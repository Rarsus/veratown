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

// @ts-ignore - jest types not available
import { describe, it, expect } from "@jest/globals";
import { KeypadBackwardCompatibility } from "../../veratown/migrations/keypadBackwardCompatibility";
import { VeratownLocationDoc } from "../../veratown/veratownLocationStore";

describe("KeypadBackwardCompatibility", () => {
    describe("Legacy Detection", () => {
        it("should detect legacy keypad location", () => {
            const location: VeratownLocationDoc = {
                key: "cell_1",
                name: "Prison Cell",
                type: "keypad_door",
                x: 10,
                y: 20,
                enabled: true,
                data: {
                    lockedTile: "MetalDown",
                    unlockedTile: "SteelDoorOpen",
                    unlockDurationMs: 10000,
                },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            expect(
                KeypadBackwardCompatibility.isLegacyKeypadLocation(location),
            ).toBe(true);
        });

        it("should not detect new-style keypad location", () => {
            const location: VeratownLocationDoc = {
                key: "cell_1",
                name: "Prison Cell",
                type: "keypad_door",
                x: 10,
                y: 20,
                enabled: true,
                data: {
                    doorKey: "prison_cell_1",
                },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            expect(
                KeypadBackwardCompatibility.isLegacyKeypadLocation(location),
            ).toBe(false);
        });
    });

    describe("Legacy Configuration Extraction", () => {
        it("should extract door config from legacy location", () => {
            const location: VeratownLocationDoc = {
                key: "cell_1",
                name: "Prison Cell",
                type: "keypad_door",
                x: 15,
                y: 25,
                enabled: true,
                data: {
                    lockedTile: "MetalDown",
                    unlockedTile: "SteelDoorOpen",
                    unlockDurationMs: 10000,
                },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            const door =
                KeypadBackwardCompatibility.extractLegacyDoorConfig(location);

            expect(door).toBeDefined();
            expect(door?.doorKey).toBe("auto_location_cell_1");
            expect(door?.doorX).toBe(15);
            expect(door?.doorY).toBe(25);
            expect(door?.lockedTile).toBe("MetalDown");
            expect(door?.unlockDurationMs).toBe(10000);
        });

        it("should handle missing optional fields", () => {
            const location: VeratownLocationDoc = {
                key: "cell_2",
                name: "Cell",
                type: "keypad_door",
                x: 10,
                y: 20,
                enabled: true,
                data: {
                    lockedTile: "MetalDown",
                    unlockedTile: "SteelDoorOpen",
                },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            const door =
                KeypadBackwardCompatibility.extractLegacyDoorConfig(location);

            expect(door?.unlockDurationMs).toBe(10000); // default
        });
    });

    describe("Legacy Group Management", () => {
        it("should identify legacy group names", () => {
            const location: VeratownLocationDoc = {
                key: "cell_1",
                name: "Cell",
                type: "keypad_door",
                x: 10,
                y: 20,
                enabled: true,
                data: {
                    lockedTile: "MetalDown",
                    unlockedTile: "SteelDoorOpen",
                    whitelistMemberNumbers: [123, 456],
                    memberNumbers: [123, 456, 789],
                    code: "1234",
                },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            const groups =
                KeypadBackwardCompatibility.getLegacyGroupNames(location);

            expect(groups).toContain("auto_whitelist");
            expect(groups).toContain("auto_members");
            expect(groups).toContain("auto_code");
        });

        it("should extract members from legacy whitelist", () => {
            const location: VeratownLocationDoc = {
                key: "cell_1",
                name: "Cell",
                type: "keypad_door",
                x: 10,
                y: 20,
                enabled: true,
                data: {
                    lockedTile: "MetalDown",
                    unlockedTile: "SteelDoorOpen",
                    whitelistMemberNumbers: [111, 222, 333],
                },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            const members = KeypadBackwardCompatibility.getLegacyGroupMembers(
                location,
                "auto_whitelist",
            );

            expect(members).toEqual([111, 222, 333]);
        });

        it("should extract code from legacy location", () => {
            const location: VeratownLocationDoc = {
                key: "cell_1",
                name: "Cell",
                type: "keypad_door",
                x: 10,
                y: 20,
                enabled: true,
                data: {
                    lockedTile: "MetalDown",
                    unlockedTile: "SteelDoorOpen",
                    code: "secret123",
                },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            const code = KeypadBackwardCompatibility.getLegacyCode(location);

            expect(code).toBe("secret123");
        });
    });

    describe("Auto-Migration Detection", () => {
        it("should identify auto-migrated door keys", () => {
            expect(
                KeypadBackwardCompatibility.isAutoMigrated(
                    "auto_location_cell_1",
                ),
            ).toBe(true);
            expect(
                KeypadBackwardCompatibility.isAutoMigrated("custom_door"),
            ).toBe(false);
        });

        it("should extract original location key", () => {
            const original = KeypadBackwardCompatibility.getOriginalLocationKey(
                "auto_location_prison_cell_1",
            );

            expect(original).toBe("prison_cell_1");
        });

        it("should return null for non-auto-migrated doors", () => {
            const original =
                KeypadBackwardCompatibility.getOriginalLocationKey(
                    "custom_door",
                );

            expect(original).toBeNull();
        });
    });

    describe("Legacy Config Validation", () => {
        it("should validate valid legacy config", () => {
            const location: VeratownLocationDoc = {
                key: "cell_1",
                name: "Cell",
                type: "keypad_door",
                x: 10,
                y: 20,
                enabled: true,
                data: {
                    lockedTile: "MetalDown",
                    unlockedTile: "SteelDoorOpen",
                },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            const result =
                KeypadBackwardCompatibility.validateLegacyConfig(location);

            expect(result.valid).toBe(true);
            expect(result.errors.length).toBe(0);
        });

        it("should detect missing required fields", () => {
            const location: VeratownLocationDoc = {
                key: "cell_1",
                name: "Cell",
                type: "keypad_door",
                x: 10,
                y: 20,
                enabled: true,
                data: {},
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            const result =
                KeypadBackwardCompatibility.validateLegacyConfig(location);

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it("should detect invalid member arrays", () => {
            const location: VeratownLocationDoc = {
                key: "cell_1",
                name: "Cell",
                type: "keypad_door",
                x: 10,
                y: 20,
                enabled: true,
                data: {
                    lockedTile: "MetalDown",
                    unlockedTile: "SteelDoorOpen",
                    whitelistMemberNumbers: "not an array",
                },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            const result =
                KeypadBackwardCompatibility.validateLegacyConfig(location);

            expect(result.valid).toBe(false);
        });
    });

    describe("Migration Statistics", () => {
        it("should generate migration stats", () => {
            const locations: VeratownLocationDoc[] = [
                {
                    key: "cell_1",
                    name: "Cell 1",
                    type: "keypad_door",
                    x: 10,
                    y: 20,
                    enabled: true,
                    data: {
                        lockedTile: "MetalDown",
                        unlockedTile: "SteelDoorOpen",
                        whitelistMemberNumbers: [111, 222],
                        memberNumbers: [111, 222, 333],
                    },
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
                {
                    key: "cell_2",
                    name: "Cell 2",
                    type: "keypad_door",
                    x: 15,
                    y: 25,
                    enabled: true,
                    data: {
                        lockedTile: "MetalDown",
                        unlockedTile: "SteelDoorOpen",
                        whitelistMemberNumbers: [444, 555],
                    },
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            const stats =
                KeypadBackwardCompatibility.generateMigrationStats(locations);

            expect(stats.totalLocations).toBe(2);
            expect(stats.doorsToCreate).toBe(2);
            expect(stats.totalMembers).toBe(4); // 111, 222, 333, 444, 555 unique
        });
    });
});
