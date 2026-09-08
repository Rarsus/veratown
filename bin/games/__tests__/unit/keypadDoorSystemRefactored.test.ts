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

import { describe, it } from "node:test";
import { expect } from "../../../testUtils";
import { KeypadDoorSystem } from "../../veratown/keypadDoorSystemRefactored";
import { KeypadLocationIntegration } from "../../veratown/migrations/keypadLocationIntegration";
import { VeratownLocationDoc } from "../../veratown/veratownLocationStore";
import { KeypadDoorDefinitionDoc } from "../../veratown/keypadTypes";

describe("KeypadDoorSystem (refactored)", () => {
    it("registers keypad and auto-open triggers and relocks the door", async () => {
        const tileTriggers: Array<{
            x: number;
            y: number;
            callback: (character: any) => void;
        }> = [];
        const tileUpdates: string[] = [];
        const map = {
            addTileTrigger: (
                position: { X: number; Y: number },
                callback: (character: any) => void,
            ) => {
                tileTriggers.push({
                    x: position.X,
                    y: position.Y,
                    callback,
                });
            },
            removeTileTrigger: () => {},
            setObject: (_position: { X: number; Y: number }, tile: string) => {
                tileUpdates.push(tile);
            },
        };
        const location: VeratownLocationDoc = {
            key: "shop_entrance",
            name: "Shop entrance",
            type: "keypad_door",
            x: 13,
            y: 9,
            data: { doorKey: "shop_entrance" },
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        const door: KeypadDoorDefinitionDoc = {
            _id: "shop_entrance",
            doorKey: "shop_entrance",
            doorX: 13,
            doorY: 9,
            lockedTile: "MetalDown",
            unlockedTile: "SteelDoorOpen",
            unlockDurationMs: 10,
            autoOpenTile: { X: 13, Y: 8 },
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        const definitionService = {
            init: async () => {},
            getAllDoorDefinitions: async () => [door],
            getDoorDefinition: async (doorKey: string) =>
                doorKey === door.doorKey ? door : null,
        };
        const connection = {
            chatRoom: { map },
            on: () => {},
        };
        const system = new KeypadDoorSystem(
            connection as any,
            {
                getAllLocations: async () => [location],
                on: () => {},
                off: () => {},
            } as any,
            definitionService as any,
            {
                init: async () => {},
                canAccessDoor: async () => true,
            } as any,
            {} as any,
            new KeypadLocationIntegration(definitionService as any),
        );

        await system.init();

        expect(tileTriggers.length).toBe(2);
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

        tileTriggers
            .find((trigger) => trigger.x === 13 && trigger.y === 8)!
            .callback(character);
        await new Promise((resolve) => setTimeout(resolve, 1025));
        expect(tileUpdates).toContain("SteelDoorOpen");

        await system.shutdown();
    });

    it("migrates legacy locations before loading door definitions", async () => {
        const doors: KeypadDoorDefinitionDoc[] = [];
        const definitionService = {
            init: async () => {},
            getAllDoorDefinitions: async () => doors,
            getDoorDefinition: async (doorKey: string) =>
                doors.find((door) => door.doorKey === doorKey) ?? null,
            createDoor: async (door: KeypadDoorDefinitionDoc) => {
                doors.push(door);
            },
            updateDoor: async () => {},
            deleteDoor: async () => {},
        };
        const location: VeratownLocationDoc = {
            key: "legacy_cell",
            name: "Legacy cell",
            type: "keypad_door",
            x: 10,
            y: 20,
            data: {
                lockedTile: "MetalDown",
                unlockedTile: "SteelDoorOpen",
            },
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        const system = new KeypadDoorSystem(
            {} as any,
            {
                getAllLocations: async () => [location],
            } as any,
            definitionService as any,
            { init: async () => {} } as any,
            {} as any,
            new KeypadLocationIntegration(definitionService as any),
        );

        await system.init();

        expect(doors.length).toBe(1);
        expect(doors[0].doorKey).toBe("auto_location_legacy_cell");
        expect(doors[0].doorX).toBe(10);
        expect(doors[0].doorY).toBe(20);
    });

    it("routes whispered admin commands through the dispatcher", async () => {
        let messageHandler:
            | ((message: {
                  message: { Type: string; Content: string };
                  sender: any;
              }) => void)
            | undefined;
        let dispatched: { commandLine: string; isAdmin: boolean } | undefined;
        const connection = {
            on: (
                event: string,
                handler: (message: {
                    message: { Type: string; Content: string };
                    sender: any;
                }) => void,
            ) => {
                if (event === "Message") messageHandler = handler;
            },
        };
        const dispatcher = {
            executeCommand: async (
                _actor: any,
                commandLine: string,
                isAdmin: boolean,
            ) => {
                dispatched = { commandLine, isAdmin };
                return { success: true, message: "Door listed" };
            },
        };
        const system = new KeypadDoorSystem(
            connection as any,
            {} as any,
            { init: async () => {} } as any,
            { init: async () => {} } as any,
            dispatcher as any,
            {} as any,
        );

        system.registerTriggers();
        expect(messageHandler).toBeDefined();
        messageHandler!({
            message: { Type: "Whisper", Content: "!door door list" },
            sender: {
                MemberNumber: 1,
                Name: "Admin",
                IsRoomAdmin: () => true,
            },
        });
        await new Promise((resolve) => setImmediate(resolve));

        expect(dispatched?.commandLine).toBe("door list");
        expect(dispatched?.isAdmin).toBe(true);
        await system.shutdown();
    });
});
