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

Collects dare / forfeit cards privately & anonymously that can then be drawn.

!dare add <dare>
eg. !dare add take off one item of clothing
(This should be whispered to the bot so your dare stays secret!)

!dare draw
Draws a dare card (you can do this in the public room). Strip, bondage and
reward dares are applied automatically.

!dare pass
Chickens out of the dare you just drew. You'll be locked into a random piece
of bondage as a forfeit instead.

!dare list <page>
Lists dares stored in the database, 10 per page (admin only, whisper this to
the bot). <page> is optional and defaults to 1.

!pick
Chooses someone in the room who isn't the bot or yourself (for dares that involve someone else)

Rules
=====
1. Everyone rolls a d100 (/dice 100) to start and placed in the room from lowest to highest.
2. Players take turns to draw a dare, from left to right.
3. Dares last 10 minutes unless the dare says otherwise.
4. For dares involving someone else, spin the wheel to decide who. Re-spin if they're already a
   target for a dare.
5. If you're writing a dare that involves someone else, you can let the person doing the dare pick
   someone or have them spin the bot wheel to choose. Your dare can't involve another specific,
   named person (eg. you can say, "tie a random person", you can't say, "tie Deya").
6. Don't want to do your dare? !dare pass - but you'll be forfeited into bondage instead!
`;

    private commandParser: CommandParser;

    // Tracks the dare each player most recently drew but hasn't resolved
    // yet, so "!dare pass" knows what to forfeit against.
    private pendingDraws = new Map<number, DareDoc>();

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
                    "*Usage: !dare <add|draw|pass|reset|list>",
                );
                return;
        }
    };

    private applyDareEffect = async (
        senderCharacter: API_Character,
        dare: DareDoc,
    ): Promise<void> => {
        switch (dare.category) {
            case "strip":
                senderCharacter.Appearance.stripBulk(
                    { clothing: true },
                    false,
                    dare.stripCount,
                );
                if (dare.noRedress) {
                    this.conn.SendMessage(
                        "Emote",
                        `*${senderCharacter} must stay undressed for this dare - no getting dressed until it's done!`,
                    );
                }
                break;
            case "bondage":
                for (const forfeitKey of dare.forfeitKeys ?? []) {
                    applyForfeitForDare(
                        senderCharacter,
                        this.conn.Player.MemberNumber,
                        forfeitKey,
                        dare.durationMs,
                    );
                }
                if (dare.noRedress) {
                    this.conn.SendMessage(
                        "Emote",
                        `*${senderCharacter} isn't allowed to get dressed again until the timer runs out!`,
                    );
                }
                break;
            case "reward":
                if (this.casinoStore && dare.chips) {
                    await this.casinoStore.addCredits(
                        senderCharacter.MemberNumber,
                        dare.chips,
                    );
                    this.conn.SendMessage(
                        "Emote",
                        `*${senderCharacter} wins ${dare.chips} casino chips!`,
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
