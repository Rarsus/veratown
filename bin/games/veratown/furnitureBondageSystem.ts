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
import { wait } from "../../hub/utils";
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import { VeratownLocationDoc } from "./veratownLocationStore";

interface BondageRestraint {
    group: string;
    asset: string;
    extendedType?: string;
    difficulty?: number;
    color?: string;
}

interface FurnitureActionConfig {
    /**
     * Furniture to place on the map (ItemDevices group assumed).
     * Example: "Kennel", "Bed", "WoodenBox", "Pole"
     */
    furnitureAsset: string;
    furnitureGroup?: string;

    /**
     * List of restraints to apply when character enters
     */
    restraints?: BondageRestraint[];

    /**
     * Optional delay before restraints are applied (ms)
     */
    applyDelayMs?: number;

    /**
     * Optional duration to automatically remove restraints after (ms)
     */
    durationMs?: number;

    /**
     * Furniture-specific properties (e.g. { d: 0, p: 1 } for kennel)
     */
    furnitureProperties?: Record<string, unknown>;

    /**
     * Extended type for furniture item
     */
    furnitureExtendedType?: string;

    /**
     * Color for furniture
     */
    furnitureColor?: string;

    /**
     * Custom craft description
     */
    craftDescription?: string;
}

interface FurnitureTile {
    location: VeratownLocationDoc;
    config: FurnitureActionConfig;
}

export class FurnitureBondageSystem implements VeratownFeatureSystem {
    public readonly key = "furnitureBondage";
    public readonly label = "Bondage furniture";
    public enabled = true;

    private tiles: FurnitureTile[] = [];
    private activeTimers = new Map<number, ReturnType<typeof setTimeout>>();
    private readonly furnitureTrigger: ReturnType<typeof guardHandler>;

    public constructor(private conn: API_Connector) {
        this.furnitureTrigger = guardHandler(
            this.key,
            this.onCharacterEnterFurniture,
        );
    }

    public registerTriggers(): void {
        // Location-backed triggers are registered by reloadLocations().
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        try {
            // Clean up old triggers and timers
            for (const tile of this.tiles) {
                this.conn.chatRoom.map.removeTileTrigger(
                    tile.location.x,
                    tile.location.y,
                    this.furnitureTrigger,
                );
            }

            // Clear active timers
            for (const timer of this.activeTimers.values()) {
                clearTimeout(timer);
            }
            this.activeTimers.clear();

            // Load new furniture locations
            this.tiles = [];
            for (const location of locations) {
                if (location.type === "furniture" && location.enabled) {
                    const config = this.parseConfig(location);
                    if (config) {
                        this.tiles.push({ location, config });
                    }
                }
            }

            // Register new triggers
            for (const tile of this.tiles) {
                this.conn.chatRoom.map.addTileTrigger(
                    { X: tile.location.x, Y: tile.location.y },
                    this.furnitureTrigger,
                );
            }

            console.log(
                `[FurnitureBondageSystem] Loaded ${this.tiles.length} furniture bondage location(s)`,
            );
        } catch (e) {
            console.error(
                "[FurnitureBondageSystem] Unexpected error during initialization",
                e,
            );
        }
    }

    private parseConfig(location: VeratownLocationDoc): FurnitureActionConfig | null {
        const data = location.data ?? {};

        const furnitureAsset = typeof data.furnitureAsset === "string" ? data.furnitureAsset : undefined;
        if (!furnitureAsset) {
            console.warn(`[FurnitureBondageSystem] Location ${location.key} missing furnitureAsset`);
            return null;
        }

        const config: FurnitureActionConfig = {
            furnitureAsset,
            furnitureGroup: typeof data.furnitureGroup === "string" ? data.furnitureGroup : "ItemDevices",
            applyDelayMs: typeof data.applyDelayMs === "number" ? data.applyDelayMs : 0,
            durationMs: typeof data.durationMs === "number" ? data.durationMs : undefined,
            furnitureExtendedType: typeof data.furnitureExtendedType === "string" ? data.furnitureExtendedType : undefined,
            furnitureColor: typeof data.furnitureColor === "string" ? data.furnitureColor : undefined,
            craftDescription: typeof data.craftDescription === "string" ? data.craftDescription : `Bondage furniture from ${location.name}`,
        };

        // Parse restraints array
        if (Array.isArray(data.restraints)) {
            config.restraints = [];
            for (const r of data.restraints) {
                if (typeof r === "object" && r !== null) {
                    const restraint = r as Record<string, unknown>;
                    if (typeof restraint.group === "string" && typeof restraint.asset === "string") {
                        config.restraints.push({
                            group: restraint.group,
                            asset: restraint.asset,
                            extendedType: typeof restraint.extendedType === "string" ? restraint.extendedType : undefined,
                            difficulty: typeof restraint.difficulty === "number" ? restraint.difficulty : 20,
                            color: typeof restraint.color === "string" ? restraint.color : undefined,
                        });
                    }
                }
            }
        }

        // Parse furniture properties
        if (typeof data.furnitureProperties === "object" && data.furnitureProperties !== null) {
            config.furnitureProperties = data.furnitureProperties as Record<string, unknown>;
        }

        return config;
    }

