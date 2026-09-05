import { waitForCondition } from "../../hub/utils";
import { Casino, getItemsBlockingForfeit } from "../casino";
import { FORFEITS } from "./forfeits";
import { Bet, Game } from "./game";
import { Card, createDeck, getCardString, shuffleDeck } from "./pokerCards";
import { BetValidator } from "./betValidator";
import { GameTimer } from "./gameTimer";
import { CommandValidator } from "../shared/commandValidator";
import {
    API_Character,
    API_Connector,
    BC_Server_ChatRoomMessage,
    API_AppearanceItem,
    AssetGet,
} from "bc-bot";
import { createLogger } from "../../logging";
import { getXpRewardForSource } from "../shared/progressionRules";
import type { GamePluginCommandRouter } from "../shared/gamePlugin";

//TODOs:
// + fix forfeit pushing
// + reconsider payouts for forfeits half as much makes more sense
// + (I'd recommend a /bot forfeits command or something to list that menu) + bot commands as help is too long
// + Split hands...max once?
// - insurance
// - random bonus rounds
// + multiple decks per shoe

const BLACKJACKCOMMANDS = `Blackjack commands:
/bot bet <amount> - Bet on the current hand. Odds: 1:1.
/bot hit - Take another card from the deck.
/bot stand - Keep your current hand
/bot double - Double your bet and take one more card. Only available on your first two cards.
/bot split - Split your hand into two hands if you have two cards of the same value.
/bot cancel - Cancel your bet. Only available before any cards are dealt.
/bot chips - Show your current chip balance.
/bot give <name or member number> <amount> - Give chips to another player.
/bot help - Show this help
/bot commands - Show all available commands.
/bot forfeits - Show available forfeits.
`;

const BLACKJACKHELP = `Blackjack is a card game where the goal is to get as close to 21 as possible without going over.
Each player is dealt two cards, and can choose to "hit" (take another card) or "stand" (keep their current hand).
The dealer also has a hand, and must hit until they reach 17 or higher.
Blackjack (21 with two cards) pays 3:2 rounding down to the nearest whole number.

Every card has a value:
- Number cards (2-10) are worth their face value.
- Jacks, Queens, and Kings are worth 10.
- Aces can be worth 1 or 11, depending on what is more beneficial for the hand.
`;

const BLACKJACKHELPCOMMAND = `
${BLACKJACKHELP}

For more information on commands or forfeits, use the following commands:
/bot commands - Show all available commands.
/bot forfeits - Show available forfeits.
`;

const BLACKJACKEXAMPLES = `
/bot bet 10
    bets 10 chips
/bot bet leg binder
    bets the 'leg binder' forfeit (worth 7 chips)
`;
const FULLBLACKJACKHELP = `${BLACKJACKHELP}

${BLACKJACKCOMMANDS}
`;

const TIME_UNTIL_DEAL_MS = 35000;
// const TIME_UNTIL_DEAL_MS = 6000;
const BET_CANCEL_THRESHOLD_MS = 1000;
const AUTO_STAND_TIMEOUT_MS = 45000;
const SPLIT_TIMEOUT_INCREASE_MS = 10000; // Time added to the auto-stand timeout when a player splits their hand
// const AUTO_STAND_TIMEOUT_MS = 10000;
const RESET_TIMEOUT_MS = 10000; // Time after a game ends before a new game can start

export type BlackjackRole = "player" | "dealer" | "observer" | "administrator";

export interface RolePermissions {
    canBet: boolean;
    canHit: boolean;
    canStand: boolean;
    canDouble: boolean;
    canSplit: boolean;
    canCancel: boolean;
    canObserve: boolean;
    canManageDealer: boolean;
    canAdminister: boolean;
}

export const BLACKJACK_ROLE_PERMISSIONS: Record<
    BlackjackRole,
    RolePermissions
> = {
    player: {
        canBet: true,
        canHit: true,
        canStand: true,
        canDouble: true,
        canSplit: true,
        canCancel: true,
        canObserve: true,
        canManageDealer: false,
        canAdminister: false,
    },
    dealer: {
        canBet: false,
        canHit: false,
        canStand: false,
        canDouble: false,
        canSplit: false,
        canCancel: false,
        canObserve: true,
        canManageDealer: true,
        canAdminister: false,
    },
    observer: {
        canBet: false,
        canHit: false,
        canStand: false,
        canDouble: false,
        canSplit: false,
        canCancel: false,
        canObserve: true,
        canManageDealer: false,
        canAdminister: false,
    },
    administrator: {
        canBet: true,
        canHit: true,
        canStand: true,
        canDouble: true,
        canSplit: true,
        canCancel: true,
        canObserve: true,
        canManageDealer: true,
        canAdminister: true,
    },
};

export interface BlackjackPlayerState {
    memberNumber: number;
    memberName: string;
    playingHand: number;
    role: BlackjackRole;
    disconnected?: boolean;
    bets: Array<{
        stake: number;
        stakeForfeit: string;
        standing: boolean;
    }>;
    hands: Card[][];
}

export interface BlackjackGameState {
    gameId: string;
    roundId: string;
    phase: "betting" | "dealt" | "playing" | "resolving" | "settled";
    roles?: Record<string, BlackjackRole>;
    players: BlackjackPlayerState[];
    dealerHand: Card[];
    willDealAt?: number;
    willStandAt?: number;
    settled: boolean;
    updatedAt: number;
}

export interface BlackjackPlayer {
    memberNumber: number;
    memberName: string;
    playingHand: number;
    bets: BlackjackBet[];
    role?: BlackjackRole;
    disconnected?: boolean;
}

export interface BlackjackBet extends Bet {
    stake: number;
    stakeForfeit: string;
    standing: boolean;
}

type Hand = Card[];

export class BlackjackGame implements Game {
    private readonly logger = createLogger("BlackjackGame");
    private casino: Casino;
    private deck: Card[] = [];
    private dealerHand: Hand = [];
    private playerHands: Map<BlackjackBet, Hand> = new Map();
    private willDealAt: number | undefined;
    private willStandAt: number | undefined;
    private players: BlackjackPlayer[] = [];
    private resetTimer = new GameTimer(); // after finishing a game
    private dealTimer = new GameTimer(); // after first bet until the deal
    private autoStandTimer = new GameTimer(); // after the deal until all players stand
    private bettingOpen = true;
    private betValidator = new BetValidator();
    private commandValidator = new CommandValidator();

    private roles: Map<number, BlackjackRole> = new Map();
    private currentRoundId: string = "";
    private currentPhase:
        "betting" | "dealt" | "playing" | "resolving" | "settled" = "betting";
    private settledRounds: Set<string> = new Set();
    private latestState?: BlackjackGameState;

