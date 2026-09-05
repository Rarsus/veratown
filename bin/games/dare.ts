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
    CommandParser,
    API_Character,
    BC_Server_ChatRoomMessage,
    AssetGet,
    MapRegion,
    isBind,
} from "bc-bot";
import { wait } from "../hub/utils";
import { GameTimer } from "./casino/gameTimer";
import { CommandValidator } from "./shared/commandValidator";
import { UnifiedCharacterStore } from "./shared/unifiedCharacterStore";
import {
    GameStateMutationService,
    GameStateMutationServiceImpl,
} from "./shared/gameStateMutationService";
import { DareDataService, DareDoc } from "./dare/dareDataService";
import { DareStateService } from "./dare/dareStateService";
import {
    applyForfeitForDare,
    describeForfeitOutcome,
    lockInForfeitKennel,
} from "./casino/forfeits";
import { VeratownFeatureSystem, guardHandler } from "./veratown/featureSystem";
import { VeratownLocationDoc } from "./veratown/veratownLocationStore";
import { createLogger } from "../logging";
import type { GamePlugin, GamePluginCommandRouter } from "./shared/gamePlugin";
import { GamePluginCommandRouterImpl } from "./shared/gamePluginCommandRouter";
import { GamePluginMessageFeatureSystem } from "./shared/gamePluginMessageFeatureSystem";

// Epic 1.2 Manager Imports (Feature 1.2.7 Integration)
import { TurnOrderManager } from "./dare/turnOrderManager";
import { TurnTimerManager } from "./dare/turnTimerManager";
import { DisconnectTracker } from "./dare/disconnectTracker";
import { GameParticipantManager } from "./dare/gameParticipant";
import { DareCommandHandlers } from "./dare/commandHandlers";
import { DareEffectApplier } from "./dare/dareEffectApplier";
import { GameManager, Game } from "./dare/gameManager";

// How long a repeat dare-evader stays locked in the pillory (first pass is
// only locked until their next draw instead - see the "pass" command).
const PILLORY_REPEAT_LOCK_MS = 4 * 60 * 60 * 1000;

// How long a player gets to "!dare forfeit" into the kennel instead of
// having a drawn bondage dare's effect applied automatically.
const BONDAGE_DECISION_MS = 15 * 1000;

// How often dressing-blocked players get any redressed clothing stripped
// back off. Runs continuously (not just while a game is active), since a
// stripped/noRedress-bound player stays blocked after the game too, until
// their last dare-applied bondage item is gone (see enforceDressingBlocks()).
const STRIP_ENFORCE_INTERVAL_MS = 20 * 1000;

// How long someone can sit on their turn without drawing before getting a
// reminder, and before the bot passes on their behalf entirely.
const TURN_REMINDER_MS = 30 * 1000;
const TURN_AUTO_PASS_MS = 60 * 1000;

// How long a player who disconnects (leaves the room) from the lobby or an
// active game gets to return before being purged entirely.
const DISCONNECT_GRACE_MS = 60 * 1000;

// How many structured games can run at once. Each is fully independent -
// own roster, turn order and round counter - and shares only the deck.
const MAX_CONCURRENT_GAMES = 3;

// Total rounds in a structured game
const TOTAL_ROUNDS = 10;

export interface DareConfig {
    // If set, dare commands are only handled while the sender stands
    // inside this map region.
    region?: MapRegion;
}

export class Dare implements GamePlugin {
    public readonly key = "dare";
    public readonly label = "Dare Game";
    public readonly critical = false;
    // Toggled via "/bot feature enable|disable dare". When disabled, !dare
    // and !pick simply reply that the feature is off instead of acting.
    public enabled = true;

    public static description_intro = `(Dares
 =====

A structured bondage/strip dare game for a group, played over 10 rounds
with turn order - or just casual free-for-all drawing if nobody starts a
game. Whisper !dare help any time for the full rundown.

Game Overview
=====
1. Everyone who wants to play whispers !dare join to sign up to the lobby.
2. Once at least 2 people are in the lobby, anyone can start a game with
   !dare start. This locks in a random turn order for everyone currently
   in the lobby and begins round 1 of 10 - the lobby is then empty again,
   so new joiners form the next, separate game - up to 3 games at once.
3. Once a game has started, nobody else can join it - they'll be told to
   join the lobby instead and start their own game.
4. On your turn, !dare draw draws a random card. Strip, bondage and reward
   dares are applied automatically - to yourself, or to a random other
   participant in your game if the dare calls for it.
5. Don't want to do your dare? !dare pass - you'll be locked into the
   pillory until your next draw: and it counts against you. Pass again
   and you're pilloried for 4 hours with a sign reading "Evades / Dares"!
6. Drawn a bondage dare? You get a short window to !dare forfeit instead -
   skip the specific bondage and get locked into a heavy kennel instead.
7. The bot announces whose turn is next after every draw. Once everyone's
   gone, the round advances - 10 rounds total.
8. Win condition: when round 10 finishes, whoever picked up the FEWEST
   binds over the whole game wins, and is automatically freed from all
   their bondage. Everyone else stays locked up until their timers run out!
9. Stripped by a dare? You stay bare - blocked from getting dressed - until
   every last bit of your dare-applied bondage is gone, even after the game
   ends. The bot keeps stripping anything you try to put back on early.
10. If a body part is already bound when a new bondage dare targets it, the
    existing lock's timer is extended instead of piling on more gear.
11. Not responding on your turn? You'll get a reminder after 30 seconds,
    and after 60 seconds the bot passes on your behalf, with the usual
    pillory consequence, escalating on a second miss.
12. Disconnect from the room and you get a 60 second grace period to
    return before being purged from the lobby/game entirely. Game state
    survives a bot restart too.
`;

    public static description_commands = `(Commands
=====
!dare join              - Join the lobby, waiting for a game to start.
!dare leave             - Leave the lobby/game you're currently in.
!dare start             - Start a fresh 10-round game with everyone in the
                          lobby.
!dare turn              - Show whose turn it currently is in your game.
!dare draw              - Draw a dare card - on your turn, if playing.
!dare pass              - Chicken out of your last drawn dare - forfeit.
!dare forfeit           - After drawing bondage, get kenneled instead.
!dare players           - Whisper the lobby and every running game's roster.
!dare remove <who>      - [admin only] Remove a player from dare entirely.
!dare stop <gameId>     - [admin only] Stop a running dare game.
!dare add <dare>        - [admin only] Add a new dare card to the deck.
!dare list <page>       - [admin only] List dares in the database.
!dare reset             - [admin only] Reset the deck / mark all unused.
!dare validate          - [admin only] Check/repair the dare database.
!dare balancerewards    - [admin only] Top up reward dares to ~25% of deck.
!dare help              - Show this message.)
`;
    public static description_rules = `(Rules
=====
1. !dare join before you start, so you can be picked as a dare's target and
   take your turn in a structured game.
2. For dares involving someone else, the dare is applied to a random other
   joined participant automatically - no need to spin anything yourself.
3. Dares last 10 minutes unless the dare says otherwise.
4. Don't want to do your dare? !dare pass - but you'll be locked into the
   pillory until your next draw, and it counts against you. Pass again on
   a later turn and it's 4 hours in the pillory with a shaming sign!
5. Bondage dares give you a short window to !dare forfeit into a heavy,
   exclusively-locked kennel instead of the specific bondage drawn.
6. If the spot a dare wants to bind is already covered, the existing
   item's timer is extended rather than adding a second item there.
7. Stripped/noRedress players stay dressing-blocked until every last bit
   of their dare-applied bondage is gone - even after their game ends.
8. At the end of round 10, the player with the fewest binds wins and is
   freed from all their bondage and redressed in their original outfit.
9. Ignore your turn too long and the bot passes for you automatically.
   Disconnecting gives you 60 seconds to return before you're purged.
   Last one standing in a game wins by default.
10. Up to 3 separate dare games can run at once; once a game starts,
    nobody new can join it - they join the lobby and start their own.)
`;
    public static description =
        Dare.description_intro +
        "\n" +
        Dare.description_commands +
        "\n" +
        Dare.description_rules;

