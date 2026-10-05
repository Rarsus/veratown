/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    API_Connector,
    API_Character,
    getExtendedAssetDef,
    hasExtendedAssetGroup,
    type BC_AppearanceItem,
} from "bc-bot";
import {
    ActionLayerRolloutController,
    CharacterActionExecutor,
    createActionMetadata,
    createActionResult,
    sendFeatureWhisper,
    type ActionContext,
    type ActionResult,
    type AppearanceActionService,
    type CommunicationActionService,
    type MovementActionService,
} from "../../action-layer";
import { AbstractTileFeatureSystem } from "../shared/abstractTileFeatureSystem";
import { VeratownLocationDoc } from "./veratownLocationStore";
import { createIdempotentMonitor } from "./shared/idempotentMonitor";
import {
    executeConfiguredActionSequence,
    parseConfiguredActionList,
    type ConfiguredAction,
} from "./shared/configuredActions";

interface CatDogAction extends ConfiguredAction {
    type: "emote" | "bondage" | "vibrator";
}

interface CatDogEmoteAction extends CatDogAction {
    type: "emote";
    text: string;
}

interface BondagePiece {
    group: string;
    asset: string;
    extendedType?: string;
    color?: string;
}

interface CatDogBondageAction extends CatDogAction {
    type: "bondage";
    pieces: BondagePiece[];
    difficulty: number;
    color: string;
    craftDescription: string;
}

interface CatDogVibratorAction extends CatDogAction {
    type: "vibrator";
    message: string;
    intensityIncrease: number;
}

type CatDogActionUnion =
    CatDogEmoteAction | CatDogBondageAction | CatDogVibratorAction;

type CatDogAppearanceItem = BC_AppearanceItem;

interface CatDogExtendedModuleOption {
    readonly Property?: Record<string, unknown>;
}

interface CatDogExtendedModule {
    readonly Name: string;
    readonly Key: string;
    readonly Options: readonly CatDogExtendedModuleOption[];
}

interface CatDogExtendedDefinition {
    readonly Archetype?: string;
    readonly Options?: readonly unknown[];
    readonly Modules?: readonly CatDogExtendedModule[];
    readonly CopyConfig?: {
        readonly GroupName?: string;
        readonly AssetName: string;
    };
}

interface ExtendedPropertyMutation {
    readonly properties: Record<string, unknown>;
    readonly expectedProperties: Record<string, unknown>;
}

const STANDARD_VIBRATOR_OPTIONS = [
    { name: "Off", intensity: -1, effects: ["Egged"] },
    { name: "Low", intensity: 0, effects: ["Egged", "Vibrating"] },
    { name: "Medium", intensity: 1, effects: ["Egged", "Vibrating"] },
    { name: "High", intensity: 2, effects: ["Egged", "Vibrating"] },
    { name: "Maximum", intensity: 3, effects: ["Egged", "Vibrating"] },
] as const;

const ADVANCED_VIBRATOR_OPTION_NAMES = [
    "Random",
    "Escalate",
    "Tease",
    "Deny",
    "Edge",
] as const;

function extendedDefinitionFor(
    group: string,
    asset: string,
): CatDogExtendedDefinition | undefined {
    const visited = new Set<string>();
    let currentGroup = group;
    let currentAsset = asset;

    while (true) {
        const key = `${currentGroup}\u0000${currentAsset}`;
        if (visited.has(key)) return undefined;
        visited.add(key);
        const definition = getExtendedAssetDef({
            Group: currentGroup as never,
            Name: currentAsset as never,
        } as never) as unknown as CatDogExtendedDefinition | null;
        if (!definition) return undefined;
        if (!definition.CopyConfig) return definition;
        currentGroup = definition.CopyConfig.GroupName ?? currentGroup;
        currentAsset = definition.CopyConfig.AssetName;
    }
}

function itemPropertyRecord(
    item: CatDogAppearanceItem,
): Record<string, unknown> {
    const properties = item.Property;
    return properties && typeof properties === "object"
        ? (properties as Record<string, unknown>)
        : {};
}

