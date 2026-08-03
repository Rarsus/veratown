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
    API_Character,
    API_Message,
    CommandParser,
    BC_Server_ChatRoomMessage,
} from "bc-bot";
import { compressToBase64, decompressFromBase64 } from "lz-string";
import { wait } from "../../hub/utils";
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import { VeratownMapStore } from "./mapStore";
import { MAP as DEFAULT_MAP_BUNDLE } from "./veratownConfig";

// Owns every admin-only Veratown command: "strip", "feature
// enable/disable", "map update/reset/import/export", and "maintenance".
// Registered through the same guardHandler() safety wrapper used by the
// room feature systems (bin/games/veratown/featureSystem.ts), so a bug in
// one admin command is logged and swallowed instead of crashing the bot or
// taking out any other command.
export class VeratownAdminCommands {
    // Guards against overlapping "!maintenance" runs (eg. a second admin
    // triggering it while the one-minute warning is still counting down).
    private maintenanceInProgress = false;

    public constructor(
        private conn: API_Connector,
        private commandParser: CommandParser,
        private features: VeratownFeatureSystem[],
        private mapStore?: VeratownMapStore,
        // Delegates to Veratown's private freeCharacter() (strips bind
        // items and frees from any cage), so the maintenance shutdown frees
        // people the same way "/bot freeandleave" does.
        private freeCharacter?: (character: API_Character) => void,
        // The optional second bot connection (eg. for shower narration) -
        // used only to exclude it from the maintenance shutdown's
        // free/kick pass, since it's a bot, not a room member.
        private conn2?: API_Connector,
    ) {}

    public registerCommands(): void {
        this.commandParser.register(
            "strip",
            guardHandler("admin:strip", this.onCommandStrip),
        );
        this.commandParser.register(
            "feature",
            guardHandler("admin:feature", this.onCommandFeature),
        );
        this.commandParser.register(
            "map",
            guardHandler("admin:map", this.onCommandMap),
        );
        this.commandParser.register(
            "maintenance",
            guardHandler("admin:maintenance", this.onCommandMaintenance),
        );

        // "!map import <data>" is handled separately from the other "map"
        // subcommands above: CommandParser lowercases the *entire* message
        // before any handler sees it (including command arguments), but
        // the base64 map bundle produced by "!map export" is case-
        // sensitive, so routing "import" through CommandParser the normal
        // way would silently corrupt every import. This raw listener reads
        // the untouched original message content instead.
        this.conn.on(
            "Message",
            guardHandler("admin:map-import", this.onRawMessage),
        );
    }

    private requireAdmin(
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
    ): boolean {
        if (!sender.IsRoomAdmin()) {
            this.conn.reply(msg, "Only admins can use this command.");
            return false;
        }
        return true;
    }

