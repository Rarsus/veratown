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

import assert from "node:assert/strict";
import test from "node:test";
import type { CommandInteraction, CacheType } from "discord.js";
import type { Db } from "mongodb";
import {
    handlePlayerListCommand,
    handlePlayerInfoCommand,
    handlePlayerBlacklistCommand,
} from "../commands/playerManagement";
import {
    handleBotStatusCommand,
    handleDiagnosticsCommand,
    handleLogsCommand,
} from "../commands/diagnostics";
import {
    handleCharacterInfoCommand,
    handleActivePlayersCommand,
    handleCharacterSearchCommand,
} from "../commands/characterInfo";
import {
    handleBotRestartCommand,
    handleBotStopCommand,
} from "../commands/botControl";
import type { CommandContext, CommandResult } from "../types";

/**
 * Mock CommandInteraction for testing
 */
function createMockInteraction(
    overrides: Partial<CommandInteraction> = {},
): CommandInteraction {
    return {
        commandName: "test",
        user: {
            id: "test-user-id",
            username: "testuser",
            bot: false,
            system: false,
            flags: null as any,
            avatar: null,
            avatarDecorationData: null,
            banner: null,
            accentColor: null,
            discriminator: "0",
            publicFlags: null as any,
            locale: "en-US",
            mfaEnabled: false,
            verified: false,
            email: null,
            premiumType: null,
            defaultAvatarURL: "https://example.com/avatar.png",
            avatarURL: () => "https://example.com/avatar.png",
            displayAvatarURL: () => "https://example.com/avatar.png",
            createDM: async () =>
                ({ id: "test-dm", send: async () => undefined }) as any,
            isDMChannel: () => false,
            isWeb: () => false,
            fetch: async () => undefined as any,
            toString: () => "@testuser",
            equals: () => false,
        } as any,
        member: {
            id: "test-user-id",
            guild: { id: "test-guild-id" } as any,
            roles: {
                cache: {
                    has: (id: string) => false,
                    get: () => undefined,
                    size: 0,
                    some: (fn: (role: any) => boolean) => false,
                    toJSON: () => [],
                    [Symbol.iterator]: function* () {
                        yield;
                    },
                } as any,
            },
            user: undefined,
            nickname: null,
            avatar: null,
            joinedTimestamp: Date.now(),
            premiumSinceTimestamp: null,
            displayName: "testuser",
            displayHexColor: "#000000",
            avatarURL: () => "https://example.com/avatar.png",
        } as any,
        guildId: "test-guild-id",
        guild: { id: "test-guild-id" } as any,
        inGuild: () => true,
        isCommand: () => true,
        isChatInputCommand: () => true,
        deferReply: async () => ({}) as any,
        reply: async () => ({}) as any,
        editReply: async () => ({}) as any,
        followUp: async () => ({}) as any,
        responded: false,
        deferred: false,
        replied: false,
        options: {
            getInteger: (name: string) => 10,
            getString: (name: string) =>
                name === "action" ? "add" : `test-${name}`,
        } as any,
        ...overrides,
    } as any as CommandInteraction<CacheType>;
}

/**
 * Mock database for testing
 */
function createMockDb(): Partial<Db> {
    return {
        collection: () => ({
            find: () => ({
                limit: () => ({
                    sort: () => ({
                        toArray: async () => [],
                    }),
                }),
            }),
            findOne: async () => null,
            updateOne: async () => ({ modifiedCount: 0 }),
            insertOne: async () => ({ insertedId: "test-id" }),
        }),
        admin: () => ({
            ping: async () => ({}),
        }),
    } as any as Partial<Db>;
}

/**
 * Create a test command context
 */
function createCommandContext(
    overrides: Partial<CommandContext> = {},
): CommandContext {
    return {
        db: createMockDb() as Db,
        userId: "test-user-id",
        guildId: "test-guild-id",
        isAdmin: false,
        ...overrides,
    };
}