function typeRecordOf(
    properties: Record<string, unknown>,
): Record<string, number> {
    const typeRecord = properties.TypeRecord;
    if (!typeRecord || typeof typeRecord !== "object") return {};
    return Object.fromEntries(
        Object.entries(typeRecord).filter(
            (entry): entry is [string, number] =>
                typeof entry[1] === "number" && Number.isInteger(entry[1]),
        ),
    );
}

function propertySnapshot(
    properties: Record<string, unknown>,
    keys: readonly string[],
): Record<string, unknown> {
    return Object.fromEntries(
        keys
            .filter((key) => Object.hasOwn(properties, key))
            .map((key) => [key, properties[key]]),
    );
}

function vibrationModeNames(definition: CatDogExtendedDefinition): string[] {
    const configuredSets = definition.Options?.filter(
        (option): option is string =>
            option === "Standard" || option === "Advanced",
    );
    const modeSets =
        configuredSets && configuredSets.length > 0
            ? configuredSets
            : ["Standard", "Advanced"];
    return modeSets.flatMap((modeSet) =>
        modeSet === "Standard"
            ? STANDARD_VIBRATOR_OPTIONS.map((option) => option.name)
            : [...ADVANCED_VIBRATOR_OPTION_NAMES],
    );
}

function buildVibratorModeMutation(
    item: CatDogAppearanceItem,
    definition: CatDogExtendedDefinition,
    intensityIncrease: number,
): ExtendedPropertyMutation | undefined {
    const properties = itemPropertyRecord(item);
    const typeRecord = typeRecordOf(properties);
    const optionNames = vibrationModeNames(definition);
    const typeRecordKey = definition.Archetype ?? "vibrating";
    const recordIndex = typeRecord[typeRecordKey];
    const currentMode =
        typeof properties.Mode === "string"
            ? properties.Mode
            : typeof recordIndex === "number"
              ? optionNames[recordIndex]
              : "Off";
    const currentStandardIndex = STANDARD_VIBRATOR_OPTIONS.findIndex(
        (option) => option.name === currentMode,
    );
    if (currentStandardIndex < 0) {
        if (
            !ADVANCED_VIBRATOR_OPTION_NAMES.includes(
                currentMode as (typeof ADVANCED_VIBRATOR_OPTION_NAMES)[number],
            )
        ) {
            return undefined;
        }
        const currentIntensity =
            typeof properties.Intensity === "number"
                ? properties.Intensity
                : currentMode === "Random"
                  ? -1
                  : 0;
        const maxIntensity = currentMode === "Edge" ? 1 : 3;
        const targetIntensity = Math.min(
            maxIntensity,
            currentIntensity + intensityIncrease,
        );
        if (targetIntensity === currentIntensity) return undefined;
        const effects = new Set(
            Array.isArray(properties.Effect)
                ? properties.Effect.filter(
                      (effect): effect is string => typeof effect === "string",
                  )
                : ["Egged"],
        );
        if (targetIntensity >= 0) effects.add("Vibrating");
        else effects.delete("Vibrating");
        if (currentMode === "Deny" || currentMode === "Edge") {
            effects.add("Edged");
        }
        return {
            properties: {
                Intensity: targetIntensity,
                Effect: [...effects],
            },
            expectedProperties: propertySnapshot(properties, [
                "TypeRecord",
                "Mode",
                "Intensity",
                "Effect",
            ]),
        };
    }

    const targetStandardIndex = Math.min(
        STANDARD_VIBRATOR_OPTIONS.length - 1,
        currentStandardIndex + intensityIncrease,
    );
    if (targetStandardIndex === currentStandardIndex) return undefined;
    const targetOption = STANDARD_VIBRATOR_OPTIONS[targetStandardIndex];
    const optionIndex = optionNames.indexOf(targetOption.name);
    if (optionIndex < 0) return undefined;

    return {
        properties: {
            TypeRecord: { ...typeRecord, [typeRecordKey]: optionIndex },
            Mode: targetOption.name,
            Intensity: targetOption.intensity,
            Effect: [...targetOption.effects],
        },
        expectedProperties: propertySnapshot(properties, [
            "TypeRecord",
            "Mode",
            "Intensity",
            "Effect",
        ]),
    };
}

