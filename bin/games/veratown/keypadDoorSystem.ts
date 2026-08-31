import {
    API_Character,
    API_Connector,
    API_Message,
    MapRegion,
    CommandParser,
} from "bc-bot";
import { guardHandler, VeratownFeatureSystem } from "./featureSystem";
import {
    VeratownLocationDoc,
    VeratownLocationStore,
} from "./veratownLocationStore";
import { createTimerManager, createSystemLogger } from "./shared";
import { KeypadAccessGroupManager } from "./keypadAccessGroupManager";

// A keypad_door location uses this data shape:
// {
//   doorX: 20,
//   doorY: 10,
//   lockedTile: "MetalDown",
//   unlockedTile: "SteelDoorOpen",
//   unlockDurationMs: 10000,
//   codes: { admin: "...", whitelist: "...", guest: "..." },
//   whitelistMemberNumbers: [12345]
//   Optional directional exit protection:
//   insideTopLeftX: 21,
//   insideTopLeftY: 9,
//   insideBottomRightX: 39,
//   insideBottomRightY: 20,
//   Optional auto-open tile (only when insideRegion not defined):
//   autoOpenTileX: 25,
//   autoOpenTileY: 15
// }
export type KeypadAccessGroup = "admin" | "whitelist" | "guest";

interface KeypadDoorConfig {
    doorX: number;
    doorY: number;
    lockedTile: string;
    unlockedTile: string;
    unlockDurationMs: number;
    codes: Partial<Record<KeypadAccessGroup, string>>;
    whitelistMemberNumbers: number[];
    insideRegion?: MapRegion;
    autoOpenTile?: { X: number; Y: number };
}

interface KeypadDoor {
    location: VeratownLocationDoc;
    config: KeypadDoorConfig;
}

const KEYPAD_NOTIFICATION_DELAY_MS = 1500;
const AUTO_OPEN_TRIGGER_DELAY_MS = 1000;

export function getKeypadAccessGroup(
    character: API_Character,
    whitelistMemberNumbers: readonly number[],
): KeypadAccessGroup {
    if (character.IsRoomAdmin()) return "admin";
    if (whitelistMemberNumbers.includes(character.MemberNumber)) {
        return "whitelist";
    }
    return "guest";
}

function readNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value)
        ? value
        : undefined;
}

function readString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readConfig(
    location: VeratownLocationDoc,
): KeypadDoorConfig | undefined {
    const data = location.data ?? {};
    const doorX = readNumber(data.doorX);
    const doorY = readNumber(data.doorY);
    const lockedTile = readString(data.lockedTile);
    const unlockedTile = readString(data.unlockedTile);
    const unlockDurationMs = readNumber(data.unlockDurationMs) ?? 10_000;
    const insideTopLeftX = readNumber(data.insideTopLeftX);
    const insideTopLeftY = readNumber(data.insideTopLeftY);
    const insideBottomRightX = readNumber(data.insideBottomRightX);
    const insideBottomRightY = readNumber(data.insideBottomRightY);

    if (
        doorX === undefined ||
        doorY === undefined ||
        !lockedTile ||
        !unlockedTile ||
        unlockDurationMs <= 0
    ) {
        return undefined;
    }

    const insideCoordinates = [
        insideTopLeftX,
        insideTopLeftY,
        insideBottomRightX,
        insideBottomRightY,
    ];
    const hasInsideRegion = insideCoordinates.some(
        (coordinate) => coordinate !== undefined,
    );
    if (
        hasInsideRegion &&
        insideCoordinates.some((coordinate) => coordinate === undefined)
    ) {
        return undefined;
    }

    const autoOpenTileX = readNumber(data.autoOpenTileX);
    const autoOpenTileY = readNumber(data.autoOpenTileY);
    const hasAutoOpenTile =
        autoOpenTileX !== undefined && autoOpenTileY !== undefined;

    if (hasAutoOpenTile && hasInsideRegion) {
        return undefined;
    }

    const rawCodes = data.codes;
    const codes: Partial<Record<KeypadAccessGroup, string>> = {};
    if (rawCodes && typeof rawCodes === "object" && !Array.isArray(rawCodes)) {
        for (const group of ["admin", "whitelist", "guest"] as const) {
            const code = readString(
                (rawCodes as Record<string, unknown>)[group],
            );
            if (code) codes[group] = code;
        }
    }

    const legacyCode = readString(data.code);
    if (legacyCode && !codes.guest) codes.guest = legacyCode;

    const rawWhitelist = data.whitelistMemberNumbers;
    const whitelistMemberNumbers = Array.isArray(rawWhitelist)
        ? rawWhitelist.filter(
              (memberNumber): memberNumber is number =>
                  typeof memberNumber === "number" &&
                  Number.isInteger(memberNumber),
          )
        : [];

    if (Object.keys(codes).length === 0) return undefined;

    return {
        doorX,
        doorY,
        lockedTile,
        unlockedTile,
        unlockDurationMs,
        codes,
        whitelistMemberNumbers,
        insideRegion: hasInsideRegion
            ? {
                  TopLeft: { X: insideTopLeftX!, Y: insideTopLeftY! },
                  BottomRight: {
                      X: insideBottomRightX!,
                      Y: insideBottomRightY!,
                  },
              }
            : undefined,
        autoOpenTile: hasAutoOpenTile
            ? { X: autoOpenTileX!, Y: autoOpenTileY! }
            : undefined,
    };
}