    // Resolves once persisted state (lobby, games, per-member bookkeeping)
    // has been loaded from the database - awaited at the top of every
    // command handler so a just-restarted bot doesn't act on empty state.
    private ready: Promise<void>;

    // Tracks the dare each player most recently drew but hasn't resolved
    // yet, so "!dare pass" knows what to forfeit against.
    private pendingDraws = new Map<number, DareDoc>();

    // Players who've done "!dare join" but aren't in a running game yet.
    // Starting a game moves everyone currently here into a new, separate
    // Game and empties the lobby for the next group.
    private lobby = new Set<number>();

    // Game manager (Phase 3 refactoring: owns all games and turn state)
    private gameManager: GameManager;

    // How many bondage items each member has been forfeited into over the
    // course of their current game, used to decide the round-10 winner.
    private bindCounts = new Map<number, number>();

    // Scheduled auto-apply timers (and their absolute deadlines, for
    // persistence) for bondage dares currently in their "!dare forfeit"
    // decision window, keyed by the drawer's member number.
    // Bondage deadline tracking (timers managed by turnTimerManager)
    private pendingBondageDeadlines = new Map<number, number>();

    // Members currently blocked from getting dressed - either their
    // clothing was stripped by a dare, or they're bound by a "noRedress"
    // bondage dare. Stays populated past the end of the game: only cleared
    // once the member has no dare-applied (bot-locked) bondage left on them
    // (see enforceDressingBlocks()), at which point their original outfit
    // is automatically restored. Maps to the clothing-item cap that member
    // was actually dared to lose - undefined means "everything" (a
    // stripCount-less strip dare, or a noRedress bondage dare) - so
    // re-enforcement only strips back down to that same partial cap
    // instead of always stripping every last stitch of clothing.
    private dressingBlocked = new Map<number, number | undefined>();

    // How many times each member has passed on a drawn dare this game -
    // the 2nd+ pass escalates the pillory into a long timed, signed one.
    private passCounts = new Map<number, number>();
    // Members currently pilloried "until their next draw" (first pass),
    // released automatically the next time they successfully !dare draw.
    private pilloriedUntilNextDraw = new Set<number>();

    // Members who've left the room and are on their 1-minute grace period
    // before being purged from the lobby/game they were in.
    // (Phase 5: Managed by disconnectTracker)
    private disconnectGraceTimers = new Map<number, GameTimer>();
    // Timestamps for persistence (kept in sync with disconnectTracker)
    private disconnectedAt = new Map<number, number>();

    private region?: MapRegion;
    private dareRegion?: MapRegion;
    private configuredRegion?: MapRegion;
    private readonly logger = createLogger("Dare");
    private commandValidator = new CommandValidator();

    // Epic 1.2 Managers (Feature 1.2.7 Integration)
    private turnOrderManager: TurnOrderManager;
    private turnTimerManager: TurnTimerManager;
    private disconnectTracker: DisconnectTracker;
    private participantManager: GameParticipantManager;
    private commandHandlers: DareCommandHandlers;
    private effectApplier: DareEffectApplier;
    private mutationService: GameStateMutationService;
    private readonly messageFeatureSystem: GamePluginMessageFeatureSystem;

    /**
     * DARE SYSTEM CONSTRUCTOR - Three-Layer Architecture
     *
     * Layer 1: unifiedStore → UnifiedCharacterStore (character state: bonds, stats)
     * Layer 2: dareStateService → DareStateService (system state: games, lobbies)
     * Layer 3: dareDataService → DareDataService (reference data: dare definitions)
     *
     * PLUGGABILITY: No circular dependencies or external system dependencies.
     * This system is fully self-contained and independently testable.
     */
    public constructor(
        private conn: API_Connector,
        private commandParser?: CommandParser,
        private unifiedStore: UnifiedCharacterStore = undefined as any,
        private dareDataService?: DareDataService,
        private dareStateService?: DareStateService,
        private config?: DareConfig,
        mutationService?: GameStateMutationService,
    ) {
        // Initialize unified store (Layer 1: character state)
        this.unifiedStore =
            unifiedStore ||
            (global as any).unifiedCharacterStore ||
            new UnifiedCharacterStore(undefined as any);
        this.mutationService =
            mutationService ??
            new GameStateMutationServiceImpl(
                this.unifiedStore,
                this.unifiedStore.getEventBus(),
            );

        // Initialize dare data service (Layer 3: reference data)
        // If not provided, will be injected later via setter
        if (!this.dareDataService && (global as any).dareDataService) {
            this.dareDataService = (global as any).dareDataService as any;
        }

        // Initialize dare state service (Layer 2: system state)
        // If not provided, will be injected later via setter
        if (!this.dareStateService && (global as any).dareStateService) {
            this.dareStateService = (global as any).dareStateService as any;
        }

        this.region = config?.region;
        this.configuredRegion = config?.region;

        // Initialize Epic 1.2 managers (Feature 1.2.7 Integration)
        this.turnOrderManager = new TurnOrderManager();
        this.turnTimerManager = new TurnTimerManager();
        this.disconnectTracker = new DisconnectTracker();
        this.participantManager = new GameParticipantManager();
        this.commandHandlers = new DareCommandHandlers();
        this.effectApplier = new DareEffectApplier(this.mutationService);
        this.gameManager = new GameManager(); // Phase 3: Game management
        this.messageFeatureSystem = new GamePluginMessageFeatureSystem(
            this.conn,
            this.key,
            this.label,
            () => this.enabled,
            async (sender, msg, command, args) =>
                command === "pick"
                    ? this.onPick(sender, msg, args)
                    : this.onDare(sender, msg, [command, ...args]),
            async (sender) => {
                this.whisper(
                    sender.MemberNumber,
                    "The dare game is currently disabled in this room.",
                );
            },
        );
        if (this.commandParser) {
            this.registerCommands(
                new GamePluginCommandRouterImpl(this.commandParser, this.key),
            );
        }

        this.ready = this.loadState().catch((e) => {
            this.logger.error("Failed to load persisted state", { error: e });
        });
    }

    /**
     * Phase 5: Direct UnifiedCharacterStore access (no adapters)
     * Returns the unified store for direct access to character state
     */
    public getUnifiedStore(): UnifiedCharacterStore {
        return this.unifiedStore!;
    }

    /**
     * Initialize the Dare plugin. Called once during bot startup.
     * Loads persisted game state from the database.
     */
    public async init(): Promise<void> {
        // State loading happens in ready promise
        await this.ready;
    }

    /**
     * Register Dare commands via the GamePluginCommandRouter.
     * Called during Veratown plugin initialization.
     */
    public registerCommands(router: GamePluginCommandRouter): void {
        router.registerRoot(this.onDare);
        router.registerCommand("pick", this.routePickCommand);
    }