function isVibrationModule(module: CatDogExtendedModule): boolean {
    return module.Options.some((option) => {
        const properties = option.Property;
        return (
            typeof properties?.Intensity === "number" &&
            Array.isArray(properties.Effect) &&
            properties.Effect.includes("Vibrating")
        );
    });
}

function buildVibrationModuleMutation(
    item: CatDogAppearanceItem,
    definition: CatDogExtendedDefinition,
    vibrationModules: readonly CatDogExtendedModule[],
    intensityIncrease: number,
): ExtendedPropertyMutation | undefined {
    const properties = itemPropertyRecord(item);
    const typeRecord = typeRecordOf(properties);
    const modules = definition.Modules ?? [];
    const nextTypeRecord = { ...typeRecord };
    let changed = false;
    for (const module of vibrationModules) {
        const currentIndex = typeRecord[module.Key] ?? 0;
        if (!module.Options[currentIndex]) return undefined;
        const targetIndex = Math.min(
            module.Options.length - 1,
            currentIndex + intensityIncrease,
        );
        if (targetIndex !== currentIndex) changed = true;
        nextTypeRecord[module.Key] = targetIndex;
    }
    if (!changed) return undefined;

    const configuredEffects = new Set<string>();
    for (const module of modules) {
        for (const option of module.Options) {
            const effects = option.Property?.Effect;
            if (Array.isArray(effects)) {
                for (const effect of effects) {
                    if (typeof effect === "string")
                        configuredEffects.add(effect);
                }
            }
        }
    }

    const preservedEffects = Array.isArray(properties.Effect)
        ? properties.Effect.filter(
              (effect): effect is string =>
                  typeof effect === "string" && !configuredEffects.has(effect),
          )
        : [];
    const selectedEffects: string[] = [];
    let effectiveIntensity: number | undefined;
    const updates: Record<string, unknown> = {
        TypeRecord: nextTypeRecord,
    };
    for (const module of modules) {
        const selectedIndex = nextTypeRecord[module.Key] ?? 0;
        const selectedProperties = module.Options[selectedIndex]?.Property;
        if (!selectedProperties) continue;
        if (typeof selectedProperties.Intensity === "number") {
            effectiveIntensity = selectedProperties.Intensity;
        }
        if (Array.isArray(selectedProperties.Effect)) {
            selectedEffects.push(
                ...selectedProperties.Effect.filter(
                    (effect): effect is string => typeof effect === "string",
                ),
            );
        }
        for (const [key, value] of Object.entries(selectedProperties)) {
            if (
                key !== "TypeRecord" &&
                key !== "Effect" &&
                key !== "Intensity"
            ) {
                updates[key] = value;
            }
        }
    }

    updates.Effect = [...new Set([...preservedEffects, ...selectedEffects])];
    if (effectiveIntensity !== undefined) {
        updates.Intensity = effectiveIntensity;
    }

    return {
        properties: updates,
        expectedProperties: propertySnapshot(properties, [
            "TypeRecord",
            "Intensity",
            "Effect",
        ]),
    };
}

interface CatDogTileConfig {
    actions: CatDogActionUnion[];
    enabled: boolean;
}

interface CatDogTile {
    location: VeratownLocationDoc;
    config: CatDogTileConfig;
    petType: "cat" | "dog";
}

export class CatDogSystem extends AbstractTileFeatureSystem {
    private tiles: CatDogTile[] = [];
    private catDogNotificationSequence = 0;
    private catDogActionSequence = 0;
    private catDogMovementSequence = 0;
    private readonly petTrigger: ReturnType<
        AbstractTileFeatureSystem["guardTileHandler"]
    >;
    private botOriginalX: number = 0;
    private botOriginalY: number = 0;
    private readonly monitor =
        createIdempotentMonitor<API_Character>("CatDogSystem");
    private readonly characterActions: CharacterActionExecutor<API_Character>;

