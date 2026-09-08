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
});