    private routePickCommand = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ): Promise<void> => {
        await this.messageFeatureSystem.processCommand(
            sender,
            msg,
            "pick",
            args,
        );
    };

    /**
     * Get current Dare game status.
     * Used for diagnostics and monitoring.
     */
    public getStatus(): string {
        const gameCount = this.gameManager.getGameCount();
        const lobbySize = this.lobby.size;
        return `Dare: ${this.enabled ? "enabled" : "disabled"} | Lobby: ${lobbySize} | Active games: ${gameCount}`;
    }

    /**
     * Cleanup when the plugin is being stopped.
     * Optionally saves state and stops timers.
     */
    public async cleanup?(): Promise<void> {
        this.turnTimerManager.clearAll();
        // Additional cleanup as needed
    }

    /**
     * Registers event listeners and triggers for the Dare plugin.
     * Called once during Veratown startup after registerCommands().
     * Note: Command registration happens in registerCommands() via GamePluginCommandRouter.
     */
    public registerTriggers(): void {
        this.conn.on(
            "CharacterLeft",
            guardHandler("dare", this.onCharacterLeft),
        );
        this.conn.on(
            "CharacterEntered",
            guardHandler("dare", this.onCharacterEntered),
        );

        // Dressing-block enforcement runs continuously, independent of any
        // game's lifecycle, so it also covers players still bound after a
        // structured game ends (see dressingBlocked's doc comment above).
        this.turnTimerManager.startStripEnforcementInterval(
            STRIP_ENFORCE_INTERVAL_MS,
            () => this.enforceDressingBlocks(),
        );
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        this.dareRegion = undefined;
        this.region = this.configuredRegion;
        const region = locations.find(
            (location) =>
                location.type === "dare_region" &&
                location.enabled &&
                typeof location.x === "number" &&
                typeof location.y === "number" &&
                typeof location.data?.bottomRightX === "number" &&
                typeof location.data?.bottomRightY === "number",
        );
        if (region) {
            this.dareRegion = {
                TopLeft: { X: region.x!, Y: region.y! },
                BottomRight: {
                    X: region.data!.bottomRightX as number,
                    Y: region.data!.bottomRightY as number,
                },
            };
            this.region = this.dareRegion;
        }
        this.logger.info(
            `Loaded dare region: ${this.dareRegion ? "from database" : "using config fallback or none"}`,
        );
    }

    private whisper = (memberNumber: number, text: string): void => {
        this.conn.SendMessage("Whisper", text, memberNumber);
    };

    onDare = async (
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.enabled) {
            this.whisper(
                senderCharacter.MemberNumber,
                "The dare game is currently disabled in this room.",
            );
            return;
        }

        await this.ready;

        if (!this.requireInDareRegion(senderCharacter, msg)) return;

        this.pruneUnavailableParticipants();

        if (args.length < 1) {
            this.conn.SendMessage(
                "Emote",
                "*" + ((await this.dareDataService?.getSummary()) ?? ""),
            );
            return;
        }

        const subcommand = args[0].toLowerCase();

        // Validate argument count based on subcommand (Phase 2C consolidation)
        // Most dare subcommands take just 1 argument (the subcommand itself)
        // except "forfeit" which takes 2 (subcommand + forfeit item)
        let expectedArgCount = 1;
        if (subcommand === "forfeit") {
            expectedArgCount = 2;
        }

        const argCountResult = this.commandValidator.validateArgumentCount(
            args,
            expectedArgCount,
        );
        if (!argCountResult.valid) {
            this.whisper(
                senderCharacter.MemberNumber,
                argCountResult.message || "Invalid command arguments.",
            );
            return;
        }

        switch (args[0]) {
            case "join": {
                const activeGameId = this.gameManager.getPlayerGame(
                    senderCharacter.MemberNumber,
                );
                if (activeGameId !== undefined) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        `You're already playing in dare game #${activeGameId} - you can't join another until it finishes.`,
                    );
                    return;
                }
                if (this.lobby.has(senderCharacter.MemberNumber)) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "You're already joined.",
                    );
                    return;
                }
                this.lobby.add(senderCharacter.MemberNumber);
                this.conn.SendMessage(
                    "Emote",
                    `*${senderCharacter} joins the dare lobby! (${this.lobby.size} waiting to start)`,
                );
                this.persistState();
                break;
            }
            case "leave": {
                const inLobby = this.lobby.has(senderCharacter.MemberNumber);
                const inGame = this.gameManager.getPlayerGame(
                    senderCharacter.MemberNumber,
                );
                if (!inLobby && !inGame) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "You're not currently joined.",
                    );
                    return;
                }
                const result = this.removeParticipantByMemberNumber(
                    senderCharacter.MemberNumber,
                    "left the dare game.",
                );
                if (result.removedFromJoined && !result.removedFromGame) {
                    this.conn.SendMessage(
                        "Emote",
                        `*${senderCharacter} leaves the dare lobby.`,
                    );
                }
                break;
            }
            case "start": {
                this.pruneUnavailableParticipants();
                if (
                    this.gameManager.getPlayerGame(senderCharacter.MemberNumber)
                ) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "You're already playing in an active dare game - finish that one before starting another.",
                    );
                    return;
                }
                if (this.lobby.size < 2) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "Need at least 2 joined players (!dare join) to start a game.",
                    );
                    return;
                }
                if (this.gameManager.getGameCount() >= MAX_CONCURRENT_GAMES) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        `Maximum of ${MAX_CONCURRENT_GAMES} concurrent dare games are already running - wait for one to finish.`,
                    );
                    return;
                }

                const turnOrder = [...this.lobby].sort(
                    () => Math.random() - 0.5,
                );
                this.lobby.clear();

                // Create game via GameManager
                const game = this.gameManager.createGame(turnOrder);

                // Snapshot everyone's current outfit before the game can
                // touch it, so the eventual winner can be redressed exactly
                // as they were at the start (see declareWinner()).
                for (const memberNumber of turnOrder) {
                    const character =
                        this.conn.chatRoom!.findMember(memberNumber);
                    if (character)
                        await this.captureOriginalOutfitIfMissing(character);
                }

                const order = turnOrder
                    .map((m) => this.describeMember(m))
                    .join(" -> ");
                this.conn.SendMessage(
                    "Emote",
                    `*Dare game #${game.id} begins! ${TOTAL_ROUNDS} rounds, turn order: ${order}.`,
                );
                this.announceTurn(game.id);
                this.startTurnTimers(game.id);
                break;
            }
            case "players": {
                this.pruneUnavailableParticipants();
                const lines: string[] = [];
                lines.push(
                    this.lobby.size === 0
                        ? "Lobby: nobody is currently waiting to start a game."
                        : `Lobby (${this.lobby.size}): ${[...this.lobby].map((m) => this.describeMember(m)).join(", ")}`,
                );
                const games = this.gameManager.getAllGames();
                if (games.length === 0) {
                    lines.push("No dare games are currently running.");
                } else {
                    for (const game of games) {
                        lines.push(
                            `Game #${game.id} (round ${game.round}/${TOTAL_ROUNDS}): ${game.turnOrder.map((m) => this.describeMember(m)).join(", ")}`,
                        );
                    }
                }
                this.whisper(senderCharacter.MemberNumber, lines.join("\n"));
                break;
            }
            case "turn": {
                const gameId = this.gameManager.getPlayerGame(
                    senderCharacter.MemberNumber,
                );
                if (gameId === undefined) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "You're not in an active dare game - use !dare start to begin one.",
                    );
                    return;
                }
                this.announceTurn(gameId);
                break;
            }
            case "remove": {
                if (!senderCharacter.IsRoomAdmin()) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "Only admins can use this command.",
                    );
                    return;
                }
                const who = args[1];
                if (!who) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "Usage: !dare remove <name or member number>",
                    );
                    return;
                }
                const memberNumber = this.resolveParticipantMemberNumber(who);
                if (memberNumber === undefined) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "I can't find a joined dare player by that name/member number.",
                    );
                    return;
                }
                const result = this.removeParticipantByMemberNumber(
                    memberNumber,
                    `was removed from the dare game by admin ${senderCharacter}.`,
                );
                if (result.removedFromJoined && !result.removedFromGame) {
                    this.conn.SendMessage(
                        "Emote",
                        `*${this.describeMember(memberNumber)} was removed from the dare lobby by admin ${senderCharacter}.`,
                    );
                }
                break;
            }
            case "stop": {
                if (!senderCharacter.IsRoomAdmin()) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "Only admins can use this command.",
                    );
                    return;
                }
                const games = this.gameManager.getAllGames();
                if (games.length === 0) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "No dare games are currently running.",
                    );
                    return;
                }
                const gameId = Number.parseInt(args[1], 10);
                if (
                    !Number.isInteger(gameId) ||
                    !this.gameManager.getGame(gameId)
                ) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        `Usage: !dare stop <gameId>. Currently running: ${games.map((g) => g.id).join(", ")}`,
                    );
                    return;
                }
                this.resetGameState(gameId);
                this.conn.SendMessage(
                    "Emote",
                    `*Dare game #${gameId} was stopped by admin ${senderCharacter}.`,
                );
                break;
            }
            case "help":
                this.whisper(
                    senderCharacter.MemberNumber,
                    Dare.description_intro,
                );
                this.whisper(
                    senderCharacter.MemberNumber,
                    Dare.description_commands,
                );
                this.whisper(
                    senderCharacter.MemberNumber,
                    Dare.description_rules,
                );
                break;
            case "forfeit": {
                const hasTimer = this.turnTimerManager.hasBondageDecisionTimer(
                    senderCharacter.MemberNumber,
                );
                if (!hasTimer) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "You don't have a bondage dare pending to forfeit out of!",
                    );
                    return;
                }
                this.turnTimerManager.clearForPlayer(
                    senderCharacter.MemberNumber,
                );
                this.pendingBondageDeadlines.delete(
                    senderCharacter.MemberNumber,
                );
                this.pendingDraws.delete(senderCharacter.MemberNumber);

                lockInForfeitKennel(
                    senderCharacter,
                    this.conn.Player.MemberNumber,
                );
                this.addBinds(senderCharacter.MemberNumber, 2);
                this.conn.SendMessage(
                    "Emote",
                    `*${senderCharacter} can't face that bondage and taps out - the bot scoops them up and seals them into a heavy kennel instead, exclusively locked until someone lets them out!`,
                );
                this.finishTurn(senderCharacter.MemberNumber);
                this.persistState();
                break;
            }
            case "add":
                if (!senderCharacter.IsRoomAdmin()) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "Only admins can use this command.",
                    );
                    return;
                }
                if (args.length < 2) {
                    this.conn.SendMessage("Emote", "*Usage: !dare add <dare>");
                    return;
                }

                // Add dare to the database via DareDataService (Layer 3)
                const dareText = args.slice(1).join(" ");
                await this.dareDataService?.addDare({
                    text: dareText,
                    category: "custom",
                    originalAuthor: senderCharacter.Name,
                });

                this.conn.SendMessage(
                    "Emote",
                    `*Dare saved, thanks ${senderCharacter}! ${await this.dareDataService?.getSummary()}`,
                );

                break;
            case "draw": {
                const gameId = this.gameManager.getPlayerGame(
                    senderCharacter.MemberNumber,
                );
                let game: Game | undefined;
                if (gameId !== undefined) {
                    game = this.gameManager.getGame(gameId);
                    const currentTurn =
                        this.gameManager.getCurrentPlayer(gameId);
                    if (senderCharacter.MemberNumber !== currentTurn) {
                        this.whisper(
                            senderCharacter.MemberNumber,
                            `It's not your turn! Waiting on ${this.describeMember(currentTurn ?? -1)}.`,
                        );
                        return;
                    }
                    if (game) this.gameManager.clearTurnTimers(game.id);
                }

                if (
                    this.pilloriedUntilNextDraw.delete(
                        senderCharacter.MemberNumber,
                    )
                ) {
                    senderCharacter.Appearance.RemoveItem("ItemArms");
                    this.conn.SendMessage(
                        "Emote",
                        `*The pillory releases ${senderCharacter} just in time for their next draw!`,
                    );
                }

                this.conn.SendMessage(
                    "Emote",
                    `*${senderCharacter} draws a dare card...`,
                );
                await wait(2000);

                const dare = await this.dareDataService?.drawDare();
                if (!dare) {
                    this.conn.SendMessage("Emote", `*No more dares left!`);
                    return;
                }
                this.conn.SendMessage(
                    "Emote",
                    `*${senderCharacter} draws: ${dare.text}\n${(await this.dareDataService?.getSummary()) ?? ""}`,
                );

                this.pendingDraws.set(senderCharacter.MemberNumber, dare);

                if (dare.category === "bondage") {
                    this.conn.SendMessage(
                        "Emote",
                        `*${senderCharacter} has ${BONDAGE_DECISION_MS / 1000} seconds to !dare forfeit into the kennel instead, or !dare pass to chicken out entirely - otherwise the bondage locks in automatically!`,
                    );
                    this.pendingBondageDeadlines.set(
                        senderCharacter.MemberNumber,
                        Date.now() + BONDAGE_DECISION_MS,
                    );
                    this.turnTimerManager.startBondageDecisionTimer(
                        senderCharacter.MemberNumber,
                        BONDAGE_DECISION_MS,
                        () => {
                            this.autoApplyPendingBondage(
                                senderCharacter.MemberNumber,
                                dare,
                            );
                        },
                    );
                    this.persistState();
                } else {
                    await this.applyDareEffect(senderCharacter, dare);
                    this.finishTurn(senderCharacter.MemberNumber);
                }
                break;
            }
            case "pass": {
                const pending = this.pendingDraws.get(
                    senderCharacter.MemberNumber,
                );
                if (!pending) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "You haven't drawn a dare to pass on!",
                    );
                    return;
                }
                this.pendingDraws.delete(senderCharacter.MemberNumber);

                if (
                    this.turnTimerManager.hasBondageDecisionTimer(
                        senderCharacter.MemberNumber,
                    )
                ) {
                    this.turnTimerManager.clearForPlayer(
                        senderCharacter.MemberNumber,
                    );
                    this.pendingBondageDeadlines.delete(
                        senderCharacter.MemberNumber,
                    );
                }

                this.applyPassConsequence(senderCharacter);
                this.finishTurn(senderCharacter.MemberNumber);
                this.persistState();
                break;
            }
            case "reset":
                if (!senderCharacter.IsRoomAdmin()) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "Only admins can use this command.",
                    );
                    return;
                }
                if (!this.dareDataService) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "Dare service not available",
                    );
                    return;
                }
                await this.dareDataService.resetDares();
                const summary = await this.dareDataService.getSummary();
                this.conn.SendMessage(
                    "Emote",
                    "*" + (summary || "Dare deck reset."),
                );
                break;
            case "validate": {
                if (!senderCharacter.IsRoomAdmin()) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "Only admins can use this command.",
                    );
                    return;
                }

                const result = await this.dareDataService?.validateDares();
                if (!result) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "Dare service not available",
                    );
                    return;
                }

                const allIssues = [...result.errors, ...result.warnings];
                const summary =
                    result.valid === true
                        ? "✓ All dares are valid!"
                        : `✗ Found ${allIssues.length} issue(s)`;

                const shown = allIssues.slice(0, 20);
                const extra =
                    allIssues.length > shown.length
                        ? `\n...and ${allIssues.length - shown.length} more.`
                        : "";

                if (result.suggestions.length > 0) {
                    shown.push(
                        `\nSuggestions:\n${result.suggestions.join("\n")}`,
                    );
                }

                this.whisper(
                    senderCharacter.MemberNumber,
                    shown.length > 0
                        ? `${summary}\n${shown.join("\n")}${extra}`
                        : summary,
                );
                break;
            }
            case "balancerewards": {
                if (!senderCharacter.IsRoomAdmin()) {
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "Only admins can use this command.",
                    );
                    return;
                }

                const result =
                    await this.dareDataService?.ensureRewardRatio(0.15);
                this.whisper(
                    senderCharacter.MemberNumber,
                    result || "Dare service not available",
                );
                break;
            }
            case "list": {
                try {
                    this.logger.info(
                        `List command from ${senderCharacter.MemberNumber}, admin=${senderCharacter.IsRoomAdmin()}, args=${JSON.stringify(args)}`,
                        { memberNumber: senderCharacter.MemberNumber },
                    );

                    if (!senderCharacter.IsRoomAdmin()) {
                        this.whisper(
                            senderCharacter.MemberNumber,
                            "Only admins can use this command.",
                        );
                        return;
                    }
                    const result = await this.dareDataService?.listDares(10, 0);
                    if (!result) {
                        this.whisper(
                            senderCharacter.MemberNumber,
                            "Dare service not available",
                        );
                        return;
                    }

                    const {
                        dares,
                        total: totalDares,
                        page,
                        pages: totalPages,
                    } = result;

                    this.logger.info(`List command found dares`, {
                        count: totalDares,
                        memberNumber: senderCharacter.MemberNumber,
                    });

                    if (dares.length === 0) {
                        this.whisper(
                            senderCharacter.MemberNumber,
                            "No dares in the database.",
                        );
                        return;
                    }

                    // Parse requested page
                    let requestedPage = parseInt(args[1], 10);
                    if (!Number.isInteger(requestedPage) || requestedPage < 1) {
                        requestedPage = 1;
                    }
                    if (requestedPage > totalPages) {
                        requestedPage = totalPages;
                    }

                    // Load the requested page
                    const pageResult =
                        requestedPage === page
                            ? result
                            : await this.dareDataService?.listDares(
                                  10,
                                  requestedPage - 1,
                              );

                    if (!pageResult) {
                        this.whisper(
                            senderCharacter.MemberNumber,
                            "Failed to load page",
                        );
                        return;
                    }

                    const lines = pageResult.dares.map(
                        (d, i) =>
                            `${(requestedPage - 1) * 10 + i + 1}. ${d.text.replace(/[()]/g, "")}`,
                    );
                    lines.push(
                        `Page ${requestedPage} of ${totalPages} - !dare list <page> for more`,
                    );

                    this.whisper(
                        senderCharacter.MemberNumber,
                        lines.join("\n"),
                    );
                } catch (e) {
                    this.logger.error("Failed to list dares", {
                        error: e,
                        memberNumber: senderCharacter.MemberNumber,
                    });
                    this.whisper(
                        senderCharacter.MemberNumber,
                        "Something went wrong listing dares, sorry!",
                    );
                }
                break;
            }
            default:
                this.conn.SendMessage(
                    "Emote",
                    "*Usage: !dare <join|leave|start|turn|draw|pass|forfeit|players|remove|stop|add|reset|list|validate|balancerewards|help>",
                );
                return;
        }
    };

    private requireInDareRegion = (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
    ): boolean => {
        if (!this.region) return true;
        if (this.isInRegion(sender, this.region)) return true;

        this.whisper(
            sender.MemberNumber,
            "Dare commands only work inside the dare area on the map.",
        );
        return false;
    };

    private isInRegion = (
        character: API_Character,
        region: MapRegion,
    ): boolean => {
        const { X, Y } = character.MapPos;
        return (
            X >= region.TopLeft.X &&
            X <= region.BottomRight.X &&
            Y >= region.TopLeft.Y &&
            Y <= region.BottomRight.Y
        );
    };

    private pruneUnavailableParticipants = (): void => {
        const online = new Set(
            (this.conn.chatRoom?.characters ?? []).map((c) => c.MemberNumber),
        );

        for (const memberNumber of [...this.lobby]) {
            if (online.has(memberNumber)) continue;
            // Already on its own disconnect-grace timer - let that handle
            // the eventual purge instead of racing it here.
            if (this.disconnectGraceTimers.has(memberNumber)) continue;
            this.lobby.delete(memberNumber);
            this.cleanupMemberBookkeeping(memberNumber);
        }

        for (const game of [...this.gameManager.getAllGames()]) {
            for (const memberNumber of [...game.turnOrder]) {
                if (online.has(memberNumber)) continue;
                if (this.disconnectGraceTimers.has(memberNumber)) continue;
                this.removeParticipantByMemberNumber(
                    memberNumber,
                    "is no longer available and is removed from the dare game.",
                );
            }
        }
    };

    private normalizeStripCount = (value: unknown): number | undefined => {
        if (value === undefined || value === null) return undefined;
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return undefined;
        return Math.max(1, Math.floor(parsed));
    };

    // Removes all per-member bookkeeping not tied to a specific game (used
    // whether the member is leaving the lobby or a running game entirely).
    private cleanupMemberBookkeeping = (memberNumber: number): void => {
        this.pendingDraws.delete(memberNumber);
        this.pilloriedUntilNextDraw.delete(memberNumber);
        this.dressingBlocked.delete(memberNumber);
        this.passCounts.delete(memberNumber);
        this.bindCounts.delete(memberNumber);

        this.turnTimerManager.clearForPlayer(memberNumber);
        this.pendingBondageDeadlines.delete(memberNumber);
    };

    private resolveParticipantMemberNumber = (
        input: string,
    ): number | undefined => {
        const isTracked = (memberNumber: number): boolean =>
            this.lobby.has(memberNumber) ||
            this.gameManager.getPlayerGame(memberNumber) !== undefined;

        const asNumber = Number.parseInt(input, 10);
        if (Number.isInteger(asNumber) && isTracked(asNumber)) return asNumber;

        const fromRoom = this.conn.chatRoom!.findCharacter(input);
        if (fromRoom && isTracked(fromRoom.MemberNumber)) {
            return fromRoom.MemberNumber;
        }

        return undefined;
    };

    private describeMember = (memberNumber: number): string => {
        const character = this.conn.chatRoom!.findMember(memberNumber);
        return character ? `${character}` : `#${memberNumber}`;
    };

    // Descriptive strip emote, instead of a flat "strips off" statement.
    private describeStrip = (target: API_Character, dare: DareDoc): string => {
        const stripCount = this.normalizeStripCount(dare.stripCount);
        if (stripCount === 1) {
            return `*${target} peels off a single item of clothing and tosses it aside.`;
        }
        if (stripCount) {
            return `*${target} slowly strips off ${stripCount} items of clothing, one by one.`;
        }
        return `*${target} strips down completely, leaving nothing to the imagination.`;
    };

    private addBinds = (memberNumber: number, count: number): void => {
        if (count <= 0) return;
        this.bindCounts.set(
            memberNumber,
            (this.bindCounts.get(memberNumber) ?? 0) + count,
        );
    };

    // Saves a member's current outfit as their "original" one, if nothing's
    // saved for them already - see DareDataService.saveOriginalOutfitIfMissing().
    private captureOriginalOutfitIfMissing = async (
        character: API_Character,
    ): Promise<void> => {
        await this.dareDataService?.saveOriginalOutfitIfMissing(
            character.MemberNumber,
            character.Appearance.MakeAppearanceBundle(),
        );
    };

    // Restores a member's saved outfit (clothing and restraints alike),
    // then clears the saved snapshot so a future game/dare starts fresh.
    // No-ops if nothing was ever saved for them.
    private restoreOriginalOutfit = async (
        character: API_Character,
    ): Promise<void> => {
        const original = await this.dareDataService?.getOriginalOutfit(
            character.MemberNumber,
        );
        if (!original) return;

        character.Appearance.stripBulk(
            { appearance: true, bodyCosplay: true, clothing: true, item: true },
            true,
        );
        character.Appearance.applyBundle(original);
        await this.dareDataService?.clearOriginalOutfit(character.MemberNumber);
    };

    // Runs continuously (see registerTriggers()): re-strips any clothing a
    // dressing-blocked member has tried to put back on (limited to the
    // same partial cap they were originally dared to lose, if any), and
    // once they no longer have any bot-locked ("dare-applied") bondage
    // item left, releases the block and redresses them in their original
    // outfit.
    private enforceDressingBlocks = (): void => {
        for (const [memberNumber, stripCap] of [...this.dressingBlocked]) {
            const character = this.conn.chatRoom!.findMember(memberNumber);
            if (!character) continue;

            character.Appearance.stripBulk({ clothing: true }, false, stripCap);
            // Refresh appearance cache before reading state (Golden Rule #2)
            character.Appearance.MakeAppearanceBundle();

            const stillBound = character.Appearance.getAppearanceData().some(
                (item) =>
                    isBind(item) &&
                    item.Property?.LockMemberNumber ===
                        this.conn.Player.MemberNumber,
            );
            if (stillBound) continue;

            this.dressingBlocked.delete(memberNumber);
            void this.restoreOriginalOutfit(character).catch((e) =>
                this.logger.error("Failed to restore original outfit", {
                    memberNumber,
                    error: e,
                }),
            );
        }
    };

    private announceTurn = (gameId: number): void => {
        const game = this.gameManager.getGame(gameId);
        if (!game) return;
        const memberNumber = this.gameManager.getCurrentPlayer(gameId);
        this.conn.SendMessage(
            "Emote",
            `*Game #${gameId} - round ${game.round}/${TOTAL_ROUNDS}: it's ${this.describeMember(memberNumber ?? -1)}'s turn to !dare draw.`,
        );
    };

    // Applies the "chickened out" pillory consequence to a character - used
    // both by the explicit "!dare pass" command and by auto-pass when
    // someone doesn't respond to their turn in time (or catches up on
    // penalties for turns missed while disconnected).
    private applyPassConsequence = (character: API_Character): void => {
        const memberNumber = character.MemberNumber;
        const passCount = (this.passCounts.get(memberNumber) ?? 0) + 1;
        this.passCounts.set(memberNumber, passCount);

        character.Appearance.RemoveItem("ItemArms");
        const pillory = character.Appearance.AddItem(
            AssetGet("ItemArms", "Pillory"),
        );
        pillory.SetDifficulty(20);

        if (passCount === 1) {
            pillory.SetCraft({
                Name: "Dare: Pillory",
                Description: `${character} chickened out of a dare and has been locked into the pillory until their next draw!`,
            });
            pillory.lock("ExclusivePadlock", this.conn.Player.MemberNumber, {});
            this.pilloriedUntilNextDraw.add(memberNumber);
            this.conn.SendMessage(
                "Emote",
                `*${character} chickens out of their dare and is clamped into the pillory - stuck there until their next draw!`,
            );
        } else {
            pillory.SetCraft({
                Name: "Dare: Repeat Evader",
                Description: `${character} has repeatedly evaded their dares and is locked into the pillory for 4 hours, marked for everyone to see.`,
            });
            pillory.lock(
                "TimerPasswordPadlock",
                this.conn.Player.MemberNumber,
                {
                    RemoveItem: true,
                    RemoveTimer: Date.now() + PILLORY_REPEAT_LOCK_MS,
                    ShowTimer: false,
                    LockSet: true,
                },
            );
            this.pilloriedUntilNextDraw.delete(memberNumber);

            character.Appearance.RemoveItem("ItemMisc");
            const sign = character.Appearance.AddItem(
                AssetGet("ItemMisc", "WoodenSign"),
            );
            sign.setProperty("Text", "Evades");
            sign.setProperty("Text2", "Dares");

            this.conn.SendMessage(
                "Emote",
                `*${character} chickens out AGAIN! Locked in the pillory for 4 hours with a sign reading "Evades / Dares" for everyone to see.`,
            );
        }

        this.addBinds(memberNumber, passCount === 1 ? 1 : 2);
    };

    // Clears a specific game's idle-turn reminder/auto-pass timers, if any
    // are pending. (Deprecated: timers now managed by TurnTimerManager)
    private clearGameTurnTimers = (game: Game): void => {
        const memberNumber = this.gameManager.getCurrentPlayer(game.id);
        if (memberNumber) {
            this.turnTimerManager.clearForPlayer(memberNumber);
        }
    };

    // Starts the reminder (30s) / auto-pass (60s) timers for a game's
    // current turn holder, so an unresponsive player doesn't stall it.
    private startTurnTimers = (gameId: number): void => {
        const game = this.gameManager.getGame(gameId);
        if (!game) return;
        game.turnStartedAt = Date.now();

        const memberNumber = this.gameManager.getCurrentPlayer(gameId);
        if (!memberNumber) return;

        this.turnTimerManager.startReminderTimer(
            memberNumber,
            TURN_REMINDER_MS,
            () => {
                this.fireTurnReminder(gameId, memberNumber);
            },
        );
        this.turnTimerManager.startAutoPassTimer(
            memberNumber,
            TURN_AUTO_PASS_MS,
            () => {
                this.fireTurnAutoPass(gameId, memberNumber);
            },
        );
        this.persistState();
    };

    // Re-arms a resumed game's turn timers based on how long ago its turn
    // actually began (see game.turnStartedAt), so a bot restart
    // doesn't silently reset (or skip) the reminder/auto-pass window.
    private resumeTurnTimers = (game: Game): void => {
        const memberNumber = this.gameManager.getCurrentPlayer(game.id);
        if (!memberNumber) return;

        const elapsed = Date.now() - game.turnStartedAt;

        const reminderDelay = TURN_REMINDER_MS - elapsed;
        if (reminderDelay > 0) {
            this.turnTimerManager.startReminderTimer(
                memberNumber,
                reminderDelay,
                () => {
                    this.fireTurnReminder(game.id, memberNumber);
                },
            );
        }

        const autoPassDelay = TURN_AUTO_PASS_MS - elapsed;
        this.turnTimerManager.startAutoPassTimer(
            memberNumber,
            Math.max(0, autoPassDelay),
            () => this.fireTurnAutoPass(game.id, memberNumber),
        );
    };

    private fireTurnReminder = (gameId: number, memberNumber: number): void => {
        const game = this.gameManager.getGame(gameId);
        if (!game) return;
        if (this.gameManager.getCurrentPlayer(gameId) !== memberNumber) return;
        this.conn.SendMessage(
            "Emote",
            `*Reminder: it's still ${this.describeMember(memberNumber)}'s turn (game #${gameId}) - !dare draw within ${(TURN_AUTO_PASS_MS - TURN_REMINDER_MS) / 1000} more seconds or the bot will pass on their behalf!`,
        );
    };

    private fireTurnAutoPass = (gameId: number, memberNumber: number): void => {
        const game = this.gameManager.getGame(gameId);
        if (!game) return;
        if (this.gameManager.getCurrentPlayer(gameId) !== memberNumber) return;

        const character = this.conn.chatRoom!.findMember(memberNumber);
        if (!character) {
            this.removeParticipantByMemberNumber(
                memberNumber,
                "is no longer available and is removed from the dare game.",
            );
            return;
        }
        this.conn.SendMessage(
            "Emote",
            `*${character} doesn't respond in time to draw a dare - the bot passes on their behalf!`,
        );
        this.applyPassConsequence(character);
        this.finishTurn(memberNumber);
    };

    // Fired whenever anyone leaves the room. Rather than removing them
    // immediately, they get a grace period to return (see
    // DISCONNECT_GRACE_MS) before being purged from the lobby/game.
    private onCharacterLeft = (
        sourceMemberNumber: number,
        character: API_Character,
        _leaveMessage: string | null,
        _intentional: boolean,
    ): void => {
        const inLobby = this.lobby.has(sourceMemberNumber);
        const inGame =
            this.gameManager.getPlayerGame(sourceMemberNumber) !== undefined;
        if (!inLobby && !inGame) return;

        // Phase 5: Use DisconnectTracker to manage disconnect state
        const now = Date.now();
        this.disconnectTracker.markDisconnected(sourceMemberNumber, now);
        this.disconnectedAt.set(sourceMemberNumber, now);

        // Schedule grace period expiration
        const timer = new GameTimer();
        timer.start(DISCONNECT_GRACE_MS, () =>
            this.purgeDisconnected(sourceMemberNumber),
        );
        this.disconnectGraceTimers.set(sourceMemberNumber, timer);

        this.conn.SendMessage(
            "Emote",
            `*${character} disconnects from the dare game - they have ${DISCONNECT_GRACE_MS / 1000} seconds to return before being removed.`,
        );
        this.persistState();
    };

    // Cancels a pending disconnect-grace purge once a member returns to the
    // room in time, leaving them exactly where they were.
    private onCharacterEntered = (character: API_Character): void => {
        const timer = this.disconnectGraceTimers.get(character.MemberNumber);
        if (!timer) return;

        timer.clear();
        this.disconnectGraceTimers.delete(character.MemberNumber);
        this.disconnectedAt.delete(character.MemberNumber);
        this.disconnectTracker.markReconnected(character.MemberNumber);

        this.conn.SendMessage(
            "Emote",
            `*${character} returns just in time and rejoins the dare game!`,
        );
        this.persistState();
    };

    // A disconnected member's grace period ran out without them returning -
    // purge them from whatever lobby/game they were in, same as an
    // explicit "!dare leave"/admin removal would.
    private purgeDisconnected = (memberNumber: number): void => {
        this.disconnectGraceTimers.delete(memberNumber);
        this.disconnectedAt.delete(memberNumber);
        this.disconnectTracker.clearPlayer(memberNumber);

        const result = this.removeParticipantByMemberNumber(
            memberNumber,
            "didn't return in time and is removed from the dare game.",
        );
        if (result.removedFromJoined && !result.removedFromGame) {
            this.conn.SendMessage(
                "Emote",
                `*${this.describeMember(memberNumber)} didn't return in time and is removed from the dare lobby.`,
            );
        }
        this.persistState();
    };

    private removeParticipantByMemberNumber = (
        memberNumber: number,
        reason: string,
    ): {
        removedFromGame: boolean;
        removedFromJoined: boolean;
    } => {
        const wasInLobby = this.lobby.has(memberNumber);
        const gameId = this.gameManager.getPlayerGame(memberNumber);

        if (gameId !== undefined) {
            this.removePlayerFromGame(gameId, memberNumber, reason);
            return { removedFromGame: true, removedFromJoined: wasInLobby };
        }

        if (!wasInLobby) {
            return { removedFromGame: false, removedFromJoined: false };
        }

        this.lobby.delete(memberNumber);
        this.cleanupMemberBookkeeping(memberNumber);
        this.persistState();
        return { removedFromGame: false, removedFromJoined: true };
    };

    // Removes a participant from a specific running game: turn order and
    // any pending per-player state for them, then resolves whatever that
    // leaves the game in (ended, sole-survivor win, or just advance past
    // them if it was their turn).
    private removePlayerFromGame = (
        gameId: number,
        memberNumber: number,
        reason: string,
    ): void => {
        const game = this.gameManager.getGame(gameId);
        if (!game) return;

        const { wasCurrentTurn } = this.gameManager.removePlayer(
            gameId,
            memberNumber,
        );
        this.cleanupMemberBookkeeping(memberNumber);

        this.conn.SendMessage(
            "Emote",
            `*${this.describeMember(memberNumber)} ${reason}`,
        );

        if (game.turnOrder.length === 0) {
            this.endGame(gameId);
            return;
        }
        if (game.turnOrder.length === 1) {
            this.winBySoleSurvivor(gameId);
            return;
        }
        if (wasCurrentTurn) {
            this.gameManager.clearTurnTimers(gameId);
            this.advanceTurn(gameId);
            return;
        }
        this.persistState();
    };

    // Advances the turn/round for a specific game if it's still active
    // (called once a drawn dare - and any pass/forfeit decision window for
    // it - has fully resolved). No-ops for casual, non-game play.
    private finishTurn = (memberNumber: number): void => {
        const gameId = this.gameManager.getPlayerGame(memberNumber);
        if (gameId !== undefined) this.advanceTurn(gameId);
        this.persistState();
    };

    // Moves a game to the next player's turn, advancing the round (and
    // ending the game at the end of round 10) once everyone's gone.
    // Silently skips (and eventually removes) disconnected players, and
    // ends the game early if only one participant is left standing.
    private advanceTurn = (gameId: number): void => {
        const game = this.gameManager.getGame(gameId);
        if (!game) return;

        this.gameManager.clearTurnTimers(gameId);
        this.pruneUnavailableParticipants();
        if (!this.gameManager.getGame(gameId)) return;

        const guardLimit = game.turnOrder.length + 1;
        for (let attempt = 0; attempt < guardLimit; attempt++) {
            if (game.turnOrder.length === 0) {
                this.endGame(gameId);
                return;
            }
            if (game.turnOrder.length === 1) {
                this.winBySoleSurvivor(gameId);
                return;
            }

            const nextMember = this.gameManager.advanceTurn(
                gameId,
                TOTAL_ROUNDS,
            );
            if (nextMember === undefined) {
                // Game is over (exceeded totalRounds)
                this.endGame(gameId);
                return;
            }

            const nextCharacter = this.conn.chatRoom!.findMember(nextMember);
            if (!nextCharacter) {
                this.removeParticipantByMemberNumber(
                    nextMember,
                    "is no longer available and is removed from the dare game.",
                );
                if (!this.gameManager.getGame(gameId)) return;
                continue;
            }

            this.announceTurn(gameId);
            this.startTurnTimers(gameId);
            return;
        }

        // Safety net - shouldn't normally be reached.
        this.endGame(gameId);
    };

    // Tears down a specific game's state: turn timers, roster and every
    // per-member bookkeeping entry tied to it (bind/pass counts, pending
    // draws/bondage decisions). Deliberately leaves dressingBlocked (and
    // the persistent enforcement interval) untouched for former
    // participants - that's handled independently of the game's lifecycle
    // by enforceDressingBlocks()/declareWinner().
    private resetGameState = (gameId: number): void => {
        const game = this.gameManager.getGame(gameId);
        if (!game) return;

        for (const memberNumber of game.turnOrder) {
            this.pendingDraws.delete(memberNumber);
            this.bindCounts.delete(memberNumber);
            this.passCounts.delete(memberNumber);
            this.pilloriedUntilNextDraw.delete(memberNumber);

            if (this.turnTimerManager.hasBondageDecisionTimer(memberNumber)) {
                this.turnTimerManager.clearForPlayer(memberNumber);
            }
            this.pendingBondageDeadlines.delete(memberNumber);
        }

        this.gameManager.endGame(gameId);
        this.persistState();
    };

    // Frees the winner of all bondage, redresses them in whatever they were
    // wearing before the game touched their outfit, and announces the
    // game's end. Everyone else stays locked up (and dressing-blocked)
    // until their own bondage timers run out - see enforceDressingBlocks().
    private declareWinner = (
        gameId: number,
        winner: number,
        reasonPhrase: string,
    ): void => {
        const winnerCharacter = this.conn.chatRoom!.findMember(winner);
        winnerCharacter?.Appearance.stripBulk({ item: true }, true);

        if (winnerCharacter) {
            this.dressingBlocked.delete(winner);
            void this.restoreOriginalOutfit(winnerCharacter).catch((e) =>
                this.logger.error("Failed to restore winner outfit", {
                    memberNumber: winner,
                    error: e,
                }),
            );
        }

        this.conn.SendMessage(
            "Emote",
            `*Dare game #${gameId} is over! ${this.describeMember(winner)} ${reasonPhrase} and is freed from all bondage!`,
        );
    };

    // Ends a game early because only one participant remains (everyone
    // else left or was removed for being disconnected too long).
    private winBySoleSurvivor = (gameId: number): void => {
        const game = this.gameManager.getGame(gameId);
        if (!game || game.turnOrder.length === 0) return;
        const winner = game.turnOrder[0];
        this.resetGameState(gameId);
        this.declareWinner(
            gameId,
            winner,
            "is the only one left standing and wins by default",
        );
    };

    // Ends a game: whoever has the fewest binds wins and is stripped of all
    // their bondage (including locked items).
    private endGame = (gameId: number): void => {
        const game = this.gameManager.getGame(gameId);
        if (!game) return;

        let winner: number | undefined;
        let lowestBinds = Infinity;
        for (const memberNumber of game.turnOrder) {
            const binds = this.bindCounts.get(memberNumber) ?? 0;
            if (binds < lowestBinds) {
                lowestBinds = binds;
                winner = memberNumber;
            }
        }

        this.resetGameState(gameId);

        if (winner === undefined) {
            this.conn.SendMessage(
                "Emote",
                `*Dare game #${gameId} has ended with no participants!`,
            );
            return;
        }

        this.declareWinner(
            gameId,
            winner,
            `wins with only ${lowestBinds} bind(s)`,
        );
    };

    // Picks who a drawn dare's effect actually applies to: the drawer
    // themselves, unless the dare calls for a random other participant in
    // the same game (or lobby, for casual play) - falling back to the
    // drawer if nobody else is available.
    private resolveDareTarget = (
        drawer: API_Character,
        dare: DareDoc,
    ): API_Character => {
        if (dare.target !== "other") return drawer;

        const gameId = this.gameManager.getPlayerGame(drawer.MemberNumber);
        const pool =
            gameId !== undefined
                ? this.gameManager.getGameRoster(gameId)
                : [...this.lobby];

        const candidates = pool
            .filter((memberNumber) => memberNumber !== drawer.MemberNumber)
            .map((memberNumber) => this.conn.chatRoom!.findMember(memberNumber))
            .filter((character): character is API_Character => !!character);

        if (candidates.length === 0) {
            this.conn.SendMessage(
                "Emote",
                `*No other dare participants have joined (!dare join) - applying to ${drawer} instead.`,
            );
            return drawer;
        }

        const target =
            candidates[Math.floor(Math.random() * candidates.length)];
        this.conn.SendMessage(
            "Emote",
            `*This dare targets ${target} instead of ${drawer}!`,
        );
        return target;
    };

    // Applies a resolved bondage decision (auto-locked-in after the
    // "!dare forfeit" window elapses, or resumed from persisted state
    // after a restart) to whichever member drew it.
    private autoApplyPendingBondage = (
        memberNumber: number,
        dare: DareDoc,
    ): void => {
        this.turnTimerManager.clearForPlayer(memberNumber);
        this.pendingBondageDeadlines.delete(memberNumber);
        this.pendingDraws.delete(memberNumber);

        const character = this.conn.chatRoom!.findMember(memberNumber);
        if (!character) {
            this.finishTurn(memberNumber);
            return;
        }

        void this.applyDareEffect(character, dare)
            .catch((e) =>
                this.logger.error("Failed to auto-apply bondage dare", {
                    memberNumber,
                    error: e,
                }),
            )
            .then(() => this.finishTurn(memberNumber));
    };

    // Persists the full live-state snapshot (fire-and-forget). Called after
    // every state-mutating action so a restart/reconnect can resume without
    // losing the lobby, in-progress games, or per-member bookkeeping.
    private persistState = (): void => {
        void this.buildAndSaveState().catch((e) =>
            this.logger.error("Failed to persist state", { error: e }),
        );
    };

    private buildAndSaveState = async (): Promise<void> => {
        const games = this.gameManager.serialize();

        const pendingBondage: [
            number,
            { dare: DareDoc; deadlineAt: number },
        ][] = [];
        for (const [memberNumber, deadlineAt] of this.pendingBondageDeadlines) {
            const dare = this.pendingDraws.get(memberNumber);
            if (dare) pendingBondage.push([memberNumber, { dare, deadlineAt }]);
        }

        await this.dareStateService?.saveState({
            lobby: [...this.lobby],
            nextGameId: 1, // No longer tracked - gameManager handles it
            games,
            bindCounts: [...this.bindCounts.entries()],
            passCounts: [...this.passCounts.entries()],
            pilloriedUntilNextDraw: [...this.pilloriedUntilNextDraw],
            dressingBlocked: [...this.dressingBlocked],
            pendingDraws: [...this.pendingDraws.entries()],
            pendingBondage,
            disconnected: [...this.disconnectedAt.entries()],
        });
    };

    // Rehydrates lobby/game/per-member state from the database - called
    // once from the constructor (see `ready`) so a bot restart resumes
    // in-progress games instead of silently losing them.
    private loadState = async (): Promise<void> => {
        const state = await this.dareStateService?.loadState();
        if (!state) return;

        this.lobby = new Set(state.lobby ?? []);
        this.bindCounts = new Map(state.bindCounts ?? []);
        this.passCounts = new Map(state.passCounts ?? []);
        this.pilloriedUntilNextDraw = new Set(
            state.pilloriedUntilNextDraw ?? [],
        );
        this.dressingBlocked = new Map(state.dressingBlocked ?? []);
        this.pendingDraws = new Map(state.pendingDraws ?? []);

        // Restore games via gameManager
        this.gameManager.deserialize(state.games ?? []);
        for (const game of this.gameManager.getAllGames()) {
            this.resumeTurnTimers(game);
        }

        const now = Date.now();

        for (const [memberNumber, entry] of state.pendingBondage ?? []) {
            const remaining = entry.deadlineAt - now;
            this.turnTimerManager.startBondageDecisionTimer(
                memberNumber,
                Math.max(0, remaining),
                () => this.autoApplyPendingBondage(memberNumber, entry.dare),
            );
            this.pendingBondageDeadlines.set(memberNumber, entry.deadlineAt);
        }

        for (const [memberNumber, disconnectedAt] of state.disconnected ?? []) {
            // Phase 5: Use DisconnectTracker to restore disconnect state
            this.disconnectTracker.markDisconnected(
                memberNumber,
                disconnectedAt,
            );
            const remaining = DISCONNECT_GRACE_MS - (now - disconnectedAt);
            const timer = new GameTimer();
            timer.start(Math.max(0, remaining), () =>
                this.purgeDisconnected(memberNumber),
            );
            this.disconnectGraceTimers.set(memberNumber, timer);
        }
    };

    private applyDareEffect = async (
        drawer: API_Character,
        dare: DareDoc,
    ): Promise<void> => {
        // Reward dares always benefit the drawer; only strip/bondage dares
        // can be redirected to another joined participant.
        const target =
            dare.category === "reward"
                ? drawer
                : this.resolveDareTarget(drawer, dare);

        // Snapshot the target's outfit the first time a strip/bondage dare
        // is about to touch it - whether that's at the start of a
        // structured game (see "start" above) or their first casual draw -
        // so they can be redressed exactly as they were once they're free.
        if (dare.category === "strip" || dare.category === "bondage") {
            await this.captureOriginalOutfitIfMissing(target);
        }

        switch (dare.category) {
            case "strip": {
                const stripCount = this.normalizeStripCount(dare.stripCount);
                this.conn.SendMessage(
                    "Emote",
                    this.describeStrip(target, dare),
                );
                target.Appearance.stripBulk(
                    { clothing: true },
                    false,
                    stripCount,
                );
                this.dressingBlocked.set(target.MemberNumber, stripCount);
                this.conn.SendMessage(
                    "Emote",
                    stripCount
                        ? `*${target} will stay short those ${stripCount} item(s) until they're free of every last bit of dare-applied bondage!`
                        : `*${target} will stay bare until they're free of every last bit of dare-applied bondage!`,
                );
                break;
            }
            case "bondage": {
                const forfeitKeys = dare.forfeitKeys ?? [];
                let appliedCount = 0;
                for (const forfeitKey of forfeitKeys) {
                    // A single forfeitKey throwing (e.g. a forfeit's items()
                    // choking on a particular character's body/appearance)
                    // used to abort this whole loop silently, so the rest of
                    // the dare's bondage never got applied either. Catch per
                    // key instead so one bad item can't sink the others.
                    let result;
                    try {
                        result = await applyForfeitForDare(
                            target,
                            this.conn.Player.MemberNumber,
                            forfeitKey,
                            dare.durationMs,
                        );
                    } catch (e) {
                        this.logger.error("Failed to apply forfeit", {
                            forfeitKey,
                            memberNumber: target.MemberNumber,
                            error: e,
                        });
                        continue;
                    }
                    if (!result) continue;
                    this.conn.SendMessage(
                        "Emote",
                        describeForfeitOutcome(target, result),
                    );
                    if (result.outcome === "applied") appliedCount++;
                }
                this.addBinds(target.MemberNumber, appliedCount);
                if (dare.noRedress) {
                    this.dressingBlocked.set(target.MemberNumber, undefined);
                    this.conn.SendMessage(
                        "Emote",
                        `*${target} isn't allowed to get dressed again until the timer runs out!`,
                    );
                }
                break;
            }
            case "reward":
                // Reward dares always benefit the drawer, regardless of the
                // dare's "target" field.
                if (dare.chips) {
                    await this.mutationService.awardChips(
                        drawer.MemberNumber,
                        dare.chips,
                        "dare_reward",
                        0,
                    );
                    this.conn.SendMessage(
                        "Emote",
                        `*${drawer} wins ${dare.chips} casino chips!`,
                    );
                }
                break;
        }
    };

    onPick = async (
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.enabled) {
            this.whisper(
                senderCharacter.MemberNumber,
                "The dare game is currently disabled in this room.",
            );
            return;
        }

        await this.ready;

        this.conn.SendMessage(
            "Emote",
            `*${senderCharacter} randomly selects a room member...`,
        );
        await wait(2000);

        const possibleMembers = this.conn.chatRoom!.characters.filter(
            (m) =>
                ![
                    senderCharacter.MemberNumber,
                    this.conn.Player.MemberNumber,
                ].includes(m.MemberNumber),
        );
        const n = Math.floor(Math.random() * possibleMembers.length);
        const target = possibleMembers[n];
        this.conn.SendMessage("Emote", `*${target} has been selected!`);
    };
}