    public constructor(
        conn: API_Connector,
        private botConn?: API_Connector,
        private readonly communicationService?: CommunicationActionService,
        private readonly rollout?: ActionLayerRolloutController,
        private readonly appearanceService?: AppearanceActionService<
            API_Character,
            readonly BC_AppearanceItem[]
        >,
        private readonly movementService?: MovementActionService<API_Character>,
    ) {
        super(conn, "catDog", "Cat/Dog tiles");
        this.characterActions = new CharacterActionExecutor({
            appearance: this.appearanceService,
            movement: this.movementService,
        });
        this.logger?.info("[CatDogSystem] Initializing CatDogSystem");
        this.petTrigger = this.guardTileHandler(this.onCharacterStepOnPet);
        this.logger?.info(
            "[CatDogSystem] Trigger handler created:",
            typeof this.petTrigger as any,
        );
        // Store bot's initial position if bot connector is provided
        if (this.botConn) {
            this.storeBotPosition();
        }
    }

    private storeBotPosition(): void {
        try {
            if (!this.botConn?.chatRoom) return;
            const botChar = this.botConn.Player;
            if (botChar?.MapPos) {
                this.botOriginalX = botChar.MapPos.X ?? 0;
                this.botOriginalY = botChar.MapPos.Y ?? 0;
            }
        } catch (e) {
            this.logger?.warn(
                "[CatDogSystem] Could not store bot initial position",
                e as any,
            );
        }
    }

    public registerTriggers(): void {
        // Location-backed triggers are registered by reloadLocations().
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        this.logger?.info(
            `[CatDogSystem] reloadLocations called with ${locations.length} locations`,
        );
        try {
            // Clean up old triggers
            this.logger?.info(
                `[CatDogSystem] Cleaning up ${this.tiles.length} old triggers`,
            );
            for (const tile of this.tiles) {
                this.logger?.info(
                    `[CatDogSystem] Removing trigger at (${tile.location.x!}, ${tile.location.y!})`,
                );
                this.conn.chatRoom!.map.removeTileTrigger(
                    tile.location.x!,
                    tile.location.y!,
                    this.petTrigger,
                );
            }

            // Load cat and dog locations
            this.tiles = [];
            for (const location of locations) {
                this.logger?.debug(
                    `[CatDogSystem] Checking location: ${location.key} type=${location.type} enabled=${location.enabled}`,
                );
                if (
                    (location.type === "cat" || location.type === "dog") &&
                    location.enabled
                ) {
                    const config = this.parseConfig(location);
                    if (config) {
                        this.logger?.debug(
                            `[CatDogSystem] Adding ${location.type} at (${location.x}, ${location.y})`,
                        );
                        this.tiles.push({
                            location,
                            config,
                            petType: location.type as "cat" | "dog",
                        });
                    } else {
                        this.logger?.info(
                            `[CatDogSystem] Failed to parse config for ${location.key}`,
                        );
                    }
                }
            }

            // Register tile triggers for pet positions
            this.logger?.info(
                `[CatDogSystem] Registering ${this.tiles.length} new tile triggers`,
            );
            for (const tile of this.tiles) {
                this.logger?.info(
                    `[CatDogSystem] Adding tile trigger at (${tile.location.x!}, ${tile.location.y!})`,
                );
                this.conn.chatRoom!.map.addTileTrigger(
                    { X: tile.location.x!, Y: tile.location.y! },
                    this.petTrigger,
                );
            }

            this.logger?.info(
                `[CatDogSystem] Loaded ${this.tiles.length} cat/dog location(s)`,
            );
        } catch (e) {
            this.logger?.error(
                "[CatDogSystem] Unexpected error during initialization",
                e as any,
            );
        }
    }

    private parseConfig(
        location: VeratownLocationDoc,
    ): CatDogTileConfig | null {
        const data = location.data ?? {};

        // Parse actions from data.actions array
        const parsed = parseConfiguredActionList(data.actions, (action) =>
            this.parseAction(action),
        );
        for (const action of parsed.rejected) {
            this.logger?.warn(
                `[CatDogSystem] Ignoring invalid action for ${location.key}`,
                action as any,
            );
        }
        const actions = [...parsed.actions];

        // If no valid actions, config is invalid
        if (actions.length === 0) {
            return null;
        }

        return {
            actions,
            enabled: true,
        };
    }

