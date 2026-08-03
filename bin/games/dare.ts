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
} from "bc-bot";
import { wait } from "../hub/utils";
import { DareStore, DareDoc } from "./dareStore";
import { CasinoStore } from "./casino/casinostore";
import {
    applyForfeitForDare,
    describeForfeitOutcome,
    lockInForfeitKennel,
} from "./casino/forfeits";

// How long a repeat dare-evader stays locked in the pillory (first pass is
// only locked until their next draw instead - see the "pass" command).
const PILLORY_REPEAT_LOCK_MS = 4 * 60 * 60 * 1000;

// How long a player gets to "!dare forfeit" into the kennel instead of
// having a drawn bondage dare's effect applied automatically.
const BONDAGE_DECISION_MS = 15 * 1000;

// How often stripped-for-the-game players get any redressed clothing
// stripped back off while a structured game is running.
const STRIP_ENFORCE_INTERVAL_MS = 20 * 1000;

// How long someone can sit on their turn without drawing before getting a
// reminder, and before the bot passes on their behalf entirely.
const TURN_REMINDER_MS = 30 * 1000;
const TURN_AUTO_PASS_MS = 60 * 1000;

export interface DareConfig {
    // If set, dare commands are only handled while the sender stands
    // inside this map region.
    region?: MapRegion;
}

export class Dare {

    public static description_intro = `Dares
 =====

A structured bondage/strip dare game for a group, played over 10 rounds
with turn order - or just casual free-for-all drawing if nobody starts a
game. Whisper !dare help any time for the full rundown.

Game Overview
=====
1. Everyone who wants to play whispers !dare join to sign up.
2. Once at least 2 people have joined, anyone can start the game with
   !dare start. This locks in a random turn order and begins round 1 of 10.
3. On your turn, !dare draw draws a random card. Strip, bondage and reward
   dares are applied automatically - to yourself, or to a random other
   joined participant if the dare calls for it.
4. Don't want to do your dare? !dare pass - you'll be locked into the
   pillory until your next draw (and it counts against you). Pass again
   and you're pilloried for 4 hours with a sign reading "Evades / Dares"!
5. Drawn a bondage dare? You get a short window to !dare forfeit instead -
   skip the specific bondage and get locked into a heavy kennel instead.
6. The bot announces whose turn is next after every draw. Once everyone's
   gone, the round advances - 10 rounds total.
7. Win condition: when round 10 finishes, whoever picked up the FEWEST
   binds over the whole game wins, and is automatically freed from all
   their bondage. Everyone else stays locked up until their timers run out!
8. Stripped by a dare? You stay bare for the rest of the game - the bot
   will keep stripping anything you try to put back on until it ends.
9. If a body part is already bound when a new bondage dare targets it, the
   existing lock's timer is extended instead of piling on more gear.
10. Not responding on your turn? You'll get a reminder after 30 seconds,
    and after 60 seconds the bot passes on your behalf (with the usual
    pillory consequence, escalating on a second miss).
11. Leave the room mid-game and you're removed from the running game
    immediately. If everyone else leaves, whoever's left auto-wins.
`;

public static description_commands = `Commands
=====
!dare join          - Join the game as a participant.
!dare leave         - Leave the game - you won't be targeted or turned to.
!dare start         - Start a fresh 10-round game with everyone joined.
!dare turn          - Show whose turn it currently is.
!dare draw          - Draw a dare card - on your turn, if a game's running.
!dare pass          - Chicken out of your last drawn dare - forfeit instead.
!dare forfeit       - After drawing bondage, get kenneled instead of bound.
!dare players       - Show everyone currently joined to dare.
!dare remove <who>  - [admin only] Remove a joined player from dare.
!dare stop          - [admin only] Stop the currently running dare game.
!dare add <dare>    - Whisper a new dare card to add to the deck.
!dare list <page>   - [admin only] List dares in the database.
!dare reset         - [admin only] Reset the deck / mark all dares unused.
!dare help          - Show this message.
!pick               - Randomly pick a room member, not you, not the bot.
`;
public static description_rules = `Rules
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
7. Stripped players stay bare until the game ends - no redressing early!
8. At the end of round 10, the player with the fewest binds wins and is
   freed from all their bondage.
9. Ignore your turn too long and the bot passes for you automatically.
    Leave mid-game and you're removed immediately. Last one standing wins.
`;
public static description = Dare.description_intro + "\n" + Dare.description_commands + "\n" + Dare.description_rules;

