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

import { decompressFromBase64 } from "lz-string";
import { Db } from "mongodb";
import {
    API_Connector,
    API_Character,
    CommandParser,
    BC_Server_ChatRoomMessage,
} from "bc-bot";
import { wait } from "../hub/utils";
import { Dare } from "./dare";
import { DareConfig } from "./dare";
import { DareStore } from "./dareStore";
import { Casino } from "./casino";
import { CasinoConfig } from "./casino";
import { CasinoStore } from "./casino/casinostore";
import { CageSystem } from "./veratown/cageSystem";
import { KennelSystem } from "./veratown/kennelSystem";
import { ShowerSystem } from "./veratown/showerSystem";
import { BedSystem } from "./veratown/bedSystem";
import { BunnyParkSystem } from "./veratown/bunnyParkSystem";
import { WindowSystem } from "./veratown/windowSystem";
import { TrashcanSystem } from "./veratown/trashcanSystem";
import { KeypadDoorSystem } from "./veratown/keypadDoorSystem";
import { CatDogSystem } from "./veratown/catDogSystem";
import { FurnitureBondageSystem } from "./veratown/furnitureBondageSystem";
import { VeratownFeatureSystem } from "./veratown/featureSystem";
import { VeratownMapStore } from "./veratown/mapStore";
import {
    VeratownLocationStore,
    VeratownLocationDoc,
} from "./veratown/veratownLocationStore";
import { VeratownAdminCommands } from "./veratown/adminCommands";
import { RegionManager, VeratownRegion } from "./veratown/regionManager";
import { VeratownCharacterProfileStore } from "./veratown/veratownCharacterProfileStore";
import {
    RECEPTIONIST_POSITION,
    GAME_LOCATION,
    GAME_MISTRESS_POSITION,
    DARE_LOCATION,
    CHANGELOG,
    MAP,
    SHOWER_BOT2_HOME_POSITION,
    PET_EARS,
    VERATOWN_LOCATIONS_FALLBACK,
    FEATURE_REGIONS_STATIC,
} from "./veratown/veratownConfig";

// Re-exported for callers importing map layout/items from this module (kept
// at its original path so bin/main.ts and bin/games/casino/forfeits.ts
// don't need to change their imports as part of this file's internal split
// into bin/games/veratown/*).
export {
    GAME_LOCATION,
    GAME_MISTRESS_POSITION,
    PET_EARS,
    VERATOWN_LOCATIONS_FALLBACK,
};

export type { VeratownRegion } from "./veratown/regionManager";
export { RegionManager } from "./veratown/regionManager";
export type {
    VeratownCharacterProfileDoc,
    CageSession,
    KennelSession,
    CurrentRestraint,
    RoleplayFlags,
    AuditLogEntry,
} from "./veratown/veratownCharacterProfileStore";
export { VeratownCharacterProfileStore } from "./veratown/veratownCharacterProfileStore";

export interface VeratownConnections {
    main: API_Connector;
    shower?: API_Connector;
    casino?: API_Connector;
}

