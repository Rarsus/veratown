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

// A keypad_door location uses this data shape:
// {
//   doorX: 20,
//   doorY: 10,
//   lockedTile: "SteelDoor",
//   unlockedTile: "SteelDoorOpen",
//   unlockDurationMs: 10000,
//   codes: { admin: "...", whitelist: "...", guest: "..." },
//   whitelistMemberNumbers: [12345],
//   insideTopLeftX: 21,
//   insideTopLeftY: 9,
//   insideBottomRightX: 39,
//   insideBottomRightY: 20
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
    insideRegion: MapRegion;
}

interface KeypadDoor {
    location: VeratownLocationDoc;
    config: KeypadDoorConfig;
    timer?: ReturnType<typeof setTimeout>;
}

const KEYPAD_NOTIFICATION_DELAY_MS = 1500;

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

function readConfig(location: VeratownLocationDoc): KeypadDoorConfig | undefined {
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
        unlockDurationMs <= 0 ||
        insideTopLeftX === undefined ||
        insideTopLeftY === undefined ||
        insideBottomRightX === undefined ||
        insideBottomRightY === undefined
    ) {
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
                  typeof memberNumber === "number" && Number.isInteger(memberNumber),
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
        insideRegion: {
            TopLeft: { X: insideTopLeftX, Y: insideTopLeftY },
            BottomRight: { X: insideBottomRightX, Y: insideBottomRightY },
        },
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
    private notificationTimers = new Map<string, ReturnType<typeof setTimeout>>();

    public constructor(
        private conn: API_Connector,
        private commandParser?: CommandParser,
        private locationStore?: VeratownLocationStore,
        private reloadLocationsCallback?: () => Promise<void>,
    ) {
        this.keypadTrigger = guardHandler(
            this.key,
            this.onCharacterAtKeypad,
        );
    }

    public registerTriggers(): void {
        this.conn.on("Message", guardHandler(this.key, this.onMessage));
        this.commandParser?.register("door", this.onDoorCommandPlaceholder);
        this.commandParser?.register("code", this.onCodeCommandPlaceholder);
        this.conn.on(
            "Message",
            guardHandler(`${this.key}:admin`, this.onAdminMessage),
        );
        this.conn.on(
            "Message",
            guardHandler(`${this.key}:code`, this.onCodeMessage),
        );
    }

    public async reloadLocations(
        locations: readonly VeratownLocationDoc[],
    ): Promise<void> {
        for (const door of this.doors) {
            if (door.timer) clearTimeout(door.timer);
        }
        for (const timer of this.notificationTimers.values()) {
            clearTimeout(timer);
        }
        this.notificationTimers.clear();

        for (const door of this.doors) {
            if (door.location.x !== undefined && door.location.y !== undefined) {
                this.conn.chatRoom?.map.removeTileTrigger(
                    door.location.x,
                    door.location.y,
                    this.keypadTrigger,
                );
            }
        }

        this.doors = locations
            .filter((location) => location.type === "keypad_door" && location.enabled)
            .map((location) => {
                const config = readConfig(location);
                return config ? { location, config } : undefined;
            })
            .filter((door): door is KeypadDoor => door !== undefined);

        for (const door of this.doors) {
            if (door.location.x !== undefined && door.location.y !== undefined) {
                this.conn.chatRoom?.map.addTileTrigger(
                    { X: door.location.x, Y: door.location.y },
                    this.keypadTrigger,
                );
            }
            if (this.hasInsideOccupants(door)) {
                this.setDoorTile(door, door.config.unlockedTile);
                this.scheduleLockWhenEmpty(door);
            } else {
                this.setDoorTile(door, door.config.lockedTile);
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
        const existingTimer = this.notificationTimers.get(notificationKey);
        if (existingTimer) clearTimeout(existingTimer);

        const timer = setTimeout(() => {
            this.notificationTimers.delete(notificationKey);
            const stillAtKeypad =
                character.MapPos.X === door.location.x &&
                character.MapPos.Y === door.location.y;
            if (!stillAtKeypad) return;

            character.Tell(
                "Whisper",
                "You are standing at a keypad. Whisper /bot code followed by your access code to try this door.",
            );
        }, KEYPAD_NOTIFICATION_DELAY_MS);

        this.notificationTimers.set(notificationKey, timer);
    };

    private onMessage = async (msg: API_Message): Promise<void> => {
        if (!this.enabled || msg.message.Type !== "Whisper") return;

        const code = unwrapWhisper(msg.message.Content).trim();
        if (!code) return;
        if (code.toLowerCase().startsWith("!door")) return;

        for (const door of this.doors) {
            if (
                msg.sender.MapPos.X !== door.location.x ||
                msg.sender.MapPos.Y !== door.location.y
            ) {
                continue;
            }

            const group = getKeypadAccessGroup(
                msg.sender,
                door.config.whitelistMemberNumbers,
            );
            if (door.config.codes[group] !== code) {
                this.conn.reply(msg.message, "Invalid keypad code.");
                return;
            }

            this.unlockDoor(door, group, msg.sender);
            return;
        }
    };

    private onDoorCommandPlaceholder = async (): Promise<void> => {
        // The raw listener below handles this command so code casing is kept.
    };

    private onCodeCommandPlaceholder = async (): Promise<void> => {
        // The raw listener below handles this command so code casing is kept.
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

        const group = getKeypadAccessGroup(
            msg.sender,
            door.config.whitelistMemberNumbers,
        );
        if (door.config.codes[group] !== match[1]) {
            this.conn.reply(msg.message, "Invalid keypad code.");
            return;
        }

        this.unlockDoor(door, group, msg.sender);
    };

    private onAdminMessage = async (msg: API_Message): Promise<void> => {
        if (msg.message.Type !== "Whisper" || !msg.sender.IsRoomAdmin()) {
            return;
        }

        const content = unwrapWhisper(msg.message.Content).trim();
        const match = /^!door(?:\s+(.+))?$/i.exec(content);
        if (!match) return;

        const door = this.findDoorAt(msg.sender);
        if (!door) {
            this.conn.reply(
                msg.message,
                "Stand on a configured keypad tile to manage its door.",
            );
            return;
        }

        const args = match[1]?.trim().split(/\s+/) ?? ["help"];
        const action = args[0].toLowerCase();

        switch (action) {
            case "help":
                this.replyAdmin(
                    msg.message,
                    "Door commands: !door change-code <admin|whitelist|guest> <code>; !door add-user <member number>; !door remove-user <member number>; !door list; !door lock; !door unlock [seconds]",
                );
                return;
            case "change-code":
            case "code":
            case "change": {
                const offset = action === "change" ? 1 : 0;
                const group = args[1 + offset]?.toLowerCase() as KeypadAccessGroup;
                const code = args[2 + offset];
                if (
                    !["admin", "whitelist", "guest"].includes(group) ||
                    !code ||
                    code.includes("(") ||
                    code.includes(")")
                ) {
                    this.replyAdmin(
                        msg.message,
                        "Usage: !door change-code <admin|whitelist|guest> <code>",
                    );
                    return;
                }
                door.config.codes[group] = code;
                await this.persistDoor(door);
                this.replyAdmin(msg.message, `The ${group} door code was changed.`);
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
                    .filter((group) => door.config.codes[group as KeypadAccessGroup])
                    .join(", ");
                this.replyAdmin(
                    msg.message,
                    `Door ${door.location.key}. Configured groups: ${groups || "none"}. Whitelist member numbers: ${door.config.whitelistMemberNumbers.join(", ") || "none"}. Unlock duration: ${door.config.unlockDurationMs / 1000} seconds.`,
                );
                return;
            }
            case "lock":
                if (door.timer) clearTimeout(door.timer);
                door.timer = undefined;
                this.setDoorTile(door, door.config.lockedTile);
                this.replyAdmin(msg.message, "The door was locked immediately.");
                return;
            case "unlock": {
                const seconds = args[1] ? Number(args[1]) : door.config.unlockDurationMs / 1000;
                if (!Number.isFinite(seconds) || seconds <= 0) {
                    this.replyAdmin(msg.message, "Usage: !door unlock [seconds]");
                    return;
                }
                this.unlockDoor(door, "admin", msg.sender, seconds * 1000);
                return;
            }
            default:
                this.replyAdmin(msg.message, "Unknown door command. Use !door help.");
        }
    };

    private findDoorAt(character: API_Character): KeypadDoor | undefined {
        return this.doors.find(
            (door) =>
                door.location.x === character.MapPos.X &&
                door.location.y === character.MapPos.Y,
        );
    }

    private replyAdmin(message: API_Message["message"], text: string): void {
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
            this.replyAdmin(
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
        this.replyAdmin(
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

        if (door.timer) clearTimeout(door.timer);
        this.setDoorTile(door, door.config.unlockedTile);
        this.conn.SendMessage(
            "Whisper",
            `Keypad accepted for ${group}. Door unlocked for ${durationMs / 1000} seconds.`,
            character.MemberNumber,
        );

        door.timer = setTimeout(
            () => this.scheduleLockWhenEmpty(door),
            durationMs,
        );
    }

    private scheduleLockWhenEmpty(door: KeypadDoor): void {
        if (this.hasInsideOccupants(door)) {
            door.timer = setTimeout(() => this.scheduleLockWhenEmpty(door), 1000);
            return;
        }

        this.setDoorTile(door, door.config.lockedTile);
        door.timer = undefined;
    }

    private setDoorTile(door: KeypadDoor, tile: string): void {
        this.conn.chatRoom?.map.setTile(
            { X: door.config.doorX, Y: door.config.doorY },
            tile,
        );
    }

    private hasInsideOccupants(door: KeypadDoor): boolean {
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
