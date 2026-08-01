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
} from "bc-bot";
import { wait } from "../hub/utils";
import { DareStore, DareDoc } from "./dareStore";
import { CasinoStore } from "./casino/casinostore";
import { applyForfeitForDare } from "./casino/forfeits";

// Forfeit items a player can be lumbered with if they pass on a drawn dare.
const PASS_FORFEIT_KEYS = [
    "boots",
    "legbinder",
    "frogtie",
    "gag",
    "blindfold",
    "mittens",
    "paws",
    "armbinder",
    "yoke",
];
const PASS_FORFEIT_DURATION_MS = 30 * 60 * 1000;

export class Dare {
    public static description = `Dares
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
4. Don't want to do your dare? !dare pass - you'll be forfeited into a
   random piece of bondage instead (and it still counts against you).
5. The bot announces whose turn is next after every draw. Once everyone's
   gone, the round advances - 10 rounds total.
6. Win condition: when round 10 finishes, whoever picked up the FEWEST
   binds over the whole game wins, and is automatically freed from all
   their bondage. Everyone else stays locked up until their timers run out!

Commands
=====
!dare join          - Join the game as a participant.
!dare leave         - Leave the game (you won't be targeted or turned to).
!dare start         - Start a fresh 10-round game with everyone joined.
!dare turn          - Show whose turn it currently is.
!dare draw          - Draw a dare card (on your turn, if a game's running).
!dare pass          - Chicken out of your last drawn dare - forfeit instead.
!dare add <dare>    - Whisper a new dare card to add to the deck.
!dare list <page>   - (admin only) List dares in the database.
!dare reset         - (admin only) Reset the deck / mark all dares unused.
!dare help          - Show this message.
!pick               - Randomly pick a room member (not you, not the bot).

Rules
=====
1. !dare join before you start, so you can be picked as a dare's target and
   take your turn in a structured game.
2. For dares involving someone else, the dare is applied to a random other
   joined participant automatically - no need to spin anything yourself.
3. Dares last 10 minutes unless the dare says otherwise.
4. Don't want to do your dare? !dare pass - but you'll be forfeited into
   bondage instead, and it still counts against you for the win condition.
5. At the end of round 10, the player with the fewest binds wins and is
   freed from all their bondage.
`;

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

    public constructor(
        private conn: API_Connector,
        private store: DareStore,
        commandParser?: CommandParser,
        private casinoStore?: CasinoStore,
    ) {
        this.commandParser = commandParser ?? new CommandParser(conn);

        this.commandParser.register("pick", this.onPick);
        this.commandParser.register("dare", this.onDare);
    }

    onDare = async (
        senderCharacter: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (args.length < 1) {
            this.conn.SendMessage("Emote", "*" + (await this.store.getSummary()));
            return;
        }

        switch (args[0]) {
            case "join":
                this.joinedPlayers.add(senderCharacter.MemberNumber);
                this.conn.SendMessage(
                    "Emote",
                    `*${senderCharacter} joins the dare game! (${this.joinedPlayers.size} participant(s))`,
                );
                break;
            case "leave":
                this.joinedPlayers.delete(senderCharacter.MemberNumber);
                this.conn.SendMessage(
                    "Emote",
                    `*${senderCharacter} leaves the dare game.`,
                );
                break;
            case "start": {
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

                const order = this.turnOrder
                    .map((m) => this.describeMember(m))
                    .join(" -> ");
                this.conn.SendMessage(
                    "Emote",
                    `*The dare game begins! ${this.totalRounds} rounds, turn order: ${order}.`,
                );
                this.announceTurn();
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
            case "help":
                this.conn.reply(msg, Dare.description);
                break;
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
                await this.applyDareEffect(senderCharacter, dare);

                if (this.gameActive) this.advanceTurn();
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

                const forfeitKey =
                    PASS_FORFEIT_KEYS[
                        Math.floor(Math.random() * PASS_FORFEIT_KEYS.length)
                    ];
                applyForfeitForDare(
                    senderCharacter,
                    this.conn.Player.MemberNumber,
                    forfeitKey,
                    PASS_FORFEIT_DURATION_MS,
                );
                this.addBinds(senderCharacter.MemberNumber, 1);
                this.conn.SendMessage(
                    "Emote",
                    `*${senderCharacter} chickens out of their dare and gets locked into a forfeit instead!`,
                );
                break;
            }
            case "reset":
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
                    "*Usage: !dare <join|leave|start|turn|add|draw|pass|reset|list|help>",
                );
                return;
        }
    };

    private describeMember = (memberNumber: number): string => {
        const character = this.conn.chatRoom.findMember(memberNumber);
        return character ? `${character}` : `#${memberNumber}`;
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

    // Moves to the next player's turn, advancing the round (and ending the
    // game at the end of round 10) once everyone's gone.
    private advanceTurn = (): void => {
        this.currentTurnIndex++;
        if (this.currentTurnIndex >= this.turnOrder.length) {
            this.currentTurnIndex = 0;
            this.round++;
            if (this.round > this.totalRounds) {
                this.endGame();
                return;
            }
        }
        this.announceTurn();
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

        this.gameActive = false;
        this.turnOrder = [];
        this.currentTurnIndex = 0;
        this.round = 1;
        this.bindCounts.clear();

        if (winner === undefined) {
            this.conn.SendMessage(
                "Emote",
                "*The dare game has ended with no participants!",
            );
            return;
        }

        const winnerCharacter = this.conn.chatRoom.findMember(winner);
        winnerCharacter?.Appearance.stripBulk({ item: true }, true);

        this.conn.SendMessage(
            "Emote",
            `*The dare game is over! ${this.describeMember(winner)} wins with only ${lowestBinds} bind(s) and is freed from all bondage!`,
        );
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
            case "strip":
                target.Appearance.stripBulk(
                    { clothing: true },
                    false,
                    dare.stripCount,
                );
                if (dare.noRedress) {
                    this.conn.SendMessage(
                        "Emote",
                        `*${target} must stay undressed for this dare - no getting dressed until it's done!`,
                    );
                }
                break;
            case "bondage": {
                const forfeitKeys = dare.forfeitKeys ?? [];
                for (const forfeitKey of forfeitKeys) {
                    applyForfeitForDare(
                        target,
                        this.conn.Player.MemberNumber,
                        forfeitKey,
                        dare.durationMs,
                    );
                }
                this.addBinds(target.MemberNumber, forfeitKeys.length);
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
