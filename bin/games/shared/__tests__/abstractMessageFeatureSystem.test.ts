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

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import type {
    API_Character,
    BC_Server_ChatRoomMessage,
    API_Connector,
} from "bc-bot";
import {
    AbstractMessageFeatureSystem,
    type ParsedCommand,
    type PermissionCheckResult,
} from "../abstractMessageFeatureSystem";
import { CommandSystemMessageFeatureSystem } from "../commandSystemMessageFeatureSystem";

/**
 * Mock concrete implementation for testing
 */
class TestMessageFeatureSystem extends AbstractMessageFeatureSystem {
    private _enabled = true;
    public handledCommands: Map<string, ParsedCommand> = new Map();

    constructor(conn: API_Connector) {
        super(conn, "test", "Test Feature");
    }

    setEnabled(enabled: boolean): void {
        this._enabled = enabled;
    }

    protected isEnabled(): boolean {
        return this._enabled;
    }

    protected async handleCommand(
        _sender: API_Character,
        parsed: ParsedCommand,
    ): Promise<void> {
        this.handledCommands.set(parsed.command, parsed);

        if (parsed.command === "error") {
            throw new Error("Test error");
        }
    }
}

/**
 * Mock concrete implementation for testing permission checks
 */
class AdminOnlyFeatureSystem extends AbstractMessageFeatureSystem {
    protected isEnabled(): boolean {
        return true;
    }

    protected validateUserPermission(
        sender: API_Character,
        _args: string[],
    ): PermissionCheckResult {
        return this.requireAdmin(sender);
    }

    protected async handleCommand(
        _sender: API_Character,
        parsed: ParsedCommand,
    ): Promise<void> {
        // Just echo the command
        await this.sendMessage(1, `Handled: ${parsed.command}`);
    }
}

class CommandFeatureSystem extends CommandSystemMessageFeatureSystem {
    public calls: string[][] = [];

    constructor(conn: API_Connector, commandParser: any) {
        super(conn, commandParser, "commands", "Command Feature", () => true);
    }

    public addCommand(
        command: string,
        handler: (
            sender: API_Character,
            msg: BC_Server_ChatRoomMessage,
            args: string[],
        ) => Promise<void>,
    ): void {
        this.registerCommand(command, handler);
    }
}

/**
 * Mock API_Character
 */
function createMockCharacter(
    memberNumber: number = 123,
    isAdmin: boolean = false,
): API_Character {
    return {
        MemberNumber: memberNumber,
        IsRoomAdmin: () => isAdmin,
        Name: `Character${memberNumber}`,
        Appearance: {},
    } as unknown as API_Character;
}

/**
 * Mock BC_Server_ChatRoomMessage
 */
function createMockMessage(): BC_Server_ChatRoomMessage {
    return {
        Type: "Chat",
        Content: "test",
    } as unknown as BC_Server_ChatRoomMessage;
}

/**
 * Mock API_Connector
 */
function createMockConnector(): API_Connector {
    const messages: Array<{
        type: string;
        text: string;
        memberNumber?: number;
    }> = [];

    return {
        SendMessage: (type: string, text: string, memberNumber?: number) => {
            messages.push({ type, text, memberNumber });
        },
        chatRoom: {
            characters: [],
            map: { mapData: null },
        },
        on: () => {
            /* mock */
        },
        getMessages: () => messages,
        clearMessages: () => {
            messages.length = 0;
        },
    } as unknown as API_Connector;
}