function unwrapWhisper(content: string): string {
    return content.startsWith("(") && content.endsWith(")")
        ? content.slice(1, -1)
        : content;
}

export class KeypadDoorSystem implements VeratownFeatureSystem {
    public readonly key = "keypadDoor";
    public readonly label = "Keypad doors";
    public enabled = true;

    private doors: KeypadDoor[] = [];
    private readonly keypadTrigger: ReturnType<typeof guardHandler>;
    private readonly autoOpenTrigger: ReturnType<typeof guardHandler>;
    private readonly doorUnlockTimers = createTimerManager<string>(
        "KeypadDoorSystem.doorUnlock",
    );
    private readonly notificationTimers = createTimerManager<string>(
        "KeypadDoorSystem.notifications",
    );
    private readonly autoOpenTimers = createTimerManager<string>(
        "KeypadDoorSystem.autoOpen",
    );
    private readonly logger = createSystemLogger("KeypadDoorSystem");

    public constructor(
        private conn: API_Connector,
        private commandParser?: CommandParser,
        private locationStore?: VeratownLocationStore,
        private reloadLocationsCallback?: () => Promise<void>,
        private keypadAccessGroupManager?: KeypadAccessGroupManager,
    ) {
        this.keypadTrigger = guardHandler(this.key, this.onCharacterAtKeypad);
        this.autoOpenTrigger = guardHandler(
            this.key,
            this.onCharacterAtAutoOpenTile,
        );
    }

    public registerTriggers(): void {
        this.conn.on("Message", guardHandler(this.key, this.onMessage));
        // Register "code" command with CommandParser so BC knows it's valid.
        // The actual handling is done by the raw message listener below, which
        // preserves casing and format.
        this.commandParser?.register(
            "code",
            guardHandler(`${this.key}:code-parser`, this.onCodeCommandParser),
        );
        // Register raw listeners for both !door and /bot door formats
        // This ensures !door whisper commands are properly routed
        this.conn.on(
            "Message",
            guardHandler(`${this.key}:admin`, this.onAdminMessage),
        );
        this.conn.on(
            "Message",
            guardHandler(`${this.key}:code`, this.onCodeMessage),
        );
    }

    private getDoorKey(door: KeypadDoor): string {
        return `door_${door.config.doorX}_${door.config.doorY}`;
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        // Clean up all existing timers
        this.doorUnlockTimers.clearAll();
        this.notificationTimers.clearAll();
        this.autoOpenTimers.clearAll();

        this.logger.info("Cleaning up timers during location reload", {
            doorCount: this.doors.length,
        });

        for (const door of this.doors) {
            if (
                door.location.x !== undefined &&
                door.location.y !== undefined
            ) {
                this.conn.chatRoom?.map.removeTileTrigger(
                    door.location.x,
                    door.location.y,
                    this.keypadTrigger,
                );
            }
            if (door.config.autoOpenTile) {
                this.conn.chatRoom?.map.removeTileTrigger(
                    door.config.autoOpenTile.X,
                    door.config.autoOpenTile.Y,
                    this.autoOpenTrigger,
                );
            }
        }

        this.doors = locations
            .filter(
                (location) =>
                    location.type === "keypad_door" && location.enabled,
            )
            .map((location) => {
                const config = readConfig(location);
                return config ? { location, config } : undefined;
            })
            .filter((door): door is KeypadDoor => door !== undefined);

        for (const door of this.doors) {
            if (
                door.location.x !== undefined &&
                door.location.y !== undefined
            ) {
                this.conn.chatRoom?.map.addTileTrigger(
                    { X: door.location.x, Y: door.location.y },
                    this.keypadTrigger,
                );
            }
            if (door.config.autoOpenTile) {
                this.conn.chatRoom?.map.addTileTrigger(
                    door.config.autoOpenTile,
                    this.autoOpenTrigger,
                );
            }
            if (this.hasInsideOccupants(door)) {
                this.setDoorTile(door, door.config.unlockedTile);
                this.scheduleLockWhenEmpty(door);
            } else {
                this.setDoorLocked(door);
            }
            console.log(
                `[KeypadDoorSystem] Loaded keypad ${door.location.key} for door at ${door.config.doorX},${door.config.doorY}`,
            );
        }
    }

