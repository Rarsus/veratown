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
import { DareDataService } from "./dare/dareDataService";
import { Casino } from "./casino";
import { CasinoConfig } from "./casino";
import { UnifiedCharacterStore } from "./shared/unifiedCharacterStore";
import { GameStateMutationService } from "./shared/gameStateMutationService";
import { GamePluginCommandRouterImpl } from "./shared/gamePluginCommandRouter";
import { KidnappersGameCommandController } from "./kidnappers/kidnappersGameCommands";
import { KidnappersGameEventRouter } from "./kidnappers/kidnappersGameMessaging";
import { KidnappersGameLifecycleService } from "./kidnappers/kidnappersGameLifecycleService";
import { KidnappersGamePersistence } from "./kidnappers/kidnappersGamePersistence";
import { CageSystem } from "./veratown/cageSystem";
import { KennelSystem } from "./veratown/kennelSystem";
import { ShowerSystem } from "./veratown/showerSystem";
import { BedSystem } from "./veratown/bedSystem";
import { BunnyParkSystem } from "./veratown/bunnyParkSystem";
import { WindowSystem } from "./veratown/windowSystem";
import { TrashcanSystem } from "./veratown/trashcanSystem";
import { KeypadDoorSystem } from "./veratown/keypadDoorSystemRefactored";
import { CatDogSystem } from "./veratown/catDogSystem";
import { FurnitureBondageSystem } from "./veratown/furnitureBondageSystem";
import { KeypadDefinitionService } from "./veratown/services/keypadDefinitionService";
import { KeypadAccessService } from "./veratown/services/keypadAccessService";
import { KeypadCommandDispatcher } from "./veratown/handlers/keypadCommandDispatcher";
import {
    VeratownFeatureSystem,
    getLifecycleObjectId,
} from "./veratown/featureSystem";
import { VeratownMapStore } from "./veratown/mapStore";
import {
    VeratownLocationStore,
    VeratownLocationDoc,
} from "./veratown/veratownLocationStore";
import { VeratownAdminCommands } from "./veratown/adminCommands";
import { RegionManager, VeratownRegion } from "./veratown/regionManager";
import { ReleaseSystem } from "./veratown/veratownReleaseSystem";
import { FurnitureInteractionSystem } from "./veratown/furnitureInteractionSystem";
import { AppearanceAuditTrail } from "./veratown/appearanceAuditTrail";
import { DIContainer, DIServiceKeys } from "../di/container";
import { LocationEventSystem } from "./veratown/locationEventSystem";
import {
    BotHelpMonitorProvider,
    CageOccupancyMonitorProvider,
    LocationMonitorSystem,
} from "./veratown/locationMonitorSystem";
import { PlayerRoleSystem } from "./veratown/playerRoleSystem";
import { LiveCharacterStateSync } from "./veratown/liveCharacterStateSync";
import {
    evaluateContainmentReadiness,
    type ContainmentDependency,
    type ContainmentFeature,
    type ContainmentReadinessDiagnostic,
} from "./veratown/containmentReadiness";
import {
    syncAppearanceMutation,
    filterOwnerLocked,
} from "./veratown/shared/appearanceSync";
import { createLogger } from "../logging";
import {
    getBotRecoveryEpoch,
    isBotRecoveryReady,
    recordBotPositionPersistence,
    verifyBotMapPosition,
} from "../botConnections";
import {
    RECEPTIONIST_POSITION,
    GAME_LOCATION,
    KIDNAPPERS_LOCATION,
    GAME_MISTRESS_POSITION,
    DARE_LOCATION,
    CHANGELOG,
    MAP,
    SHOWER_BOT2_HOME_POSITION,
    PET_EARS,
    VERATOWN_LOCATIONS_FALLBACK,
    FEATURE_REGIONS_STATIC,
} from "./veratown/veratownConfig";