    public HELPMESSAGE = FULLBLACKJACKHELP;
    public EXAMPLES = BLACKJACKEXAMPLES;
    public HELPCOMMANDMESSAGE = BLACKJACKHELPCOMMAND;
    public COMMANDSMESSAGE = BLACKJACKCOMMANDS;

    /**
     * Register Blackjack-specific commands with the command router.
     * Called by Casino after instantiation (follows plugin architecture principles).
     */
    public registerCommands(router: GamePluginCommandRouter): void {
        router.registerRootCommand("cancel", this.onCommandCancel);
        router.registerRootCommand("bet", this.onCommandBet);
        router.registerRootCommand("hit", this.onCommandHit);
        router.registerRootCommand("stand", this.onCommandStand);
        router.registerRootCommand("double", this.onCommandDouble);
        router.registerRootCommand("split", this.onCommandSplit);
        router.registerRootCommand("bjrole", this.onCommandSetRole);
        router.registerRootCommand("bjreset", this.onCommandReset);
        router.registerRootCommand("bjsettle", this.onCommandSettle);
        router.registerRootCommand("bjrefund", this.onCommandRefund);
        router.registerRootCommand(
            "sign",
            (
                sender: API_Character,
                msg: BC_Server_ChatRoomMessage,
                args: string[],
            ) => {
                const sign = this.casino.getSign();

                sign.setProperty("OverridePriority", { Text: 63 });
                sign.setProperty("Text", "Place bets!");
                sign.setProperty("Text2", " ");
                this.casino.setTextColor("#ffffff");
            },
        );
    }

    public unregisterCommands(router: GamePluginCommandRouter): void {
        for (const command of [
            "cancel",
            "bet",
            "hit",
            "stand",
            "double",
            "split",
            "bjrole",
            "bjreset",
            "bjsettle",
            "bjrefund",
            "sign",
        ]) {
            router.unregisterRootCommand(command);
        }
    }

    constructor(
        private conn: API_Connector,
        casino: Casino,
    ) {
        this.casino = casino;

        setTimeout(() => {
            this.getPole();
            const sign = this.casino.getSign();

            sign.setProperty("OverridePriority", { Text: 63 });
            sign.setProperty("Text", "Place bets!");
            sign.setProperty("Text2", " ");
            this.casino.setTextColor("#ffffff");

            this.casino.setBio().catch((e) => {
                this.logger?.error("Failed to set bio.", e);
            });

            this.conn.Player.setScriptPermissions(true, false);

            const scriptItem = this.conn.Player.Appearance.AddItem(
                AssetGet("ItemScript", "Script"),
            );
            scriptItem.setProperty("Hide", [
                "Height",
                "BodyUpper",
                "ArmsLeft",
                "ArmsRight",
                "HandsLeft",
                "HandsRight",
                "BodyLower",
                "HairFront",
                "HairBack",
                "Eyebrows",
                "Eyes",
                "Eyes2",
                "Mouth",
                "Nipples",
                "Pussy",
                "Pronouns",
                "Head",
                "Blush",
                "Fluids",
                "Emoticon",
                "ItemNeck",
                "ItemHead",
                "Cloth",
                "Bra",
                "Socks",
                "Shoes",
                "ClothAccessory",
                "Necklace",
                "ClothLower",
                "Panties",
                "Suit",
                "Gloves",
            ]);
        }, 500);
    }

    getPole(): API_AppearanceItem | null {
        let pole = this.conn.Player.Appearance.InventoryGet("ItemDevices");
        if (pole && pole.Name === "Pole") {
            // this.logger?.info("Pole already exists in inventory", pole);
            return pole as API_AppearanceItem;
        }

        /*this.conn.Player.Appearance.RemoveItem("ItemDevices");
        pole = this.conn.Player.Appearance.AddItem(
            AssetGet("ItemDevices", "Pole"),
        );
        this.logger?.info("Adding pole to appearance");
        pole.SetColor(["#AC9A85"]);
/**/
        this.logger?.info("Adding pole to inventory");
        let newPole = AssetGet("ItemDevices", "Pole");
        newPole.Color = ["#AC9A85"];
        this.conn.Player.Appearance.AddItem(newPole);
        return this.conn.Player.Appearance.InventoryGet("ItemDevices");
    }

    async endGame(): Promise<void> {
        await waitForCondition(() => this.willDealAt === undefined);
        // await wait(2000);

        this.clear();
    }

    public setRole(
        memberNumber: number,
        role: BlackjackRole,
        assignedBy?: number,
    ): void {
        this.roles.set(memberNumber, role);
        this.logger?.info(
            `Assigned role ${role} to member ${memberNumber}${assignedBy ? ` by ${assignedBy}` : ""}`,
        );
    }

    public getRole(memberNumber: number): BlackjackRole {
        return this.roles.get(memberNumber) || "player";
    }

    public hasPermission(
        memberNumber: number,
        action: keyof RolePermissions,
    ): boolean {
        const role = this.getRole(memberNumber);
        const perms =
            BLACKJACK_ROLE_PERMISSIONS[role] ||
            BLACKJACK_ROLE_PERMISSIONS.player;
        return perms[action] ?? false;
    }

    private verifyRolePermission(
        sender: API_Character,
        action: keyof RolePermissions,
        actionName: string,
    ): boolean {
        const role = this.getRole(sender.MemberNumber);
        if (!this.hasPermission(sender.MemberNumber, action)) {
            this.conn.SendMessage(
                "Whisper",
                `Permission denied: Role '${role}' is not allowed to perform action '${actionName}'.`,
                sender.MemberNumber,
            );
            return false;
        }
        return true;
    }