    private onCharacterAtKeypad = (character: API_Character): void => {
        const door = this.findDoorAt(character);
        if (!door) return;

        const notificationKey = `${door.location.key}:${character.MemberNumber}`;

        // Clear any existing notification timer for this character
        if (this.notificationTimers.has(notificationKey)) {
            this.notificationTimers.clear(notificationKey);
        }

        this.logger.debug("Character at keypad", {
            doorX: door.config.doorX,
            doorY: door.config.doorY,
            memberNumber: character.MemberNumber,
        });

        this.notificationTimers.set(
            notificationKey,
            () => {
                const stillAtKeypad =
                    character.MapPos.X === door.location.x &&
                    character.MapPos.Y === door.location.y;
                if (!stillAtKeypad) return;

                this.logger.debug("Sending keypad notification", {
                    memberNumber: character.MemberNumber,
                });

                character.Tell(
                    "Whisper",
                    "You are standing at a keypad. Whisper /bot code followed by your access code to try this door.",
                );
            },
            KEYPAD_NOTIFICATION_DELAY_MS,
        );
    };

    private onCharacterAtAutoOpenTile = (character: API_Character): void => {
        const door = this.findDoorAtAutoOpenTile(character);
        if (!door || door.config.insideRegion) return;

        const autoOpenKey = `${door.location.key}:auto:${character.MemberNumber}`;

        // Clear any existing auto-open timer for this character
        if (this.autoOpenTimers.has(autoOpenKey)) {
            this.autoOpenTimers.clear(autoOpenKey);
        }

        this.logger.debug("Character at auto-open tile", {
            doorX: door.config.doorX,
            doorY: door.config.doorY,
            memberNumber: character.MemberNumber,
        });

        this.autoOpenTimers.set(
            autoOpenKey,
            () => {
                const stillAtAutoOpenTile =
                    character.MapPos.X === door.config.autoOpenTile?.X &&
                    character.MapPos.Y === door.config.autoOpenTile?.Y;
                if (!stillAtAutoOpenTile) return;

                this.logger.info("Auto-opening door", {
                    doorX: door.config.doorX,
                    doorY: door.config.doorY,
                    memberNumber: character.MemberNumber,
                });

                this.unlockDoor(
                    door,
                    "admin",
                    character,
                    door.config.unlockDurationMs,
                );
            },
            AUTO_OPEN_TRIGGER_DELAY_MS,
        );
    };

    private onCodeCommandParser = async (): Promise<void> => {
        // This handler exists only to tell BC that "code" is a valid command.
        // The actual code entry handling is done by the raw message listeners
        // (onMessage for direct codes and onCodeMessage for /bot code and !code formats).
        // We don't do anything here to avoid interfering with raw listeners.
    };

    private onMessage = async (msg: API_Message): Promise<void> => {
        if (!this.enabled || msg.message.Type !== "Whisper") return;

        const content = unwrapWhisper(msg.message.Content).trim();
        if (!content) return;
        if (content.toLowerCase().startsWith("!door")) return;

        // Support both "!code <code>" and direct "<code>" formats
        const codeMatch = /^!code\s+(\S+)\s*$/i.exec(content);
        const code = codeMatch
            ? codeMatch[1]
            : content.toLowerCase().startsWith("!code")
              ? undefined
              : content;

        if (!code) return;

        for (const door of this.doors) {
            if (
                msg.sender.MapPos.X !== door.location.x ||
                msg.sender.MapPos.Y !== door.location.y
            ) {
                continue;
            }

            // Check hardcoded groups
            const hardcodedGroup = getKeypadAccessGroup(
                msg.sender,
                door.config.whitelistMemberNumbers,
            );

            // Try hardcoded group code first
            if (
                door.config.codes[hardcodedGroup] &&
                door.config.codes[hardcodedGroup] === code
            ) {
                this.unlockDoor(door, hardcodedGroup, msg.sender);
                return;
            }

            // Try custom groups
            if (this.keypadAccessGroupManager) {
                try {
                    const groupConfig =
                        await this.keypadAccessGroupManager.getDoorGroups(
                            door.location.key,
                        );
                    const memberCustomGroups =
                        await this.keypadAccessGroupManager.getMemberGroups(
                            door.location.key,
                            msg.sender.MemberNumber,
                        );

                    for (const customGroup of memberCustomGroups) {
                        if (groupConfig.groups[customGroup]?.code === code) {
                            this.unlockDoor(door, hardcodedGroup, msg.sender);
                            return;
                        }
                    }
                } catch (e) {
                    this.logger.error(
                        "Failed to check custom groups for code",
                        e as Error,
                    );
                }
            }

            // If we get here, no code matched
            if (!door.config.codes[hardcodedGroup]) {
                this.conn.reply(
                    msg.message,
                    `${hardcodedGroup} access is not enabled for this keypad.`,
                );
            } else {
                this.conn.reply(msg.message, "Invalid keypad code.");
            }
            return;
        }
    };