    private parseAction(action: unknown): CatDogActionUnion | null {
        if (typeof action !== "object" || action === null) return null;

        const obj = action as Record<string, unknown>;
        const type = obj.type;

        if (type === "emote") {
            const text = obj.text;
            if (typeof text === "string") {
                return { type: "emote", text };
            }
        } else if (type === "bondage") {
            const pieces = obj.pieces;
            const difficulty = obj.difficulty ?? 20;
            const color = obj.color ?? "#8B4513";
            const craftDescription = obj.craftDescription ?? "Pet bondage";

            if (Array.isArray(pieces) && pieces.length > 0) {
                const validPieces: BondagePiece[] = [];
                for (const piece of pieces) {
                    if (typeof piece === "object" && piece !== null) {
                        const p = piece as Record<string, unknown>;
                        const group = p.group;
                        const asset = p.asset;
                        if (
                            typeof group === "string" &&
                            typeof asset === "string"
                        ) {
                            validPieces.push({
                                group,
                                asset,
                                extendedType:
                                    typeof p.extendedType === "string"
                                        ? p.extendedType
                                        : undefined,
                                color:
                                    typeof p.color === "string"
                                        ? p.color
                                        : undefined,
                            });
                        }
                    }
                }

                if (validPieces.length > 0) {
                    return {
                        type: "bondage",
                        pieces: validPieces,
                        difficulty:
                            typeof difficulty === "number" ? difficulty : 20,
                        color: typeof color === "string" ? color : "#8B4513",
                        craftDescription:
                            typeof craftDescription === "string"
                                ? craftDescription
                                : "Pet bondage",
                    };
                }
            }
        } else if (type === "vibrator") {
            const message = obj.message;
            const intensityIncrease = obj.intensityIncrease ?? 1;

            if (typeof message === "string") {
                return {
                    type: "vibrator",
                    message,
                    intensityIncrease:
                        typeof intensityIncrease === "number"
                            ? Math.max(1, intensityIncrease)
                            : 1,
                };
            }
        }

        return null;
    }

    private onCharacterStepOnPet = async (character: API_Character) => {
        this.logger?.info(
            `[CatDogSystem] onCharacterStepOnPet triggered for ${character.Name}, enabled=${this.enabled}, tiles count=${this.tiles.length}`,
        );
        if (!this.enabled) {
            this.logger?.info(
                `[CatDogSystem] System disabled, ignoring trigger`,
            );
            return;
        }

        // Use idempotent monitor to prevent duplicate actions
        await this.monitor.run(character, async () => {
            const characterPos = character.MapPos;
            this.logger?.info(
                `[CatDogSystem] Character position: (${characterPos.X}, ${characterPos.Y})`,
            );
            this.logger?.info(
                `[CatDogSystem] Available tiles:`,
                this.tiles.map(
                    (t) => `${t.petType} at (${t.location.x}, ${t.location.y})`,
                ),
            );

            const tile = this.tiles.find(
                (t) =>
                    characterPos.X === t.location.x &&
                    characterPos.Y === t.location.y,
            );

            if (!tile) {
                this.logger?.info(
                    `[CatDogSystem] No matching tile found for position (${characterPos.X}, ${characterPos.Y})`,
                );
                return;
            }

            this.logger?.info(
                `[CatDogSystem] Found matching tile: ${tile.petType} with ${tile.config.actions.length} actions`,
            );

            try {
                const sequence = await executeConfiguredActionSequence(
                    tile.config.actions,
                    {
                        operationId: `catdog:${tile.location.key}:${character.MemberNumber}:${++this.catDogActionSequence}`,
                        memberNumber: character.MemberNumber,
                        source: "feature",
                        reason: `${tile.petType} tile interaction`,
                        deadlineAt: Date.now() + 30_000,
                    },
                    async (action, context) => {
                        this.logger?.info(
                            `[CatDogSystem] Executing action: ${action.type}`,
                        );
                        if (action.type === "emote") {
                            await this.performEmoteAction(
                                character,
                                action,
                                tile.petType,
                            );
                        } else if (action.type === "bondage") {
                            await this.performBondageAction(character, action);
                        } else if (action.type === "vibrator") {
                            return this.performVibratorAction(
                                character,
                                action,
                                tile.petType,
                                context,
                            );
                        }
                        return createActionResult(
                            "completed",
                            createActionMetadata(
                                context,
                                action.type,
                                Date.now(),
                            ),
                        );
                    },
                    { continueOnFailure: true },
                );
                if (!sequence.success) {
                    this.logger.warn("Pet interaction had failed actions", {
                        memberNumber: character.MemberNumber,
                        petType: tile.petType,
                        statuses: sequence.results.map(
                            (result) => result.status,
                        ),
                    });
                }

                this.logger.info("Pet interaction completed", {
                    memberNumber: character.MemberNumber,
                    petType: tile.petType,
                });
            } catch (e) {
                this.logger.error(
                    `Error executing action for ${character.Name}:`,
                    e as Error,
                );
            }
        });
    };

