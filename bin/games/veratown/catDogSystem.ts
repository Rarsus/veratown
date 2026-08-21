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

    public constructor(private conn: API_Connector) {
        this.petTrigger = guardHandler(this.key, this.onCharacterStepOnPet);
    }

    public registerTriggers(): void {
        // Location-backed triggers are registered by reloadLocations().
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        try {
            // Clean up old triggers
            for (const tile of this.tiles) {
                this.conn.chatRoom.map.removeTileTrigger(
                    tile.location.x,
                    tile.location.y,
                    this.petTrigger,
                );
            }

            // Load cat and dog locations
            this.tiles = [];
            for (const location of locations) {
                if (
                    (location.type === "cat" || location.type === "dog") &&
                    location.enabled
                ) {
                    const config = this.parseConfig(location);
                    if (config) {
                        this.tiles.push({
                            location,
                            config,
                            petType: location.type as "cat" | "dog",
                        });
                    }
                }
            }

            // Register tile triggers for pet positions
            for (const tile of this.tiles) {
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
        if (!this.enabled) return;

        const tile = this.tiles.find(
            (t) =>
                character.MapPos.X === t.location.x &&
                character.MapPos.Y === t.location.y,
        );

        if (!tile) return;

        try {
            // Execute each action
            for (const action of tile.config.actions) {
                if (action.type === "emote") {
                    this.performEmoteAction(character, action, tile.petType);
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

    private performEmoteAction(
        character: API_Character,
        action: CatDogEmoteAction,
        petType: "cat" | "dog",
    ): void {
        try {
            character.Tell(
                "Emote",
                action.text || `*A ${petType} nuzzles you adorably*`,
            );
        } catch (e) {
            console.error("[CatDogSystem] Failed to perform emote action", e);
        }
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
            // Find vibrator items in character's appearance by checking asset names
            const vibrators = (character.Appearance.Appearance || []).filter(
                (item) => {
                    const assetName = (item as any)?.Asset?.Name as string | undefined;
                    const groupName = (item as any)?.Group as string | undefined;
                    return (
                        (assetName && assetName.includes("Vibrator")) ||
                        (groupName && (groupName.includes("ItemVulva") || groupName.includes("ItemPelvis")))
                    );
                },
            );

            if (vibrators && vibrators.length > 0) {
                // Send whisper with custom message
                character.Tell(
                    "Whisper",
                    `*The ${petType} cuddles you and by mistake triggers your device... ${action.message}*`,
                );

                // Attempt to escalate each vibrator
                for (const vibrator of vibrators) {
                    try {
                        this.escalateVibrator(vibrator as any, action.intensityIncrease);
                    } catch (e) {
                        console.error(
                            `[CatDogSystem] Failed to escalate vibrator`,
                            e,
                        );
                    }
                }
            }
        } catch (e) {
            console.error("[CatDogSystem] Failed to perform vibrator action", e);
        }
    }

    private escalateVibrator(item: any, intensityIncrease: number): void {
        // Get current extended type if it exists
        const currentType = item?.Extended?.Type ?? 0;
        const newType = Math.min(
            7,
            Math.max(0, (currentType as number) + intensityIncrease),
        );

        if (item?.Extended && typeof item.Extended.SetType === "function") {
            item.Extended.SetType(newType);
        } else if (
            item &&
            typeof item.setProperty === "function"
        ) {
            // Fallback: try to set via TypeRecord property
            const typeRecord = item.getProperty?.("TypeRecord") ?? {};
            item.setProperty("TypeRecord", {
                ...typeRecord,
                v: Math.min(7, (typeRecord.v ?? 0) + intensityIncrease),
            });
        }
    }
}