    public startNewRound(): void {
        this.currentRoundId = `bj_round_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        this.currentPhase = "betting";
        this.persistGameState().catch((err) => {
            this.logger?.error(
                "Failed to persist game state on round start",
                err,
            );
        });
    }

    public getGameState(): BlackjackGameState {
        return {
            gameId: "blackjack",
            roundId: this.currentRoundId,
            phase: this.currentPhase,
            roles: Object.fromEntries(this.roles.entries()),
            players: this.players.map((p) => {
                const playerBets = p.bets || [];
                return {
                    memberNumber: p.memberNumber,
                    memberName: p.memberName,
                    role: this.getRole(p.memberNumber),
                    playingHand: p.playingHand,
                    disconnected: p.disconnected,
                    bets: playerBets.map((b) => ({
                        stake: b.stake,
                        stakeForfeit: b.stakeForfeit,
                        standing: b.standing,
                    })),
                    hands: playerBets.map((b) => this.playerHands.get(b) || []),
                };
            }),
            dealerHand: [...this.dealerHand],
            willDealAt: this.willDealAt,
            willStandAt: this.willStandAt,
            settled: this.settledRounds.has(this.currentRoundId),
            updatedAt: Date.now(),
        };
    }

    public async persistGameState(): Promise<void> {
        const state = this.getGameState();
        this.latestState = state;
        try {
            const mutationService = this.casino.getMutationService();
            if (mutationService) {
                await mutationService.updateGameProgress(
                    0,
                    "blackjack",
                    state as unknown as Record<string, unknown>,
                );
            }
        } catch (e) {
            this.logger?.warn(
                "Error persisting game state to mutation service",
                { error: e instanceof Error ? e.message : String(e) },
            );
        }
    }

    public recoverGameState(state: BlackjackGameState): void {
        this.currentRoundId = state.roundId;
        this.currentPhase = state.phase;
        this.willDealAt = state.willDealAt;
        this.willStandAt = state.willStandAt;
        this.dealerHand = state.dealerHand || [];
        if (state.settled && state.roundId) {
            this.settledRounds.add(state.roundId);
        }
        if (state.roles) {
            this.roles = new Map(
                Object.entries(state.roles).map(([k, v]) => [
                    Number(k),
                    v as BlackjackRole,
                ]),
            );
        }
        this.players = [];
        this.playerHands.clear();
        for (const p of state.players || []) {
            this.setRole(p.memberNumber, p.role || "player");
            const playerBets: BlackjackBet[] = (p.bets || []).map((b) => ({
                memberNumber: p.memberNumber,
                memberName: p.memberName,
                stake: b.stake,
                stakeForfeit: b.stakeForfeit,
                standing: b.standing,
            }));
            this.players.push({
                memberNumber: p.memberNumber,
                memberName: p.memberName,
                playingHand: p.playingHand,
                bets: playerBets,
                role: p.role,
                disconnected: p.disconnected,
            });
            for (let i = 0; i < playerBets.length; i++) {
                if (p.hands && p.hands[i]) {
                    this.playerHands.set(playerBets[i], p.hands[i]);
                }
            }
        }
        this.latestState = state;
    }

    public handlePlayerDisconnect(memberNumber: number): void {
        const player = this.players.find(
            (p) => p.memberNumber === memberNumber,
        );
        if (!player) return;

        player.disconnected = true;
        for (const bet of player.bets) {
            bet.standing = true;
        }

        this.conn.SendMessage(
            "Chat",
            `${player.memberName} disconnected. Their hand has been stood automatically.`,
        );

        this.casino
            .getMutationService()
            .recordEvent({
                timestamp: Date.now(),
                type: "casino_blackjack_disconnect",
                source: "casino",
                actor: memberNumber,
                target: memberNumber,
                data: {
                    roundId: this.currentRoundId,
                    memberNumber,
                },
                processed: true,
            })
            .catch((e) =>
                this.logger?.error("Failed to record disconnect event", e),
            );

        this.persistGameState().catch(() => {});

        if (this.allPlayersDone()) {
            this.resolveGame().catch((e) =>
                this.logger?.error("Error resolving game after disconnect", e),
            );
        }
    }

    private onCommandSetRole = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.verifyRolePermission(sender, "canAdminister", "assign_role"))
            return;
        if (args.length < 2) {
            this.conn.SendMessage(
                "Whisper",
                "Usage: /bot bjrole <memberNumber> <player|dealer|observer|administrator>",
                sender.MemberNumber,
            );
            return;
        }
        const targetMember = parseInt(args[0], 10);
        const targetRole = args[1].toLowerCase() as BlackjackRole;
        if (isNaN(targetMember) || !BLACKJACK_ROLE_PERMISSIONS[targetRole]) {
            this.conn.SendMessage(
                "Whisper",
                "Invalid member number or role.",
                sender.MemberNumber,
            );
            return;
        }
        this.setRole(targetMember, targetRole, sender.MemberNumber);
        this.conn.SendMessage(
            "Whisper",
            `Role '${targetRole}' assigned to member ${targetMember}.`,
            sender.MemberNumber,
        );
    };

    private onCommandReset = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (
            !this.verifyRolePermission(sender, "canAdminister", "reset") &&
            !this.verifyRolePermission(sender, "canManageDealer", "reset")
        )
            return;
        this.clear();
        this.willDealAt = undefined;
        this.willStandAt = undefined;
        this.currentRoundId = "";
        this.currentPhase = "betting";
        this.dealTimer.clear();
        this.autoStandTimer.clear();
        this.resetTimer.clear();
        this.conn.SendMessage(
            "Chat",
            `Blackjack table reset by ${sender.toString()}.`,
        );
    };

    private onCommandSettle = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.verifyRolePermission(sender, "canAdminister", "settle"))
            return;
        await this.resolveGame();
    };

    private onCommandRefund = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.verifyRolePermission(sender, "canAdminister", "refund"))
            return;
        if (args.length < 1) {
            this.conn.SendMessage(
                "Whisper",
                "Usage: /bot bjrefund <memberNumber>",
                sender.MemberNumber,
            );
            return;
        }
        const targetMember = parseInt(args[0], 10);
        if (isNaN(targetMember)) {
            this.conn.SendMessage(
                "Whisper",
                "Invalid member number.",
                sender.MemberNumber,
            );
            return;
        }
        const bets = this.getBetsForPlayer(targetMember);
        let refundTotal = 0;
        for (const b of bets) {
            refundTotal += b.stake;
        }
        if (refundTotal > 0) {
            await this.casino
                .getMutationService()
                .awardChips(
                    targetMember,
                    refundTotal,
                    "Blackjack admin refund",
                    sender.MemberNumber,
                );
            this.clearBetsForPlayer(targetMember);
            this.conn.SendMessage(
                "Whisper",
                `Refunded ${refundTotal} chips to member ${targetMember}.`,
                sender.MemberNumber,
            );
        } else {
            this.conn.SendMessage(
                "Whisper",
                `No active bets found for member ${targetMember}.`,
                sender.MemberNumber,
            );
        }
    };

    public isBettingOpen(): boolean {
        return this.bettingOpen;
    }

    public reopenBetting(): void {
        this.bettingOpen = true;
    }

    public async closeBetting(): Promise<void> {
        // If a round just finished, wait for its post-round cooldown to
        // clear before deciding whether we need to force one final round.
        await waitForCondition(() => !this.resetTimer.isActive());

        if (this.willDealAt === undefined) {
            // No round in progress: run one final round so there's a genuine
            // last round to bet on rather than closing immediately.
            this.willDealAt = Date.now() + TIME_UNTIL_DEAL_MS;
            this.dealTimer.start(
                1000,
                () => {
                    this.onDealTimeout();
                },
                true,
            );
        }

        await waitForCondition(() => this.willDealAt === undefined);
        await waitForCondition(() => !this.resetTimer.isActive());

        this.bettingOpen = false;
    }

    parseBetCommand(
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ): BlackjackBet | undefined {
        if (this.resetTimer.isActive()) {
            this.conn.SendMessage(
                "Whisper",
                "The next game hasn't started yet",
                senderCharacter.MemberNumber,
            );
            return;
        }

        // Validate argument count (1 for Blackjack)
        // Use CommandValidator for generic argument validation (Phase 2B consolidation)
        const argCountResult = this.commandValidator.validateArgumentCount(
            args,
            1,
            "!bet <amount>",
        );
        if (!argCountResult.valid) {
            this.conn.SendMessage(
                "Whisper",
                argCountResult.message ||
                    "I couldn't understand that bet. Try, eg. /bot bet 10 or /bot bet boots",
                senderCharacter.MemberNumber,
            );
            return;
        }

        // Check for duplicate bets
        const notBetResult = this.betValidator.validateNotAlreadyBet(
            senderCharacter.MemberNumber,
            this.players as unknown as Bet[],
        );
        if (!notBetResult.valid) {
            this.conn.SendMessage(
                "Whisper",
                notBetResult.message ||
                    "You already placed a bet. Use !cancel to cancel it.",
                senderCharacter.MemberNumber,
            );
            return;
        }

        // Validate and parse stake
        const stakeResult = this.betValidator.validateStake(args[0]);
        if (!stakeResult.valid) {
            this.conn.SendMessage(
                "Whisper",
                stakeResult.message || "Invalid stake.",
                senderCharacter.MemberNumber,
            );
            return;
        }

        // If it's a forfeit, validate that it exists
        if (stakeResult.stakeForfeit) {
            const forfeitExistsResult = this.betValidator.validateForfeitExists(
                stakeResult.stakeForfeit,
            );
            if (!forfeitExistsResult.valid) {
                this.conn.SendMessage(
                    "Whisper",
                    forfeitExistsResult.message ||
                        "That forfeit doesn't exist.",
                    senderCharacter.MemberNumber,
                );
                return;
            }
        }

        return {
            memberNumber: senderCharacter.MemberNumber,
            memberName: senderCharacter.toString(),
            stake: stakeResult.stake!,
            stakeForfeit: stakeResult.stakeForfeit ?? "",
            standing: false,
        };
    }

    private onCommandHit = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.verifyRolePermission(sender, "canHit", "hit")) return;
        if (!this.autoStandTimer.isActive()) {
            this.conn.SendMessage(
                "Whisper",
                "You can't hit right now.",
                sender.MemberNumber,
            );
            return;
        }
        const player = this.players.find(
            (b) => b.memberNumber === sender.MemberNumber,
        );
        if (!player) {
            this.conn.SendMessage(
                "Whisper",
                "You're not playing in this game.",
                sender.MemberNumber,
            );
            return;
        }
        const bet = this.getBetsForPlayer(sender.MemberNumber)[
            player.playingHand
        ];
        if (!bet) {
            this.conn.SendMessage(
                "Whisper",
                "You don't have a bet in play.",
                sender.MemberNumber,
            );
            return;
        }
        if (bet.standing) {
            this.conn.SendMessage(
                "Whisper",
                "You can't hit, you're standing.",
                sender.MemberNumber,
            );
            return;
        } else if (this.playerHands.get(bet) === undefined) {
            this.conn.SendMessage(
                "Whisper",
                "You don't have a hand to hit.",
                sender.MemberNumber,
            );
            return;
        }
        const hand = this.playerHands.get(bet)!;
        if (!hand) return;
        const newCard = this.deck.pop()!;
        hand.push(newCard);

        await this.casino.getMutationService().recordEvent({
            timestamp: Date.now(),
            type: "casino_blackjack_hit",
            source: "casino",
            actor: sender.MemberNumber,
            target: sender.MemberNumber,
            data: {
                roundId: this.currentRoundId,
                card: newCard,
            },
            processed: true,
        });

        const playerValue = this.calculateHandValue(hand);
        if (playerValue > 20) {
            bet.standing = true; // Player automatically stands after busting or on 21
            if (player.bets.length > player.playingHand + 1) {
                player.playingHand++;
            }
        }
        const handString = await this.buildHandString(true, player);
        this.conn.SendMessage(
            "Whisper",
            `You hit and got a ${getCardString(hand[hand.length - 1])}.\n${handString}`,
            sender.MemberNumber,
        );
        await this.persistGameState();
        if (this.allPlayersDone()) {
            this.resolveGame();
        }
    };

    private onCommandDouble = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.verifyRolePermission(sender, "canDouble", "double")) return;
        if (!this.willStandAt || Date.now() > this.willStandAt) {
            this.conn.SendMessage(
                "Whisper",
                "You can't double down right now.",
                sender.MemberNumber,
            );
            return;
        }
        const bets = this.getBetsForPlayer(sender.MemberNumber);
        const player = this.players.find(
            (b) => b.memberNumber === sender.MemberNumber,
        );
        if (!player) {
            this.conn.SendMessage(
                "Whisper",
                "You're not playing in this game.",
                sender.MemberNumber,
            );
            return;
        }
        if (!bets) {
            this.conn.SendMessage(
                "Whisper",
                "You don't have a bet in play.",
                sender.MemberNumber,
            );
            return;
        }
        const currentBet = bets[player.playingHand];
        if (currentBet.standing) {
            this.conn.SendMessage(
                "Whisper",
                "You are already standing.",
                sender.MemberNumber,
            );
            return;
        } else if (this.playerHands.get(currentBet) === undefined) {
            this.conn.SendMessage(
                "Whisper",
                "You don't have a hand to double down on.",
                sender.MemberNumber,
            );
            return;
        } else if (currentBet.stakeForfeit) {
            this.conn.SendMessage(
                "Whisper",
                "You can't double down on a forfeit bet.",
                sender.MemberNumber,
            );
            return;
        }
        const hand = this.playerHands.get(currentBet);
        if (!hand || hand.length !== 2) {
            this.conn.SendMessage(
                "Whisper",
                "You can only double down on your initial two cards.",
                sender.MemberNumber,
            );
            return;
        }
        const unifiedStore = this.casino.getUnifiedStore();
        const profile = await unifiedStore.getProfile(sender.MemberNumber);
        const totalChips = profile.casino?.chips ?? 0;
        const lockedChips = profile.casino?.lockedChips ?? 0;
        const availableChips = totalChips - lockedChips;

        if (availableChips < currentBet.stake) {
            if (lockedChips > 0 && totalChips >= currentBet.stake) {
                this.conn.SendMessage(
                    "Whisper",
                    `Your chips are locked (${lockedChips} locked). You do not have enough available chips.`,
                    sender.MemberNumber,
                );
            } else {
                this.conn.SendMessage(
                    "Whisper",
                    "You don't have enough chips to double down.",
                    sender.MemberNumber,
                );
            }
            return;
        }

        await this.casino
            .getMutationService()
            .deductChips(
                sender.MemberNumber,
                currentBet.stake,
                "Blackjack double down",
                sender.MemberNumber,
            );
        currentBet.stake *= 2; // Double the stake
        const newCard = this.deck.pop()!;
        hand.push(newCard);
        currentBet.standing = true;

        await this.casino.getMutationService().recordEvent({
            timestamp: Date.now(),
            type: "casino_blackjack_double",
            source: "casino",
            actor: sender.MemberNumber,
            target: sender.MemberNumber,
            data: {
                roundId: this.currentRoundId,
                newStake: currentBet.stake,
                card: newCard,
            },
            processed: true,
        });

        if (player.bets.length > player.playingHand + 1) {
            player.playingHand++;
            const handString = await this.buildHandString(true, player);
            this.conn.SendMessage(
                "Whisper",
                `You doubled down on hand ${player.playingHand} and got a ${getCardString(hand[hand.length - 1])}. You are now playing hand ${player.playingHand}\n${handString}`,
                sender.MemberNumber,
            );
        } else {
            const handString = await this.buildHandString(true, player);
            this.conn.SendMessage(
                "Whisper",
                `You doubled down and got a ${getCardString(hand[hand.length - 1])}.\n${handString}`,
                sender.MemberNumber,
            );
        }
        await this.persistGameState();
        if (this.allPlayersDone()) {
            this.resolveGame();
        }
    };

    private onCommandSplit = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.verifyRolePermission(sender, "canSplit", "split")) return;
        if (!this.willStandAt || Date.now() > this.willStandAt) {
            this.conn.SendMessage(
                "Whisper",
                "You can't split right now.",
                sender.MemberNumber,
            );
            return;
        }
        const bets = this.getBetsForPlayer(sender.MemberNumber);
        const player = this.players.find(
            (b) => b.memberNumber === sender.MemberNumber,
        );
        if (!player) {
            this.conn.SendMessage(
                "Whisper",
                "You're not playing in this game.",
                sender.MemberNumber,
            );
            return;
        }
        if (!bets) {
            this.conn.SendMessage(
                "Whisper",
                "You don't have a bet in play.",
                sender.MemberNumber,
            );
            return;
        }
        const currentBet = bets[player.playingHand];
        if (currentBet.standing) {
            this.conn.SendMessage(
                "Whisper",
                "You are already standing.",
                sender.MemberNumber,
            );
            return;
        } else if (this.playerHands.get(currentBet) === undefined) {
            this.conn.SendMessage(
                "Whisper",
                "You don't have a hand to split.",
                sender.MemberNumber,
            );
            return;
        }
        const hand = this.playerHands.get(currentBet);
        if (!hand || hand.length !== 2) {
            this.conn.SendMessage(
                "Whisper",
                "You can only split your initial two cards.",
                sender.MemberNumber,
            );
            return;
        }
        if (
            hand[0].value !== hand[1].value &&
            !(
                ["10", "J", "Q", "K"].includes(hand[0].value) &&
                ["10", "J", "Q", "K"].includes(hand[1].value)
            )
        ) {
            this.conn.SendMessage(
                "Whisper",
                "You can only split if your two cards have the same value.",
                sender.MemberNumber,
            );
            return;
        }
        if (currentBet.stakeForfeit) {
            this.conn.SendMessage(
                "Whisper",
                "You can't split a forfeit bet.",
                sender.MemberNumber,
            );
            return;
        }
        const unifiedStore = this.casino.getUnifiedStore();
        const profile = await unifiedStore.getProfile(sender.MemberNumber);
        const totalChips = profile.casino?.chips ?? 0;
        const lockedChips = profile.casino?.lockedChips ?? 0;
        const availableChips = totalChips - lockedChips;

        if (availableChips < currentBet.stake) {
            if (lockedChips > 0 && totalChips >= currentBet.stake) {
                this.conn.SendMessage(
                    "Whisper",
                    `Your chips are locked (${lockedChips} locked). You do not have enough available chips.`,
                    sender.MemberNumber,
                );
            } else {
                this.conn.SendMessage(
                    "Whisper",
                    "You don't have enough chips to split.",
                    sender.MemberNumber,
                );
            }
            return;
        }
        await this.casino
            .getMutationService()
            .deductChips(
                sender.MemberNumber,
                currentBet.stake,
                "Blackjack split",
                sender.MemberNumber,
            );
        player.bets.push({
            memberNumber: sender.MemberNumber,
            memberName: sender.toString(),
            stake: currentBet.stake,
            stakeForfeit: currentBet.stakeForfeit,
            standing: false,
        });
        const newBet = player.bets[player.bets.length - 1];
        const newCard = this.deck.pop()!;
        this.playerHands.set(newBet, [hand[1], newCard]);
        const newBetHand = this.playerHands.get(newBet);
        hand[1] = this.deck.pop()!;
        if (this.calculateHandValue(hand) > 20) {
            currentBet.standing = true; // Player automatically stands on 21
            player.playingHand++;
        }
        if (newBetHand && this.calculateHandValue(newBetHand) > 20) {
            newBet.standing = true; // Player automatically stands on 21
        }

        await this.casino.getMutationService().recordEvent({
            timestamp: Date.now(),
            type: "casino_blackjack_split",
            source: "casino",
            actor: sender.MemberNumber,
            target: sender.MemberNumber,
            data: {
                roundId: this.currentRoundId,
                stake: currentBet.stake,
            },
            processed: true,
        });

        const newHandString = newBetHand
            ? getCardString(newBetHand[1])
            : "unknown";
        this.conn.SendMessage(
            "Whisper",
            `You split your hand and got a ${getCardString(hand[1])} on the first hand and a ${newHandString} on the second hand.\n${await this.buildHandString(true, player)}`,
            sender.MemberNumber,
        );
        this.willStandAt = this.willStandAt + SPLIT_TIMEOUT_INCREASE_MS;
        this.conn.SendMessage(
            "Chat",
            `${sender.toString()} has split their hand! Remaining time has been increased.`,
        );
        await this.persistGameState();
        if (this.allPlayersDone()) {
            this.resolveGame();
        }
    };

    private async resolveGame(): Promise<void> {
        this.autoStandTimer.clear();
        if (
            this.currentRoundId &&
            this.settledRounds.has(this.currentRoundId)
        ) {
            this.logger?.warn(
                `Round ${this.currentRoundId} is already settled.`,
            );
            return;
        }
        if (this.currentRoundId) {
            this.settledRounds.add(this.currentRoundId);
        }
        this.currentPhase = "resolving";
        if (this.dealerHand.length < 2) {
            if (this.deck.length < 2) {
                this.createShoe(1);
            }
            this.dealerHand = [this.deck.pop()!, this.deck.pop()!];
        }
        while (this.calculateHandValue(this.dealerHand) < 17) {
            if (this.deck.length === 0) {
                this.createShoe(1);
            }
            this.dealerHand.push(this.deck.pop()!);
        }
        await this.showHands(false);
        let message = `Dealer has a hand of ${this.calculateHandValue(this.dealerHand)}\n`;
        const sign = this.casino.getSign();
        sign.setProperty("Text", "Dealer has");
        sign.setProperty(
            "Text2",
            `${this.calculateHandValue(this.dealerHand)}`,
        );
        this.casino.setTextColor("#ffffff");

        const venueMultiplier =
            this.casino.venueSystem?.getVenueMultiplier() ?? 1;

        for (const player of this.players) {
            let totalWinnings = 0;
            for (const bet of player.bets) {
                const playerHand = this.playerHands.get(bet);
                if (!playerHand) {
                    this.logger?.info(
                        `No hand found for player ${player.memberName} (${player.memberNumber}) during resolution`,
                    );
                    continue;
                }
                const winnings = this.getWinnings(playerHand, bet);
                totalWinnings += winnings;
            }

            const effectiveWinnings =
                totalWinnings > 0
                    ? (this.casino.venueSystem?.applyVenueBonus(
                          totalWinnings,
                      ) ?? totalWinnings)
                    : totalWinnings;

            if (effectiveWinnings > 0) {
                // Update chips using unified store via mutation service
                await this.casino
                    .getMutationService()
                    .awardChips(
                        player.memberNumber,
                        effectiveWinnings,
                        "blackjack_win",
                        player.memberNumber,
                    );
                // Phase 2A.7: Award progression XP, keyed by round so
                // retried settlements never grant duplicate XP.
                await this.casino
                    .getMutationService()
                    .awardProgressionXp(
                        player.memberNumber,
                        getXpRewardForSource("casino_blackjack_win"),
                        "casino_blackjack_win",
                        `blackjack:${this.currentRoundId}:${player.memberNumber}`,
                        player.memberNumber,
                    );
                message += `${player.memberName} wins ${effectiveWinnings} chips! \n`;
            } else if (player.bets[0].stakeForfeit && totalWinnings !== -100) {
                await this.casino.applyForfeit(player.bets[0]);
                message += `${player.memberName} lost and gets ${FORFEITS[player.bets[0].stakeForfeit].name}! \n`;
            }

            await this.casino.getMutationService().recordEvent({
                timestamp: Date.now(),
                type: "casino_blackjack_settlement",
                source: "casino",
                actor: player.memberNumber,
                target: player.memberNumber,
                data: {
                    roundId: this.currentRoundId,
                    rawWinnings: totalWinnings,
                    effectiveWinnings,
                    venueMultiplier,
                },
                processed: true,
            });
        }
        await this.persistGameState();
        this.clear();
        this.willDealAt = undefined;
        this.casino.multiplier = 1;

        this.dealTimer.clear();
        this.resetTimer.start(RESET_TIMEOUT_MS, () => {
            const sign = this.casino.getSign();
            sign.setProperty("Text", "Place bets!");
            sign.setProperty("Text2", " ");
            this.casino.setTextColor("#ffffff");
        });

        this.conn.SendMessage("Chat", message);
    }

    private onCommandStand = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.verifyRolePermission(sender, "canStand", "stand")) return;
        if (!this.autoStandTimer.isActive()) {
            this.conn.SendMessage(
                "Whisper",
                "You can't stand right now.",
                sender.MemberNumber,
            );
            return;
        }
        const player = this.players.find(
            (b) => b.memberNumber === sender.MemberNumber,
        );
        if (!player) {
            this.conn.SendMessage(
                "Whisper",
                "You're not playing in this game.",
                sender.MemberNumber,
            );
            return;
        }
        const bet = this.getBetsForPlayer(sender.MemberNumber)[
            player.playingHand
        ];
        if (!bet) {
            this.conn.SendMessage(
                "Whisper",
                "You don't have a bet in play.",
                sender.MemberNumber,
            );
            return;
        } else if (bet.standing) {
            this.conn.SendMessage(
                "Whisper",
                "You are already standing.",
                sender.MemberNumber,
            );
            return;
        }
        bet.standing = true;

        await this.casino.getMutationService().recordEvent({
            timestamp: Date.now(),
            type: "casino_blackjack_stand",
            source: "casino",
            actor: sender.MemberNumber,
            target: sender.MemberNumber,
            data: {
                roundId: this.currentRoundId,
            },
            processed: true,
        });

        if (player.bets.length > player.playingHand + 1) {
            player.playingHand++;
            const handString = await this.buildHandString(true, player);
            this.conn.SendMessage(
                "Whisper",
                `You are standing on hand ${player.playingHand} and are now playing hand ${player.playingHand + 1}. \n${handString}`,
                sender.MemberNumber,
            );
        } else {
            const handString = await this.buildHandString(true, player);
            this.conn.SendMessage(
                "Whisper",
                `You are standing. \n${handString}`,
                sender.MemberNumber,
            );
        }
        await this.persistGameState();
        if (this.allPlayersDone()) {
            this.resolveGame();
        }
    };

    placeBet(bet: BlackjackBet): void {
        this.players.push({
            memberNumber: bet.memberNumber,
            memberName: bet.memberName,
            playingHand: 0, // first hand played
            bets: [bet],
        });
        if (bet.stakeForfeit) {
            this.conn.SendMessage(
                "Chat",
                `${bet.memberName} bets ${FORFEITS[bet.stakeForfeit].name} for ${bet.stake} chips`,
            );
        } else {
            this.conn.SendMessage(
                "Chat",
                `${bet.memberName} bets ${bet.stake} chips`,
            );
        }
    }

    getBets(): BlackjackBet[] {
        return this.players.map((b) => b.bets[0]);
    }
    public getBetsForPlayer(memberNumber: number): BlackjackBet[] {
        // this.logger?.info(this.players.find((b) => b.memberNumber === memberNumber));
        return this.players
            .filter((b) => b.memberNumber === memberNumber)
            .flatMap((b) => b.bets);
    }

    public clearBetsForPlayer(memberNumber: number): undefined {
        this.players = this.players.filter(
            (b) => b.memberNumber !== memberNumber,
        );
    }

    onCommandBet = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.verifyRolePermission(sender, "canBet", "bet")) return;
        if (this.resetTimer.isActive()) {
            this.conn.SendMessage(
                "Whisper",
                "The next game hasn't started yet",
                sender.MemberNumber,
            );
            return;
        }
        if (!this.bettingOpen) {
            this.conn.SendMessage(
                "Whisper",
                "The casino is currently closed. Please check back later!",
                sender.MemberNumber,
            );
            return;
        }
        if (
            this.autoStandTimer.isActive() ||
            (this.willDealAt &&
                this.willDealAt - Date.now() < BET_CANCEL_THRESHOLD_MS)
        ) {
            this.conn.SendMessage(
                "Whisper",
                "You can't bet right now.",
                sender.MemberNumber,
            );
            return;
        }

        const bet = this.parseBetCommand(sender, msg, args);
        if (bet === undefined) {
            return;
        }

        const unifiedStore = this.casino.getUnifiedStore();
        const profile = await unifiedStore.getProfile(sender.MemberNumber);

        if (!bet.stakeForfeit || bet.stakeForfeit === "") {
            const totalChips = profile.casino?.chips ?? 0;
            const lockedChips = profile.casino?.lockedChips ?? 0;
            const availableChips = totalChips - lockedChips;

            if (availableChips < bet.stake) {
                if (lockedChips > 0 && totalChips >= bet.stake) {
                    this.conn.SendMessage(
                        "Whisper",
                        `Your chips are locked (${lockedChips} locked). You do not have enough available chips.`,
                        sender.MemberNumber,
                    );
                } else {
                    this.conn.SendMessage(
                        "Whisper",
                        `You don't have enough chips.`,
                        sender.MemberNumber,
                    );
                }
                return;
            }

            await this.casino
                .getMutationService()
                .deductChips(
                    sender.MemberNumber,
                    bet.stake,
                    "Blackjack bet",
                    sender.MemberNumber,
                );
        } else {
            const blockers = getItemsBlockingForfeit(
                sender,
                FORFEITS[bet.stakeForfeit].items(sender),
            );
            if (blockers.length > 0) {
                this.logger?.info(
                    `Blocked forfeit bet of ${bet.stakeForfeit} with blockers `,
                    blockers,
                );
                this.conn.SendMessage(
                    "Whisper",
                    `You can't bet that while you have: ${blockers.map((i) => i.Name).join(", ")}`,
                    sender.MemberNumber,
                );
                return;
            }

            const canInteract = await sender.GetAllowItem();
            if (!canInteract) {
                this.conn.SendMessage(
                    "Whisper",
                    "You'll need to open up your permissions or whitelist the bot to bet restraints.",
                    sender.MemberNumber,
                );
                return;
            }

            const needItems = [...FORFEITS[bet.stakeForfeit].items(sender)];
            const lock = FORFEITS[bet.stakeForfeit].lock;
            if (lock) {
                needItems.push(lock);
            }
            const blocked = needItems.filter(
                (i) => !sender.IsItemPermissionAccessible(i),
            );
            if (blocked.length > 0) {
                this.conn.SendMessage(
                    "Whisper",
                    `You can't bet that forfeit because you've blocked: ${blocked.map((i) => i.Name).join(", ")}.`,
                    sender.MemberNumber,
                );
                return;
            }

            bet.stake *= this.casino.multiplier;
        }

        if (
            bet.stakeForfeit &&
            FORFEITS[bet.stakeForfeit]?.items(sender).length === 1
        ) {
            const forfeitItem = FORFEITS[bet.stakeForfeit].items(sender)[0];
            const lockTime = this.casino.lockedItems
                .get(sender.MemberNumber)
                ?.get(forfeitItem.Group);
            if (lockTime && Date.now() < lockTime) {
                this.logger?.info(
                    `CHEATER DETECTED: ${sender} tried to bet ${bet.stakeForfeit} which should be locked`,
                );
                // TODO: Implement cheat strike tracking in unified store
                // For now, just log the cheat attempt
                this.casino.cheatPunishment(sender, {
                    MemberNumber: sender.MemberNumber,
                } as unknown as any);

                return;
            }
        }

        if (this.players.length === 0 || !this.currentRoundId) {
            this.currentRoundId = `bj_${Date.now()}_${sender.MemberNumber}`;
        }

        this.placeBet(bet);

        await this.casino.getMutationService().recordEvent({
            timestamp: Date.now(),
            type: "casino_blackjack_bet",
            source: "casino",
            actor: sender.MemberNumber,
            target: sender.MemberNumber,
            data: {
                roundId: this.currentRoundId,
                stake: bet.stake,
                stakeForfeit: bet.stakeForfeit,
            },
            processed: true,
        });

        await this.persistGameState();

        if (this.willDealAt === undefined) {
            if (this.resetTimer.isActive()) {
                this.resetTimer.clear();
            }
            this.willDealAt = Date.now() + TIME_UNTIL_DEAL_MS;
            this.dealTimer.start(
                1000,
                () => {
                    this.onDealTimeout();
                },
                true,
            );
        }
    };

    private onDealTimeout(): void {
        if (!this.willDealAt) return;

        const sign = this.casino.getSign();

        const timeLeft = this.willDealAt - Date.now();
        if (timeLeft <= 0) {
            if (sign.Extended) {
                sign.Extended.SetText("");
            }
            sign.setProperty("Text2", "");

            this.dealTimer.clear();
            this.initialDeal();
        } else {
            this.casino.setTextColor("#ffffff");
            sign.setProperty("Text", "Place bets!");
            sign.setProperty("Text2", `${Math.ceil(timeLeft / 1000)}`);
        }
    }

    private onStandTimeout(): void {
        if (!this.willStandAt) return;

        const sign = this.casino.getSign();
        const timeLeft = this.willStandAt - Date.now();
        if (timeLeft <= 0) {
            this.players.forEach((player) => {
                player.bets.forEach((bet) => {
                    bet.standing = true; // Automatically stand all bets
                });
            });
            this.conn.SendMessage(
                "Chat",
                "All open bets have been automatically stood.",
            );
            this.resolveGame();
        } else {
            this.casino.setTextColor("#ffffff");
            sign.setProperty("Text", "Time left");
            sign.setProperty("Text2", `${Math.ceil(timeLeft / 1000)}`);
        }
    }

    private allPlayersDone(): boolean {
        return this.players.every((player) =>
            player.bets.every((bet) => bet.standing),
        );
    }

    onCommandCancel = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.verifyRolePermission(sender, "canCancel", "cancel")) return;
        if (this.getBetsForPlayer(sender.MemberNumber).length === 0) {
            this.conn.SendMessage(
                "Whisper",
                "You don't have a bet in play.",
                sender.MemberNumber,
            );
            return;
        }

        const timeLeft = (this.willDealAt ?? 0) - Date.now();
        if (timeLeft <= BET_CANCEL_THRESHOLD_MS) {
            this.conn.SendMessage(
                "Whisper",
                "You can't cancel your bet now.",
                sender.MemberNumber,
            );
            return;
        }

        if (!this.getBetsForPlayer(sender.MemberNumber)[0].stakeForfeit) {
            let totalRefund = 0;
            this.getBetsForPlayer(sender.MemberNumber).forEach((b) => {
                totalRefund += b.stake;
            });

            if (totalRefund > 0) {
                await this.casino
                    .getMutationService()
                    .awardChips(
                        sender.MemberNumber,
                        totalRefund,
                        "Blackjack bet cancellation",
                        sender.MemberNumber,
                    );
            }
        }

        this.clearBetsForPlayer(sender.MemberNumber);

        await this.casino.getMutationService().recordEvent({
            timestamp: Date.now(),
            type: "casino_blackjack_cancel",
            source: "casino",
            actor: sender.MemberNumber,
            target: sender.MemberNumber,
            data: {
                roundId: this.currentRoundId,
            },
            processed: true,
        });

        await this.persistGameState();
        this.conn.SendMessage("Whisper", "Bet cancelled.", sender.MemberNumber);
    };

    getWinnings(playerHand: Hand, bet: BlackjackBet): number {
        let playerHandValue: number = this.calculateHandValue(playerHand);
        let dealerHandValue: number = this.calculateHandValue(this.dealerHand);
        if (playerHandValue > 21) {
            return 0;
        }
        if (bet.stakeForfeit) {
            if (playerHandValue === dealerHandValue) {
                return -100; // push for forfeits
            }
            if (playerHandValue === 21 && playerHand.length === 2) {
                return Math.floor(bet.stake * 1.5);
            }
            if (dealerHandValue > 21) {
                return bet.stake;
            }
            if (playerHandValue > dealerHandValue) {
                return bet.stake;
            }
        } else {
            if (playerHandValue === dealerHandValue) {
                return bet.stake;
            }
            if (playerHandValue === 21 && playerHand.length === 2) {
                return Math.floor(bet.stake * 2.5);
            }
            if (dealerHandValue > 21) {
                return bet.stake * 2;
            }
            if (playerHandValue > dealerHandValue) {
                return bet.stake * 2;
            }
        }
        return 0;
    }

    clear(): void {
        this.players = [];
        this.playerHands.clear();
    }

    private calculateDeckCountForRound(activePlayers: number): number {
        return Math.max(1, Math.min(8, Math.floor((activePlayers + 1) / 2)));
    }

    private createShoe(decks: number = 1): void {
        this.logger?.info(`Creating a shoe with ${decks} decks.`);
        for (let i = 0; i < decks; i++) {
            if (this.deck.length > 0) {
                this.deck.push(...createDeck());
            } else {
                this.deck = createDeck();
            }
        }
        shuffleDeck(this.deck);
    }

    private async initialDeal(): Promise<void> {
        this.currentPhase = "playing";
        this.autoStandTimer.start(
            1000,
            () => {
                this.onStandTimeout();
            },
            true,
        );
        if (this.deck.length < this.players.length * 7 + 5) {
            this.conn.SendMessage(
                "Chat",
                "The deck is running low, shuffling a new deck.",
            );
            this.createShoe(
                this.calculateDeckCountForRound(this.players.length),
            );
        }
        this.dealerHand = [this.deck.pop()!, this.deck.pop()!];
        for (const player of this.players) {
            // const LillyTestCard = this.deck.pop();
            const playerHand: Hand = [
                this.deck.pop()!,
                this.deck.pop()!,
                // LillyTestCard,
                // LillyTestCard
            ];
            this.playerHands.set(player.bets[0], playerHand);
            const handValue = this.calculateHandValue(playerHand);
            if (handValue === 21) {
                player.bets[0].standing = true; // Automatically stand on blackjack
                this.conn.SendMessage(
                    "Whisper",
                    `You got a blackjack! You automatically stand.`,
                    player.memberNumber,
                );
            }
        }

        await this.casino.getMutationService().recordEvent({
            timestamp: Date.now(),
            type: "casino_blackjack_deal",
            source: "casino",
            actor: 0,
            target: 0,
            data: {
                roundId: this.currentRoundId,
                playerCount: this.players.length,
            },
            processed: true,
        });

        await this.persistGameState();

        if (this.calculateHandValue(this.dealerHand) === 21) {
            this.conn.SendMessage(
                "Chat",
                `Dealer got a blackjack! All players lose their bets unless they have blackjack themselves.`,
            );
            this.players.forEach((player) => {
                player.bets.forEach((bet) => {
                    bet.standing = true; // Automatically stand all bets
                });
            });
            this.resolveGame();
            return;
        }

        if (this.allPlayersDone()) {
            this.resolveGame();
        }

        this.willStandAt = Date.now() + AUTO_STAND_TIMEOUT_MS;

        this.showHands(true);
    }

    private async showHands(dealerHidden: boolean): Promise<void> {
        const handString = await this.buildHandString(dealerHidden);
        this.conn.SendMessage("Chat", handString);
    }

    private async buildHandString(
        dealerHidden: boolean,
        requestingPlayer: BlackjackPlayer | undefined = undefined,
    ): Promise<string> {
        const dealerValue = this.calculateHandValue(this.dealerHand);
        const dealerHandString = dealerHidden
            ? `[${getCardString(this.dealerHand[0])}] [???]`
            : this.handToString(this.dealerHand);
        let string = `Dealer's hand: ${dealerHandString} (${dealerHidden ? "???" : dealerValue})\n`;
        for (const player of this.players) {
            for (let i = 0; i < player.bets.length; i++) {
                const bet = player.bets[i];
                const hand = this.playerHands.get(bet);
                if (!hand) continue;
                const handString = this.handToString(hand);
                const handValue = this.calculateHandValue(hand);
                if (
                    requestingPlayer &&
                    player.memberNumber === requestingPlayer.memberNumber &&
                    i === requestingPlayer.playingHand
                ) {
                    string += `> ${player.memberName} (${bet.memberNumber}) hand: ${handString} (${handValue})\n`;
                } else {
                    string += `${player.memberName} (${bet.memberNumber}) hand: ${handString} (${handValue})\n`;
                }
            }
        }
        return string;
    }

    private handToString(hand: Hand): string {
        if (!hand || hand.length === 0) {
            return "";
        }
        return hand.map((card) => `[${getCardString(card)}]`).join(", ");
    }

    private calculateHandValue(hand: Hand): number {
        let value = 0;
        let aces = 0;
        if (!hand || hand.length === 0) {
            return 0; // No cards, value is 0
        }

        for (const card of hand) {
            if (card.value === "A") {
                aces++;
                value += 11;
            } else if (["J", "Q", "K"].includes(card.value)) {
                value += 10;
            } else {
                value += parseInt(card.value);
            }
        }

        while (value > 21 && aces > 0) {
            value -= 10;
            aces--;
        }

        return value;
    }
}
