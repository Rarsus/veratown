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

import { test } from "node:test";
import * as assert from "node:assert/strict";
import { CasinoBioManager } from "../bioManager";

// Player type for testing (simplified - actual type not exported)
type Player = any;

// ============================================================================
// CasinoBioManager: Bio Building
// ============================================================================

test("CasinoBioManager: buildBio includes welcome section", () => {
    const manager = new CasinoBioManager();
    const bio = manager.buildBio("", "Example", "Help");

    assert.ok(bio.includes("🎰🎰🎰 Welcome to the Veratown Casino!"));
});

test("CasinoBioManager: buildBio includes daily chips info", () => {
    const manager = new CasinoBioManager();
    const bio = manager.buildBio("", "Example", "Help");

    assert.ok(
        bio.includes(
            "All visitors will automatically ber awarded 20 chips every day!",
        ),
    );
});

test("CasinoBioManager: buildBio includes example string", () => {
    const manager = new CasinoBioManager();
    const exampleString = "Example: /bot bet 50 red";
    const bio = manager.buildBio("", exampleString, "Help");

    assert.ok(bio.includes(exampleString));
});

test("CasinoBioManager: buildBio includes help message", () => {
    const manager = new CasinoBioManager();
    const helpString = "To play: send /bot bet amount";
    const bio = manager.buildBio("", "Example", helpString);

    assert.ok(bio.includes(helpString));
});

test("CasinoBioManager: buildBio includes leaderboard section", () => {
    const manager = new CasinoBioManager();
    const leaderboard = "1. Player One (12345): 1000 chips won";
    const bio = manager.buildBio(leaderboard, "Example", "Help");

    assert.ok(bio.includes("🏆 Leaderboard"));
    assert.ok(bio.includes(leaderboard));
});

test("CasinoBioManager: buildBio includes forfeit table section", () => {
    const manager = new CasinoBioManager();
    const bio = manager.buildBio("", "Example", "Help");

    assert.ok(bio.includes("🪢 Forfeit Table"));
});

test("CasinoBioManager: buildBio includes shop section", () => {
    const manager = new CasinoBioManager();
    const bio = manager.buildBio("", "Example", "Help");

    assert.ok(bio.includes("🛒 Shop"));
    assert.ok(bio.includes("Restraint removal:"));
});

test("CasinoBioManager: buildBio includes github link", () => {
    const manager = new CasinoBioManager();
    const bio = manager.buildBio("", "Example", "Help");

    assert.ok(bio.includes("https://github.com/FriendsOfBC/ropeybot"));
});

test("CasinoBioManager: buildBio handles empty leaderboard", () => {
    const manager = new CasinoBioManager();
    const bio = manager.buildBio("", "Example", "Help");

    assert.ok(typeof bio === "string");
    assert.ok(bio.length > 100);
});

test("CasinoBioManager: buildBio handles multiline content", () => {
    const manager = new CasinoBioManager();
    const multilineExample = "Example 1: /bot bet 50\nExample 2: /bot bet gag";
    const bio = manager.buildBio("", multilineExample, "Help");

    assert.ok(bio.includes(multilineExample));
});

// ============================================================================
// CasinoBioManager: Leaderboard Formatting
// ============================================================================

test("CasinoBioManager: formatLeaderboard returns empty string for empty array", () => {
    const manager = new CasinoBioManager();
    const leaderboard = manager.formatLeaderboard([]);

    assert.strictEqual(leaderboard, "");
});

test("CasinoBioManager: formatLeaderboard formats single player", () => {
    const manager = new CasinoBioManager();
    const player: Player = {
        memberNumber: 12345,
        name: "Alice",
        credits: 100,
        score: 1000,
        lastFreeCredits: 0,
        cheatStrikes: 0,
    };

    const leaderboard = manager.formatLeaderboard([player]);

    assert.strictEqual(leaderboard, "1. Alice (12345): 1000 chips won");
});

