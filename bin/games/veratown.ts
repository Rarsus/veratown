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
import { DareStore } from "./dareStore";
import { CasinoStore } from "./casino/casinostore";
import { CageSystem } from "./veratown/cageSystem";
import { KennelSystem } from "./veratown/kennelSystem";
import { ShowerSystem } from "./veratown/showerSystem";
import { BedSystem } from "./veratown/bedSystem";
import { BunnyParkSystem } from "./veratown/bunnyParkSystem";
import { WindowSystem } from "./veratown/windowSystem";
import { TrashcanSystem } from "./veratown/trashcanSystem";
import {
    RECEPTIONIST_POSITION,
    GAME_LOCATION,
    GAME_MISTRESS_POSITION,
    CHANGELOG,
    MAP,
    SHOWER_BOT2_HOME_POSITION,
    PET_EARS,
} from "./veratown/veratownConfig";

// Re-exported for callers importing map layout/items from this module (kept
// at its original path so bin/main.ts and bin/games/casino/forfeits.ts
// don't need to change their imports as part of this file's internal split
// into bin/games/veratown/*).
export { GAME_LOCATION, GAME_MISTRESS_POSITION, PET_EARS };

export class Veratown {
    public static description = [
        "This is an example to show how to use the ropeybot API to create a simple game.",
        "Commands:",
        "",
        "/bot freeandleave - Immediately removes any restraints added and kicks you from the room",
        "/bot strip <name> - Removes all equipped clothing from the named character (admin only)",
        "/bot changelog - Shows a summary of recent functional changes to the map",
        "/bot dare <join|leave|start|turn|add|draw|pass|forfeit|reset|list|help> - Join/leave, start/check turn, add, draw, pass (pillory!), forfeit into a kennel, reset or (admin only) list dare/forfeit cards (if configured)",
        "/bot pick - Randomly selects a room member other than the bot or yourself",
        "Code at https://github.com/FriendsOfBC/ropeybot, modified map code at <tbd>",,
    ].join("\n");

    private commandParser: CommandParser;

    private dare?: Dare;

    private cageSystem: CageSystem;
    private kennelSystem: KennelSystem;
    private showerSystem: ShowerSystem;
    private bedSystem: BedSystem;
    private bunnyParkSystem: BunnyParkSystem;
    private windowSystem: WindowSystem;
    private trashcanSystem: TrashcanSystem;

    public constructor(
        private conn: API_Connector,
        private conn2?: API_Connector,
        db?: Db,
    ) {
        this.commandParser = new CommandParser(this.conn, undefined, [
            GAME_LOCATION,
        ]);

        if (db) {
            this.dare = new Dare(
                this.conn,
                new DareStore(db),
                this.commandParser,
                new CasinoStore(db),
            );
        } else {
            console.log(
                "mongo_uri/mongo_db must be configured to enable the dare/pick commands in Veratown; skipping.",
            );
        }

        this.cageSystem = new CageSystem(this.conn);
        this.kennelSystem = new KennelSystem(this.conn);
        this.showerSystem = new ShowerSystem(this.conn, this.conn2);
        this.bedSystem = new BedSystem(this.conn);
        this.bunnyParkSystem = new BunnyParkSystem(this.conn);
        this.windowSystem = new WindowSystem(this.conn);
        this.trashcanSystem = new TrashcanSystem(this.conn);

        this.conn.on("RoomCreate", this.onChatRoomCreated);
        this.conn.on("RoomJoin", this.onChatRoomJoined);

        this.cageSystem.registerTriggers();
        this.bunnyParkSystem.registerTriggers();
        this.kennelSystem.registerTriggers();
        this.windowSystem.registerTriggers();
        this.showerSystem.registerTriggers();
        this.bedSystem.registerTriggers();
        this.trashcanSystem.register();

        // TODO: exhibit tile triggers, dressing/redressing pads, and the
        // hallway/common area doors are disabled until their coordinates
        // are updated to match the new map layout.

        this.commandParser.register("freeandleave", this.onCommandFreeAndLeave);
        this.commandParser.register("strip", this.onCommandStrip);
        this.commandParser.register("changelog", this.onCommandChangelog);
    }

    public async init(): Promise<void> {
        await this.setupRoom();
        await this.setupCharacter();
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
            this.conn.chatRoom.map.setMapFromData(
                JSON.parse(decompressFromBase64(MAP)),
            );
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

    private onCommandStrip = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!sender.IsRoomAdmin()) {
            this.conn.reply(msg, "Only admins can use this command.");
            return;
        }

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

    private freeCharacter(character: API_Character): void {
        // Strip every bind item (locked or not) regardless of which bot
        // system placed it - dare game bondage/pillory/kennel, casino
        // forfeits, veratown cages, etc. Collars (ItemNeck/
        // ItemNeckAccessories) are intentionally left alone by stripBulk.
        character.Appearance.stripBulk({ item: true }, true);

        this.cageSystem.freeCharacterIfCaged(character);
    }
}