    private onCodeMessage = async (msg: API_Message): Promise<void> => {
        if (msg.message.Type !== "Hidden") return;

        const match = /^ChatRoomBot\s+code\s+(\S+)\s*$/i.exec(
            msg.message.Content,
        );
        if (!match) return;

        const door = this.findDoorAt(msg.sender);
        if (!door) {
            this.conn.reply(
                msg.message,
                "Stand on a configured keypad tile to use the code command.",
            );
            return;
        }

        const code = match[1];
        const hardcodedGroup = getKeypadAccessGroup(
            msg.sender,
            door.config.whitelistMemberNumbers,
        );

        // Try hardcoded group code first
        if (
            door.config.codes[hardcodedGroup] &&
            door.config.codes[hardcodedGroup] === code
        ) {
            this.unlockDoor(door, hardcodedGroup, msg.sender);
            return;
        }

        // Try custom groups
        if (this.keypadAccessGroupManager) {
            try {
                const groupConfig =
                    await this.keypadAccessGroupManager.getDoorGroups(
                        door.location.key,
                    );
                const memberCustomGroups =
                    await this.keypadAccessGroupManager.getMemberGroups(
                        door.location.key,
                        msg.sender.MemberNumber,
                    );

                for (const customGroup of memberCustomGroups) {
                    if (groupConfig.groups[customGroup]?.code === code) {
                        this.unlockDoor(door, hardcodedGroup, msg.sender);
                        return;
                    }
                }
            } catch (e) {
                this.logger.error(
                    "Failed to check custom groups for code",
                    e as Error,
                );
            }
        }

        // If we get here, no code matched
        if (!door.config.codes[hardcodedGroup]) {
            this.conn.reply(
                msg.message,
                `${hardcodedGroup} access is not enabled for this keypad.`,
            );
        } else {
            this.conn.reply(msg.message, "Invalid keypad code.");
        }
    };