    private onCommandStrip = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.requireAdmin(sender, msg)) return;

        if (args.length === 0) {
            this.conn.reply(msg, "Usage: strip <name or member number>");
            return;
        }

        const target = this.conn.chatRoom.findCharacter(args[0]);
        if (!target) {
            this.conn.reply(msg, "I can't find that person.");
            return;
        }

        target.Appearance.stripBulk({ clothing: true });
        this.conn.reply(msg, `${target} has been stripped of their clothing.`);
    };

    private onCommandFeature = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        const sub = args[0];

        if (!sub || sub === "list") {
            if (this.features.length === 0) {
                this.conn.reply(
                    msg,
                    "No room features are currently available.",
                );
                return;
            }
            const lines = this.features.map(
                (f) =>
                    `${f.key} - ${f.label}: ${f.enabled ? "enabled" : "disabled"}`,
            );
            this.conn.reply(msg, `Room features:\n${lines.join("\n")}`);
            return;
        }

        if (sub !== "enable" && sub !== "disable") {
            this.conn.reply(
                msg,
                "Usage: /bot feature <list|enable|disable> [name]",
            );
            return;
        }

        if (!this.requireAdmin(sender, msg)) return;

        const key = args[1];
        // CommandParser lowercases every arg (not just the command name)
        // before handlers see it, so match feature keys case-insensitively
        // - otherwise mixed-case keys like "bunnyPark" could never match.
        const feature = this.features.find(
            (f) => f.key.toLowerCase() === key,
        );
        if (!feature) {
            this.conn.reply(
                msg,
                `Unknown feature "${key}". Use "/bot feature list" to see available features.`,
            );
            return;
        }

        feature.enabled = sub === "enable";
        this.conn.reply(
            msg,
            `${feature.label} is now ${feature.enabled ? "enabled" : "disabled"}.`,
        );
    };

    private onCommandMap = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        const sub = args[0];

        switch (sub) {
            case "update": {
                if (!this.requireAdmin(sender, msg)) return;

                const mapData = this.conn.chatRoom.map.mapData;
                if (!mapData) {
                    this.conn.reply(msg, "No map data is currently loaded.");
                    return;
                }

                if (this.mapStore) {
                    await this.mapStore.save(mapData, sender.MemberNumber);
                    this.conn.reply(
                        msg,
                        "Current room layout saved as the new default.",
                    );
                } else {
                    this.conn.reply(
                        msg,
                        "mongo_uri/mongo_db isn't configured, so the layout can't be saved as the default.",
                    );
                }
                break;
            }
            case "reset": {
                if (!this.requireAdmin(sender, msg)) return;

                const mapData = JSON.parse(
                    decompressFromBase64(DEFAULT_MAP_BUNDLE),
                );
                this.conn.chatRoom.map.setMapFromData(mapData);

                if (this.mapStore) {
                    await this.mapStore.reset();
                }

                this.conn.reply(
                    msg,
                    "Room layout reset to the built-in default map.",
                );
                break;
            }
            case "export": {
                if (!this.requireAdmin(sender, msg)) return;

                const mapData = this.conn.chatRoom.map.mapData;
                if (!mapData) {
                    this.conn.reply(msg, "No map data is currently loaded.");
                    return;
                }

                const bundle = compressToBase64(JSON.stringify(mapData));
                this.conn.reply(
                    msg,
                    `Map export - save this to restore later with "!map import <data>":\n${bundle}`,
                );
                break;
            }
            case "import":
                // Reaching this point means CommandParser's already-
                // lowercased copy of the message matched instead of the
                // case-preserving raw listener below - the base64 payload
                // would already be corrupted, so refuse rather than
                // silently importing garbage.
                this.conn.reply(
                    msg,
                    'Map data is case-sensitive - send exactly: !map import <data> (as its own whisper/chat message, not via "/bot").',
                );
                break;
            default:
                this.conn.reply(
                    msg,
                    "Usage: !map <update|reset|export|import <data>>",
                );
        }
    };

    private onCommandMaintenance = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.requireAdmin(sender, msg)) return;

        if (this.maintenanceInProgress) {
            this.conn.reply(
                msg,
                "A maintenance shutdown is already in progress.",
            );
            return;
        }
        this.maintenanceInProgress = true;

        try {
            this.conn.SendMessage(
                "Chat",
                "This room will be taken down for maintenance in one minute. " +
                    "Please wrap up - everyone present will be freed and removed, " +
                    "and the room will then be locked to admins only.",
            );

            await wait(60_000);

            // Bots (this connection's own character, plus the optional
            // second shower-narration bot) are excluded from the free/kick
            // pass below - only room members should be freed and removed.
            const botMemberNumbers = new Set(
                [
                    this.conn.Player.MemberNumber,
                    this.conn2?.Player.MemberNumber,
                ].filter((n): n is number => n !== undefined),
            );

            const targets = (this.conn.chatRoom?.characters ?? []).filter(
                (character) => !botMemberNumbers.has(character.MemberNumber),
            );

            for (const character of targets) {
                this.freeCharacter?.(character);
            }

            // Give freed items/messages a moment to land before kicking,
            // same as the regular "/bot freeandleave" command.
            await wait(500);

            for (const character of targets) {
                character.Kick();
            }

            if (this.conn.chatRoom) {
                this.conn.chatRoom.Access = ["Admin"];
            }

            this.conn.reply(
                msg,
                "Maintenance shutdown complete: the room is now locked to admins only.",
            );
        } finally {
            this.maintenanceInProgress = false;
        }
    };

    // Raw (non-CommandParser) listener solely for "!map import <data>", so
    // the base64 map bundle's original casing survives - see the comment
    // in registerCommands() for why.
    private onRawMessage = async (ev: API_Message) => {
        if (!["Whisper", "Chat"].includes(ev.message.Type)) return;

        const content = ev.message.Content.replace(/^\(+/, "").replace(
            /\)+$/,
            "",
        );
        const match = /^!map import\s+(\S+)\s*$/i.exec(content);
        if (!match) return;

        if (!ev.sender.IsRoomAdmin()) {
            this.conn.reply(ev.message, "Only admins can use this command.");
            return;
        }

        let mapData: ServerChatRoomMapData;
        try {
            mapData = JSON.parse(decompressFromBase64(match[1]));
        } catch (e) {
            this.conn.reply(
                ev.message,
                "That doesn't look like valid map data.",
            );
            return;
        }

        this.conn.chatRoom.map.setMapFromData(mapData);

        if (this.mapStore) {
            await this.mapStore.save(mapData, ev.sender.MemberNumber);
            this.conn.reply(
                ev.message,
                "Map imported and saved as the new default.",
            );
        } else {
            this.conn.reply(
                ev.message,
                "Map imported, but mongo_uri/mongo_db isn't configured, so it won't persist across restarts.",
            );
        }
    };
}
