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
import { test } from "node:test";
import { CommandParser } from "bc-bot";
import { Dare } from "../dare";
import { GamePluginCommandRouterImpl } from "../shared/gamePluginCommandRouter";

type MessageListener = (event: unknown) => void;

class MockConnection {
    public readonly listeners = new Map<string, MessageListener[]>();
    public readonly sentMessages: Array<{ type: string; content: string }> = [];

    public on(event: string, listener: MessageListener): void {
        const listeners = this.listeners.get(event) ?? [];
        listeners.push(listener);
        this.listeners.set(event, listeners);
    }

    public SendMessage(type: string, content: string): void {
        this.sentMessages.push({ type, content });
    }

    public reply(): void {}

    public emitMessage(content: string, type: string): void {
        const event = {
            message: { Content: content, Type: type },
            sender: { MemberNumber: 123 },
        };
        for (const listener of this.listeners.get("Message") ?? []) {
            listener(event);
        }
    }
}

const flushCommands = (): Promise<void> =>
    new Promise((resolve) => setImmediate(resolve));

test("Dare registers and dispatches its root command through both command syntaxes", async () => {
    const connection = new MockConnection();
    const parser = new CommandParser(connection as any);
    const dare = new Dare(
        connection as any,
        parser,
        { getEventBus: () => ({}) } as any,
        undefined,
        { loadState: async () => undefined } as any,
        undefined,
        {} as any,
    );
    const registeredCommands = (parser as any).commands as Map<string, unknown>;

    assert.deepEqual([...registeredCommands.keys()].sort(), [
        "dare",
        "dare pick",
    ]);

    connection.emitMessage("!dare unknown", "Whisper");
    connection.emitMessage("ChatRoomBot dare unknown", "Hidden");
    await flushCommands();
    assert.equal(
        connection.sentMessages.filter(({ content }) =>
            content.includes("Usage: !dare <join|leave|start|turn|draw"),
        ).length,
        2,
    );

    const routedCommands: string[][] = [];
    dare.onDare = async (_sender, _message, args) => {
        routedCommands.push(args);
    };
    dare.registerCommands(new GamePluginCommandRouterImpl(parser, dare.key));

    const subcommands = [
        "help",
        "join",
        "leave",
        "start",
        "draw",
        "pass",
        "forfeit",
        "players",
    ];
    for (const subcommand of subcommands) {
        connection.emitMessage(`!dare ${subcommand}`, "Whisper");
        connection.emitMessage(`ChatRoomBot dare ${subcommand}`, "Hidden");
    }
    connection.emitMessage("!dare unknown", "Whisper");

    await flushCommands();

    assert.deepEqual(routedCommands, [
        ...subcommands.flatMap((subcommand) => [[subcommand], [subcommand]]),
        ["unknown"],
    ]);
});