describe("AbstractMessageFeatureSystem", () => {
    let system: TestMessageFeatureSystem;
    let adminSystem: AdminOnlyFeatureSystem;
    let connector: API_Connector;

    beforeEach(() => {
        connector = createMockConnector();
        system = new TestMessageFeatureSystem(connector);
        adminSystem = new AdminOnlyFeatureSystem(
            connector,
            "admin-test",
            "Admin Test Feature",
        );
    });

    describe("CommandSystemMessageFeatureSystem", () => {
        it("runs a registered handler once after base validation", async () => {
            const connector = createMockConnector();
            let registeredHandler:
                | ((
                      sender: API_Character,
                      msg: BC_Server_ChatRoomMessage,
                      args: string[],
                  ) => Promise<void>)
                | undefined;
            const parser = {
                register: (
                    _command: string,
                    handler: (
                        sender: API_Character,
                        msg: BC_Server_ChatRoomMessage,
                        args: string[],
                    ) => Promise<void>,
                ) => {
                    registeredHandler = handler;
                },
            };
            const system = new CommandFeatureSystem(connector, parser);
            system.addCommand("echo", async (_sender, _msg, args) => {
                system.calls.push(args);
            });

            await registeredHandler!(
                createMockCharacter(),
                createMockMessage(),
                ["one", "two"],
            );

            assert.deepStrictEqual(system.calls, [["one", "two"]]);
        });
    });

    describe("processMessage", () => {
        it("should send disabled message when system is disabled", async () => {
            system.setEnabled(false);
            const sender = createMockCharacter(123, false);
            const msg = createMockMessage();

            await system.processMessage(sender, msg, ["help"]);

            const messages = (connector as any).getMessages();
            assert.strictEqual(messages.length, 1);
            assert(messages[0].text.includes("disabled"));
        });

        it("should process enabled message with valid command", async () => {
            system.setEnabled(true);
            const sender = createMockCharacter(123, false);
            const msg = createMockMessage();

            await system.processMessage(sender, msg, ["help"]);

            assert.strictEqual(system.handledCommands.size, 1);
            assert(system.handledCommands.has("help"));
        });

        it("should reject commands when permission check fails", async () => {
            const sender = createMockCharacter(123, false); // Not admin
            const msg = createMockMessage();

            await adminSystem.processMessage(sender, msg, ["help"]);

            const messages = (connector as any).getMessages();
            assert(
                messages.some((m: { text: string }) =>
                    m.text.includes("admin"),
                ),
            );
        });

        it("should allow commands when permission check passes", async () => {
            const sender = createMockCharacter(123, true); // Is admin
            const msg = createMockMessage();

            // Override handleCommand to track execution
            let handled = false;
            const original = adminSystem["handleCommand"];
            (adminSystem as any).handleCommand = async () => {
                handled = true;
            };

            await adminSystem.processMessage(sender, msg, ["help"]);

            assert.strictEqual(handled, true);

            // Restore
            (adminSystem as any).handleCommand = original;
        });

        it("should handle errors from handler", async () => {
            system.setEnabled(true);
            const sender = createMockCharacter(123, false);
            const msg = createMockMessage();

            await system.processMessage(sender, msg, ["error"]);

            const messages = (connector as any).getMessages();
            assert(
                messages.some((m: { text: string }) =>
                    m.text.includes("Error"),
                ),
            );
        });

        it("should pass empty args when no arguments provided", async () => {
            system.setEnabled(true);
            const sender = createMockCharacter(123, false);
            const msg = createMockMessage();

            await system.processMessage(sender, msg, []);

            // Should still try to process with empty command
            const messages = (connector as any).getMessages();
            assert.strictEqual(messages.length, 1);
        });
    });

    describe("parseCommand", () => {
        it("should parse single command with no args", () => {
            const result = system["parseCommand"](["help"]);

            assert.strictEqual(result.command, "help");
            assert.deepStrictEqual(result.args, []);
        });

        it("should parse command with multiple args", () => {
            const result = system["parseCommand"](["add", "item", "value"]);

            assert.strictEqual(result.command, "add");
            assert.deepStrictEqual(result.args, ["item", "value"]);
        });

        it("should lowercase command name", () => {
            const result = system["parseCommand"](["HELP", "arg"]);

            assert.strictEqual(result.command, "help");
            assert.deepStrictEqual(result.args, ["arg"]);
        });

        it("should handle empty args array", () => {
            const result = system["parseCommand"]([]);

            assert.strictEqual(result.command, "");
            assert.deepStrictEqual(result.args, []);
        });
    });

    describe("validateUserPermission", () => {
        it("should allow all users by default", () => {
            const sender = createMockCharacter(123, false);
            const result = system["validateUserPermission"](sender, []);

            assert.strictEqual(result.allowed, true);
        });

        it("should deny non-admins when admin required", () => {
            const sender = createMockCharacter(123, false);
            const result = adminSystem["validateUserPermission"](sender, []);

            assert.strictEqual(result.allowed, false);
            assert(result.reason?.includes("admin"));
        });

        it("should allow admins when admin required", () => {
            const sender = createMockCharacter(123, true);
            const result = adminSystem["validateUserPermission"](sender, []);

            assert.strictEqual(result.allowed, true);
        });
    });

    describe("validateCommand", () => {
        it("should reject empty commands", () => {
            const sender = createMockCharacter();
            const parsed = { command: "", args: [] };
            const result = system["validateCommand"](parsed, sender);

            assert.strictEqual(result.valid, false);
            assert(result.message?.includes("No command"));
        });

        it("should accept valid commands", () => {
            const sender = createMockCharacter();
            const parsed = { command: "help", args: [] };
            const result = system["validateCommand"](parsed, sender);

            assert.strictEqual(result.valid, true);
        });
    });

    describe("sendMessage", () => {
        it("should send whisper message", async () => {
            const result = await system["sendMessage"](123, "Test message");

            assert.strictEqual(result.success, true);
            const messages = (connector as any).getMessages();
            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].text, "Test message");
            assert.strictEqual(messages[0].memberNumber, 123);
        });

        it("should return success result", async () => {
            const result = await system["sendMessage"](123, "Test");

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.message, undefined);
            assert.strictEqual(result.error, undefined);
        });
    });

    describe("isUserAdmin", () => {
        it("should return true for admin users", () => {
            const admin = createMockCharacter(123, true);
            const result = system["isUserAdmin"](admin);

            assert.strictEqual(result, true);
        });

        it("should return false for non-admin users", () => {
            const user = createMockCharacter(123, false);
            const result = system["isUserAdmin"](user);

            assert.strictEqual(result, false);
        });
    });

    describe("requireAdmin", () => {
        it("should allow admins", () => {
            const admin = createMockCharacter(123, true);
            const result = system["requireAdmin"](admin);

            assert.strictEqual(result.allowed, true);
        });

        it("should deny non-admins", () => {
            const user = createMockCharacter(123, false);
            const result = system["requireAdmin"](user);

            assert.strictEqual(result.allowed, false);
            assert(result.reason?.includes("admin"));
        });
    });

    describe("getDisabledMessage", () => {
        it("should return disabled message with system label", () => {
            const msg = system["getDisabledMessage"]();

            assert(msg.includes("Test Feature"));
            assert(msg.includes("disabled"));
        });
    });
});