test("CasinoBioManager: formatLeaderboard formats multiple players with correct numbering", () => {
    const manager = new CasinoBioManager();
    const players: Player[] = [
        {
            memberNumber: 111,
            name: "Alice",
            credits: 100,
            score: 1000,
            lastFreeCredits: 0,
            cheatStrikes: 0,
        },
        {
            memberNumber: 222,
            name: "Bob",
            credits: 50,
            score: 900,
            lastFreeCredits: 0,
            cheatStrikes: 0,
        },
        {
            memberNumber: 333,
            name: "Charlie",
            credits: 200,
            score: 800,
            lastFreeCredits: 0,
            cheatStrikes: 0,
        },
    ];

    const leaderboard = manager.formatLeaderboard(players);
    const lines = leaderboard.split("\n");

    assert.strictEqual(lines.length, 3);
    assert.ok(lines[0].startsWith("1. Alice"));
    assert.ok(lines[1].startsWith("2. Bob"));
    assert.ok(lines[2].startsWith("3. Charlie"));
});

test("CasinoBioManager: formatLeaderboard includes all player info", () => {
    const manager = new CasinoBioManager();
    const player: Player = {
        memberNumber: 99999,
        name: "TestPlayer",
        credits: 500,
        score: 5000,
        lastFreeCredits: 0,
        cheatStrikes: 0,
    };

    const leaderboard = manager.formatLeaderboard([player]);

    assert.ok(leaderboard.includes("TestPlayer"));
    assert.ok(leaderboard.includes("99999"));
    assert.ok(leaderboard.includes("5000"));
});

test("CasinoBioManager: formatLeaderboard handles large scores", () => {
    const manager = new CasinoBioManager();
    const player: Player = {
        memberNumber: 12345,
        name: "HighRoller",
        credits: 10000,
        score: 999999,
        lastFreeCredits: 0,
        cheatStrikes: 0,
    };

    const leaderboard = manager.formatLeaderboard([player]);

    assert.ok(leaderboard.includes("999999"));
});

test("CasinoBioManager: formatLeaderboard preserves order", () => {
    const manager = new CasinoBioManager();
    const players: Player[] = [
        {
            memberNumber: 1,
            name: "First",
            credits: 100,
            score: 1000,
            lastFreeCredits: 0,
            cheatStrikes: 0,
        },
        {
            memberNumber: 2,
            name: "Second",
            credits: 100,
            score: 900,
            lastFreeCredits: 0,
            cheatStrikes: 0,
        },
        {
            memberNumber: 3,
            name: "Third",
            credits: 100,
            score: 800,
            lastFreeCredits: 0,
            cheatStrikes: 0,
        },
    ];

    const leaderboard = manager.formatLeaderboard(players);

    assert.ok(leaderboard.indexOf("First") < leaderboard.indexOf("Second"));
    assert.ok(leaderboard.indexOf("Second") < leaderboard.indexOf("Third"));
});

// ============================================================================
// CasinoBioManager: Individual Line Formatting
// ============================================================================

test("CasinoBioManager: formatLeaderboardLine formats with default position", () => {
    const manager = new CasinoBioManager();
    const player: Player = {
        memberNumber: 12345,
        name: "Alice",
        credits: 100,
        score: 1000,
        lastFreeCredits: 0,
        cheatStrikes: 0,
    };

    const line = manager.formatLeaderboardLine(player);

    assert.strictEqual(line, "1. Alice (12345): 1000 chips won");
});

test("CasinoBioManager: formatLeaderboardLine formats with custom position", () => {
    const manager = new CasinoBioManager();
    const player: Player = {
        memberNumber: 54321,
        name: "Bob",
        credits: 50,
        score: 500,
        lastFreeCredits: 0,
        cheatStrikes: 0,
    };

    const line = manager.formatLeaderboardLine(player, 5);

    assert.ok(line.startsWith("5. Bob"));
});

test("CasinoBioManager: formatLeaderboardLine includes member number in parentheses", () => {
    const manager = new CasinoBioManager();
    const player: Player = {
        memberNumber: 77777,
        name: "TestName",
        credits: 100,
        score: 100,
        lastFreeCredits: 0,
        cheatStrikes: 0,
    };

    const line = manager.formatLeaderboardLine(player, 1);

    assert.ok(line.includes("(77777)"));
});

test("CasinoBioManager: formatLeaderboardLine includes score with chips label", () => {
    const manager = new CasinoBioManager();
    const player: Player = {
        memberNumber: 12345,
        name: "Player",
        credits: 100,
        score: 2500,
        lastFreeCredits: 0,
        cheatStrikes: 0,
    };

    const line = manager.formatLeaderboardLine(player, 1);

    assert.ok(line.includes("2500 chips won"));
});

