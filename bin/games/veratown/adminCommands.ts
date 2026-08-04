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
import {
    VeratownLocationStore,
    VeratownLocationDoc,
} from "./veratownLocationStore";
import { RegionManager, VeratownRegion } from "./regionManager";

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
        private locationStore?: VeratownLocationStore,
        private regionManager?: RegionManager,
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
        this.commandParser.register(
            "adminhelp",
            guardHandler("admin:help", this.onCommandAdminHelp),
        );
        this.commandParser.register(
            "location",
            guardHandler("admin:location", this.onCommandLocation),
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
        const feature = this.features.find((f) => f.key.toLowerCase() === key);
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

    private onCommandAdminHelp = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.requireAdmin(sender, msg)) return;

        const helpText = [
            "=== ADMIN COMMANDS ===",
            "",
            "!strip <name or member number>",
            "  Strips all clothing from the specified character.",
            "",
            "!feature <list|enable|disable> [name]",
            "  Manage room features. Use '!feature list' to see available features.",
            "",
            "!map <update|reset|export|import <data>>",
            "  Manage room layout:",
            "    - update: Save current layout as new default",
            "    - reset: Restore built-in default map",
            "    - export: Export current layout (save the output)",
            "    - import <data>: Import previously exported layout (case-sensitive)",
            "",
            "!location <add|get|update|delete|list|enable|disable>",
            "  Manage database locations:",
            "    - add <key> <name> <type> <x> <y> [metadata_json]",
            "    - get <key>: View location details",
            "    - update <key> <field> <value>: Update name/type/x/y/data",
            "    - delete <key>: Remove location",
            "    - list [type]: Show all locations or filter by type",
            "    - enable/disable <key>: Toggle enabled state",
            "",
            "!maintenance",
            "  Initiate one-minute shutdown. All room members will be freed and removed.",
            "",
            "!adminhelp",
            "  Display this help message.",
        ];

        this.conn.reply(msg, helpText.join("\n"));
    };

    private onCommandLocation = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        if (!this.requireAdmin(sender, msg)) return;

        if (!this.locationStore) {
            this.conn.reply(
                msg,
                "Location database is not configured (mongo_uri/mongo_db not set).",
            );
            return;
        }

        const subcommand = args[0]?.toLowerCase();

        switch (subcommand) {
            case "add": {
                if (args.length < 6) {
                    this.conn.reply(
                        msg,
                        "Usage: !location add <key> <name> <type> <x> <y> [metadata_json]",
                    );
                    return;
                }

                const key = args[1];
                const name = args[2];
                const type = args[3];
                const x = parseFloat(args[4]);
                const y = parseFloat(args[5]);
                let metadata: Record<string, unknown> | undefined;

                if (args[6]) {
                    try {
                        metadata = JSON.parse(args.slice(6).join(" "));
                    } catch (e) {
                        this.conn.reply(msg, "Invalid metadata JSON.");
                        return;
                    }
                }

                if (isNaN(x) || isNaN(y)) {
                    this.conn.reply(msg, "Coordinates must be valid numbers.");
                    return;
                }

                try {
                    await this.locationStore.addLocation({
                        key,
                        name,
                        type: type as any,
                        x,
                        y,
                        data: metadata,
                        enabled: true,
                    });
                    this.conn.reply(
                        msg,
                        `Location "${key}" added successfully.`,
                    );
                } catch (e: any) {
                    this.conn.reply(
                        msg,
                        `Failed to add location: ${e.message || "Unknown error"}`,
                    );
                }
                break;
            }

            case "get": {
                if (!args[1]) {
                    this.conn.reply(msg, "Usage: !location get <key>");
                    return;
                }

                try {
                    const location = await this.locationStore.getLocation(
                        args[1],
                    );
                    if (!location) {
                        this.conn.reply(
                            msg,
                            `Location "${args[1]}" not found.`,
                        );
                        return;
                    }

                    const details = [
                        `Key: ${location.key}`,
                        `Name: ${location.name}`,
                        `Type: ${location.type}`,
                        `Position: (${location.x}, ${location.y})`,
                        `Enabled: ${location.enabled ? "Yes" : "No"}`,
                        `Created: ${new Date(location.createdAt).toISOString()}`,
                        `Updated: ${new Date(location.updatedAt).toISOString()}`,
                    ];

                    if (
                        location.data &&
                        Object.keys(location.data).length > 0
                    ) {
                        details.push(
                            `Metadata: ${JSON.stringify(location.data)}`,
                        );
                    }

                    this.conn.SendMessage(
                        "Whisper",
                        details.join("\n"),
                        sender.MemberNumber,
                    );
                } catch (e: any) {
                    this.conn.reply(
                        msg,
                        `Failed to get location: ${e.message || "Unknown error"}`,
                    );
                }
                break;
            }

            case "update": {
                if (args.length < 4) {
                    this.conn.reply(
                        msg,
                        "Usage: !location update <key> <field> <value>",
                    );
                    return;
                }

                const key = args[1];
                const field = args[2];
                const value = args.slice(3).join(" ");

                try {
                    const validFields = ["name", "type", "x", "y", "data"];
                    if (!validFields.includes(field)) {
                        this.conn.reply(
                            msg,
                            `Invalid field. Valid fields: ${validFields.join(", ")}`,
                        );
                        return;
                    }

                    let updateValue: any = value;
                    if (field === "x" || field === "y") {
                        updateValue = parseFloat(value);
                        if (isNaN(updateValue)) {
                            this.conn.reply(
                                msg,
                                `${field} must be a valid number.`,
                            );
                            return;
                        }
                    } else if (field === "data") {
                        updateValue = JSON.parse(value);
                    }

                    const success = await this.locationStore.updateLocation(
                        key,
                        { [field]: updateValue },
                    );
                    if (success) {
                        this.conn.reply(
                            msg,
                            `Location "${key}" updated successfully.`,
                        );
                    } else {
                        this.conn.reply(msg, `Location "${key}" not found.`);
                    }
                } catch (e: any) {
                    this.conn.reply(
                        msg,
                        `Failed to update location: ${e.message || "Unknown error"}`,
                    );
                }
                break;
            }

            case "delete": {
                if (!args[1]) {
                    this.conn.reply(msg, "Usage: !location delete <key>");
                    return;
                }

                try {
                    const success = await this.locationStore.deleteLocation(
                        args[1],
                    );
                    if (success) {
                        this.conn.reply(
                            msg,
                            `Location "${args[1]}" deleted successfully.`,
                        );
                    } else {
                        this.conn.reply(
                            msg,
                            `Location "${args[1]}" not found.`,
                        );
                    }
                } catch (e: any) {
                    this.conn.reply(
                        msg,
                        `Failed to delete location: ${e.message || "Unknown error"}`,
                    );
                }
                break;
            }

            case "list": {
                try {
                    let filter = {};
                    if (args[1]) {
                        filter = { type: args[1] };
                    }

                    const locations = args[1]
                        ? await this.locationStore.getLocationsByType(args[1])
                        : await this.locationStore.loadLocations();

                    if (locations.length === 0) {
                        this.conn.reply(
                            msg,
                            args[1]
                                ? `No locations of type "${args[1]}" found.`
                                : "No locations found.",
                        );
                        return;
                    }

                    const lines = locations
                        .map(
                            (loc) =>
                                `${loc.key} (${loc.type}) - ${loc.name} ${loc.enabled ? "" : "[DISABLED]"}`,
                        )
                        .slice(0, 100); // Limit to 100 entries

                    this.conn.SendMessage(
                        "Whisper",
                        `Locations${args[1] ? ` of type "${args[1]}"` : ""} (${locations.length} total):\n${lines.join("\n")}`,
                        sender.MemberNumber,
                    );
                } catch (e: any) {
                    this.conn.reply(
                        msg,
                        `Failed to list locations: ${e.message || "Unknown error"}`,
                    );
                }
                break;
            }

            case "enable": {
                if (!args[1]) {
                    this.conn.reply(msg, "Usage: !location enable <key>");
                    return;
                }

                try {
                    const success = await this.locationStore.setLocationEnabled(
                        args[1],
                        true,
                    );
                    if (success) {
                        this.conn.reply(msg, `Location "${args[1]}" enabled.`);
                    } else {
                        this.conn.reply(
                            msg,
                            `Location "${args[1]}" not found.`,
                        );
                    }
                } catch (e: any) {
                    this.conn.reply(
                        msg,
                        `Failed to enable location: ${e.message || "Unknown error"}`,
                    );
                }
                break;
            }

            case "disable": {
                if (!args[1]) {
                    this.conn.reply(msg, "Usage: !location disable <key>");
                    return;
                }

                try {
                    const success = await this.locationStore.setLocationEnabled(
                        args[1],
                        false,
                    );
                    if (success) {
                        this.conn.reply(msg, `Location "${args[1]}" disabled.`);
                    } else {
                        this.conn.reply(
                            msg,
                            `Location "${args[1]}" not found.`,
                        );
                    }
                } catch (e: any) {
                    this.conn.reply(
                        msg,
                        `Failed to disable location: ${e.message || "Unknown error"}`,
                    );
                }
                break;
            }

            case "region": {
                if (!this.regionManager) {
                    this.conn.reply(msg, "Region manager is not available.");
                    return;
                }
                await this.onCommandLocationRegion(sender, msg, args.slice(1));
                break;
            }

            default:
                this.conn.reply(
                    msg,
                    "Usage: !location <add|get|update|delete|list|enable|disable|region> [args...]",
                );
        }
    };

    private onCommandLocationRegion = async (
        sender: API_Character,
        msg: BC_Server_ChatRoomMessage,
        args: string[],
    ) => {
        const subcommand = args[0]?.toLowerCase();

        switch (subcommand) {
            case "add": {
                if (args.length < 6) {
                    this.conn.reply(
                        msg,
                        "Usage: !location region add <key> <TopLeftX> <TopLeftY> <BottomRightX> <BottomRightY> [type] [description]",
                    );
                    return;
                }

                const key = args[1];
                const tlX = parseFloat(args[2]);
                const tlY = parseFloat(args[3]);
                const brX = parseFloat(args[4]);
                const brY = parseFloat(args[5]);
                const regionType = (args[6] as any) || "custom";
                const description = args.slice(7).join(" ") || undefined;

                if (isNaN(tlX) || isNaN(tlY) || isNaN(brX) || isNaN(brY)) {
                    this.conn.reply(msg, "All coordinates must be valid numbers.");
                    return;
                }

                const region: VeratownRegion = {
                    key,
                    name: `Region: ${key}`,
                    type: "region",
                    regionType: regionType as any,
                    region: {
                        TopLeft: { X: tlX, Y: tlY },
                        BottomRight: { X: brX, Y: brY },
                    },
                    label: `Region: ${key}`,
                    description,
                    enabled: true,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };

                try {
                    await this.regionManager!.updateRegion(this.locationStore!, region);
                    this.conn.reply(
                        msg,
                        `Region "${key}" added successfully.`,
                    );
                } catch (e: any) {
                    this.conn.reply(
                        msg,
                        `Failed to add region: ${e.message || "Unknown error"}`,
                    );
                }
                break;
            }

            case "get": {
                if (!args[1]) {
                    this.conn.reply(msg, "Usage: !location region get <key>");
                    return;
                }

                try {
                    const region = this.regionManager!.getRegion(args[1]);
                    if (!region) {
                        this.conn.reply(
                            msg,
                            `Region "${args[1]}" not found.`,
                        );
                        return;
                    }

                    const details = [
                        `Key: ${region.key}`,
                        `Name: ${region.name}`,
                        `Type: Region (${region.regionType})`,
                        `Bounds: TopLeft(${region.region.TopLeft.X}, ${region.region.TopLeft.Y}) to BottomRight(${region.region.BottomRight.X}, ${region.region.BottomRight.Y})`,
                        `Label: ${region.label || "N/A"}`,
                        `Enabled: ${region.enabled ? "Yes" : "No"}`,
                        `Created: ${new Date(region.createdAt).toISOString()}`,
                        `Updated: ${new Date(region.updatedAt).toISOString()}`,
                    ];

                    if (region.description) {
                        details.push(`Description: ${region.description}`);
                    }

                    this.conn.SendMessage(
                        "Whisper",
                        details.join("\n"),
                        sender.MemberNumber,
                    );
                } catch (e: any) {
                    this.conn.reply(
                        msg,
                        `Failed to get region: ${e.message || "Unknown error"}`,
                    );
                }
                break;
            }

            case "update": {
                if (args.length < 6) {
                    this.conn.reply(
                        msg,
                        "Usage: !location region update <key> <TopLeftX> <TopLeftY> <BottomRightX> <BottomRightY>",
                    );
                    return;
                }

                const key = args[1];
                const tlX = parseFloat(args[2]);
                const tlY = parseFloat(args[3]);
                const brX = parseFloat(args[4]);
                const brY = parseFloat(args[5]);

                if (isNaN(tlX) || isNaN(tlY) || isNaN(brX) || isNaN(brY)) {
                    this.conn.reply(msg, "All coordinates must be valid numbers.");
                    return;
                }

                try {
                    const existing = this.regionManager!.getRegion(key);
                    if (!existing) {
                        this.conn.reply(msg, `Region "${key}" not found.`);
                        return;
                    }

                    const updated: VeratownRegion = {
                        ...existing,
                        region: {
                            TopLeft: { X: tlX, Y: tlY },
                            BottomRight: { X: brX, Y: brY },
                        },
                        updatedAt: Date.now(),
                    };

                    await this.regionManager!.updateRegion(this.locationStore!, updated);
                    this.conn.reply(
                        msg,
                        `Region "${key}" updated successfully.`,
                    );
                } catch (e: any) {
                    this.conn.reply(
                        msg,
                        `Failed to update region: ${e.message || "Unknown error"}`,
                    );
                }
                break;
            }

            case "delete": {
                if (!args[1]) {
                    this.conn.reply(msg, "Usage: !location region delete <key>");
                    return;
                }

                try {
                    await this.regionManager!.deleteRegion(this.locationStore!, args[1]);
                    this.conn.reply(
                        msg,
                        `Region "${args[1]}" deleted successfully.`,
                    );
                } catch (e: any) {
                    this.conn.reply(
                        msg,
                        `Failed to delete region: ${e.message || "Unknown error"}`,
                    );
                }
                break;
            }

            case "list": {
                try {
                    const regions = this.regionManager!.getAllRegions();

                    if (regions.length === 0) {
                        this.conn.reply(msg, "No regions found.");
                        return;
                    }

                    let typeFilter = args[1];
                    let filtered = regions;
                    if (typeFilter) {
                        filtered = regions.filter(r => r.regionType === typeFilter);
                        if (filtered.length === 0) {
                            this.conn.reply(
                                msg,
                                `No regions of type "${typeFilter}" found.`,
                            );
                            return;
                        }
                    }

                    const lines = filtered
                        .map(
                            (r) =>
                                `${r.key} (${r.regionType}) - ${r.label || r.name} ${r.enabled ? "" : "[DISABLED]"}`,
                        )
                        .slice(0, 100);

                    this.conn.SendMessage(
                        "Whisper",
                        `Regions${typeFilter ? ` of type "${typeFilter}"` : ""} (${filtered.length} total):\n${lines.join("\n")}`,
                        sender.MemberNumber,
                    );
                } catch (e: any) {
                    this.conn.reply(
                        msg,
                        `Failed to list regions: ${e.message || "Unknown error"}`,
                    );
                }
                break;
            }

            case "validate": {
                try {
                    const staticRegions = new Map([
                        ["game_region", this.regionManager!.getRegion("game_region")],
                        ["dare_region", this.regionManager!.getRegion("dare_region")],
                    ]);

                    // Filter out undefined values
                    const validStaticRegions = new Map(
                        Array.from(staticRegions).filter(([_, v]) => v !== undefined)
                    ) as Map<string, VeratownRegion>;

                    const warnings = this.regionManager!.validateRegions(validStaticRegions);
                    if (warnings.length === 0) {
                        this.conn.reply(msg, "All regions are consistent with static definitions.");
                    } else {
                        this.conn.SendMessage(
                            "Whisper",
                            `Region validation found ${warnings.length} issue(s):\n${warnings.join("\n")}`,
                            sender.MemberNumber,
                        );
                    }
                } catch (e: any) {
                    this.conn.reply(
                        msg,
                        `Failed to validate regions: ${e.message || "Unknown error"}`,
                    );
                }
                break;
            }

            default:
                this.conn.reply(
                    msg,
                    "Usage: !location region <add|get|update|delete|list|validate> [args...]",
                );
        }
    };
    // the base64 map bundle's original casing survives - see the comment
    // in registerCommands() for why.
    private onRawMessage = async (ev: API_Message) => {
        if (!["Whisper", "Chat"].includes(ev.message.Type)) return;

        // Preserve original content, but gracefully handle BC's message wrapping
        // BC wraps private whispers with parentheses: "(content)" becomes the Content
        // Only strip if wrapped: starts with '(' AND ends with ')'
        let content = ev.message.Content;
        if (content.startsWith("(") && content.endsWith(")")) {
            content = content.slice(1, -1);
        }

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