    private onAdminMessage = async (msg: API_Message): Promise<void> => {
        const content =
            msg.message.Type === "Whisper"
                ? unwrapWhisper(msg.message.Content).trim()
                : msg.message.Content;
        const match =
            msg.message.Type === "Whisper"
                ? /^!door(?:\s+(.+))?$/i.exec(content)
                : msg.message.Type === "Hidden"
                  ? /^ChatRoomBot\s+door(?:\s+(.+))?$/i.exec(content)
                  : undefined;

        if (!match) {
            return;
        }

        const door = this.findDoorAt(msg.sender);
        if (!door) {
            console.log(
                `[KeypadDoorSystem] User '${msg.sender.Name}' at (${msg.sender.MapPos.X},${msg.sender.MapPos.Y}) tried door command but no keypad found. Available: ${this.doors.map((d) => `${d.location.key}@(${d.location.x},${d.location.y})`).join(", ") || "none"}`,
            );
            this.conn.reply(
                msg.message,
                "Stand on a configured keypad tile to manage its door.",
            );
            return;
        }

        const args = match[1]?.trim().split(/\s+/) ?? ["help"];
        const action = args[0].toLowerCase();

        // Determine access level
        const isAdmin = msg.sender.IsRoomAdmin();
        const isWhitelisted = door.config.whitelistMemberNumbers.includes(
            msg.sender.MemberNumber,
        );

        // Help is available to everyone
        if (action === "help") {
            if (isAdmin) {
                const adminHelp = [
                    "=== KEYPAD DOOR MANAGEMENT ===",
                    "",
                    "CODE MANAGEMENT:",
                    "  !door change-code <admin|whitelist|guest> <code> - Change access code",
                    "  !door code <group> <code> - Set code for specific group",
                    "",
                    "WHITELIST MANAGEMENT:",
                    "  !door add-user <member> - Add member to whitelist",
                    "  !door remove-user <member> - Remove member from whitelist",
                    "  !door list-whitelist - Show all whitelisted members",
                    "",
                    "DOOR CONTROL:",
                    "  !door lock - Lock door immediately",
                    "  !door unlock [sec] - Manually unlock for duration",
                    "  !door enable - Re-enable a disabled keypad",
                    "  !door disable - Disable keypad without deleting",
                    "",
                    "GROUP MANAGEMENT:",
                    "  !door group-list - Show all access groups",
                    "  !door group-create <name> - Create custom group",
                    "  !door group-delete <name> - Delete custom group",
                    "  !door group-add <group> <member> - Add member to group",
                    "  !door group-remove <group> <member> - Remove member from group",
                    "  !door group-code <group> <code> - Set group code",
                    "",
                    "STATUS:",
                    "  !door list - Show door configuration and groups",
                ].join("\n");
                this.replyDoor(msg.message, adminHelp);
            } else if (isWhitelisted) {
                const whitelistHelp = [
                    "=== WHITELIST MEMBER COMMANDS ===",
                    "",
                    "CODE MANAGEMENT:",
                    "  !door change-code <whitelist|guest> <code> - Change whitelist or guest code",
                    "",
                    "WHITELIST MANAGEMENT:",
                    "  !door add-user <member> - Add member to whitelist",
                    "  !door remove-user <member> - Remove member from whitelist",
                    "  !door list - Show configuration",
                    "  !door list-whitelist - Show all whitelisted members",
                ].join("\n");
                this.replyDoor(msg.message, whitelistHelp);
            } else {
                this.replyDoor(
                    msg.message,
                    "You do not have permission to manage this door. (Requires admin or whitelist access)",
                );
            }
            return;
        }

        // All other commands require admin or whitelist access
        if (!isAdmin && !isWhitelisted) {
            this.replyDoor(
                msg.message,
                "You do not have permission to manage this door. (Requires admin or whitelist access)",
            );
            return;
        }

        switch (action) {
            case "change-code":
            case "code":
            case "change": {
                const offset = action === "change" ? 1 : 0;
                const group = args[
                    1 + offset
                ]?.toLowerCase() as KeypadAccessGroup;
                const code = args[2 + offset];

                // Whitelist members can only change whitelist and guest codes
                if (!isAdmin && group === "admin") {
                    this.replyDoor(
                        msg.message,
                        "Only room admins can change the admin code.",
                    );
                    return;
                }

                if (
                    !["admin", "whitelist", "guest"].includes(group) ||
                    !code ||
                    code.includes("(") ||
                    code.includes(")")
                ) {
                    this.replyDoor(
                        msg.message,
                        `Usage: !door change-code <${isAdmin ? "admin|" : ""}whitelist|guest> <code>`,
                    );
                    return;
                }
                door.config.codes[group] = code;
                await this.persistDoor(door);
                this.replyDoor(
                    msg.message,
                    `The ${group} door code was changed.`,
                );
                return;
            }
            case "add-user":
            case "add":
                await this.changeWhitelist(
                    msg.message,
                    door,
                    args[1]?.toLowerCase() === "user" ? args[2] : args[1],
                    true,
                );
                return;
            case "remove-user":
            case "remove":
                await this.changeWhitelist(
                    msg.message,
                    door,
                    args[1]?.toLowerCase() === "user" ? args[2] : args[1],
                    false,
                );
                return;
            case "list": {
                const groups = ["admin", "whitelist", "guest"]
                    .filter(
                        (group) =>
                            door.config.codes[group as KeypadAccessGroup],
                    )
                    .join(", ");
                this.replyDoor(
                    msg.message,
                    `Door ${door.location.key}. Configured groups: ${groups || "none"}. Whitelist member numbers: ${door.config.whitelistMemberNumbers.join(", ") || "none"}. Unlock duration: ${door.config.unlockDurationMs / 1000} seconds.`,
                );
                return;
            }
            case "list-whitelist": {
                if (door.config.whitelistMemberNumbers.length === 0) {
                    this.replyDoor(
                        msg.message,
                        "No whitelist members configured for this door.",
                    );
                } else {
                    this.replyDoor(
                        msg.message,
                        `Whitelist members for ${door.location.key}: ${door.config.whitelistMemberNumbers.join(", ")}`,
                    );
                }
                return;
            }
            // Admin-only commands
            case "enable": {
                if (!isAdmin) {
                    this.replyDoor(
                        msg.message,
                        "Only room admins can enable/disable keypads.",
                    );
                    return;
                }
                if (door.location.enabled) {
                    this.replyDoor(
                        msg.message,
                        "This keypad is already enabled.",
                    );
                    return;
                }
                await this.locationStore?.updateLocation(door.location.key, {
                    enabled: true,
                });
                await this.reloadLocationsCallback?.();
                this.replyDoor(
                    msg.message,
                    `Keypad ${door.location.key} has been enabled.`,
                );
                return;
            }
            case "disable": {
                if (!isAdmin) {
                    this.replyDoor(
                        msg.message,
                        "Only room admins can enable/disable keypads.",
                    );
                    return;
                }
                if (!door.location.enabled) {
                    this.replyDoor(
                        msg.message,
                        "This keypad is already disabled.",
                    );
                    return;
                }
                await this.locationStore?.updateLocation(door.location.key, {
                    enabled: false,
                });
                await this.reloadLocationsCallback?.();
                this.replyDoor(
                    msg.message,
                    `Keypad ${door.location.key} has been disabled.`,
                );
                return;
            }
            case "lock": {
                if (!isAdmin) {
                    this.replyDoor(
                        msg.message,
                        "Only room admins can lock doors.",
                    );
                    return;
                }
                const doorKey = this.getDoorKey(door);
                if (this.doorUnlockTimers.has(doorKey)) {
                    this.doorUnlockTimers.clear(doorKey);
                }
                this.setDoorLocked(door);
                this.logger.info("Door manually locked by admin", {
                    doorX: door.config.doorX,
                    doorY: door.config.doorY,
                });
                this.replyDoor(msg.message, "The door was locked immediately.");
                return;
            }
            case "unlock": {
                if (!isAdmin) {
                    this.replyDoor(
                        msg.message,
                        "Only room admins can manually unlock doors.",
                    );
                    return;
                }
                const seconds = args[1]
                    ? Number(args[1])
                    : door.config.unlockDurationMs / 1000;
                if (!Number.isFinite(seconds) || seconds <= 0) {
                    this.replyDoor(
                        msg.message,
                        "Usage: !door unlock [seconds]",
                    );
                    return;
                }
                this.unlockDoor(door, "admin", msg.sender, seconds * 1000);
                return;
            }
            case "group-list": {
                if (!isAdmin && !isWhitelisted) {
                    this.replyDoor(
                        msg.message,
                        "You do not have permission to manage this door.",
                    );
                    return;
                }

                const hardcodedGroups = ["admin", "whitelist", "guest"]
                    .filter((g) => door.config.codes[g as KeypadAccessGroup])
                    .join(", ");

                let customGroups = "none";
                if (this.keypadAccessGroupManager) {
                    try {
                        const doorKey = door.location.key;
                        const customGroupList =
                            await this.keypadAccessGroupManager.listGroups(
                                doorKey,
                            );
                        if (customGroupList && customGroupList.length > 0) {
                            customGroups = customGroupList
                                .map((g) => g.groupName)
                                .join(", ");
                        }
                    } catch (e) {
                        this.logger.error(
                            "Failed to fetch custom groups",
                            e as Error,
                        );
                    }
                }

                this.replyDoor(
                    msg.message,
                    `Hardcoded groups: ${hardcodedGroups || "none"}. Custom groups: ${customGroups}.`,
                );
                return;
            }
            case "group-create": {
                if (!isAdmin) {
                    this.replyDoor(
                        msg.message,
                        "Only room admins can create custom groups.",
                    );
                    return;
                }

                if (!this.keypadAccessGroupManager) {
                    this.replyDoor(
                        msg.message,
                        "Custom groups are not available (database not configured).",
                    );
                    return;
                }

                const groupName = args[1]?.toLowerCase();
                const groupCode = args[2];

                if (!groupName || !groupCode) {
                    this.replyDoor(
                        msg.message,
                        "Usage: !door group-create <name> <code>",
                    );
                    return;
                }

                try {
                    const doorKey = door.location.key;
                    await this.keypadAccessGroupManager.createGroup(
                        doorKey,
                        groupName,
                        groupCode,
                    );
                    this.replyDoor(
                        msg.message,
                        `Custom group "${groupName}" created with code "${groupCode}".`,
                    );
                } catch (e: any) {
                    this.replyDoor(
                        msg.message,
                        `Failed to create group: ${e.message || "Unknown error"}`,
                    );
                    this.logger.error(
                        "Failed to create custom group",
                        e as Error,
                    );
                }
                return;
            }
            case "group-delete": {
                if (!isAdmin) {
                    this.replyDoor(
                        msg.message,
                        "Only room admins can delete custom groups.",
                    );
                    return;
                }

                if (!this.keypadAccessGroupManager) {
                    this.replyDoor(
                        msg.message,
                        "Custom groups are not available (database not configured).",
                    );
                    return;
                }

                const groupName = args[1]?.toLowerCase();

                if (!groupName) {
                    this.replyDoor(
                        msg.message,
                        "Usage: !door group-delete <name>",
                    );
                    return;
                }

                try {
                    const doorKey = door.location.key;
                    await this.keypadAccessGroupManager.deleteGroup(
                        doorKey,
                        groupName,
                    );
                    this.replyDoor(
                        msg.message,
                        `Custom group "${groupName}" deleted.`,
                    );
                } catch (e: any) {
                    this.replyDoor(
                        msg.message,
                        `Failed to delete group: ${e.message || "Unknown error"}`,
                    );
                    this.logger.error(
                        "Failed to delete custom group",
                        e as Error,
                    );
                }
                return;
            }
            case "group-add": {
                if (!isAdmin && !isWhitelisted) {
                    this.replyDoor(
                        msg.message,
                        "You do not have permission to manage this door.",
                    );
                    return;
                }

                if (!this.keypadAccessGroupManager) {
                    this.replyDoor(
                        msg.message,
                        "Custom groups are not available (database not configured).",
                    );
                    return;
                }

                const groupName = args[1]?.toLowerCase();
                const rawMemberNumber = args[2];

                if (!groupName || !rawMemberNumber) {
                    this.replyDoor(
                        msg.message,
                        "Usage: !door group-add <name> <member number>",
                    );
                    return;
                }

                const memberNumber = Number(rawMemberNumber);
                if (!Number.isInteger(memberNumber) || memberNumber <= 0) {
                    this.replyDoor(
                        msg.message,
                        "Member number must be a positive integer.",
                    );
                    return;
                }

                try {
                    const doorKey = door.location.key;
                    await this.keypadAccessGroupManager.addMember(
                        doorKey,
                        groupName,
                        memberNumber,
                    );
                    this.replyDoor(
                        msg.message,
                        `Member ${memberNumber} added to custom group "${groupName}".`,
                    );
                } catch (e: any) {
                    this.replyDoor(
                        msg.message,
                        `Failed to add member: ${e.message || "Unknown error"}`,
                    );
                    this.logger.error(
                        "Failed to add member to custom group",
                        e as Error,
                    );
                }
                return;
            }
            case "group-remove": {
                if (!isAdmin && !isWhitelisted) {
                    this.replyDoor(
                        msg.message,
                        "You do not have permission to manage this door.",
                    );
                    return;
                }

                if (!this.keypadAccessGroupManager) {
                    this.replyDoor(
                        msg.message,
                        "Custom groups are not available (database not configured).",
                    );
                    return;
                }

                const groupName = args[1]?.toLowerCase();
                const rawMemberNumber = args[2];

                if (!groupName || !rawMemberNumber) {
                    this.replyDoor(
                        msg.message,
                        "Usage: !door group-remove <name> <member number>",
                    );
                    return;
                }

                const memberNumber = Number(rawMemberNumber);
                if (!Number.isInteger(memberNumber) || memberNumber <= 0) {
                    this.replyDoor(
                        msg.message,
                        "Member number must be a positive integer.",
                    );
                    return;
                }

                try {
                    const doorKey = door.location.key;
                    await this.keypadAccessGroupManager.removeMember(
                        doorKey,
                        groupName,
                        memberNumber,
                    );
                    this.replyDoor(
                        msg.message,
                        `Member ${memberNumber} removed from custom group "${groupName}".`,
                    );
                } catch (e: any) {
                    this.replyDoor(
                        msg.message,
                        `Failed to remove member: ${e.message || "Unknown error"}`,
                    );
                    this.logger.error(
                        "Failed to remove member from custom group",
                        e as Error,
                    );
                }
                return;
            }
            case "group-code": {
                if (!isAdmin) {
                    this.replyDoor(
                        msg.message,
                        "Only room admins can change group codes.",
                    );
                    return;
                }

                if (!this.keypadAccessGroupManager) {
                    this.replyDoor(
                        msg.message,
                        "Custom groups are not available (database not configured).",
                    );
                    return;
                }

                const groupName = args[1]?.toLowerCase();
                const newCode = args[2];

                if (!groupName || !newCode) {
                    this.replyDoor(
                        msg.message,
                        "Usage: !door group-code <name> <code>",
                    );
                    return;
                }

                try {
                    const doorKey = door.location.key;
                    await this.keypadAccessGroupManager.updateCode(
                        doorKey,
                        groupName,
                        newCode,
                    );
                    this.replyDoor(
                        msg.message,
                        `Code for custom group "${groupName}" updated.`,
                    );
                } catch (e: any) {
                    this.replyDoor(
                        msg.message,
                        `Failed to update group code: ${e.message || "Unknown error"}`,
                    );
                    this.logger.error(
                        "Failed to update custom group code",
                        e as Error,
                    );
                }
                return;
            }
            default:
                this.replyDoor(
                    msg.message,
                    "Unknown door command. Use !door help.",
                );
        }
    };