const logger = createLogger("Veratown");

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
    CageSession,
    KennelSession,
    CurrentRestraint,
    RoleplayFlags,
    AuditLogEntry,
} from "./shared/unifiedCharacterTypes";

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
        "/bot release - Emergency release: teleport to punishment room, then strip to escape",
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
    private container: DIContainer;

    private conn: API_Connector;
    private conn2?: API_Connector;
    private conn3?: API_Connector;

    private dare?: Dare;
    private casino?: Casino;
    private kidnappers?: KidnappersGameCommandController;

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
    private releaseSystem?: ReleaseSystem;

    // EPIC 1.3: Veratown Architecture Systems
    private furnitureInteractionSystem?: FurnitureInteractionSystem;
    private appearanceAuditTrail?: AppearanceAuditTrail;
    private locationEventSystem?: LocationEventSystem;
    private locationMonitorSystem?: LocationMonitorSystem;
    private playerRoleSystem?: PlayerRoleSystem;
    private liveCharacterStateSync?: LiveCharacterStateSync;
    private unifiedCharacterStore?: UnifiedCharacterStore;

    // Every successfully-initialized room feature, in registration order.
    // Backs the "/bot feature list|enable|disable" command; systems that
    // failed to construct or register (see initFeature()) are simply
    // absent from this list rather than crashing Veratown's startup.
    private features: VeratownFeatureSystem[] = [];
    private pendingFeatureRegistrations: Promise<void>[] = [];
    private locationSnapshot: VeratownLocationDoc[] = [];
    private locationReload?: Promise<void>;
    private containmentReadiness = new Map<
        ContainmentFeature,
        ContainmentReadinessDiagnostic
    >();

    // Only set when mongo_uri/mongo_db are configured; without it, the map
    // layout falls back to the built-in default (MAP, from veratownConfig.ts)
    // and can't be saved/persisted across restarts.
    private mapStore?: VeratownMapStore;

    // Stores location data (cages, keypads, monitors, etc.) in the database,
    // with config fallback. Only set when mongo_uri/mongo_db are configured.
    private locationStore?: VeratownLocationStore;

    public constructor(
        connections: VeratownConnections,
        db?: Db,
        dareConfig?: DareConfig,
        private casinoConfig?: CasinoConfig,
        container?: DIContainer,
    ) {
        this.conn = connections.main;
        this.conn2 = connections.shower;
        this.conn3 = connections.casino;
        this.container = container || new DIContainer();

        this.commandParser = new CommandParser(this.conn, undefined, [
            GAME_LOCATION,
        ]);
        this.regionManager = new RegionManager();

        if (db) {
            const effectiveDareConfig: DareConfig | undefined =
                dareConfig ??
                (DARE_LOCATION ? { region: DARE_LOCATION } : undefined);
            this.locationStore = new VeratownLocationStore(db);
            this.dare = this.initFeature(() => {
                // Phase 5: Direct UnifiedCharacterStore access (no adapters)
                // Use DI container to get unified store
                const unifiedStore = this.container.has(
                    DIServiceKeys.UNIFIED_CHARACTER_STORE,
                )
                    ? this.container.get<UnifiedCharacterStore>(
                          DIServiceKeys.UNIFIED_CHARACTER_STORE,
                      )
                    : new UnifiedCharacterStore(db);
                const mutationService = this.container.has(
                    DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
                )
                    ? this.container.get<GameStateMutationService>(
                          DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
                      )
                    : undefined;
                const dareDataService = this.container.has(
                    DIServiceKeys.DARE_DATA_SERVICE,
                )
                    ? this.container.get<DareDataService>(
                          DIServiceKeys.DARE_DATA_SERVICE,
                      )
                    : new DareDataService(db);
                return new Dare(
                    this.conn,
                    this.commandParser,
                    unifiedStore,
                    dareDataService,
                    undefined,
                    effectiveDareConfig,
                    mutationService,
                );
            });
            this.mapStore = new VeratownMapStore(db);

            // EPIC 1.3: Initialize Veratown Architecture Systems (Phase 2 Integration)
            // These systems provide core functionality: access control, furniture interactions,
            // audit trails, location events, and role management
            this.furnitureInteractionSystem = new FurnitureInteractionSystem(
                db,
                this.conn,
            );
            this.appearanceAuditTrail = new AppearanceAuditTrail(db);
            const unifiedStore = this.container.has(
                DIServiceKeys.UNIFIED_CHARACTER_STORE,
            )
                ? this.container.get<UnifiedCharacterStore>(
                      DIServiceKeys.UNIFIED_CHARACTER_STORE,
                  )
                : new UnifiedCharacterStore(db);
            this.unifiedCharacterStore = unifiedStore;
            const mutationService = this.container.has(
                DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
            )
                ? this.container.get<GameStateMutationService>(
                      DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
                  )
                : undefined;
            const definitionService = this.container.has(
                DIServiceKeys.KEYPAD_DEFINITION_SERVICE,
            )
                ? this.container.get<KeypadDefinitionService>(
                      DIServiceKeys.KEYPAD_DEFINITION_SERVICE,
                  )
                : new KeypadDefinitionService(db);
            if (!this.container.has(DIServiceKeys.KEYPAD_DEFINITION_SERVICE)) {
                this.container.register(
                    DIServiceKeys.KEYPAD_DEFINITION_SERVICE,
                    definitionService,
                );
            }
            const accessService = this.container.has(
                DIServiceKeys.KEYPAD_ACCESS_SERVICE,
            )
                ? this.container.get<KeypadAccessService>(
                      DIServiceKeys.KEYPAD_ACCESS_SERVICE,
                  )
                : new KeypadAccessService(
                      db,
                      definitionService,
                      unifiedStore,
                      mutationService,
                  );
            if (!this.container.has(DIServiceKeys.KEYPAD_ACCESS_SERVICE)) {
                this.container.register(
                    DIServiceKeys.KEYPAD_ACCESS_SERVICE,
                    accessService,
                );
            }
            this.liveCharacterStateSync = new LiveCharacterStateSync(
                this.conn,
                unifiedStore,
                undefined,
                [this.conn2, this.conn3].filter(
                    (connection): connection is API_Connector =>
                        connection !== undefined,
                ),
            );
            this.liveCharacterStateSync.start();
            this.locationEventSystem = new LocationEventSystem(db, {
                eventBus: unifiedStore.getEventBus(),
                mutationService,
            });
            this.playerRoleSystem = new PlayerRoleSystem(db);
            if (
                this.container.has(
                    DIServiceKeys.KIDNAPPERS_GAME_LIFECYCLE_SERVICE,
                ) &&
                this.container.has(DIServiceKeys.KIDNAPPERS_GAME_PERSISTENCE)
            ) {
                const kidnappersLifecycle =
                    this.container.get<KidnappersGameLifecycleService>(
                        DIServiceKeys.KIDNAPPERS_GAME_LIFECYCLE_SERVICE,
                    );
                const kidnappersPersistence =
                    this.container.get<KidnappersGamePersistence>(
                        DIServiceKeys.KIDNAPPERS_GAME_PERSISTENCE,
                    );
                this.kidnappers = this.initFeature(
                    () =>
                        new KidnappersGameCommandController(
                            this.conn,
                            kidnappersLifecycle,
                            kidnappersPersistence,
                            {
                                eventRouter: new KidnappersGameEventRouter(
                                    unifiedStore.getEventBus(),
                                ),
                                mutationService,
                                isInGameRoom: (sender) =>
                                    Boolean(
                                        this.conn.chatRoom?.getCharacter(
                                            sender.MemberNumber,
                                        ) && this.isInKidnappersRegion(sender),
                                    ),
                            },
                        ),
                );
            }
        } else {
            logger.info(
                "mongo_uri/mongo_db must be configured to enable the dare/pick commands and persistent map storage in Veratown; skipping.",
            );
        }

        this.conn.on("RoomCreate", this.onChatRoomCreated);
        this.conn.on("RoomJoin", this.onChatRoomJoined);
        this.conn.on("Connected", this.onBotConnected);
        this.conn.on("Disconnected", this.onBotDisconnected);
        this.conn2?.on(
            "Connected",
            () =>
                void this.onAuxiliaryBotConnected(
                    this.conn2!,
                    "shower",
                    SHOWER_BOT2_HOME_POSITION,
                ),
        );
        this.conn2?.on("Disconnected", this.onAuxiliaryBotDisconnected);
        this.conn3?.on(
            "Connected",
            () =>
                void this.onAuxiliaryBotConnected(
                    this.conn3!,
                    "casino",
                    GAME_MISTRESS_POSITION,
                ),
        );
        this.conn3?.on("Disconnected", this.onAuxiliaryBotDisconnected);

        // Each system is constructed and registered independently: if one
        // fails (eg. a bug in a single feature), the others are unaffected
        // and Veratown still starts up with everything else working.
        this.cageSystem = this.initFeature(
            () =>
                new CageSystem(
                    this.conn,
                    this.container.has(
                        DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
                    )
                        ? this.container.get<GameStateMutationService>(
                              DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
                          )
                        : undefined,
                    (character) =>
                        this.liveCharacterStateSync
                            ?.syncCharacter(character)
                            .then(() => undefined) ?? Promise.resolve(),
                ),
        );
        this.kennelSystem = this.initFeature(
            () =>
                new KennelSystem(
                    this.conn,
                    this.container.has(
                        DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
                    )
                        ? this.container.get<GameStateMutationService>(
                              DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
                          )
                        : undefined,
                    (character) =>
                        this.liveCharacterStateSync
                            ?.syncCharacter(character)
                            .then(() => undefined) ?? Promise.resolve(),
                ),
        );
        this.showerSystem = this.initFeature(
            () =>
                new ShowerSystem(
                    this.conn,
                    this.conn2,
                    (character) =>
                        this.liveCharacterStateSync
                            ?.syncCharacter(character)
                            .then(() => undefined) ?? Promise.resolve(),
                ),
        );
        this.bedSystem = this.initFeature(
            () =>
                new BedSystem(
                    this.conn,
                    (character) =>
                        this.liveCharacterStateSync
                            ?.syncCharacter(character)
                            .then(() => undefined) ?? Promise.resolve(),
                ),
        );
        this.bunnyParkSystem = this.initFeature(
            () =>
                new BunnyParkSystem(
                    this.conn,
                    (character) =>
                        this.liveCharacterStateSync
                            ?.syncCharacter(character)
                            .then(() => undefined) ?? Promise.resolve(),
                    undefined,
                    undefined,
                    async (artifact) =>
                        this.unifiedCharacterStore?.recordBunnyPunishmentArtifact(
                            artifact,
                        ) ?? Promise.resolve(),
                ),
        );
        this.windowSystem = this.initFeature(() => new WindowSystem(this.conn));
        this.trashcanSystem = this.initFeature(
            () => new TrashcanSystem(this.conn),
        );
        this.keypadDoorSystem = this.initFeature(() => {
            if (this.container.has(DIServiceKeys.KEYPAD_DOOR_SYSTEM)) {
                return this.container.get<KeypadDoorSystem>(
                    DIServiceKeys.KEYPAD_DOOR_SYSTEM,
                );
            }

            if (!this.unifiedCharacterStore) {
                throw new Error(
                    "KeypadDoorSystem requires a unified character store",
                );
            }

            const definitionService =
                this.container.get<KeypadDefinitionService>(
                    DIServiceKeys.KEYPAD_DEFINITION_SERVICE,
                );
            const accessService = this.container.get<KeypadAccessService>(
                DIServiceKeys.KEYPAD_ACCESS_SERVICE,
            );
            const system = new KeypadDoorSystem(
                this.conn,
                definitionService,
                accessService,
                new KeypadCommandDispatcher(
                    definitionService,
                    accessService,
                    this.unifiedCharacterStore,
                ),
                this.commandParser,
            );
            this.pendingFeatureRegistrations.push(
                system.init().catch((error) => {
                    logger.error(
                        "Failed to initialize KeypadDoorSystem",
                        error,
                    );
                }),
            );
            return system;
        });
        this.catDogSystem = this.initFeature(
            () =>
                new CatDogSystem(
                    this.conn,
                    this.conn2, // Optional: shower bot for emote delivery (if configured)
                ),
        );
        this.furnitureBondageSystem = this.initFeature(
            () =>
                new FurnitureBondageSystem(
                    this.conn,
                    (character) =>
                        this.liveCharacterStateSync
                            ?.syncCharacter(character)
                            .then(() => undefined) ?? Promise.resolve(),
                ),
        );
        this.releaseSystem = this.initFeature(
            () =>
                new ReleaseSystem(
                    this.conn,
                    this.locationStore,
                    undefined,
                    this.container.has(DIServiceKeys.UNIFIED_CHARACTER_STORE)
                        ? this.container.get<UnifiedCharacterStore>(
                              DIServiceKeys.UNIFIED_CHARACTER_STORE,
                          )
                        : new UnifiedCharacterStore(db!),
                    this.container.has(
                        DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
                    )
                        ? this.container.get<GameStateMutationService>(
                              DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
                          )
                        : undefined,
                    (character) =>
                        this.liveCharacterStateSync
                            ?.syncCharacter(character)
                            .then(() => undefined) ?? Promise.resolve(),
                    async (character, releaseOperation) => {
                        const view =
                            await this.unifiedCharacterStore?.getVeratownView(
                                character.MemberNumber,
                            );
                        const artifact = view?.bunnyPunishmentArtifact;
                        if (artifact) {
                            await this.unifiedCharacterStore!.cleanupBunnyPunishment(
                                character.MemberNumber,
                                artifact.operationId,
                                `release_cleanup:${releaseOperation}`,
                            );
                        }
                    },
                ),
        );
        this.locationMonitorSystem = this.initFeature(
            () =>
                new LocationMonitorSystem(this.conn, [
                    new CageOccupancyMonitorProvider(
                        () =>
                            this.cageSystem?.getOccupancyDisplay() ??
                            "Cage information is currently unavailable.",
                    ),
                    new BotHelpMonitorProvider(() => Veratown.description),
                ]),
        );

        // Link ReleaseSystem to ShowerSystem for parole violation checking
        if (this.showerSystem && this.releaseSystem) {
            this.showerSystem.setReleaseSystem(this.releaseSystem);
        }

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
                        undefined,
                        this.container,
                    ),
            );
        }

        // TODO: exhibit tile triggers, dressing/redressing pads, and the
        // hallway/common area doors are disabled until their coordinates
        // are updated to match the new map layout.

        this.commandParser.register("help", this.onCommandHelp);
        this.commandParser.register("release", async (sender, msg, args) => {
            if (!this.isContainmentFeatureReady("release")) {
                this.conn.reply(
                    msg,
                    "(Emergency release is currently unavailable. Please contact staff.)",
                );
                return;
            }
            // Handle confirmation subcommands for release confirmation mechanism
            if (args[0]?.toLowerCase() === "yes") {
                await this.releaseSystem?.handleConfirmationResponse(
                    sender,
                    true,
                );
            } else if (args[0]?.toLowerCase() === "no") {
                await this.releaseSystem?.handleConfirmationResponse(
                    sender,
                    false,
                );
            } else {
                // No argument = initiate release
                await this.releaseSystem?.executeRelease(sender);
            }
        });
        // Keep freeandleave as backward compat alias
        this.commandParser.register("freeandleave", (sender, msg, args) =>
            (async () => {
                await this.releaseSystem?.executeRelease(sender);
            })(),
        );
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
        ).registerCommands();
        this.kidnappers?.registerCommands(
            new GamePluginCommandRouterImpl(this.commandParser, "kidnappers"),
        );

        // Register kennel commands (lock and escape)
        if (this.kennelSystem) {
            const kennelCommandController =
                this.kennelSystem.createCommandController(
                    this.commandParser,
                    this.unifiedCharacterStore,
                );
            kennelCommandController.registerCommands();
        }
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
            logger.error(
                `Failed to start feature${system ? ` "${system.label}"` : ""}; it will be unavailable, but the rest of the bot is unaffected.`,
                e,
            );
            return undefined;
        }
    }

    public async init(): Promise<void> {
        await Promise.all(this.pendingFeatureRegistrations);

        // Watch for database changes and automatically reload affected locations
        if (this.locationStore) {
            await this.locationStore.watchLocations();
            this.locationStore.on("locationChanged", async (operationType) => {
                logger.info(
                    "Database change detected, reloading locations...",
                    { operationType },
                );
                await this.reloadLocations();
            });
        }

        this.setContainmentFeaturesEnabled(false);
        await this.setupRoom();
        await this.setupCharacter();
        this.attachContainmentFeatures();
        await this.reloadLocations();
        this.updateContainmentReadiness();
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
                    const monitorLocationsChanged =
                        await this.ensureLocationMonitorDefaults();
                    if (monitorLocationsChanged) {
                        this.locationSnapshot =
                            await this.locationStore.reloadLocations(
                                VERATOWN_LOCATIONS_FALLBACK,
                            );
                    }
                }

                if (this.locationStore) {
                    await this.regionManager.loadRegions(this.locationStore);
                    for (const [key, region] of FEATURE_REGIONS_STATIC) {
                        this.regionManager.addStaticRegion(region);
                    }

                    for (const warning of this.regionManager.validateRegions(
                        FEATURE_REGIONS_STATIC,
                    )) {
                        logger.warn(warning);
                    }
                }

                await Promise.all(
                    this.features
                        .filter((feature) => feature.reloadLocations)
                        .map((feature) =>
                            feature.reloadLocations!(this.locationSnapshot),
                        ),
                );
                logger.info(`Loaded ${this.locationSnapshot.length} locations`);
            } catch (e) {
                logger.error("Failed to reload locations", e);
                throw e;
            } finally {
                this.locationReload = undefined;
            }
        })();

        return this.locationReload;
    }

    private async ensureLocationMonitorDefaults(): Promise<boolean> {
        if (!this.locationStore) return false;

        let changed = false;
        const cageMonitor =
            await this.locationStore.getLocation("cage_info_screen");
        if (
            cageMonitor &&
            (cageMonitor.type === "cage_info_region" ||
                cageMonitor.data?.displayKey !== "cage_occupancy")
        ) {
            await this.locationStore.updateLocation("cage_info_screen", {
                type: "help_monitor",
                data: {
                    ...(cageMonitor.data ?? {}),
                    displayKey: "cage_occupancy",
                },
            });
            changed = true;
        }

        const helpMonitor =
            await this.locationStore.getLocation("bot_help_monitor");
        if (!helpMonitor) {
            await this.locationStore.addLocation({
                key: "bot_help_monitor",
                name: "Bot Help Monitor",
                type: "help_monitor",
                x: 16,
                y: 16,
                data: {
                    bottomRightX: 17,
                    bottomRightY: 16,
                    displayKey: "bot_help",
                    cooldownMs: 3000,
                },
                enabled: true,
            });
            changed = true;
        }

        const kidnappersRegion =
            await this.locationStore.getLocation("kidnappers_region");
        if (!kidnappersRegion) {
            await this.locationStore.addLocation({
                key: "kidnappers_region",
                name: "Kidnappers Game Area",
                type: "region",
                regionType: "game",
                region: KIDNAPPERS_LOCATION,
                enabled: true,
            });
            changed = true;
        }

        return changed;
    }

    private isInKidnappersRegion(character: API_Character): boolean {
        const location = this.locationSnapshot.find(
            (candidate) => candidate.key === "kidnappers_region",
        );
        if (location && !location.enabled) return false;
        if (location?.region) {
            return (
                character.MapPos.X >= location.region.TopLeft.X &&
                character.MapPos.X <= location.region.BottomRight.X &&
                character.MapPos.Y >= location.region.TopLeft.Y &&
                character.MapPos.Y <= location.region.BottomRight.Y
            );
        }
        const bottomRightX = location?.data?.bottomRightX;
        const bottomRightY = location?.data?.bottomRightY;
        const topLeftX = location?.x;
        const topLeftY = location?.y;
        const region =
            typeof topLeftX === "number" &&
            typeof topLeftY === "number" &&
            typeof bottomRightX === "number" &&
            typeof bottomRightY === "number"
                ? {
                      TopLeft: { X: topLeftX, Y: topLeftY },
                      BottomRight: {
                          X: bottomRightX,
                          Y: bottomRightY,
                      },
                  }
                : KIDNAPPERS_LOCATION;

        return (
            character.MapPos.X >= region.TopLeft.X &&
            character.MapPos.X <= region.BottomRight.X &&
            character.MapPos.Y >= region.TopLeft.Y &&
            character.MapPos.Y <= region.BottomRight.Y
        );
    }

    public getStatus(): string {
        const features = this.features
            .map(
                (feature) => `${feature.key}=${feature.enabled ? "on" : "off"}`,
            )
            .join(", ");
        const containment = (
            Object.keys(this.getContainmentReadiness()) as ContainmentFeature[]
        )
            .map(
                (feature) =>
                    `${feature}=${this.isContainmentFeatureReady(feature) ? "ready" : "unavailable"}`,
            )
            .join(", ");
        return [
            `Veratown: ${this.conn.isConnected() ? "connected" : "disconnected"}`,
            `locations=${this.locationSnapshot.length}`,
            `database=${this.locationStore ? "configured" : "fallback"}`,
            `features=${features || "none"}`,
            `containment=${containment}`,
        ].join("\n");
    }

    public isContainmentReady(): boolean {
        return (
            this.isContainmentFeatureReady("cage") &&
            this.isContainmentFeatureReady("kennel")
        );
    }

    public isContainmentFeatureReady(feature: ContainmentFeature): boolean {
        return this.containmentReadiness.get(feature)?.ready ?? false;
    }

    public getContainmentReadiness(): Record<
        ContainmentFeature,
        ContainmentReadinessDiagnostic
    > {
        const features: ContainmentFeature[] = [
            "cage",
            "kennel",
            "release",
            "shower",
            "casino",
        ];
        const readiness = Object.fromEntries(
            features.map((feature) => [
                feature,
                this.containmentReadiness.get(feature) ??
                    evaluateContainmentReadiness(feature, [
                        {
                            name: "Veratown initialization",
                            ready: false,
                            reason: "capability readiness has not been evaluated",
                            recoveryAction:
                                "complete room, map, and dependency initialization",
                        },
                    ]),
            ]),
        ) as Record<ContainmentFeature, ContainmentReadinessDiagnostic>;
        return {
            ...readiness,
        };
    }

    public getContainmentDiagnostics(): Record<string, unknown> {
        return {
            roomIdentity: this.conn.chatRoom
                ? getLifecycleObjectId(this.conn.chatRoom)
                : undefined,
            mapIdentity: this.conn.chatRoom?.map
                ? getLifecycleObjectId(this.conn.chatRoom.map)
                : undefined,
            readiness: this.getContainmentReadiness(),
            cage: this.cageSystem?.getDiagnostics(),
            kennel: this.kennelSystem?.getDiagnostics(),
        };
    }

    private setContainmentFeaturesEnabled(enabled: boolean): void {
        if (this.cageSystem) this.cageSystem.enabled = enabled;
        if (this.kennelSystem) this.kennelSystem.enabled = enabled;
    }

    private setContainmentReadiness(
        readiness: Record<ContainmentFeature, ContainmentReadinessDiagnostic>,
    ): void {
        this.containmentReadiness = new Map(
            Object.entries(readiness) as Array<
                [ContainmentFeature, ContainmentReadinessDiagnostic]
            >,
        );
        if (this.cageSystem) this.cageSystem.enabled = readiness.cage.ready;
        if (this.kennelSystem)
            this.kennelSystem.enabled = readiness.kennel.ready;
    }

    public getRegionManager(): RegionManager {
        return this.regionManager;
    }

    public getFeatures(): VeratownFeatureSystem[] {
        return this.features;
    }

    private onChatRoomCreated = async () => {
        this.detachContainmentFeatures();
        await this.setupRoom();
        await this.setupCharacter();
        this.attachContainmentFeatures();
        await this.reloadLocations();
        this.updateContainmentReadiness();
    };

    private onChatRoomJoined = async () => {
        this.detachContainmentFeatures();
        await this.setupCharacter();
        this.attachContainmentFeatures();
        await this.reloadLocations();
        this.updateContainmentReadiness();
    };

    private onBotConnected = async () => {
        const recoveryEpoch = getBotRecoveryEpoch(this.conn);
        try {
            if (!(await this.waitForBotRecovery(this.conn, recoveryEpoch))) {
                this.setContainmentFeaturesEnabled(false);
                this.updateContainmentReadiness();
                logger.warn("Main bot recovery remains degraded", {
                    position: RECEPTIONIST_POSITION,
                });
                return;
            }
            if (
                recoveryEpoch !== undefined &&
                getBotRecoveryEpoch(this.conn) !== recoveryEpoch
            ) {
                return;
            }
            this.detachContainmentFeatures();
            await this.setupRoom();
            await this.setupCharacter();
            this.attachContainmentFeatures();
            await this.reloadLocations();
            this.updateContainmentReadiness();
        } catch (error) {
            logger.error("Bot reconnect setup failed", error);
            this.setContainmentFeaturesEnabled(false);
            this.updateContainmentReadiness();
        }
    };

    private onBotDisconnected = () => {
        this.detachContainmentFeatures();
        this.locationMonitorSystem?.detachFromRoom?.();
        this.setContainmentFeaturesEnabled(false);
        this.updateContainmentReadiness();
    };

    private detachContainmentFeatures(): void {
        this.setContainmentFeaturesEnabled(false);
        this.cageSystem?.detachFromRoom?.();
        this.kennelSystem?.detachFromRoom?.();
    }

    private onAuxiliaryBotDisconnected = () => {
        this.updateContainmentReadiness();
    };

    private attachContainmentFeatures(): void {
        this.cageSystem?.attachToRoom?.();
        this.kennelSystem?.attachToRoom?.();
    }

    private onAuxiliaryBotConnected = async (
        connection: API_Connector,
        role: string,
        position: { X: number; Y: number },
    ): Promise<void> => {
        const recoveryEpoch = getBotRecoveryEpoch(connection);
        const recovered = await this.waitForBotRecovery(
            connection,
            recoveryEpoch,
        );
        if (!recovered) {
            this.updateContainmentReadiness();
            logger.warn("Auxiliary bot recovery remains degraded", {
                role,
                position,
            });
            return;
        }
        if (
            recoveryEpoch !== undefined &&
            getBotRecoveryEpoch(connection) !== recoveryEpoch
        ) {
            return;
        }

        try {
            const diagnostic =
                await this.liveCharacterStateSync?.syncSelfPosition(
                    connection,
                    position,
                );
            if (diagnostic) {
                recordBotPositionPersistence(connection, diagnostic);
            }
            await this.reloadLocations();
        } catch (error) {
            logger.error(
                "Auxiliary bot location reconciliation failed",
                error,
                {
                    role,
                    position,
                },
            );
        }
        this.updateContainmentReadiness();
    };

    private async waitForBotRecovery(
        connection: API_Connector,
        expectedEpoch?: number,
    ): Promise<boolean> {
        for (let attempt = 0; attempt < 50; attempt++) {
            if (
                expectedEpoch !== undefined &&
                getBotRecoveryEpoch(connection) !== expectedEpoch
            ) {
                return false;
            }
            if (isBotRecoveryReady(connection)) return true;
            if (!connection.isConnected()) return false;
            await wait(100);
        }
        return (
            (expectedEpoch === undefined ||
                getBotRecoveryEpoch(connection) === expectedEpoch) &&
            isBotRecoveryReady(connection)
        );
    }

    private setupRoom = async () => {
        try {
            // The database holds the current "live" layout (as saved via
            // "/bot map update"/"import"); if it's unavailable or empty
            // (eg. a fresh database), fail over to the built-in default map
            // from veratownConfig.ts instead.
            const storedMapData = await this.mapStore?.load();
            const mapData =
                storedMapData ?? JSON.parse(decompressFromBase64(MAP));
            this.conn.chatRoom!.map.setMapFromData(mapData);
        } catch (e) {
            logger.warn("Map data not loaded, using fallback", {
                error: String(e),
            });
        }
    };

    private setupCharacter = async () => {
        const mainPositioned = await this.moveBotToPosition(
            this.conn,
            RECEPTIONIST_POSITION,
            "main",
        );
        this.conn.Player.SetActivePose(["Kneel"]);
        if (mainPositioned) {
            await this.syncVerifiedBotPosition(
                this.conn,
                RECEPTIONIST_POSITION,
            );
        }

        if (this.conn2) {
            const showerPositioned = await this.moveBotToPosition(
                this.conn2,
                SHOWER_BOT2_HOME_POSITION,
                "shower",
            );
            if (showerPositioned) {
                await this.syncVerifiedBotPosition(
                    this.conn2,
                    SHOWER_BOT2_HOME_POSITION,
                );
            }
        }
        if (this.conn3) {
            const casinoPositioned = await this.moveBotToPosition(
                this.conn3,
                GAME_MISTRESS_POSITION,
                "casino",
            );
            if (casinoPositioned) {
                await this.syncVerifiedBotPosition(
                    this.conn3,
                    GAME_MISTRESS_POSITION,
                );
            }
        }
        await this.liveCharacterStateSync?.reconcile();
        this.updateContainmentReadiness();
    };

    private async syncVerifiedBotPosition(
        connection: API_Connector,
        requestedPosition: { X: number; Y: number },
    ): Promise<void> {
        const diagnostic = await this.liveCharacterStateSync?.syncSelfPosition(
            connection,
            requestedPosition,
        );
        if (diagnostic) {
            recordBotPositionPersistence(connection, diagnostic);
        }
    }

    private async moveBotToPosition(
        connection: API_Connector,
        position: { X: number; Y: number },
        role: string,
    ): Promise<boolean> {
        let movementError: unknown;
        try {
            await connection.moveOnMapAndWait(position.X, position.Y);
        } catch (error) {
            movementError = error;
        }
        const movementTimedOut =
            movementError instanceof Error &&
            movementError.name === "MapPositionTimeout";
        const observation = await verifyBotMapPosition(
            connection,
            position,
            this.conn.chatRoom?.Name,
            movementTimedOut ? 3 : 1,
        );
        if (observation.state === "verified" && movementTimedOut) {
            observation.state = "verified-after-timeout";
        }
        if (
            observation.state === "verified" ||
            observation.state === "verified-after-timeout"
        ) {
            logger.info("Bot map position ready", {
                role,
                movementTimedOut,
                movementError:
                    movementError instanceof Error
                        ? movementError.name
                        : undefined,
                ...observation,
            });
            return true;
        }
        if (
            observation.state !== "room-not-ready" &&
            observation.state !== "map-not-ready"
        ) {
            logger.warn(
                "Bot map position command dispatched; observation pending",
                {
                    role,
                    movementTimedOut,
                    movementError:
                        movementError instanceof Error
                            ? movementError.name
                            : undefined,
                    ...observation,
                },
            );
            return true;
        }
        logger.error("Bot map position unavailable", movementError, {
            role,
            ...observation,
        });
        return false;
    }

    private updateContainmentReadiness(): void {
        const atPosition = (
            connection: API_Connector | undefined,
            position: { X: number; Y: number },
        ): boolean => {
            return (
                !!connection &&
                isBotRecoveryReady(connection) &&
                connection.chatRoom?.Name === this.conn.chatRoom?.Name &&
                !!connection.chatRoom?.map
            );
        };

        const mainReady = atPosition(this.conn, RECEPTIONIST_POSITION);
        const showerReady =
            !this.conn2 || atPosition(this.conn2, SHOWER_BOT2_HOME_POSITION);
        const casinoReady =
            !this.conn3 || atPosition(this.conn3, GAME_MISTRESS_POSITION);
        const kennelTriggersReady = this.kennelSystem?.isReady() ?? false;
        const cageTriggersReady = this.cageSystem?.isReady() ?? false;
        const persistenceReady = this.container.has(
            DIServiceKeys.GAME_STATE_MUTATION_SERVICE,
        );
        const dependency = (
            name: string,
            ready: boolean,
            reason: string,
            recoveryAction: string,
        ): ContainmentDependency => ({
            name,
            ready,
            reason,
            recoveryAction,
        });
        const mainDependency = dependency(
            "main bot room/map position",
            mainReady,
            mainReady
                ? "verified"
                : "main bot room, map, recovery, or position is unavailable",
            "reconnect the main bot and restore the receptionist position",
        );
        const persistenceDependency = dependency(
            "authoritative containment persistence",
            persistenceReady,
            persistenceReady
                ? "mutation service is registered"
                : "game-state mutation service is unavailable",
            "restore the mutation service and reconcile active containment",
        );
        const cageRecoveryDependency = dependency(
            "authoritative cage recovery",
            this.cageSystem?.isRecoveryReady() ?? false,
            this.cageSystem?.getRecoveryReadinessReason() ??
                "cage recovery has not completed",
            "reload cage locations and reconcile active cages",
        );
        const kennelRecoveryDependency = dependency(
            "authoritative kennel recovery",
            this.kennelSystem?.isRecoveryReady() ?? false,
            this.kennelSystem?.getRecoveryReadinessReason() ??
                "kennel recovery has not completed",
            "reload kennel locations and reconcile active kennels",
        );
        const showerDependency = dependency(
            "shower narrator position",
            showerReady,
            this.conn2
                ? showerReady
                    ? "verified"
                    : "shower bot room, map, recovery, or position is unavailable"
                : "optional shower narrator is not configured; main bot narration is used",
            "reconnect the shower narrator and restore its home position",
        );
        const casinoDependency = dependency(
            "casino bot position",
            casinoReady,
            this.conn3
                ? casinoReady
                    ? "verified"
                    : "casino bot room, map, recovery, or position is unavailable"
                : "casino bot is not configured",
            "reconnect the casino bot and restore the game mistress position",
        );
        const readiness = {
            cage: evaluateContainmentReadiness("cage", [
                mainDependency,
                dependency(
                    "cage triggers",
                    cageTriggersReady,
                    cageTriggersReady
                        ? "registered"
                        : "cage triggers are not registered",
                    "rebind the cage system to the current room and map",
                ),
                persistenceDependency,
                cageRecoveryDependency,
            ]),
            kennel: evaluateContainmentReadiness("kennel", [
                mainDependency,
                dependency(
                    "kennel triggers",
                    kennelTriggersReady,
                    kennelTriggersReady
                        ? "registered"
                        : "kennel triggers are not registered",
                    "rebind the kennel system to the current room and map",
                ),
                persistenceDependency,
                kennelRecoveryDependency,
            ]),
            release: evaluateContainmentReadiness("release", [
                mainDependency,
                persistenceDependency,
            ]),
            shower: evaluateContainmentReadiness("shower", [
                mainDependency,
                showerDependency,
            ]),
            casino: evaluateContainmentReadiness("casino", [casinoDependency]),
        } satisfies Record<ContainmentFeature, ContainmentReadinessDiagnostic>;
        const previous = this.containmentReadiness;
        this.setContainmentReadiness(readiness);

        for (const [feature, status] of Object.entries(readiness) as Array<
            [ContainmentFeature, ContainmentReadinessDiagnostic]
        >) {
            const previousStatus = previous.get(feature);
            if (previousStatus?.state === status.state) continue;
            const context = {
                feature,
                state: status.state,
                reason: status.reason,
                recoveryAction: status.recoveryAction,
                checkedAt: status.checkedAt,
            };
            if (status.ready) {
                logger.info(
                    `Veratown ${feature} capability ${status.state}`,
                    context,
                );
            } else {
                logger.warn(
                    `Veratown ${feature} capability ${status.state}`,
                    context,
                );
            }
        }
    }

    private onCommandFreeAndLeave = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        await this.freeCharacter(sender);
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

    private async freeCharacter(character: API_Character): Promise<void> {
        const logger = createLogger("Veratown.freeCharacter");

        // Use atomic appearance sync to prevent data corruption if process crashes
        // during strip-then-restore sequence
        try {
            await syncAppearanceMutation(
                character,
                async () => {
                    try {
                        await this.cageSystem?.freeCharacterIfCaged(character);
                        await this.kennelSystem?.freeCharacterIfKenneled(
                            character,
                        );
                    } catch (e) {
                        logger.error(
                            "Failed to record containment release",
                            e as Error,
                            { memberNumber: character.MemberNumber },
                        );
                        return;
                    }

                    try {
                        // Strip every bind item (locked or not) regardless of which bot
                        // system placed it - dare game bondage/pillory/kennel, casino
                        // forfeits, veratown cages, etc. Collars (ItemNeck/
                        // ItemNeckAccessories) are intentionally left alone by stripBulk.
                        character.Appearance.stripBulk({ item: true }, true);
                        logger.info("Character freed from bondage", {
                            memberNumber: character.MemberNumber,
                        });
                    } catch (e) {
                        logger.error(
                            "Failed to strip bondage items",
                            e as Error,
                            {
                                memberNumber: character.MemberNumber,
                            },
                        );
                    }
                },
                100,
            );
        } catch (err) {
            logger.error("freeCharacter mutation failed", err as Error);
        }
    }

    // EPIC 1.3 System Accessors
    public getFurnitureInteractionSystem():
        FurnitureInteractionSystem | undefined {
        return this.furnitureInteractionSystem;
    }

    public getAppearanceAuditTrail(): AppearanceAuditTrail | undefined {
        return this.appearanceAuditTrail;
    }

    public getLocationEventSystem(): LocationEventSystem | undefined {
        return this.locationEventSystem;
    }

    public getPlayerRoleSystem(): PlayerRoleSystem | undefined {
        return this.playerRoleSystem;
    }

    public getDIContainer(): DIContainer {
        return this.container;
    }
}