    private commandParser: CommandParser;

    // Tracks the dare each player most recently drew but hasn't resolved
    // yet, so "!dare pass" knows what to forfeit against.
    private pendingDraws = new Map<number, DareDoc>();

    // Members who've opted into the dare game via "!dare join", and so can
    // be picked as the target of a dare drawn by someone else.
    private joinedPlayers = new Set<number>();

    // Structured 10-round game state. turnOrder/currentTurnIndex/round are
    // only meaningful while gameActive is true.
    private readonly totalRounds = 10;
    private gameActive = false;
    private turnOrder: number[] = [];
    private currentTurnIndex = 0;
    private round = 1;

    // How many bondage items each member has been forfeited into over the
    // course of the current game, used to decide the round-10 winner.
    private bindCounts = new Map<number, number>();

    // Scheduled auto-apply timers for bondage dares currently in their
    // "!dare forfeit" decision window, keyed by the drawer's member number.
    private pendingBondageTimers = new Map<number, ReturnType<typeof setTimeout>>();

    // Members who've been stripped by a dare during the current game and so
    // must stay bare until it ends.
    private strippedForGame = new Set<number>();
    private stripEnforceInterval: ReturnType<typeof setInterval> | undefined;

    // How many times each member has passed on a drawn dare this game -
    // the 2nd+ pass escalates the pillory into a long timed, signed one.
    private passCounts = new Map<number, number>();
    // Members currently pilloried "until their next draw" (first pass),
    // released automatically the next time they successfully !dare draw.
    private pilloriedUntilNextDraw = new Set<number>();

    // Reminder/auto-pass timers for whoever's turn it currently is, so an
    // unresponsive player doesn't stall the whole game.
    private turnReminderTimer: ReturnType<typeof setTimeout> | undefined;
    private turnAutoPassTimer: ReturnType<typeof setTimeout> | undefined;

    private region?: MapRegion;

    public constructor(
        private conn: API_Connector,
        private store: DareStore,
        commandParser?: CommandParser,
        private casinoStore?: CasinoStore,
        config?: DareConfig,
    ) {
        this.commandParser =
            commandParser ?? new CommandParser(conn, config?.region);
        this.region = config?.region;

        this.commandParser.register("pick", this.onPick);
        this.commandParser.register("dare", this.onDare);

        this.conn.on("CharacterLeft", this.onCharacterLeft);
        this.conn.on("CharacterEntered", this.onCharacterEntered);
    }

    onDare = async (
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.requireInDareRegion(senderCharacter, msg)) return;

        this.pruneUnavailableParticipants();

        if (args.length < 1) {
            this.conn.SendMessage("Emote", "*" + (await this.store.getSummary()));
            return;
        }