    private findDoorAt(character: API_Character): KeypadDoor | undefined {
        return this.doors.find(
            (door) =>
                door.location.x === character.MapPos.X &&
                door.location.y === character.MapPos.Y,
        );
    }

    private findDoorAtAutoOpenTile(
        character: API_Character,
    ): KeypadDoor | undefined {
        return this.doors.find(
            (door) =>
                door.config.autoOpenTile &&
                door.config.autoOpenTile.X === character.MapPos.X &&
                door.config.autoOpenTile.Y === character.MapPos.Y,
        );
    }

    private replyDoor(message: API_Message["message"], text: string): void {
        this.conn.reply(message, text);
    }

    private async changeWhitelist(
        message: API_Message["message"],
        door: KeypadDoor,
        rawMemberNumber: string | undefined,
        add: boolean,
    ): Promise<void> {
        const memberNumber = Number(rawMemberNumber);
        if (!Number.isInteger(memberNumber) || memberNumber <= 0) {
            this.replyDoor(
                message,
                `Usage: !door ${add ? "add-user" : "remove-user"} <member number>`,
            );
            return;
        }

        const members = new Set(door.config.whitelistMemberNumbers);
        if (add) members.add(memberNumber);
        else members.delete(memberNumber);
        door.config.whitelistMemberNumbers = [...members].sort((a, b) => a - b);
        await this.persistDoor(door);
        this.replyDoor(
            message,
            `${memberNumber} was ${add ? "added to" : "removed from"} the door whitelist.`,
        );
    }