export class Veratown {
    public static description = [
        "=== WELCOME TO VERATOWN ===",
        "",
        "A dynamic, interactive roleplay environment with games, challenges, and surprises.",
        "",
        "PLAYER COMMANDS:",
        "/bot help - Display this help message",
        "/bot freeandleave - Remove all restraints and exit the room",
        "/bot changelog - View recent map changes",
        "/bot status - View bot connection, location, and feature status",
        "/bot feature list - Available room features: cage, kennel, shower, bed, bunnyPark, window, trashcan, keypadDoor, dare, casino",
        "/bot code <code> - Open the keypad door while standing on a keypad",
        "Keypad doors accept group codes at configured keypad locations.",
        "",
        "DARE GAME WHEN ENABLED:",
        "/bot dare join - Enter the dare game lobby",
        "/bot dare leave - Exit the dare game",
        "/bot dare start - Start a new dare round",
        "/bot dare help - Full dare game rules and commands",
        "",
        "CASINO WHEN ENABLED:",
        "/bot roulette [bet] - Play roulette. See /bot help for options.",
        "/bot blackjack [bet] - Play blackjack",
        "/bot chips - Check your current chip balance",
        "",
        "UTILITY:",
        "/bot pick - Bot randomly selects another player as a neutral choice",
        "",
        "ADMIN COMMANDS FOR ROOM ADMINS:",
        "/bot strip <name> - Remove all clothing from a player",
        "/bot feature <enable|disable> <name> - Toggle room features",
        "/bot map update - Save current layout to database",
        "/bot map reset - Restore default map layout",
        "/bot map export - Export current layout for backup",
        "!map import <data> - Import a previously exported layout. Send as a standalone message.",
        "/bot maintenance - Begin 1-minute shutdown sequence",
        "/bot adminhelp - View all admin commands",
        "/bot location help - View location management commands with examples",
        "/bot location types - List all available location types with descriptions",
        "/bot location template <type> - Show JSON template for a location type",
        "/bot location search <keyword> - Find location types by keyword (cage, door, etc.)",
        "",
        "⚠️  WARNINGS:",
        "• BUNNY PARK: Players sent to the bunny park will be transformed into bunnies with limited commands",
        "• BONDAGE AREA: The cages and storage areas are active restraint zones - entering may result in confinement",
        "• DARE GAME: High-risk game with potentially embarrassing forfeits",
        "• CASINO: Chips earned/lost in games - forfeits may apply to losers",
        "",
        "For setup and customization: https://github.com/Rarsus/ropeybot",
        "Modified map code: https://github.com/Rarsus/ropeybot/tree/main/bin/games/veratown",
    ].join("\n");

    private commandParser: CommandParser;
    private regionManager: RegionManager;

    private conn: API_Connector;
    private conn2?: API_Connector;
    private conn3?: API_Connector;

    private dare?: Dare;
    private casino?: Casino;

    private cageSystem?: CageSystem;
    private kennelSystem?: KennelSystem;
    private showerSystem?: ShowerSystem;
    private bedSystem?: BedSystem;
    private bunnyParkSystem?: BunnyParkSystem;
    private windowSystem?: WindowSystem;
    private trashcanSystem?: TrashcanSystem;
    private keypadDoorSystem?: KeypadDoorSystem;
    private catDogSystem?: CatDogSystem;
    private furnitureBondageSystem?: FurnitureBondageSystem;

    // Every successfully-initialized room feature, in registration order.
    // Backs the "/bot feature list|enable|disable" command; systems that
    // failed to construct or register (see initFeature()) are simply
    // absent from this list rather than crashing Veratown's startup.
    private features: VeratownFeatureSystem[] = [];
    private pendingFeatureRegistrations: Promise<void>[] = [];
    private locationSnapshot: VeratownLocationDoc[] = [];
    private locationReload?: Promise<void>;

    // Only set when mongo_uri/mongo_db are configured; without it, the map
    // layout falls back to the built-in default (MAP, from veratownConfig.ts)
    // and can't be saved/persisted across restarts.
    private mapStore?: VeratownMapStore;

    // Stores location data (cages, keypads, monitors, etc.) in the database,
    // with config fallback. Only set when mongo_uri/mongo_db are configured.
    private locationStore?: VeratownLocationStore;

    // Stores character profiles (position, appearance, cage/kennel sessions, audit log).
    // Only set when mongo_uri/mongo_db are configured.
    private characterProfileStore?: VeratownCharacterProfileStore;