    private onCharacterEnterFurniture = async (character: API_Character) => {
        if (!this.enabled) return;

        const tile = this.tiles.find(
            (t) =>
                character.MapPos.X === t.location.x &&
                character.MapPos.Y === t.location.y,
        );

        if (!tile) return;

        try {
            // Add furniture item
            const furniture = character.Appearance.AddItem(
                AssetGet(
                    (tile.config.furnitureGroup ?? "ItemDevices") as any,
                    tile.config.furnitureAsset as any,
                ),
            );

            if (tile.config.furnitureExtendedType && furniture?.Extended) {
                furniture.Extended.SetType(tile.config.furnitureExtendedType as any);
            }

            if (tile.config.furnitureColor) {
                furniture?.SetColor(tile.config.furnitureColor as any);
            }

            furniture?.SetCraft({
                Name: tile.config.furnitureAsset,
                Description: tile.config.craftDescription,
            });

            // Apply furniture-specific properties
            if (tile.config.furnitureProperties) {
                furniture?.setProperty("TypeRecord", tile.config.furnitureProperties as any);
            }

            // Apply restraints after optional delay
            if (tile.config.restraints && tile.config.restraints.length > 0) {
                const applyDelay = tile.config.applyDelayMs ?? 0;
                if (applyDelay > 0) {
                    await wait(applyDelay);
                }

                for (const restraint of tile.config.restraints) {
                    this.applyRestraint(character, restraint);
                }
            }

            // Set up duration timer if configured
            if (tile.config.durationMs && tile.config.durationMs > 0) {
                const timerId = Math.random();
                this.activeTimers.set(character.MemberNumber, undefined as any);

                const timer = setTimeout(() => {
                    try {
                        this.removeRestraints(character, tile.config);
                        this.activeTimers.delete(character.MemberNumber);
                    } catch (e) {
                        console.error(
                            `[FurnitureBondageSystem] Error removing restraints after duration:`,
                            e,
                        );
                    }
                }, tile.config.durationMs);

                this.activeTimers.set(character.MemberNumber, timer);
            }
        } catch (e) {
            console.error(
                `[FurnitureBondageSystem] Error processing furniture for ${character.Name}:`,
                e,
            );
        }
    };

    private applyRestraint(
        character: API_Character,
        restraint: BondageRestraint,
    ): void {
        try {
            const item = character.Appearance.AddItem(
                AssetGet(restraint.group as any, restraint.asset as any),
            );

            if (restraint.extendedType && item?.Extended) {
                item.Extended.SetType(restraint.extendedType as any);
            }

            const difficulty = restraint.difficulty ?? 20;
            item?.SetDifficulty(difficulty);

            if (restraint.color) {
                item?.SetColor(restraint.color as any);
            }
        } catch (e) {
            console.error(
                `[FurnitureBondageSystem] Failed to apply restraint ${restraint.group}/${restraint.asset}:`,
                e,
            );
        }
    }

    private removeRestraints(
        character: API_Character,
        config: FurnitureActionConfig,
    ): void {
        try {
            // Remove furniture
            character.Appearance.RemoveItem(
                (config.furnitureGroup ?? "ItemDevices") as any,
            );

            // Remove restraints
            if (config.restraints) {
                for (const restraint of config.restraints) {
                    try {
                        character.Appearance.RemoveItem(restraint.group as any);
                    } catch (e) {
                        // Silently ignore removal failures
                    }
                }
            }

            character.Tell(
                "Whisper",
                `(Your time with the ${config.furnitureAsset} has ended. Restraints removed.)`,
            );
        } catch (e) {
            console.error("[FurnitureBondageSystem] Error removing restraints:", e);
        }
    }
}