test("Command handlers return CommandResult with success flag", async () => {
    const interaction = createMockInteraction();
    const context = createCommandContext();

    // Test all command handlers return CommandResult
    const handlers = [
        handlePlayerListCommand,
        handlePlayerInfoCommand,
        handleBotStatusCommand,
        handleDiagnosticsCommand,
        handleLogsCommand,
        handleCharacterInfoCommand,
        handleActivePlayersCommand,
        handleCharacterSearchCommand,
        handleBotRestartCommand,
        handleBotStopCommand,
    ];

    for (const handler of handlers) {
        const result = await (handler as any)(interaction, context);
        assert(
            typeof result === "object",
            `${handler.name} should return an object`,
        );
        assert(
            typeof result.success === "boolean",
            `${handler.name} should return success boolean`,
        );
        assert(
            typeof result.message === "string",
            `${handler.name} should return message string`,
        );
    }
});

test("Admin-only commands return permission denied for non-admin users", async () => {
    const interaction = createMockInteraction();
    const context = createCommandContext({ isAdmin: false });

    const adminHandlers = [
        handlePlayerListCommand,
        handlePlayerBlacklistCommand,
        handleDiagnosticsCommand,
        handleLogsCommand,
        handleBotRestartCommand,
        handleBotStopCommand,
    ];

    for (const handler of adminHandlers) {
        const result = await handler(interaction, context);
        assert(
            result.success === false || result.message.includes("permission"),
            `${handler.name} should deny non-admin users`,
        );
    }
});

test("Admin-only commands succeed for admin users", async () => {
    const interaction = createMockInteraction();
    const context = createCommandContext({ isAdmin: true });

    const adminHandlers = [
        handlePlayerListCommand,
        handlePlayerBlacklistCommand,
        handleDiagnosticsCommand,
        handleLogsCommand,
    ];

    for (const handler of adminHandlers) {
        const result = await handler(interaction, context);
        // Should not deny permission (may fail for other reasons like missing data)
        assert(
            !result.message.includes("permission"),
            `${handler.name} should allow admin users`,
        );
    }
});

test("Public commands work without admin privileges", async () => {
    const interaction = createMockInteraction();
    const context = createCommandContext({ isAdmin: false });

    const publicHandlers = [
        handleBotStatusCommand,
        handleCharacterInfoCommand,
        handleActivePlayersCommand,
        handleCharacterSearchCommand,
    ];

    for (const handler of publicHandlers) {
        const result = await (handler as any)(interaction, context);
        // Should not deny permission
        assert(
            !result.message.includes("permission"),
            `${handler.name} should be public`,
        );
    }
});

test("Commands handle missing interaction options gracefully", async () => {
    const interaction = createMockInteraction({
        options: {
            getInteger: () => null,
            getString: () => null,
        } as any,
    } as any);
    const context = createCommandContext();

    // Commands with required parameters should fail gracefully
    const result = await handleCharacterInfoCommand(interaction, context);
    assert(result.success === false, "Should fail with missing character name");
});

test("Command context includes correct user and guild info", () => {
    const context = createCommandContext({
        userId: "user-123",
        guildId: "guild-456",
        isAdmin: true,
    });

    assert.equal(context.userId, "user-123");
    assert.equal(context.guildId, "guild-456");
    assert.equal(context.isAdmin, true);
});

test("formatResultAsEmbed handles success and error results", async () => {
    const { formatResultAsEmbed } = await import("../utils/discordHelpers.js");

    const successResult: CommandResult = {
        success: true,
        message: "Test success",
        data: { test: "data" },
    };

    const errorResult: CommandResult = {
        success: false,
        message: "Test error",
        error: new Error("Test error"),
    };

    const successEmbed = formatResultAsEmbed(successResult);
    const errorEmbed = formatResultAsEmbed(errorResult);

    assert(successEmbed, "Success result should produce an embed");
    assert(errorEmbed, "Error result should produce an embed");
    assert.equal(
        successEmbed.data.color,
        0x00ff00,
        "Success embed should be green",
    );
    assert.equal(errorEmbed.data.color, 0xff0000, "Error embed should be red");
});