    public constructor(
        connections: VeratownConnections,
        db?: Db,
        dareConfig?: DareConfig,
        private casinoConfig?: CasinoConfig,
    ) {
        this.conn = connections.main;
        this.conn2 = connections.shower;
        this.conn3 = connections.casino;

        this.commandParser = new CommandParser(this.conn, undefined, [
            GAME_LOCATION,
        ]);
        this.regionManager = new RegionManager();

        if (db) {
            const effectiveDareConfig: DareConfig | undefined =
                dareConfig ??
                (DARE_LOCATION ? { region: DARE_LOCATION } : undefined);
            this.locationStore = new VeratownLocationStore(db);
            this.characterProfileStore = new VeratownCharacterProfileStore(db);
            this.dare = this.initFeature(
                () =>
                    new Dare(
                        this.conn,
                        new DareStore(db),
                        this.commandParser,
                        new CasinoStore(db),
                        effectiveDareConfig,
                    ),
            );
            this.mapStore = new VeratownMapStore(db);
        } else {
            console.log(
                "mongo_uri/mongo_db must be configured to enable the dare/pick commands and persistent map storage in Veratown; skipping.",
            );
        }

        this.conn.on("RoomCreate", this.onChatRoomCreated);
        this.conn.on("RoomJoin", this.onChatRoomJoined);

        // Each system is constructed and registered independently: if one
        // fails (eg. a bug in a single feature), the others are unaffected
        // and Veratown still starts up with everything else working.
        this.cageSystem = this.initFeature(() => new CageSystem(this.conn));
        this.kennelSystem = this.initFeature(() => new KennelSystem(this.conn));
        this.showerSystem = this.initFeature(
            () => new ShowerSystem(this.conn, this.conn2),
        );
        this.bedSystem = this.initFeature(() => new BedSystem(this.conn));
        this.bunnyParkSystem = this.initFeature(
            () => new BunnyParkSystem(this.conn),
        );
        this.windowSystem = this.initFeature(() => new WindowSystem(this.conn));
        this.trashcanSystem = this.initFeature(
            () => new TrashcanSystem(this.conn),
        );
        this.keypadDoorSystem = this.initFeature(
            () =>
                new KeypadDoorSystem(
                    this.conn,
                    this.commandParser,
                    this.locationStore,
                    () => this.reloadLocations(),
                ),
        );
        this.catDogSystem = this.initFeature(
            () =>
                new CatDogSystem(
                    this.conn,
                    this.conn2, // Optional: shower bot for emote delivery (if configured)
                ),
        );
        this.furnitureBondageSystem = this.initFeature(
            () => new FurnitureBondageSystem(this.conn),
        );

        // Casino feature uses a separate bot connection (user3) to avoid
        // modifying the main bot's appearance with casino items
        if (this.conn3 && db) {
            this.casino = this.initFeature(
                () =>
                    new Casino(
                        this.conn3!,
                        db,
                        {
                            ...this.casinoConfig,
                            region: GAME_LOCATION,
                            locationStore: this.locationStore,
                            fallbackLocations: VERATOWN_LOCATIONS_FALLBACK,
                        },
                        // Don't pass commandParser - let Casino create its own bound to conn3
                    ),
            );
        }

        // TODO: exhibit tile triggers, dressing/redressing pads, and the
        // hallway/common area doors are disabled until their coordinates
        // are updated to match the new map layout.

        this.commandParser.register("help", this.onCommandHelp);
        this.commandParser.register("freeandleave", this.onCommandFreeAndLeave);
        this.commandParser.register("changelog", this.onCommandChangelog);

        // All admin-only commands (strip, feature enable/disable, map
        // update/reset/import/export, maintenance) live in their own
        // module, with the same fault-isolation safeguards (guardHandler())
        // used by the room feature systems above.
        new VeratownAdminCommands(
            this.conn,
            this.commandParser,
            this.features,
            this.mapStore,
            this.locationStore,
            this.regionManager,
            (character) => this.freeCharacter(character),
            this.conn2,
            () => this.reloadLocations(),
            () => this.getStatus(),
            this.characterProfileStore,
        ).registerCommands();
    }

    // Constructs and registers a single room feature system, isolating any
    // failure (constructor throwing, or registerTriggers() throwing) to
    // that one feature: it's logged and left out of `features`/unavailable,
    // but doesn't prevent the rest of Veratown (or other features) from
    // starting up. Runtime errors *after* startup are handled separately by
    // guardHandler() wrapping each individual trigger callback.
    private initFeature<T extends VeratownFeatureSystem>(
        factory: () => T,
    ): T | undefined {
        let system: T | undefined;
        try {
            system = factory();
            const registration = system.registerTriggers();
            if (registration instanceof Promise) {
                this.pendingFeatureRegistrations.push(
                    registration.then(() => {
                        this.features.push(system!);
                    }),
                );
            } else {
                this.features.push(system);
            }
            return system;
        } catch (e) {
            console.error(
                `[Veratown] Failed to start feature${system ? ` "${system.label}"` : ""}; ` +
                    "it will be unavailable, but the rest of the bot is unaffected.",
                e,
            );
            return undefined;
        }
    }