    private async persistDoor(door: KeypadDoor): Promise<void> {
        if (!this.locationStore) return;
        await this.locationStore.updateLocation(door.location.key, {
            data: {
                ...door.location.data,
                codes: door.config.codes,
                whitelistMemberNumbers: door.config.whitelistMemberNumbers,
            },
        });
        await this.reloadLocationsCallback?.();
    }

    private unlockDoor(
        door: KeypadDoor,
        group: KeypadAccessGroup,
        character: API_Character,
        durationMs = door.config.unlockDurationMs,
    ): void {
        if (!this.conn.chatRoom?.map) return;

        const doorKey = this.getDoorKey(door);

        // Clear any existing unlock timer before creating new one
        if (this.doorUnlockTimers.has(doorKey)) {
            this.doorUnlockTimers.clear(doorKey);
        }

        this.setDoorTile(door, door.config.unlockedTile);
        this.logger.info("Door unlocked", {
            doorX: door.config.doorX,
            doorY: door.config.doorY,
            group,
            memberNumber: character.MemberNumber,
            durationMs,
        });

        this.conn.SendMessage(
            "Whisper",
            `Keypad accepted for ${group}. Door unlocked for ${durationMs / 1000} seconds.`,
            character.MemberNumber,
        );

        this.doorUnlockTimers.set(
            doorKey,
            () => this.scheduleLockWhenEmpty(door),
            durationMs,
        );
    }