        switch (args[0]) {
            case "join":
                if (this.joinedPlayers.has(senderCharacter.MemberNumber)) {
                    this.conn.reply(msg, "You're already joined.");
                    return;
                }
                this.joinedPlayers.add(senderCharacter.MemberNumber);
                this.conn.SendMessage(
                    "Emote",
                    `*${senderCharacter} joins the dare game! (${this.joinedPlayers.size} participant(s))`,
                );
                break;
            case "leave":
                if (!this.joinedPlayers.has(senderCharacter.MemberNumber)) {
                    this.conn.reply(msg, "You're not currently joined.");
                    return;
                }
                const result = this.removeParticipantByMemberNumber(
                    senderCharacter.MemberNumber,
                    "left the dare game.",
                );
                if (result.removedFromJoined && !result.removedFromGame) {
                    this.conn.SendMessage(
                        "Emote",
                        `*${senderCharacter} leaves the dare game.`,
                    );
                }
                break;
            case "start": {
                this.pruneUnavailableParticipants();
                if (this.joinedPlayers.size < 2) {
                    this.conn.reply(
                        msg,
                        "Need at least 2 joined players (!dare join) to start a game.",
                    );
                    return;
                }

                this.turnOrder = [...this.joinedPlayers].sort(
                    () => Math.random() - 0.5,
                );
                this.currentTurnIndex = 0;
                this.round = 1;
                this.gameActive = true;
                this.bindCounts.clear();
                this.pendingDraws.clear();

                for (const timer of this.pendingBondageTimers.values()) {
                    clearTimeout(timer);
                }
                this.pendingBondageTimers.clear();
                this.strippedForGame.clear();
                this.passCounts.clear();
                this.pilloriedUntilNextDraw.clear();
                this.clearTurnTimers();

                if (this.stripEnforceInterval) {
                    clearInterval(this.stripEnforceInterval);
                }
                this.stripEnforceInterval = setInterval(() => {
                    for (const memberNumber of this.strippedForGame) {
                        this.conn.chatRoom
                            .findMember(memberNumber)
                            ?.Appearance.stripBulk({ clothing: true }, false);
                    }
                }, STRIP_ENFORCE_INTERVAL_MS);

                const order = this.turnOrder
                    .map((m) => this.describeMember(m))
                    .join(" -> ");
                this.conn.SendMessage(
                    "Emote",
                    `*The dare game begins! ${this.totalRounds} rounds, turn order: ${order}.`,
                );
                this.announceTurn();
                this.startTurnTimers(this.turnOrder[this.currentTurnIndex]);
                break;
            }
            case "players": {
                this.pruneUnavailableParticipants();
                this.replyWithJoinedPlayers(msg);
                break;
            }
            case "turn":
                if (!this.gameActive) {
                    this.conn.reply(
                        msg,
                        "No game is running - use !dare start to begin one.",
                    );
                    return;
                }
                this.announceTurn();
                break;
            case "remove": {
                if (!senderCharacter.IsRoomAdmin()) {
                    this.conn.reply(msg, "Only admins can use this command.");
                    return;
                }
                const who = args[1];
                if (!who) {
                    this.conn.reply(
                        msg,
                        "Usage: !dare remove <name or member number>",
                    );
                    return;
                }
                const memberNumber = this.resolveParticipantMemberNumber(who);
                if (memberNumber === undefined) {
                    this.conn.reply(
                        msg,
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
                        `*${this.describeMember(memberNumber)} was removed from dare by admin ${senderCharacter}.`,
                    );
                }
                break;
            }
            case "stop": {
                if (!senderCharacter.IsRoomAdmin()) {
                    this.conn.reply(msg, "Only admins can use this command.");
                    return;
                }
                if (!this.gameActive) {
                    this.conn.reply(msg, "No dare game is currently running.");
                    return;
                }
                this.resetGameState();
                this.conn.SendMessage(
                    "Emote",
                    `*The running dare game was stopped by admin ${senderCharacter}.`,
                );
                break;
            }
            case "help":
                this.conn.reply(msg, Dare.description_intro);
                this.conn.reply(msg, Dare.description_commands);
                this.conn.reply(msg, Dare.description_rules);
                break;
            case "forfeit": {
                const timer = this.pendingBondageTimers.get(
                    senderCharacter.MemberNumber,
                );
                if (!timer) {
                    this.conn.reply(
                        msg,
                        "You don't have a bondage dare pending to forfeit out of!",
                    );
                    return;
                }
                clearTimeout(timer);
                this.pendingBondageTimers.delete(senderCharacter.MemberNumber);
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
                this.finishTurn();
                break;
            }
            case "add":
                if (args.length < 2) {
                    this.conn.SendMessage("Emote", "*Usage: !dare add <dare>");
                    return;
                }
                await this.store.addDare(
                    args.slice(1).join(" "),
                    senderCharacter.MemberNumber,
                    senderCharacter.Name,
                );
                this.conn.SendMessage(
                    "Emote",
                    `*Dare saved, thanks ${senderCharacter}! ${await this.store.getSummary()}`,
                );

                break;
            case "draw": {
                if (this.gameActive) {
                    const currentTurn = this.turnOrder[this.currentTurnIndex];
                    if (senderCharacter.MemberNumber !== currentTurn) {
                        this.conn.reply(
                            msg,
                            `It's not your turn! Waiting on ${this.describeMember(currentTurn)}.`,
                        );
                        return;
                    }
                    this.clearTurnTimers();
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

                const dare = await this.store.drawDare();
                if (dare === undefined) {
                    this.conn.SendMessage("Emote", `*No more dares left!`);
                    return;
                }
                this.conn.SendMessage(
                    "Emote",
                    `*${senderCharacter} draws: ${dare.text}\n${await this.store.getSummary()}`,
                );

                this.pendingDraws.set(senderCharacter.MemberNumber, dare);

                if (dare.category === "bondage") {
                    this.conn.SendMessage(
                        "Emote",
                        `*${senderCharacter} has ${BONDAGE_DECISION_MS / 1000} seconds to !dare forfeit into the kennel instead, or !dare pass to chicken out entirely - otherwise the bondage locks in automatically!`,
                    );
                    const timer = setTimeout(() => {
                        this.pendingBondageTimers.delete(
                            senderCharacter.MemberNumber,
                        );
                        void this.applyDareEffect(senderCharacter, dare).then(
                            () => this.finishTurn(),
                        );
                    }, BONDAGE_DECISION_MS);
                    this.pendingBondageTimers.set(
                        senderCharacter.MemberNumber,
                        timer,
                    );
                } else {
                    await this.applyDareEffect(senderCharacter, dare);
                    this.finishTurn();
                }
                break;
            }
            case "pass": {
                const pending = this.pendingDraws.get(
                    senderCharacter.MemberNumber,
                );
                if (!pending) {
                    this.conn.reply(
                        msg,
                        "You haven't drawn a dare to pass on!",
                    );
                    return;
                }
                this.pendingDraws.delete(senderCharacter.MemberNumber);

                const bondageTimer = this.pendingBondageTimers.get(
                    senderCharacter.MemberNumber,
                );
                if (bondageTimer) {
                    clearTimeout(bondageTimer);
                    this.pendingBondageTimers.delete(
                        senderCharacter.MemberNumber,
                    );
                }

                this.applyPassConsequence(senderCharacter);
                this.finishTurn();
                break;
            }
            case "reset":
                if (!senderCharacter.IsRoomAdmin()) {
                    this.conn.reply(msg, "Only admins can use this command.");
                    return;
                }
                await this.store.resetDares();
                this.conn.SendMessage(
                    "Emote",
                    "*" + (await this.store.getSummary()),
                );
                break;
            case "list": {
                try {
                    console.log(
                        `!dare list from ${senderCharacter} (${senderCharacter.MemberNumber}), admin=${senderCharacter.IsRoomAdmin()}, args=${JSON.stringify(args)}`,
                    );

                    if (!senderCharacter.IsRoomAdmin()) {
                        this.conn.reply(
                            msg,
                            "Only admins can use this command.",
                        );
                        return;
                    }
                    const dares = await this.store.listDares();
                    console.log(`!dare list found ${dares.length} dares`);
                    if (dares.length === 0) {
                        this.conn.reply(msg, "No dares in the database.");
                        return;
                    }

                    const pageSize = 10;
                    const pageCount = Math.ceil(dares.length / pageSize);
                    let page = parseInt(args[1], 10);
                    if (!Number.isInteger(page) || page < 1) page = 1;
                    if (page > pageCount) page = pageCount;

                    const start = (page - 1) * pageSize;
                    const pageDares = dares.slice(start, start + pageSize);

                    const lines = pageDares.map(
                        (d, i) =>
                            `${start + i + 1}. ${d.text.replace(/[()]/g, "")}`,
                    );
                    lines.push(
                        `Page ${page} of ${pageCount} - !dare list <page> for more`,
                    );

                    this.conn.reply(msg, lines.join("\n"));
                } catch (e) {
                    console.error("!dare list failed", e);
                    this.conn.reply(
                        msg,
                        "Something went wrong listing dares, sorry!",
                    );
                }
                break;
            }
            default:
                this.conn.SendMessage(
                    "Emote",
                    "*Usage: !dare <join|leave|start|turn|draw|pass|forfeit|players|remove|stop|add|reset|list|help>",
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

        this.conn.reply(
            msg,
            "Dare commands only work inside the dare area on the map.",
        );
        return false;
    };

    private isInRegion = (character: API_Character, region: MapRegion): boolean => {
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

        for (const memberNumber of [...this.joinedPlayers]) {
            if (online.has(memberNumber)) continue;
            this.joinedPlayers.delete(memberNumber);
            this.pendingDraws.delete(memberNumber);
            this.pilloriedUntilNextDraw.delete(memberNumber);
            this.strippedForGame.delete(memberNumber);
            this.passCounts.delete(memberNumber);
            this.bindCounts.delete(memberNumber);

            const bondageTimer = this.pendingBondageTimers.get(memberNumber);
            if (bondageTimer) {
                clearTimeout(bondageTimer);
                this.pendingBondageTimers.delete(memberNumber);
            }
        }

        for (const memberNumber of [...this.turnOrder]) {
            if (online.has(memberNumber)) continue;
            this.removeParticipantByMemberNumber(
                memberNumber,
                "is no longer available and is removed from the dare game.",
            );
        }
    };

    private normalizeStripCount = (value: unknown): number | undefined => {
        if (value === undefined || value === null) return undefined;
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return undefined;
        return Math.max(1, Math.floor(parsed));
    };

    private replyWithJoinedPlayers = (msg: BC_Server_ChatRoomMessage): void => {
        if (this.joinedPlayers.size === 0) {
            this.conn.reply(msg, "Nobody is currently joined to dare.");
            return;
        }

        const names = [...this.joinedPlayers].map((memberNumber) => {
            const c = this.conn.chatRoom.findMember(memberNumber);
            return c
                ? `${c} (#${c.MemberNumber})`
                : `#${memberNumber} (offline)`;
        });

        this.conn.reply(
            msg,
            `Joined dare players (${names.length}):\n${names.join("\n")}`,
        );
    };

    private resolveParticipantMemberNumber = (
        input: string,
    ): number | undefined => {
        const asNumber = Number.parseInt(input, 10);
        if (
            Number.isInteger(asNumber) &&
            (this.joinedPlayers.has(asNumber) || this.turnOrder.includes(asNumber))
        ) {
            return asNumber;
        }

        const fromRoom = this.conn.chatRoom.findCharacter(input);
        if (!fromRoom) return undefined;
        if (
            this.joinedPlayers.has(fromRoom.MemberNumber) ||
            this.turnOrder.includes(fromRoom.MemberNumber)
        ) {
            return fromRoom.MemberNumber;
        }

        return undefined;
    };

    private describeMember = (memberNumber: number): string => {
        const character = this.conn.chatRoom.findMember(memberNumber);
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

    private announceTurn = (): void => {
        const memberNumber = this.turnOrder[this.currentTurnIndex];
        this.conn.SendMessage(
            "Emote",
            `*Round ${this.round}/${this.totalRounds}: it's ${this.describeMember(memberNumber)}'s turn to !dare draw.`,
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
            pillory.lock("TimerPasswordPadlock", this.conn.Player.MemberNumber, {
                RemoveItem: true,
                RemoveTimer: Date.now() + PILLORY_REPEAT_LOCK_MS,
                ShowTimer: false,
                LockSet: true,
            });
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

    // Clears the idle-turn reminder/auto-pass timers, if any are pending.
    private clearTurnTimers = (): void => {
        if (this.turnReminderTimer) clearTimeout(this.turnReminderTimer);
        if (this.turnAutoPassTimer) clearTimeout(this.turnAutoPassTimer);
        this.turnReminderTimer = undefined;
        this.turnAutoPassTimer = undefined;
    };

    // Starts the reminder (30s) / auto-pass (60s) timers for whoever's
    // turn it now is, so an unresponsive player doesn't stall the game.
    private startTurnTimers = (memberNumber: number): void => {
        this.clearTurnTimers();
        this.turnReminderTimer = setTimeout(() => {
            if (!this.gameActive) return;
            if (this.turnOrder[this.currentTurnIndex] !== memberNumber) return;
            this.conn.SendMessage(
                "Emote",
                `*Reminder: it's still ${this.describeMember(memberNumber)}'s turn - !dare draw within ${(TURN_AUTO_PASS_MS - TURN_REMINDER_MS) / 1000} more seconds or the bot will pass on their behalf!`,
            );
        }, TURN_REMINDER_MS);
        this.turnAutoPassTimer = setTimeout(() => {
            if (!this.gameActive) return;
            if (this.turnOrder[this.currentTurnIndex] !== memberNumber) return;
            const character = this.conn.chatRoom.findMember(memberNumber);
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
            this.finishTurn();
        }, TURN_AUTO_PASS_MS);
    };

    // Fired whenever anyone leaves the room. Leaving always removes them from
    // the joined list immediately, and from any running game as well.
    private onCharacterLeft = (
        sourceMemberNumber: number,
        character: API_Character,
        _leaveMessage: string | null,
        _intentional: boolean,
    ): void => {
        const wasJoined = this.joinedPlayers.has(sourceMemberNumber);
        const wasInGame = this.turnOrder.includes(sourceMemberNumber);
        this.removeParticipantByMemberNumber(
            sourceMemberNumber,
            "left the room and is removed from dare.",
        );

        if (wasJoined && !wasInGame) {
            this.conn.SendMessage(
                "Emote",
                `*${character} left the room and is removed from dare.`,
            );
        }
    };

    // No reconnect recovery path is needed now that leaving removes a player
    // from the running game immediately.
    private onCharacterEntered = (_character: API_Character): void => {
        // Intentionally empty.
    };

    private removeParticipantByMemberNumber = (
        memberNumber: number,
        reason: string,
    ): {
        removedFromGame: boolean;
        removedFromJoined: boolean;
    } => {
        const wasJoined = this.joinedPlayers.has(memberNumber);
        const isCurrentTurn =
            this.gameActive &&
            this.turnOrder[this.currentTurnIndex] === memberNumber;

        if (this.turnOrder.includes(memberNumber)) {
            this.removePlayerFromGame(memberNumber, reason);

            if (!this.gameActive) {
                return { removedFromGame: true, removedFromJoined: wasJoined };
            }

            if (this.turnOrder.length === 0) {
                this.endGame();
                return { removedFromGame: true, removedFromJoined: wasJoined };
            }
            if (this.turnOrder.length === 1) {
                this.winBySoleSurvivor();
                return { removedFromGame: true, removedFromJoined: wasJoined };
            }

            if (isCurrentTurn) {
                this.clearTurnTimers();
                this.advanceTurn();
            }
            return { removedFromGame: true, removedFromJoined: wasJoined };
        }

        this.joinedPlayers.delete(memberNumber);
        this.pendingDraws.delete(memberNumber);
        this.pilloriedUntilNextDraw.delete(memberNumber);
        this.strippedForGame.delete(memberNumber);
        this.passCounts.delete(memberNumber);
        this.bindCounts.delete(memberNumber);

        const bondageTimer = this.pendingBondageTimers.get(memberNumber);
        if (bondageTimer) {
            clearTimeout(bondageTimer);
            this.pendingBondageTimers.delete(memberNumber);
        }

        return { removedFromGame: false, removedFromJoined: wasJoined };
    };

    // Removes a participant from the active game entirely: turn order,
    // joined-players set, and any pending per-player state for them.
    private removePlayerFromGame = (
        memberNumber: number,
        reason: string,
    ): void => {
        const idx = this.turnOrder.indexOf(memberNumber);
        if (idx !== -1) {
            this.turnOrder.splice(idx, 1);
            if (idx <= this.currentTurnIndex) {
                this.currentTurnIndex--;
            }
        }

        this.joinedPlayers.delete(memberNumber);
        this.pendingDraws.delete(memberNumber);
        this.pilloriedUntilNextDraw.delete(memberNumber);
        this.strippedForGame.delete(memberNumber);
        this.passCounts.delete(memberNumber);
        this.bindCounts.delete(memberNumber);

        const bondageTimer = this.pendingBondageTimers.get(memberNumber);
        if (bondageTimer) {
            clearTimeout(bondageTimer);
            this.pendingBondageTimers.delete(memberNumber);
        }

        this.conn.SendMessage(
            "Emote",
            `*${this.describeMember(memberNumber)} ${reason}`,
        );
    };

    // Advances the turn/round if a structured game is running; a no-op
    // during casual free-for-all play. Called once a drawn dare (and any
    // pass/forfeit decision window for it) has fully resolved.
    private finishTurn = (): void => {
        if (this.gameActive) this.advanceTurn();
    };

    // Moves to the next player's turn, advancing the round (and ending the
    // game at the end of round 10) once everyone's gone. Silently skips
    // (and eventually removes) disconnected players, and ends the game
    // early if only one participant is left standing.
    private advanceTurn = (): void => {
        this.clearTurnTimers();
        this.pruneUnavailableParticipants();

        const guardLimit = this.turnOrder.length + 1;
        for (let attempt = 0; attempt < guardLimit; attempt++) {
            if (this.turnOrder.length === 0) {
                this.endGame();
                return;
            }
            if (this.turnOrder.length === 1) {
                this.winBySoleSurvivor();
                return;
            }

            this.currentTurnIndex++;
            if (this.currentTurnIndex >= this.turnOrder.length) {
                this.currentTurnIndex = 0;
                this.round++;
                if (this.round > this.totalRounds) {
                    this.endGame();
                    return;
                }
            }

            const nextMember = this.turnOrder[this.currentTurnIndex];
            const nextCharacter = this.conn.chatRoom.findMember(nextMember);
            if (!nextCharacter) {
                this.removeParticipantByMemberNumber(
                    nextMember,
                    "is no longer available and is removed from the dare game.",
                );
                continue;
            }

            this.announceTurn();
            this.startTurnTimers(nextMember);
            return;
        }

        // Safety net - shouldn't normally be reached.
        this.endGame();
    };

    // Resets all structured-game state. Shared by both a normal round-10
    // finish and an early sole-survivor win.
    private resetGameState = (): void => {
        this.gameActive = false;
        this.turnOrder = [];
        this.currentTurnIndex = 0;
        this.round = 1;
        this.pendingDraws.clear();
        this.bindCounts.clear();
        this.passCounts.clear();
        this.pilloriedUntilNextDraw.clear();
        this.strippedForGame.clear();
        this.clearTurnTimers();
        for (const timer of this.pendingBondageTimers.values()) {
            clearTimeout(timer);
        }
        this.pendingBondageTimers.clear();
        if (this.stripEnforceInterval) {
            clearInterval(this.stripEnforceInterval);
            this.stripEnforceInterval = undefined;
        }
    };

    // Frees the winner of all bondage and announces the game's end.
    private declareWinner = (winner: number, reasonPhrase: string): void => {
        const winnerCharacter = this.conn.chatRoom.findMember(winner);
        winnerCharacter?.Appearance.stripBulk({ item: true }, true);

        this.conn.SendMessage(
            "Emote",
            `*The dare game is over! ${this.describeMember(winner)} ${reasonPhrase} and is freed from all bondage!`,
        );
    };

    // Ends the game early because only one participant remains (everyone
    // else left or was removed for being disconnected too long).
    private winBySoleSurvivor = (): void => {
        const winner = this.turnOrder[0];
        this.resetGameState();
        this.declareWinner(
            winner,
            "is the only one left standing and wins by default",
        );
    };

    // Ends the current game: whoever has the fewest binds wins and is
    // stripped of all their bondage (including locked items).
    private endGame = (): void => {
        let winner: number | undefined;
        let lowestBinds = Infinity;
        for (const memberNumber of this.turnOrder) {
            const binds = this.bindCounts.get(memberNumber) ?? 0;
            if (binds < lowestBinds) {
                lowestBinds = binds;
                winner = memberNumber;
            }
        }

        this.resetGameState();

        if (winner === undefined) {
            this.conn.SendMessage(
                "Emote",
                "*The dare game has ended with no participants!",
            );
            return;
        }

        this.declareWinner(winner, `wins with only ${lowestBinds} bind(s)`);
    };

    // Picks who a drawn dare's effect actually applies to: the drawer
    // themselves, unless the dare calls for a random other joined
    // participant (falling back to the drawer if nobody else has joined).
    private resolveDareTarget = (
        drawer: API_Character,
        dare: DareDoc,
    ): API_Character => {
        if (dare.target !== "other") return drawer;

        const candidates = [...this.joinedPlayers]
            .filter((memberNumber) => memberNumber !== drawer.MemberNumber)
            .map((memberNumber) => this.conn.chatRoom.findMember(memberNumber))
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
                if (dare.noRedress) {
                    this.conn.SendMessage(
                        "Emote",
                        `*${target} must stay undressed for this dare - no getting dressed until it's done!`,
                    );
                }
                if (this.gameActive) {
                    this.strippedForGame.add(target.MemberNumber);
                    this.conn.SendMessage(
                        "Emote",
                        `*${target} will stay bare for the rest of the game!`,
                    );
                }
                break;
            }
            case "bondage": {
                const forfeitKeys = dare.forfeitKeys ?? [];
                let appliedCount = 0;
                for (const forfeitKey of forfeitKeys) {
                    const result = applyForfeitForDare(
                        target,
                        this.conn.Player.MemberNumber,
                        forfeitKey,
                        dare.durationMs,
                    );
                    if (!result) continue;
                    this.conn.SendMessage(
                        "Emote",
                        describeForfeitOutcome(target, result),
                    );
                    if (result.outcome === "applied") appliedCount++;
                }
                this.addBinds(target.MemberNumber, appliedCount);
                if (dare.noRedress) {
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
                if (this.casinoStore && dare.chips) {
                    await this.casinoStore.addCredits(
                        drawer.MemberNumber,
                        dare.chips,
                    );
                    this.conn.SendMessage(
                        "Emote",
                        `*${drawer} wins ${dare.chips} casino chips!`,
                    );
                } else if (dare.chips) {
                    console.log(
                        "CasinoStore not configured; skipping chip reward for dare.",
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
        this.conn.SendMessage(
            "Emote",
            `*${senderCharacter} randomly selects a room member...`,
        );
        await wait(2000);

        const possibleMembers = this.conn.chatRoom.characters.filter(
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
