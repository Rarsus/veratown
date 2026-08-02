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
import { VeratownFeatureSystem } from "./veratown/featureSystem";
import { VeratownMapStore } from "./veratown/mapStore";
import { VeratownAdminCommands } from "./veratown/adminCommands";
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
        "/bot feature <list|enable|disable> <name> - Show, or (admin only) enable/disable, individual room features (cage, kennel, shower, bed, bunnyPark, window, trashcan)",
        "/bot map update - Saves the room's current layout to the database as the new default (admin only)",
        "/bot map reset - Resets the room layout to the built-in default map, in the database and live (admin only)",
        "/bot map export - Shows the current layout as a portable string, for backup or to move it elsewhere (admin only)",
        "!map import <data> - Loads a layout previously produced by \"/bot map export\", live and as the new default (admin only, must be sent as its own message, not via /bot)",
        "/bot maintenance - Warns everyone in the room, waits one minute, then frees and removes everyone present (bots excluded) and locks the room to admins only (admin only)",
        "/bot dare <join|leave|start|turn|add|draw|pass|forfeit|reset|list|help> - Join/leave, start/check turn, add, draw, pass (pillory!), forfeit into a kennel, reset or (admin only) list dare/forfeit cards (if configured)",
        "/bot pick - Randomly selects a room member other than the bot or yourself",
        "Code at https://github.com/FriendsOfBC/ropeybot, modified map code at <tbd>",,
    ].join("\n");

    private commandParser: CommandParser;

    private dare?: Dare;

    private cageSystem?: CageSystem;
    private kennelSystem?: KennelSystem;
    private showerSystem?: ShowerSystem;
    private bedSystem?: BedSystem;
    private bunnyParkSystem?: BunnyParkSystem;
    private windowSystem?: WindowSystem;
    private trashcanSystem?: TrashcanSystem;

    // Every successfully-initialized room feature, in registration order.
    // Backs the "/bot feature list|enable|disable" command; systems that
    // failed to construct or register (see initFeature()) are simply
    // absent from this list rather than crashing Veratown's startup.
    private features: VeratownFeatureSystem[] = [];

    // Only set when mongo_uri/mongo_db are configured; without it, the map
    // layout falls back to the built-in default (MAP, from veratownConfig.ts)
    // and can't be saved/persisted across restarts.
    private mapStore?: VeratownMapStore;

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
            this.mapStore = new VeratownMapStore(db);
        } else {
            console.log(
                "mongo_uri/mongo_db must be configured to enable the dare/pick commands and persistent map storage in Veratown; skipping.",
            );
        }

        this.conn.on("RoomCreate", this.onChatRoomCreated);
        this.conn.on("RoomJoin", this.onChatRoomJoined);

        // Each system is constructed and registered independently: if one
        // fails (eg. a bug in a single feature), the others are unaffected
        // and Veratown still starts up with everything else working.
        this.cageSystem = this.initFeature(() => new CageSystem(this.conn));
        this.kennelSystem = this.initFeature(() => new KennelSystem(this.conn));
        this.showerSystem = this.initFeature(
            () => new ShowerSystem(this.conn, this.conn2),
        );
        this.bedSystem = this.initFeature(() => new BedSystem(this.conn));
        this.bunnyParkSystem = this.initFeature(
            () => new BunnyParkSystem(this.conn),
        );
        this.windowSystem = this.initFeature(() => new WindowSystem(this.conn));
        this.trashcanSystem = this.initFeature(
            () => new TrashcanSystem(this.conn),
        );

        // TODO: exhibit tile triggers, dressing/redressing pads, and the
        // hallway/common area doors are disabled until their coordinates
        // are updated to match the new map layout.

        this.commandParser.register("freeandleave", this.onCommandFreeAndLeave);
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
            (character) => this.freeCharacter(character),
            this.conn2,
        ).registerCommands();
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
            system.registerTriggers();
            this.features.push(system);
            return system;
        } catch (e) {
            console.error(
                `[Veratown] Failed to start feature${system ? ` "${system.label}"` : ""}; ` +
                    "it will be unavailable, but the rest of the bot is unaffected.",
                e,
            );
            return undefined;
        }
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
            // The database holds the current "live" layout (as saved via
            // "/bot map update"/"import"); if it's unavailable or empty
            // (eg. a fresh database), fail over to the built-in default map
            // from veratownConfig.ts instead.
            const storedMapData = await this.mapStore?.load();
            const mapData =
                storedMapData ?? JSON.parse(decompressFromBase64(MAP));
            this.conn.chatRoom.map.setMapFromData(mapData);
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

        this.cageSystem?.freeCharacterIfCaged(character);
    }
}
