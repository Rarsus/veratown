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

import * as assert from "node:assert/strict";
import { mock, test } from "node:test";
import { CommandParser } from "bc-bot";
import { Casino } from "../casino";
import { GamePluginCommandRouterImpl } from "../shared/gamePluginCommandRouter";

type MessageListener = (event: unknown) => void;

class MockConnection {
    public readonly listeners = new Map<string, MessageListener[]>();
    public readonly replies: string[] = [];
    public isAdmin = true;

    public on(event: string, listener: MessageListener): void {
        const listeners = this.listeners.get(event) ?? [];
        listeners.push(listener);
        this.listeners.set(event, listeners);
    }

    public reply(_message?: unknown, text?: string): void {
        if (text) this.replies.push(text);
    }

    public emitMessage(content: string, type: string): void {
        const event = {
            message: { Content: content, Type: type },
            sender: {
                MemberNumber: 123,
                IsRoomAdmin: () => this.isAdmin,
            },
        };
        for (const listener of this.listeners.get("Message") ?? []) {
            listener(event);
        }
    }
}

const flushCommands = (): Promise<void> =>
    new Promise((resolve) => setImmediate(resolve));

test("Casino registers its commands at the plugin root", async () => {
    const connection = new MockConnection();
    const parser = new CommandParser(connection as any);
    const routedCommands: string[][] = [];
    const casinoCommandHandlers: Record<
        string,
        (sender: unknown, message: unknown, args: string[]) => Promise<void>
    > = {
        game: async (_sender: unknown, _message: unknown, args: string[]) => {
            routedCommands.push(args);
        },
    };
    const casino = {
        routeCasinoCommand:
            (command: string) =>
            async (sender: unknown, message: unknown, args: string[]) => {
                await casinoCommandHandlers[command](sender, message, args);
            },
        casinoCommandHandlers,
    };

    Casino.prototype.registerCommands.call(
        casino as any,
        new GamePluginCommandRouterImpl(parser, "casino"),
    );

    assert.deepEqual(
        [...((parser as any).commands as Map<string, unknown>).keys()],
        ["casino", "game"],
    );

    connection.emitMessage("!casino game blackjack", "Whisper");
    connection.emitMessage("ChatRoomBot casino game roulette", "Hidden");
    await flushCommands();

    assert.deepEqual(routedCommands, [["blackjack"], ["roulette"]]);
});

test("Casino registers documented root commands for both active game modes", async () => {
    mock.timers.enable();
    try {
        for (const game of ["roulette", "blackjack"] as const) {
            const connection = new MockConnection() as any;
            Object.assign(connection, {
                setItemPermission: () => {},
                Player: {
                    Name: "Casino",
                    MemberNumber: 1,
                    Appearance: {
                        AddItem: () => ({ setProperty: () => {} }),
                        InventoryGet: () => null,
                    },
                    setScriptPermissions: () => {},
                },
                SendMessage: () => {},
            });
            const casino = new Casino(
                connection,
                { collection: () => ({}) } as any,
                { game },
            );
            (casino as any).unifiedStore.getProfile = async () => ({
                _id: 123,
                name: "Player",
                casino: { chips: 100 },
            });

            const commands = (casino as any).commandParser.commands as Map<
                string,
                unknown
            >;
            for (const command of [
                "cancel",
                "chips",
                "give",
                "help",
                "commands",
                "forfeits",
            ]) {
                assert.ok(
                    commands.has(command),
                    `${game} should register ${command}`,
                );
            }
            assert.equal(commands.has("casino casino"), false);

            connection.emitMessage("!cancel", "Whisper");
            connection.emitMessage("!chips", "Whisper");
            connection.emitMessage("!give", "Whisper");
            connection.emitMessage("!help", "Whisper");
            connection.emitMessage("!commands", "Whisper");
            connection.emitMessage("ChatRoomBot forfeits", "Hidden");
            await Promise.resolve();
            await Promise.resolve();

            assert.equal(
                connection.replies.some((reply: string) =>
                    reply.includes("Unknown command"),
                ),
                false,
                `${game} root commands should dispatch`,
            );
        }
    } finally {
        mock.timers.reset();
    }
});

test("Casino dispatches the documented root-level game command", async () => {
    mock.timers.enable();
    try {
        const connection = new MockConnection() as any;
        Object.assign(connection, {
            setItemPermission: () => {},
            Player: {
                Name: "Casino",
                MemberNumber: 1,
                Appearance: {
                    AddItem: () => ({ setProperty: () => {} }),
                    InventoryGet: () => null,
                },
                setScriptPermissions: () => {},
            },
            SendMessage: () => {},
        });
        const database = {
            collection: () => ({}),
        };
        const casino = new Casino(connection, database as any);
        const commands = (casino as any).commandParser.commands as Map<
            string,
            unknown
        >;

        assert.ok(commands.has("game"));

        connection.isAdmin = false;
        connection.emitMessage("!game blackjack", "Whisper");
        await Promise.resolve();
        assert.deepEqual(connection.replies, [
            "Sorry, you need to be an admin",
        ]);

        connection.isAdmin = true;
        connection.emitMessage("!game poker", "Whisper");
        await Promise.resolve();
        assert.deepEqual(connection.replies, [
            "Sorry, you need to be an admin",
            "Unknown game: poker",
        ]);
    } finally {
        mock.timers.reset();
    }
});
