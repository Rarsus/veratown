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

import { API_Connector, API_Character, AssetGet } from "bc-bot";
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import { VeratownLocationDoc } from "./veratownLocationStore";

interface CatDogAction {
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
    | CatDogEmoteAction
    | CatDogBondageAction
    | CatDogVibratorAction;

interface CatDogTileConfig {
    actions: CatDogActionUnion[];
    enabled: boolean;
}

interface CatDogTile {
    location: VeratownLocationDoc;
    config: CatDogTileConfig;
    petType: "cat" | "dog";
}

export class CatDogSystem implements VeratownFeatureSystem {
    public readonly key = "catDog";
    public readonly label = "Cat/Dog tiles";
    public enabled = true;

    private tiles: CatDogTile[] = [];
    private readonly petTrigger: ReturnType<typeof guardHandler>;
    private botOriginalX: number = 0;
    private botOriginalY: number = 0;

    public constructor(
        private conn: API_Connector,
        private botConn?: API_Connector,
    ) {
        console.log("[CatDogSystem] Initializing CatDogSystem");
        this.petTrigger = guardHandler(this.key, this.onCharacterStepOnPet);
        console.log("[CatDogSystem] Trigger handler created:", typeof this.petTrigger);
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
            console.warn("[CatDogSystem] Could not store bot initial position", e);
        }
    }

    public registerTriggers(): void {
        // Location-backed triggers are registered by reloadLocations().
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        console.log(`[CatDogSystem] reloadLocations called with ${locations.length} locations`);
        try {
            // Clean up old triggers
            console.log(`[CatDogSystem] Cleaning up ${this.tiles.length} old triggers`);
            for (const tile of this.tiles) {
                console.log(`[CatDogSystem] Removing trigger at (${tile.location.x}, ${tile.location.y})`);
                this.conn.chatRoom.map.removeTileTrigger(
                    tile.location.x,
                    tile.location.y,
                    this.petTrigger,
                );
            }

            // Load cat and dog locations
            this.tiles = [];
            for (const location of locations) {
                console.log(`[CatDogSystem] Checking location: ${location.key} type=${location.type} enabled=${location.enabled}`);
                if (
                    (location.type === "cat" || location.type === "dog") &&
                    location.enabled
                ) {
                    const config = this.parseConfig(location);
                    if (config) {
                        console.log(`[CatDogSystem] Adding ${location.type} at (${location.x}, ${location.y})`);
                        this.tiles.push({
                            location,
                            config,
                            petType: location.type as "cat" | "dog",
                        });
                    } else {
                        console.log(`[CatDogSystem] Failed to parse config for ${location.key}`);
                    }
                }
            }

            // Register tile triggers for pet positions
            console.log(`[CatDogSystem] Registering ${this.tiles.length} new tile triggers`);
            for (const tile of this.tiles) {
                console.log(`[CatDogSystem] Adding tile trigger at (${tile.location.x}, ${tile.location.y})`);
                this.conn.chatRoom.map.addTileTrigger(
                    { X: tile.location.x, Y: tile.location.y },
                    this.petTrigger,
                );
            }

            console.log(
                `[CatDogSystem] Loaded ${this.tiles.length} cat/dog location(s)`,
            );
        } catch (e) {
            console.error("[CatDogSystem] Unexpected error during initialization", e);
        }
    }

    private parseConfig(location: VeratownLocationDoc): CatDogTileConfig | null {
        const data = location.data ?? {};

        // Parse actions from data.actions array
        const actions: CatDogActionUnion[] = [];

        if (Array.isArray(data.actions)) {
            for (const action of data.actions) {
                if (
                    typeof action === "object" &&
                    action !== null &&
                    "type" in action
                ) {
                    try {
                        const parsed = this.parseAction(action);
                        if (parsed) actions.push(parsed);
                    } catch (e) {
                        console.error(
                            `[CatDogSystem] Failed to parse action for ${location.key}:`,
                            e,
                        );
                    }
                }
            }
        }

        // If no valid actions, config is invalid
        if (actions.length === 0) {
            return null;
        }

        return {
            actions,
            enabled: true,
        };
    }