    private scheduleLockWhenEmpty(door: KeypadDoor): void {
        if (this.hasInsideOccupants(door)) {
            const doorKey = this.getDoorKey(door);
            this.doorUnlockTimers.set(
                doorKey,
                () => this.scheduleLockWhenEmpty(door),
                1000,
            );
            return;
        }

        this.setDoorLocked(door);
    }

    private setDoorLocked(door: KeypadDoor): void {
        this.setDoorTile(door, door.config.lockedTile);
    }

    private setDoorTile(door: KeypadDoor, tile: string): void {
        this.conn.chatRoom?.map.setObject(
            { X: door.config.doorX, Y: door.config.doorY },
            tile,
        );
    }

    private hasInsideOccupants(door: KeypadDoor): boolean {
        if (!door.config.insideRegion) return false;

        const characters = this.conn.chatRoom?.characters ?? [];
        return characters.some(
            (character) =>
                character.MemberNumber !== this.conn.Player.MemberNumber &&
                character.MapPos.X >= door.config.insideRegion.TopLeft.X &&
                character.MapPos.X <= door.config.insideRegion.BottomRight.X &&
                character.MapPos.Y >= door.config.insideRegion.TopLeft.Y &&
                character.MapPos.Y <= door.config.insideRegion.BottomRight.Y,
        );
    }
}
