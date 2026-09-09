import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
    assignConfiguredRoles,
    getKidnappersConfiguration,
} from "../kidnappersGameRules";
import type { KidnappersPlayerState } from "../kidnappersGameTypes";

function players(count: number): KidnappersPlayerState[] {
    return Array.from({ length: count }, (_, index) => ({
        memberNumber: index + 1,
        memberName: `Player${index + 1}`,
        role: null,
        status: "active" as const,
        joinedAt: 0,
    }));
}

describe("KidnappersGameRules", () => {
    test("selects the legacy role configuration for every supported player count", () => {
        assert.deepEqual(
            getKidnappersConfiguration(5),
            getKidnappersConfiguration(6),
        );
        assert.equal(getKidnappersConfiguration(7).fan, 1);
        assert.equal(getKidnappersConfiguration(8).kidnapper, 2);
        assert.equal(getKidnappersConfiguration(8).masochist, 1);
        assert.equal(getKidnappersConfiguration(9).mistress, 1);
        assert.equal(getKidnappersConfiguration(9).firstNightKidnapping, false);
    });

    test("assigns exactly the configured roles and fills remaining seats as bystanders", () => {
        const configuration = getKidnappersConfiguration(8);
        const assignment = assignConfiguredRoles(
            players(8),
            configuration,
            () => 0,
        );
        const counts = new Map<string, number>();
        for (const role of assignment.values()) {
            counts.set(role, (counts.get(role) ?? 0) + 1);
        }
        assert.equal(counts.get("kidnapper"), 2);
        assert.equal(counts.get("maid"), 1);
        assert.equal(counts.get("mistress"), 1);
        assert.equal(counts.get("masochist"), 1);
        assert.equal(counts.get("bystander") ?? 0, 3);
    });
});