    private parseAction(
        action: unknown,
    ): CatDogActionUnion | null {
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
                        if (typeof group === "string" && typeof asset === "string") {
                            validPieces.push({
                                group,
                                asset,
                                extendedType: typeof p.extendedType === "string" ? p.extendedType : undefined,
                                color: typeof p.color === "string" ? p.color : undefined,
                            });
                        }
                    }
                }

                if (validPieces.length > 0) {
                    return {
                        type: "bondage",
                        pieces: validPieces,
                        difficulty: typeof difficulty === "number" ? difficulty : 20,
                        color: typeof color === "string" ? color : "#8B4513",
                        craftDescription: typeof craftDescription === "string" ? craftDescription : "Pet bondage",
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
                    intensityIncrease: typeof intensityIncrease === "number" ? Math.max(1, intensityIncrease) : 1,
                };
            }
        }

        return null;
    }

    private onCharacterStepOnPet = async (character: API_Character) => {
        console.log(`[CatDogSystem] onCharacterStepOnPet triggered for ${character.Name}, enabled=${this.enabled}, tiles count=${this.tiles.length}`);
        if (!this.enabled) {
            console.log(`[CatDogSystem] System disabled, ignoring trigger`);
            return;
        }

        const characterPos = character.MapPos;
        console.log(`[CatDogSystem] Character position: (${characterPos.X}, ${characterPos.Y})`);
        console.log(`[CatDogSystem] Available tiles:`, this.tiles.map(t => `${t.petType} at (${t.location.x}, ${t.location.y})`));

        const tile = this.tiles.find(
            (t) =>
                characterPos.X === t.location.x &&
                characterPos.Y === t.location.y,
        );

        if (!tile) {
            console.log(`[CatDogSystem] No matching tile found for position (${characterPos.X}, ${characterPos.Y})`);
            return;
        }

        console.log(`[CatDogSystem] Found matching tile: ${tile.petType} with ${tile.config.actions.length} actions`);

        try {
            // Execute each action
            for (const action of tile.config.actions) {
                console.log(`[CatDogSystem] Executing action: ${action.type}`);
                if (action.type === "emote") {
                    await this.performEmoteAction(character, action, tile.petType);
                } else if (action.type === "bondage") {
                    this.performBondageAction(character, action);
                } else if (action.type === "vibrator") {
                    this.performVibratorAction(character, action, tile.petType);
                }
            }
        } catch (e) {
            console.error(
                `[CatDogSystem] Error executing action for ${character.Name}:`,
                e,
            );
        }
    };

    private async performEmoteAction(
        character: API_Character,
        action: CatDogEmoteAction,
        petType: "cat" | "dog",
    ): Promise<void> {
        try {
            // If bot connector is provided, teleport bot to player for emote visibility
            if (this.botConn) {
                const botChar = this.botConn.Player;
                if (!botChar?.MapPos) {
                    // Fallback: just send emote normally
                    character.Tell(
                        "Emote",
                        action.text || `*A ${petType} nuzzles you adorably*`,
                    );
                    return;
                }

                // Save current bot position
                const currentX = botChar.MapPos.X ?? 0;
                const currentY = botChar.MapPos.Y ?? 0;

                // Teleport bot to player's location for emote visibility
                await this.teleportBot(botChar, character.MapPos.X, character.MapPos.Y);
                await this.wait(100); // Brief delay for teleport to complete

                // Send emote (now in range of player)
                character.Tell(
                    "Emote",
                    action.text || `*A ${petType} nuzzles you adorably*`,
                );

                await this.wait(500); // Let emote display before returning

                // Teleport bot back to original position
                await this.teleportBot(botChar, currentX, currentY);
            } else {
                // No bot connector: send emote normally
                character.Tell(
                    "Emote",
                    action.text || `*A ${petType} nuzzles you adorably*`,
                );
            }
        } catch (e) {
            console.error("[CatDogSystem] Failed to perform emote action", e);
            // Fallback: try sending emote anyway
            try {
                character.Tell(
                    "Emote",
                    action.text || `*A ${petType} nuzzles you adorably*`,
                );
            } catch (fallbackErr) {
                console.error("[CatDogSystem] Fallback emote also failed", fallbackErr);
            }
        }
    }

    private async teleportBot(
        botChar: API_Character,
        x: number,
        y: number,
    ): Promise<void> {
        try {
            if (!botChar?.MapPos) return;
            // Update bot's map position
            botChar.MapPos.X = x;
            botChar.MapPos.Y = y;
        } catch (e) {
            console.warn(`[CatDogSystem] Failed to teleport bot to (${x}, ${y})`, e);
        }
    }

    private wait(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private performBondageAction(
        character: API_Character,
        action: CatDogBondageAction,
    ): void {
        try {
            for (const piece of action.pieces) {
                try {
                    const item = character.Appearance.AddItem(
                        AssetGet(piece.group as any, piece.asset as any),
                    );

                    if (piece.extendedType && item?.Extended) {
                        item.Extended.SetType(piece.extendedType as any);
                    }

                    item?.SetDifficulty(action.difficulty);
                    if (piece.color ?? action.color) {
                        item?.SetColor((piece.color ?? action.color) as any);
                    }
                    item?.SetCraft({
                        Name: piece.asset,
                        Description: action.craftDescription,
                    });
                } catch (e) {
                    console.error(
                        `[CatDogSystem] Failed to add bondage piece ${piece.group}/${piece.asset}`,
                        e,
                    );
                }
            }
        } catch (e) {
            console.error("[CatDogSystem] Failed to perform bondage action", e);
        }
    }

    private performVibratorAction(
        character: API_Character,
        action: CatDogVibratorAction,
        petType: "cat" | "dog",
    ): void {
        try {
            // Find vibrator items in character's appearance
            // Vibrators are typically in ItemVulva, ItemPelvis groups with "Vibrator" in the name
            // BUT some custom vibrators don't have "Vibra*" in the name, so we also check
            // for items in these groups that have Extended properties (mode/type support)
            const vibrators: any[] = [];
            const appearance = character.Appearance.Appearance || [];
            
            for (const item of appearance) {
                try {
                    const assetName = (item as any)?.Asset?.Name as string | undefined;
                    const groupName = (item as any)?.Group as string | undefined;
                    
                    // Skip non-vulva/pelvis items
                    if (groupName !== "ItemVulva" && groupName !== "ItemPelvis") {
                        continue;
                    }

                    // Check multiple detection methods:
                    // 1. Name-based: "Vibrator" in asset name (traditional vibrators)
                    // 2. Property-based: Has Extended.Type or TypeRecord (custom vibrators with modes)
                    // 3. Custom name patterns: Some vibrators have special names
                    
                    const hasVibratorName = assetName?.includes("Vibrator") || assetName?.includes("Vibrat");
                    const hasExtendedType = (item as any)?.Extended?.Type !== undefined;
                    const hasTypeProperty = typeof (item as any)?.getProperty === "function" &&
                        (item as any)?.getProperty("TypeRecord") !== undefined;
                    
                    if (hasVibratorName || hasExtendedType || hasTypeProperty) {
                        console.log(`[CatDogSystem] Detected vibrator: ${assetName} in ${groupName} (name: ${hasVibratorName}, extended: ${hasExtendedType}, property: ${hasTypeProperty})`);
                        vibrators.push(item);
                    }
                } catch (e) {
                    // Skip items that cause errors during inspection
                    console.debug("[CatDogSystem] Skipped item during vibrator detection", e);
                }
            }

            console.log(`[CatDogSystem] Found ${vibrators.length} vibrator(s)`);

            if (vibrators.length > 0) {
                // Send whisper with custom message
                character.Tell(
                    "Whisper",
                    `*The ${petType} cuddles you and by mistake triggers your device... ${action.message}*`,
                );

                // Escalate each vibrator
                for (const vibrator of vibrators) {
                    try {
                        this.escalateVibrator(character, vibrator, action.intensityIncrease);
                    } catch (e) {
                        console.error("[CatDogSystem] Failed to escalate vibrator:", e);
                    }
                }
            } else {
                console.log(`[CatDogSystem] No vibrators found for ${character.Name}`);
            }
        } catch (e) {
            console.error("[CatDogSystem] Failed to perform vibrator action", e);
        }
    }

    private escalateVibrator(
        character: API_Character,
        vibratorItem: any,
        intensityIncrease: number,
    ): void {
        try {
            if (!vibratorItem) return;

            const assetName = (vibratorItem as any)?.Asset?.Name as string | undefined;
            console.log(`[CatDogSystem] Escalating vibrator: ${assetName}`);

            // Get current intensity/type
            let currentIntensity = 0;
            
            // Try Extended.Type first (for typed vibrators with modes)
            if (vibratorItem?.Extended?.Type !== undefined) {
                const rawType = vibratorItem.Extended.Type;
                currentIntensity = typeof rawType === "string" ? parseInt(rawType) : rawType;
                currentIntensity = isNaN(currentIntensity) ? 0 : currentIntensity;
                console.log(`[CatDogSystem] Current intensity via Extended.Type: ${currentIntensity}`);
            }
            // Fallback: try TypeRecord property
            else if (typeof vibratorItem?.getProperty === "function") {
                const typeRecord = vibratorItem.getProperty("TypeRecord");
                currentIntensity = typeRecord?.v ?? typeRecord ?? 0;
                console.log(`[CatDogSystem] Current intensity via TypeRecord: ${currentIntensity}`);
            }
            // Final fallback: try Property directly
            else if (vibratorItem?.Property !== undefined) {
                const prop = vibratorItem.Property;
                currentIntensity = typeof prop === "string" ? parseInt(prop) : prop;
                currentIntensity = isNaN(currentIntensity) ? 0 : currentIntensity;
                console.log(`[CatDogSystem] Current intensity via Property: ${currentIntensity}`);
            }

            // Calculate new intensity (0-7 range for most vibrators, but can go higher for some)
            const newIntensity = Math.max(0, currentIntensity + intensityIncrease);

            console.log(`[CatDogSystem] Setting vibrator intensity: ${currentIntensity} → ${newIntensity}`);

            // Apply new intensity - try multiple methods
            let success = false;

            // Method 1: Extended.SetType for typed vibrators
            if (vibratorItem?.Extended && typeof vibratorItem.Extended.SetType === "function") {
                try {
                    vibratorItem.Extended.SetType(newIntensity);
                    console.log(`[CatDogSystem] ✓ Escalated via Extended.SetType`);
                    success = true;
                } catch (e) {
                    console.warn(`[CatDogSystem] Extended.SetType failed:`, e);
                }
            }

            // Method 2: setProperty for custom vibrators with TypeRecord
            if (!success && typeof vibratorItem?.setProperty === "function" && typeof vibratorItem?.getProperty === "function") {
                try {
                    const typeRecord = vibratorItem.getProperty("TypeRecord") ?? { v: 0 };
                    const newTypeRecord = {
                        ...typeRecord,
                        v: newIntensity,
                    };
                    vibratorItem.setProperty("TypeRecord", newTypeRecord);
                    console.log(`[CatDogSystem] ✓ Escalated via TypeRecord property`);
                    success = true;
                } catch (e) {
                    console.warn(`[CatDogSystem] TypeRecord setProperty failed:`, e);
                }
            }

            // Method 3: Direct property assignment
            if (!success && vibratorItem?.Property !== undefined) {
                try {
                    vibratorItem.Property = newIntensity;
                    console.log(`[CatDogSystem] ✓ Escalated via direct Property assignment`);
                    success = true;
                } catch (e) {
                    console.warn(`[CatDogSystem] Direct Property assignment failed:`, e);
                }
            }

            if (!success) {
                console.warn(
                    `[CatDogSystem] ⚠️  Could not escalate vibrator ${assetName} - no recognized method worked`,
                );
            }
        } catch (e) {
            console.error("[CatDogSystem] Error in escalateVibrator:", e);
        }
    }
}
