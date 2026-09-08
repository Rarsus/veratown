import { describe, it } from "node:test";
import { expect } from "../../../testUtils";
import { KeypadDoorSystem } from "../../veratown/keypadDoorSystemRefactored";
import { KeypadDoorDefinitionDoc } from "../../veratown/keypadTypes";

describe("KeypadDoorSystem (definition authoritative)", () => {
    function createDoor(): KeypadDoorDefinitionDoc {
        return {
            _id: "shop_entrance",
            doorKey: "shop_entrance",
            doorX: 13,
            doorY: 9,
            keypadTiles: [{ X: 13, Y: 9 }],
            lockedTile: "MetalDown",
            unlockedTile: "SteelDoorOpen",
            unlockDurationMs: 10,
            autoOpenTiles: [{ X: 13, Y: 8 }],
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    function createSystem(
        map: {
            addTileTrigger: Function;
            removeTileTrigger: Function;
            setObject: Function;
        },
        door = createDoor(),
    ) {
        const definitionService = {
            init: async () => {},
            on: () => {},
            off: () => {},
            getAllDoorDefinitions: async () => [door],
            getDoorDefinition: async (doorKey: string) =>
                doorKey === door.doorKey ? door : null,
        };
        const system = new KeypadDoorSystem(
            { chatRoom: { map }, on: () => {}, SendMessage: () => {} } as any,
            definitionService as any,
            { init: async () => {}, canAccessDoor: async () => true } as any,
            {} as any,
        );
        return { system, definitionService };
    }

    it("registers definition keypad and auto-open triggers and relocks", async () => {
        const tileTriggers: Array<{
            x: number;
            y: number;
            callback: (character: any) => void;
        }> = [];
        const tileUpdates: string[] = [];
        const map = {
            addTileTrigger: (
                position: { X: number; Y: number },
                callback: any,
            ) => tileTriggers.push({ x: position.X, y: position.Y, callback }),
            removeTileTrigger: () => {},
            setObject: (_position: unknown, tile: string) =>
                tileUpdates.push(tile),
        };
        const { system } = createSystem(map);
        await system.init();

        expect(
            tileTriggers.map((trigger) => `${trigger.x},${trigger.y}`).sort(),
        ).toEqual(["13,8", "13,9"]);

        const character = {
            MemberNumber: 1,
            Name: "Shopper",
            MapPos: { X: 13, Y: 9 },
            IsRoomAdmin: () => false,
        };
        tileTriggers
            .find((trigger) => trigger.x === 13 && trigger.y === 9)!
            .callback(character);
        await new Promise((resolve) => setImmediate(resolve));
        expect(tileUpdates).toContain("SteelDoorOpen");
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(tileUpdates.at(-1)).toBe("MetalDown");
        await system.shutdown();
    });

    it("routes commands without requiring a location store", async () => {
        let dispatched: { commandLine: string; isAdmin: boolean } | undefined;
        const system = new KeypadDoorSystem(
            {
                on: (event: string, handler: Function) =>
                    event === "Message" && handler,
            } as any,
            {
                init: async () => {},
                on: () => {},
                off: () => {},
                getAllDoorDefinitions: async () => [],
            } as any,
            { init: async () => {} } as any,
            {
                executeCommand: async (
                    _actor: unknown,
                    commandLine: string,
                    isAdmin: boolean,
                ) => {
                    dispatched = { commandLine, isAdmin };
                    return { success: true, message: "Door listed" };
                },
            } as any,
        );
        const connection = {
            on: (event: string, handler: Function) => {
                if (event === "Message") {
                    handler({
                        message: {
                            Type: "Whisper",
                            Content: "!door door list",
                        },
                        sender: {
                            MemberNumber: 1,
                            Name: "Admin",
                            IsRoomAdmin: () => true,
                        },
                    });
                }
            },
        };
        (system as any).conn = connection;
        system.registerTriggers();
        await new Promise((resolve) => setImmediate(resolve));
        expect(dispatched?.commandLine).toBe("door list");
        expect(dispatched?.isAdmin).toBe(true);
        await system.shutdown();
    });

    it("responds with help for !door help", async () => {
        const sent: string[] = [];
        let messageHandler: ((message: any) => void) | undefined;
        const system = new KeypadDoorSystem(
            {
                on: (event: string, handler: (message: any) => void) => {
                    if (event === "Message") messageHandler = handler;
                },
                SendMessage: (_type: string, message: string) =>
                    sent.push(message),
            } as any,
            {
                init: async () => {},
                on: () => {},
                off: () => {},
                getAllDoorDefinitions: async () => [],
            } as any,
            { init: async () => {} } as any,
            { getHelpText: () => "!door help\n!door create" } as any,
        );
        system.registerTriggers();
        messageHandler!({
            message: { Type: "Whisper", Content: "!door help" },
            sender: { MemberNumber: 1, Name: "Admin", IsRoomAdmin: () => true },
        });
        await new Promise((resolve) => setImmediate(resolve));
        expect(sent[0]).toContain("!door help");
        expect(sent[0]).toContain("!door create");
        await system.shutdown();
    });

    it("preserves case-sensitive command arguments", async () => {
        const dispatched: string[] = [];
        let messageHandler: ((message: any) => void) | undefined;
        const system = new KeypadDoorSystem(
            {
                on: (event: string, handler: (message: any) => void) => {
                    if (event === "Message") messageHandler = handler;
                },
                SendMessage: () => {},
            } as any,
            {
                init: async () => {},
                on: () => {},
                off: () => {},
                getAllDoorDefinitions: async () => [],
            } as any,
            { init: async () => {} } as any,
            {
                executeCommand: async (
                    _actor: unknown,
                    commandLine: string,
                ) => {
                    dispatched.push(commandLine);
                    return { success: true, message: "ok" };
                },
            } as any,
        );
        system.registerTriggers();
        messageHandler!({
            message: {
                Type: "Whisper",
                Content: "!door group create shop GuestCode",
            },
            sender: { MemberNumber: 1, Name: "Admin", IsRoomAdmin: () => true },
        });
        await new Promise((resolve) => setImmediate(resolve));
        expect(dispatched).toEqual(["group create shop GuestCode"]);
        await system.shutdown();
    });

    it("sends notifications to the character as whispers", async () => {
        const sent: Array<{
            type: string;
            message: string;
            memberNumber: number;
        }> = [];
        const { system } = createSystem({
            addTileTrigger: () => {},
            removeTileTrigger: () => {},
            setObject: () => {},
        });
        (system as any).conn.SendMessage = (
            type: string,
            message: string,
            memberNumber: number,
        ) => sent.push({ type, message, memberNumber });
        const character = {
            MemberNumber: 1,
            Name: "Shopper",
        };

        (system as any).sendNotification(character, "Incorrect code.");

        expect(sent).toEqual([
            { type: "Whisper", message: "Incorrect code.", memberNumber: 1 },
        ]);
        await system.shutdown();
    });

    it("reports unknown door commands instead of silently dropping them", async () => {
        const sent: string[] = [];
        const system = new KeypadDoorSystem(
            {
                on: () => {},
                SendMessage: (_type: string, message: string) =>
                    sent.push(message),
            } as any,
            {
                init: async () => {},
                on: () => {},
                off: () => {},
                getAllDoorDefinitions: async () => [],
            } as any,
            { init: async () => {} } as any,
            {
                getHelpText: () => "!door help",
                executeCommand: async () => ({
                    success: false,
                    message: "Unknown command: mystery command\n!door help",
                }),
            } as any,
        );

        (system as any).onMessage({
            message: { Type: "Whisper", Content: "!door mystery command" },
            sender: { MemberNumber: 1, Name: "Admin", IsRoomAdmin: () => true },
        });
        await new Promise((resolve) => setImmediate(resolve));

        expect(sent[0]).toContain("Unknown command");
        expect(sent[0]).toContain("!door help");
        await system.shutdown();
    });

    it("registers door commands with the ChatRoomBot command parser", async () => {
        let doorParser:
            | ((sender: any, message: unknown, args: string[]) => void)
            | undefined;
        const sent: string[] = [];
        const system = new KeypadDoorSystem(
            {
                on: () => {},
                SendMessage: (_type: string, message: string) =>
                    sent.push(message),
            } as any,
            {
                init: async () => {},
                on: () => {},
                off: () => {},
                getAllDoorDefinitions: async () => [],
            } as any,
            { init: async () => {} } as any,
            {
                getHelpText: () => "!door help",
                executeCommand: async () => ({
                    success: false,
                    message: "Unknown command: mystery\n!door help",
                }),
            } as any,
            {
                register: (command: string, handler: typeof doorParser) => {
                    if (command === "door") doorParser = handler;
                },
            } as any,
        );

        expect(doorParser).toBeDefined();
        doorParser!(
            { MemberNumber: 1, Name: "Admin", IsRoomAdmin: () => true },
            {},
            ["help"],
        );
        await new Promise((resolve) => setImmediate(resolve));
        expect(sent[0]).toContain("!door help");
        await system.shutdown();
    });
});