    private async performEmoteAction(
        character: API_Character,
        action: CatDogEmoteAction,
        petType: "cat" | "dog",
    ): Promise<void> {
        let emoteSent = false;
        try {
            this.logger?.info(
                `[CatDogSystem] performEmoteAction: botConn=${!!this.botConn}, text="${action.text}"`,
            );

            // If bot connector is provided, teleport bot to player for emote visibility
            if (this.botConn) {
                this.logger?.info(
                    "[CatDogSystem] Bot connector available, attempting teleport",
                );
                const botChar = this.botConn.Player;
                this.logger?.info(
                    `[CatDogSystem] botChar: ${botChar?.Name}, MapPos: (${botChar?.MapPos?.X}, ${botChar?.MapPos?.Y})`,
                );

                if (!botChar?.MapPos) {
                    this.logger?.info(
                        "[CatDogSystem] Bot char or MapPos missing, using fallback emote",
                    );
                    // Fallback: just send emote normally
                    this.messageSender.emoteToCharacter(
                        character,
                        action.text || `*A ${petType} nuzzles you adorably*`,
                    );
                    return;
                }

                // Save current bot position
                const currentX = botChar.MapPos.X ?? 0;
                const currentY = botChar.MapPos.Y ?? 0;
                this.logger?.info(
                    `[CatDogSystem] Saved bot position: (${currentX}, ${currentY})`,
                );

                // Teleport bot to player's location for emote visibility
                this.logger?.info(
                    `[CatDogSystem] Teleporting bot to player (${character.MapPos.X}, ${character.MapPos.Y})`,
                );
                await this.teleportBot(
                    botChar,
                    character.MapPos.X,
                    character.MapPos.Y,
                );
                await this.wait(100); // Brief delay for teleport to complete

                // Send emote (now in range of player)
                this.logger?.info(
                    `[CatDogSystem] Sending emote from bot location`,
                );
                this.messageSender.emoteToCharacter(
                    character,
                    action.text || `*A ${petType} nuzzles you adorably*`,
                );
                emoteSent = true;

                await this.wait(500); // Let emote display before returning

                // Teleport bot back to original position
                this.logger?.info(
                    `[CatDogSystem] Teleporting bot back to (${currentX}, ${currentY})`,
                );
                await this.teleportBot(botChar, currentX, currentY);
                this.logger?.info(
                    `[CatDogSystem] ✓ Bot returned to home position (${currentX}, ${currentY})`,
                );
            } else {
                // No bot connector: send emote normally
                this.logger?.info(
                    "[CatDogSystem] No bot connector, sending emote normally (may not be visible if out of range)",
                );
                this.messageSender.emoteToCharacter(
                    character,
                    action.text || `*A ${petType} nuzzles you adorably*`,
                );
            }
        } catch (e) {
            this.logger?.error(
                "[CatDogSystem] Failed to perform emote action",
                e as any,
            );
            if (!emoteSent) {
                try {
                    this.messageSender.emoteToCharacter(
                        character,
                        action.text || `*A ${petType} nuzzles you adorably*`,
                    );
                } catch (fallbackErr) {
                    this.logger?.error(
                        "[CatDogSystem] Fallback emote also failed",
                        fallbackErr,
                    );
                }
            }
        }
    }

