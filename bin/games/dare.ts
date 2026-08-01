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
import { DareStore } from "./dareStore";

export class Dare {
    public static description = `Dares
 =====

Collects dare / forfeit cards privately & anonymously that can then be drawn.

!dare add <dare>
eg. !dare add take off one item of clothing
(This should be whispered to the bot so your dare stays secret!)

!dare draw
Draws a dare card (you can do this in the public room)

!dare list
Lists all dares stored in the database, including who added them and whether
they've been drawn already (admin only, whisper this to the bot).

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
6. No "free pass" cards: 'cos skipping a turn is boring!
`;

    private commandParser: CommandParser;

    public constructor(
        private conn: API_Connector,
        private store: DareStore,
        commandParser?: CommandParser,
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
            case "draw":
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
                    `*${senderCharacter} draws: ${dare}\n${await this.store.getSummary()}`,
                );
                break;
            case "reset":
                await this.store.resetDares();
                this.conn.SendMessage(
                    "Emote",
                    "*" + (await this.store.getSummary()),
                );
                break;
            case "list":
                if (!senderCharacter.IsRoomAdmin()) {
                    this.conn.reply(msg, "Only admins can use this command.");
                    return;
                }
                const dares = await this.store.listDares();
                if (dares.length === 0) {
                    this.conn.reply(msg, "No dares in the database.");
                    return;
                }
                this.conn.reply(
                    msg,
                    dares
                        .map(
                            (d, i) =>
                                `${i + 1}. [${d.used ? "used" : "unused"}] ${d.text} (added by ${d.addedByName})`,
                        )
                        .join("\n"),
                );
                break;
            default:
                this.conn.SendMessage(
                    "Emote",
                    "*Usage: !dare <add|draw|reset|list>",
                );
                return;
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