test("CasinoBioManager: formatLeaderboardLine handles special characters in name", () => {
    const manager = new CasinoBioManager();
    const player: Player = {
        memberNumber: 12345,
        name: "Alice & Friends",
        credits: 100,
        score: 1000,
        lastFreeCredits: 0,
        cheatStrikes: 0,
    };

    const line = manager.formatLeaderboardLine(player, 1);

    assert.ok(line.includes("Alice & Friends"));
});

test("CasinoBioManager: formatLeaderboardLine handles high position numbers", () => {
    const manager = new CasinoBioManager();
    const player: Player = {
        memberNumber: 12345,
        name: "Player",
        credits: 100,
        score: 1000,
        lastFreeCredits: 0,
        cheatStrikes: 0,
    };

    const line = manager.formatLeaderboardLine(player, 999);

    assert.ok(line.startsWith("999."));
});

test("CasinoBioManager: formatLeaderboardLine handles zero score", () => {
    const manager = new CasinoBioManager();
    const player: Player = {
        memberNumber: 12345,
        name: "NewPlayer",
        credits: 100,
        score: 0,
        lastFreeCredits: 0,
        cheatStrikes: 0,
    };

    const line = manager.formatLeaderboardLine(player, 1);

    assert.strictEqual(line, "1. NewPlayer (12345): 0 chips won");
});

// ============================================================================
// CasinoBioManager: Integration Scenarios
// ============================================================================

test("CasinoBioManager: Integration - Build complete bio with leaderboard", () => {
    const manager = new CasinoBioManager();
    const players: Player[] = [
        {
            memberNumber: 111,
            name: "Winner",
            credits: 1000,
            score: 5000,
            lastFreeCredits: 0,
            cheatStrikes: 0,
        },
        {
            memberNumber: 222,
            name: "SecondPlace",
            credits: 500,
            score: 3000,
            lastFreeCredits: 0,
            cheatStrikes: 0,
        },
    ];

    const leaderboard = manager.formatLeaderboard(players);
    const bio = manager.buildBio(
        leaderboard,
        "Example: /bot bet 100",
        "Play by sending commands",
    );

    assert.ok(bio.includes("Winner"));
    assert.ok(bio.includes("SecondPlace"));
    assert.ok(bio.includes("Example: /bot bet 100"));
    assert.ok(bio.includes("Play by sending commands"));
});

test("CasinoBioManager: Integration - Bio generation with empty leaderboard", () => {
    const manager = new CasinoBioManager();
    const leaderboard = manager.formatLeaderboard([]);
    const bio = manager.buildBio(leaderboard, "Example", "Help");

    assert.ok(typeof bio === "string");
    assert.ok(bio.includes("🏆 Leaderboard"));
    // Should have empty leaderboard section but still valid
    assert.ok(bio.length > 500);
});

test("CasinoBioManager: Integration - Large leaderboard formatting", () => {
    const manager = new CasinoBioManager();
    const players: Player[] = [];

    // Create 50 players
    for (let i = 1; i <= 50; i++) {
        players.push({
            memberNumber: 10000 + i,
            name: `Player${i}`,
            credits: 100,
            score: 5000 - i * 50,
            lastFreeCredits: 0,
            cheatStrikes: 0,
        });
    }

    const leaderboard = manager.formatLeaderboard(players);
    const lines = leaderboard.split("\n");

    assert.strictEqual(lines.length, 50);
    assert.ok(lines[0].includes("Player1"));
    assert.ok(lines[49].includes("Player50"));
});

test("CasinoBioManager: Integration - Bio remains consistent format", () => {
    const manager = new CasinoBioManager();

    const bio1 = manager.buildBio("", "Example1", "Help1");
    const bio2 = manager.buildBio("", "Example2", "Help2");

    // Both should have same structure sections
    assert.ok(bio1.includes("🎰🎰🎰 Welcome to the Veratown Casino!"));
    assert.ok(bio2.includes("🎰🎰🎰 Welcome to the Veratown Casino!"));

    assert.ok(bio1.includes("🏆 Leaderboard"));
    assert.ok(bio2.includes("🏆 Leaderboard"));

    assert.ok(bio1.includes("🛒 Shop"));
    assert.ok(bio2.includes("🛒 Shop"));
});
