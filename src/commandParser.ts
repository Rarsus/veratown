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

import { API_Character } from "./apiCharacter.ts";
import { API_Connector, API_Message } from "./apiConnector.ts";
import { BC_Server_ChatRoomMessage } from "./logicEvent.ts";
import { MapRegion, positionIsInRegion } from "./apiMap.ts";

type CommandCallback = (
    sender: API_Character,
    msg: BC_Server_ChatRoomMessage,
    args: string[],
) => void | Promise<void>;

const SLASH_BOT_PREFIX = "ChatRoomBot ";

export class CommandParser {
    private commands = new Map<string, CommandCallback>();

    /**
     * @param region If set, commands are only processed when the sender is
     * standing within this map region; otherwise they're ignored.
     * @param excludeRegions If set, commands are ignored when the sender is
     * standing within any of these map regions. Useful so that a bot doesn't
     * respond to commands meant for another bot occupying its own region of
     * the same room.
     */
    public constructor(
        private conn: API_Connector,
        private region?: MapRegion,
        private excludeRegions?: MapRegion[],
    ) {
        conn.on("Message", this.onMessage);
    }

    public register(cmd: string, cb: CommandCallback) {
        this.commands.set(cmd, cb);
    }

    public unregister(cmd: string) {
        this.commands.delete(cmd);
    }

    public unregisterAll() {
        this.commands.clear();
    }

    private onMessage = (ev: API_Message) => {
        // BC wraps private whispers in one pair of parentheses. Remove only
        // that protocol wrapper so ordinary message punctuation is preserved.
        const msg =
            ev.message.Content.startsWith("(") &&
            ev.message.Content.endsWith(")")
                ? ev.message.Content.slice(1, -1)
                : ev.message.Content;

        let cmdString: string | undefined;
        if (
            ["Whisper", "Chat"].includes(ev.message.Type) &&
            msg.startsWith("!") &&
            msg.length > 1
        ) {
            cmdString = msg.substring(1);
        } else if (
            ev.message.Type === "Hidden" &&
            ev.message.Content.startsWith(SLASH_BOT_PREFIX)
        ) {
            cmdString = msg.substring(SLASH_BOT_PREFIX.length).trimStart();
        }

        if (cmdString === undefined) return;

        if (this.region && !positionIsInRegion(ev.sender.MapPos, this.region)) {
            return;
        }

        if (
            this.excludeRegions?.some((region) =>
                positionIsInRegion(ev.sender.MapPos, region),
            )
        ) {
            return;
        }

        this.processCmdString(ev, cmdString);
    };

    private processCmdString(ev: API_Message, cmdString: string): void {
        const parts = cmdString.toLowerCase().split(" ");
        let cmd = [];

        // try more words of the command until we run out of parts, so
        // we can support multi-word commands
        while (parts.length > 0) {
            cmd.push(parts.shift());

            const cb = this.commands.get(cmd.join(" "));
            if (cb) {
                try {
                    const ret = cb(ev.sender, ev.message, parts);
                    const promiseRet = ret as Promise<void>;
                    if (promiseRet && promiseRet.catch) {
                        // I am not sure if a check for promiseRet makes sense but if the return of the command is no promise it would error otherwise
                        promiseRet.catch((e) => {
                            console.log(
                                "Command handler threw async exception",
                                e,
                            );
                        });
                    }
                } catch (e) {
                    console.log("Command handler threw exception", e);
                }
                return;
            }
        }
        this.conn.reply(ev.message, "Unknown command");
    }
}
