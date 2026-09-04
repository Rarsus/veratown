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
import type { API_Character, BC_Server_ChatRoomMessage, API_Connector } from "bc-bot";
import { HelpAndGuideSystem } from "../helpAndGuideSystem";

/**
 * Mock API_Character
 */
function createMockCharacter(memberNumber: number = 123): API_Character {
    return {
        MemberNumber: memberNumber,
        IsRoomAdmin: () => false,
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

describe("HelpAndGuideSystem", () => {
    let system: HelpAndGuideSystem;
    let connector: API_Connector;

    beforeEach(() => {
        connector = createMockConnector();
        system = new HelpAndGuideSystem(connector);
    });

    describe("Help topic commands", () => {
        it("should show general help when no topic specified", async () => {
            const sender = createMockCharacter(123);
            const msg = createMockMessage();

            await system.processMessage(sender, msg, []);

            const messages = (connector as any).getMessages();
            assert.strictEqual(messages.length, 1);
            assert(messages[0].text.includes("Help System"));
        });

        it("should show dare help for dare topic", async () => {
            const sender = createMockCharacter(123);
            const msg = createMockMessage();

            await system.processMessage(sender, msg, ["dare"]);

            const messages = (connector as any).getMessages();
            assert.strictEqual(messages.length, 1);
            assert(messages[0].text.includes("Dare Game Help"));
        });

        it("should show casino help for casino topic", async () => {
            const sender = createMockCharacter(123);
            const msg = createMockMessage();

            await system.processMessage(sender, msg, ["casino"]);

            const messages = (connector as any).getMessages();
            assert.strictEqual(messages.length, 1);
            assert(messages[0].text.includes("Casino Help"));
        });

        it("should show features help for features topic", async () => {
            const sender = createMockCharacter(123);
            const msg = createMockMessage();

            await system.processMessage(sender, msg, ["features"]);

            const messages = (connector as any).getMessages();
            assert.strictEqual(messages.length, 1);
            assert(messages[0].text.includes("Available Features"));
        });

        it("should show admin help for admin topic", async () => {
            const sender = createMockCharacter(123);
            const msg = createMockMessage();

            await system.processMessage(sender, msg, ["admin"]);

            const messages = (connector as any).getMessages();
            assert.strictEqual(messages.length, 1);
            assert(messages[0].text.includes("Admin Commands"));
        });

        it("should show commands help for commands topic", async () => {
            const sender = createMockCharacter(123);
            const msg = createMockMessage();

            await system.processMessage(sender, msg, ["commands"]);

            const messages = (connector as any).getMessages();
            assert.strictEqual(messages.length, 1);
            assert(messages[0].text.includes("Available Commands"));
        });
    });

    describe("Error handling", () => {
        it("should reject unknown help topics", async () => {
            const sender = createMockCharacter(123);
            const msg = createMockMessage();

            await system.processMessage(sender, msg, ["unknown"]);

            const messages = (connector as any).getMessages();
            assert.strictEqual(messages.length, 1);
            assert(messages[0].text.includes("Unknown help topic"));
        });
    });

    describe("System enabled/disabled", () => {
        it("should reject messages when disabled", async () => {
            system.setEnabled(false);
            const sender = createMockCharacter(123);
            const msg = createMockMessage();

            await system.processMessage(sender, msg, ["dare"]);

            const messages = (connector as any).getMessages();
            assert.strictEqual(messages.length, 1);
            assert(messages[0].text.includes("disabled"));
        });

        it("should accept messages when enabled", async () => {
            system.setEnabled(true);
            const sender = createMockCharacter(123);
            const msg = createMockMessage();

            await system.processMessage(sender, msg, ["dare"]);

            const messages = (connector as any).getMessages();
            assert.strictEqual(messages.length, 1);
            assert(messages[0].text.includes("Dare Game Help"));
        });
    });

    describe("Case insensitivity", () => {
        it("should accept uppercase topic names", async () => {
            const sender = createMockCharacter(123);
            const msg = createMockMessage();

            await system.processMessage(sender, msg, ["DARE"]);

            const messages = (connector as any).getMessages();
            assert.strictEqual(messages.length, 1);
            assert(messages[0].text.includes("Dare Game Help"));
        });

        it("should accept mixed case topic names", async () => {
            const sender = createMockCharacter(123);
            const msg = createMockMessage();

            await system.processMessage(sender, msg, ["CaSiNo"]);

            const messages = (connector as any).getMessages();
            assert.strictEqual(messages.length, 1);
            assert(messages[0].text.includes("Casino Help"));
        });
    });
});