    private async teleportBot(
        botChar: API_Character,
        x: number,
        y: number,
    ): Promise<void> {
        if (!botChar?.MapPos) {
            throw new Error(
                "Cannot teleport narrator without an observed position",
            );
        }
        const context: ActionContext = {
            operationId: `catdog-emote-teleport:${botChar.MemberNumber}:${++this.catDogMovementSequence}`,
            memberNumber: botChar.MemberNumber,
            source: "feature",
            reason: "CatDog narrator positioning",
            deadlineAt: Date.now() + 5_000,
        };
        const result = await this.characterActions.execute(
            botChar,
            {
                type: "movement.teleport",
                destination: { x, y },
                options: {
                    timeoutMs: 5_000,
                    maxAttempts: 1,
                    retryDelayMs: 0,
                },
            },
            context,
        );
        if (
            result.status !== "completed" &&
            result.status !== "already_satisfied"
        ) {
            throw new Error(
                result.reason ?? `Narrator teleport failed: ${result.status}`,
            );
        }
    }

    private wait(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private async sendCatDogNotification(
        character: API_Character,
        text: string,
    ): Promise<void> {
        const operationId = `catdog-notification:${character.MemberNumber}:${++this.catDogNotificationSequence}`;
        await sendFeatureWhisper({
            communicationService: this.communicationService,
            rollout: this.rollout,
            operationId,
            memberNumber: character.MemberNumber,
            reason: "catdog vibrator notification",
            text,
            sendLegacy: () =>
                this.messageSender.whisperToCharacter(character, text),
            warn: (warning, details) =>
                this.logger.warn(warning, details as any),
        });
    }

    private async performBondageAction(
        character: API_Character,
        action: CatDogBondageAction,
    ): Promise<void> {
        const operationId = `catdog-bondage:${character.MemberNumber}:${++this.catDogActionSequence}`;
        const lease = this.rollout?.begin("feature-appearance", operationId);
        try {
            if (lease && lease.path !== "action") {
                throw new Error(
                    "CatDog bondage requires the appearance action layer",
                );
            }
            if (!this.appearanceService) {
                throw new Error(
                    "CatDog bondage appearance service is unavailable",
                );
            }
            for (const [index, piece] of action.pieces.entries()) {
                const result = await this.appearanceService.add(
                    character,
                    {
                        group: piece.group,
                        asset: piece.asset,
                        ...(piece.extendedType === undefined
                            ? {}
                            : { extendedType: piece.extendedType }),
                    },
                    {
                        operationId: `${operationId}:${index}`,
                        memberNumber: character.MemberNumber,
                        source: "feature",
                        reason: "catdog bondage action",
                        timeoutMs: 5_000,
                        maxAttempts: 1,
                        retryDelayMs: 0,
                        preserveLockedItems: true,
                        requireServerConfirmation: true,
                        itemOptions: {
                            difficulty: action.difficulty,
                            color: piece.color ?? action.color,
                            craft: {
                                name: piece.asset,
                                description: action.craftDescription,
                            },
                        },
                    },
                );
                if (
                    result.status !== "completed" &&
                    result.status !== "already_satisfied"
                ) {
                    throw new Error(
                        result.reason ??
                            `CatDog bondage action failed for ${piece.group}/${piece.asset}: ${result.status}`,
                    );
                }
                await this.wait(50);
            }
        } finally {
            lease?.release();
        }
    }

    private async performVibratorAction(
        character: API_Character,
        action: CatDogVibratorAction,
        petType: "cat" | "dog",
        context: ActionContext,
    ): Promise<ActionResult<unknown>> {
        const operationId = `${context.operationId}:vibrator`;
        const lease = this.rollout?.begin("feature-appearance", operationId);
        const startedAt = Date.now();

        try {
            if (lease?.path !== "action") {
                return createActionResult(
                    "rejected",
                    createActionMetadata(context, "catdog.vibrator", startedAt),
                    {
                        reason: "CatDog appearance action-layer rollout is disabled",
                        failureKind: "permanent",
                        retryable: false,
                    },
                );
            }
            if (!this.appearanceService) {
                return createActionResult(
                    "rejected",
                    createActionMetadata(context, "catdog.vibrator", startedAt),
                    {
                        reason: "Appearance action service is unavailable",
                        failureKind: "permanent",
                        retryable: false,
                    },
                );
            }

            const results: ActionResult<unknown>[] = [];
            const appearance = character.Appearance.MakeAppearanceBundle();
            for (const item of appearance) {
                if (
                    !item.Group ||
                    !item.Name ||
                    !hasExtendedAssetGroup(item.Group)
                ) {
                    continue;
                }
                const definition = extendedDefinitionFor(item.Group, item.Name);
                if (!definition) continue;

                const dispatch = (
                    mutation: ExtendedPropertyMutation,
                    channel: string,
                ) => {
                    const itemOperationId = `${operationId}:${item.Group}:${item.Name}:${channel}`;
                    const timeoutMs = Math.max(
                        1,
                        Math.min(5_000, context.deadlineAt - Date.now()),
                    );
                    return this.characterActions.execute(
                        character,
                        {
                            type: "appearance.update_extended_properties",
                            item: { group: item.Group, asset: item.Name },
                            properties: mutation.properties,
                            expectedProperties: mutation.expectedProperties,
                            options: {
                                timeoutMs,
                                maxAttempts: 1,
                                retryDelayMs: 0,
                                requireServerConfirmation: true,
                            },
                        },
                        {
                            ...context,
                            operationId: itemOperationId,
                            reason: `CatDog vibration update for ${item.Group}/${item.Name}/${channel}`,
                        },
                    );
                };

                if (definition.Archetype === "vibrating") {
                    const mutation = buildVibratorModeMutation(
                        item,
                        definition,
                        action.intensityIncrease,
                    );
                    if (!mutation) continue;
                    results.push(await dispatch(mutation, "vibrator-mode"));
                    await this.wait(50);
                    continue;
                }

                if (definition.Archetype !== "modular") continue;
                const vibrationModules = (definition.Modules ?? []).filter(
                    isVibrationModule,
                );
                if (vibrationModules.length === 0) continue;
                const mutation = buildVibrationModuleMutation(
                    item,
                    definition,
                    vibrationModules,
                    action.intensityIncrease,
                );
                if (!mutation) continue;
                results.push(
                    await dispatch(
                        mutation,
                        `modules-${vibrationModules.map((module) => module.Key).join("-")}`,
                    ),
                );
                await this.wait(50);
            }

            if (results.length === 0) {
                return createActionResult(
                    "already_satisfied",
                    createActionMetadata(context, "catdog.vibrator", startedAt),
                    { reason: "No supported vibration controls are equipped" },
                );
            }

            const failure = results.find(
                (result) =>
                    result.status !== "completed" &&
                    result.status !== "already_satisfied",
            );
            const hasCompletedUpdate = results.some(
                (result) => result.status === "completed",
            );
            const allAlreadySatisfied = results.every(
                (result) => result.status === "already_satisfied",
            );
            const notificationText = hasCompletedUpdate
                ? `*The ${petType} cuddles you and by mistake triggers your device... ${action.message}*`
                : allAlreadySatisfied
                  ? `*The ${petType} cuddles you. Your device is already at that setting. ${action.message}*`
                  : `*The ${petType} tries to trigger your device, but I couldn't confirm that it responded. ${action.message}*`;
            try {
                await this.sendCatDogNotification(character, notificationText);
            } catch (error) {
                this.logger.warn("CatDog vibration notification failed", {
                    memberNumber: character.MemberNumber,
                    error,
                });
            }
            if (failure) return failure;

            return createActionResult(
                results.every((result) => result.status === "already_satisfied")
                    ? "already_satisfied"
                    : "completed",
                createActionMetadata(context, "catdog.vibrator", startedAt),
                { reason: `Updated ${results.length} vibration control(s)` },
            );
        } catch (error) {
            return createActionResult(
                "failed",
                createActionMetadata(context, "catdog.vibrator", startedAt),
                {
                    reason:
                        error instanceof Error ? error.message : String(error),
                    failureKind: "permanent",
                    retryable: false,
                },
            );
        } finally {
            lease?.release();
        }
    }
}