    public async init(): Promise<void> {
        await Promise.all(this.pendingFeatureRegistrations);
        await this.reloadLocations();

        // Watch for database changes and automatically reload affected locations
        if (this.locationStore) {
            await this.locationStore.watchLocations();
            this.locationStore.on("locationChanged", async (operationType) => {
                console.log(
                    `[Veratown] Database change detected (${operationType}), reloading locations...`,
                );
                await this.reloadLocations();
            });
        }

        await this.setupRoom();
        await this.setupCharacter();
    }

    public async reloadLocations(): Promise<void> {
        if (this.locationReload) return this.locationReload;

        this.locationReload = (async () => {
            try {
                this.locationSnapshot = this.locationStore
                    ? await this.locationStore.reloadLocations(
                          VERATOWN_LOCATIONS_FALLBACK,
                      )
                    : [];

                if (this.locationStore) {
                    await this.regionManager.loadRegions(this.locationStore);
                    for (const [key, region] of FEATURE_REGIONS_STATIC) {
                        this.regionManager.addStaticRegion(region);
                    }

                    for (const warning of this.regionManager.validateRegions(
                        FEATURE_REGIONS_STATIC,
                    )) {
                        console.warn(warning);
                    }
                }

                await Promise.all(
                    this.features
                        .filter((feature) => feature.reloadLocations)
                        .map((feature) =>
                            feature.reloadLocations!(this.locationSnapshot),
                        ),
                );
                console.log(
                    `[Veratown] Loaded ${this.locationSnapshot.length} locations`,
                );
            } catch (e) {
                console.error("[Veratown] Failed to reload locations", e);
                throw e;
            } finally {
                this.locationReload = undefined;
            }
        })();

        return this.locationReload;
    }

    public getStatus(): string {
        const features = this.features
            .map(
                (feature) => `${feature.key}=${feature.enabled ? "on" : "off"}`,
            )
            .join(", ");
        return [
            `Veratown: ${this.conn.isConnected() ? "connected" : "disconnected"}`,
            `locations=${this.locationSnapshot.length}`,
            `database=${this.locationStore ? "configured" : "fallback"}`,
            `features=${features || "none"}`,
        ].join("\n");
    }

    public getRegionManager(): RegionManager {
        return this.regionManager;
    }

    public getCharacterProfileStore():
        | VeratownCharacterProfileStore
        | undefined {
        return this.characterProfileStore;
    }

    private onChatRoomCreated = async () => {
        await this.setupRoom();
        await this.setupCharacter();
    };

    private onChatRoomJoined = async () => {
        await this.setupCharacter();
    };

    private setupRoom = async () => {
        try {
            // The database holds the current "live" layout (as saved via
            // "/bot map update"/"import"); if it's unavailable or empty
            // (eg. a fresh database), fail over to the built-in default map
            // from veratownConfig.ts instead.
            const storedMapData = await this.mapStore?.load();
            const mapData =
                storedMapData ?? JSON.parse(decompressFromBase64(MAP));
            this.conn.chatRoom.map.setMapFromData(mapData);
        } catch (e) {
            console.log("Map data not loaded", e);
        }
    };

    private setupCharacter = async () => {
        this.conn.moveOnMap(RECEPTIONIST_POSITION.X, RECEPTIONIST_POSITION.Y);
        this.conn.Player.SetActivePose(["Kneel"]);

        if (this.conn2) {
            this.conn2.moveOnMap(
                SHOWER_BOT2_HOME_POSITION.X,
                SHOWER_BOT2_HOME_POSITION.Y,
            );
        }
    };

    private onCommandFreeAndLeave = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        this.freeCharacter(sender);
        await wait(500);
        sender.Kick();
    };

    private onCommandChangelog = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        this.conn.reply(
            msg,
            `Recent changes to the map:\n${CHANGELOG.map((entry) => `- ${entry}`).join("\n")}`,
        );
    };

    private onCommandHelp = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        this.conn.reply(msg, Veratown.description);
    };

    private freeCharacter(character: API_Character): void {
        // Strip every bind item (locked or not) regardless of which bot
        // system placed it - dare game bondage/pillory/kennel, casino
        // forfeits, veratown cages, etc. Collars (ItemNeck/
        // ItemNeckAccessories) are intentionally left alone by stripBulk.
        character.Appearance.stripBulk({ item: true }, true);

        this.cageSystem?.freeCharacterIfCaged(character);
    }
}
