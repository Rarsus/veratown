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
import {
    DareCommandHandlers,
    createJoinCommandHandler,
    createLeaveCommandHandler,
    createDrawCommandHandler,
} from "../commandHandlers";

const mockMember = {
    name: "TestPlayer",
    MemberNumber: 100,
} as any;

test("DareCommandHandlers: Register and dispatch command", async () => {
    const handlers = new DareCommandHandlers();
    let commandCalled = false;

    handlers.register(
        "test",
        0,
        false,
        async () => {
            commandCalled = true;
        },
        "Test command",
    );

    const result = await handlers.dispatch("test", [], mockMember, false);

    assert.equal(commandCalled, true);
    assert.equal(result.success, true);
});

test("DareCommandHandlers: Unknown command returns error", async () => {
    const handlers = new DareCommandHandlers();

    const result = await handlers.dispatch("unknown", [], mockMember, false);

    assert.equal(result.success, false);
    assert.equal(result.message.includes("Unknown command"), true);
});

test("DareCommandHandlers: Insufficient arguments error", async () => {
    const handlers = new DareCommandHandlers();

    handlers.register("test", 2, false, async () => {}, "Test command");

    const result = await handlers.dispatch("test", ["arg1"], mockMember, false);

    assert.equal(result.success, false);
    assert.equal(result.message.includes("requires at least 2"), true);
});

test("DareCommandHandlers: Admin-only command denied to user", async () => {
    const handlers = new DareCommandHandlers();

    handlers.register(
        "admin",
        0,
        true, // Admin only
        async () => {},
        "Admin command",
    );

    const result = await handlers.dispatch("admin", [], mockMember, false); // Not admin

    assert.equal(result.success, false);
    assert.equal(result.message.includes("admin only"), true);
});

test("DareCommandHandlers: Admin-only command allowed to admin", async () => {
    const handlers = new DareCommandHandlers();
    let commandCalled = false;

    handlers.register(
        "admin",
        0,
        true,
        async () => {
            commandCalled = true;
        },
        "Admin command",
    );

    const result = await handlers.dispatch("admin", [], mockMember, true); // Is admin

    assert.equal(commandCalled, true);
    assert.equal(result.success, true);
});

test("DareCommandHandlers: Command with arguments", async () => {
    const handlers = new DareCommandHandlers();
    let passedArgs: string[] = [];

    handlers.register(
        "test",
        1,
        false,
        async (member, args) => {
            passedArgs = args;
        },
        "Test command",
    );

    await handlers.dispatch("test", ["arg1", "arg2"], mockMember, false);

    assert.deepEqual(passedArgs, ["arg1", "arg2"]);
});

test("DareCommandHandlers: Error in handler propagates", async () => {
    const handlers = new DareCommandHandlers();

    handlers.register(
        "error",
        0,
        false,
        async () => {
            throw new Error("Handler error");
        },
        "Error test",
    );

    const result = await handlers.dispatch("error", [], mockMember, false);

    assert.equal(result.success, false);
    assert.equal(result.message.includes("Handler error"), true);
});

test("DareCommandHandlers: Get command names", async () => {
    const handlers = new DareCommandHandlers();

    handlers.register("join", 0, false, async () => {}, "Join");
    handlers.register("leave", 0, false, async () => {}, "Leave");
    handlers.register("draw", 0, false, async () => {}, "Draw");

    const names = handlers.getCommandNames();
    assert.deepEqual(names, ["draw", "join", "leave"]); // Sorted
});

test("DareCommandHandlers: Has command check", async () => {
    const handlers = new DareCommandHandlers();

    handlers.register("test", 0, false, async () => {}, "Test");

    assert.equal(handlers.hasCommand("test"), true);
    assert.equal(handlers.hasCommand("notexist"), false);
});

test("DareCommandHandlers: Get command info", async () => {
    const handlers = new DareCommandHandlers();

    handlers.register("test", 2, true, async () => {}, "Test command");

    const info = handlers.getCommandInfo("test");

    assert.equal(info?.name, "test");
    assert.equal(info?.minArgs, 2);
    assert.equal(info?.adminOnly, true);
    assert.equal(info?.description, "Test command");
});

test("DareCommandHandlers: Cannot register same command twice", async () => {
    const handlers = new DareCommandHandlers();

    handlers.register("test", 0, false, async () => {}, "Test");

    assert.throws(() => {
        handlers.register("test", 0, false, async () => {}, "Test again");
    });
});

test("DareCommandHandlers: Get all commands", async () => {
    const handlers = new DareCommandHandlers();

    handlers.register("join", 0, false, async () => {}, "Join");
    handlers.register("leave", 0, false, async () => {}, "Leave");
    handlers.register("admin", 0, true, async () => {}, "Admin");

    const all = handlers.getAllCommands();
    assert.equal(all.length, 3);
    assert.equal(all[0].name, "admin"); // Sorted by name
});

test("DareCommandHandlers: Get user commands (exclude admin)", async () => {
    const handlers = new DareCommandHandlers();

    handlers.register("join", 0, false, async () => {}, "Join");
    handlers.register("admin", 0, true, async () => {}, "Admin");
    handlers.register("leave", 0, false, async () => {}, "Leave");

    const userCmds = handlers.getUserCommands();
    assert.equal(userCmds.length, 2);
    assert.equal(
        userCmds.every((cmd) => !cmd.adminOnly),
        true,
    );
});

test("DareCommandHandlers: Get admin commands", async () => {
    const handlers = new DareCommandHandlers();

    handlers.register("join", 0, false, async () => {}, "Join");
    handlers.register("admin1", 0, true, async () => {}, "Admin1");
    handlers.register("admin2", 0, true, async () => {}, "Admin2");

    const adminCmds = handlers.getAdminCommands();
    assert.equal(adminCmds.length, 2);
    assert.equal(
        adminCmds.every((cmd) => cmd.adminOnly),
        true,
    );
});

test("DareCommandHandlers: Dispatch passes member correctly", async () => {
    const handlers = new DareCommandHandlers();
    let receivedMember: any;

    handlers.register(
        "test",
        0,
        false,
        async (member) => {
            receivedMember = member;
        },
        "Test",
    );

    await handlers.dispatch("test", [], mockMember, false);

    assert.equal(receivedMember.MemberNumber, mockMember.MemberNumber);
    assert.equal(receivedMember.name, mockMember.name);
});

test("DareCommandHandlers: Minimum args exactly met", async () => {
    const handlers = new DareCommandHandlers();
    let commandCalled = false;

    handlers.register(
        "test",
        3,
        false,
        async () => {
            commandCalled = true;
        },
        "Test",
    );

    const result = await handlers.dispatch(
        "test",
        ["a", "b", "c"],
        mockMember,
        false,
    );

    assert.equal(commandCalled, true);
    assert.equal(result.success, true);
});

test("DareCommandHandlers: Minimum args exceeded", async () => {
    const handlers = new DareCommandHandlers();
    let commandCalled = false;

    handlers.register(
        "test",
        1,
        false,
        async () => {
            commandCalled = true;
        },
        "Test",
    );

    const result = await handlers.dispatch(
        "test",
        ["a", "b", "c"],
        mockMember,
        false,
    );

    assert.equal(commandCalled, true);
    assert.equal(result.success, true);
});

test("DareCommandHandlers: Join command handler factory", async () => {
    const mockDare = {
        lobby: new Set(),
        conn: {
            SendPrivateMessage: () => {},
        },
    };

    const handler = await createJoinCommandHandler(mockDare);
    const result = handler instanceof Function;

    assert.equal(result, true);
});

test("DareCommandHandlers: Leave command handler factory", async () => {
    const mockDare = {
        lobby: new Set(),
        playerGame: new Map(),
        conn: {
            SendPrivateMessage: () => {},
        },
    };

    const handler = await createLeaveCommandHandler(mockDare);
    const result = handler instanceof Function;

    assert.equal(result, true);
});

test("DareCommandHandlers: Draw command handler factory", async () => {
    const mockDare = {
        playerGame: new Map(),
        games: new Map(),
        store: {},
        conn: {
            SendPrivateMessage: () => {},
        },
    };

    const handler = await createDrawCommandHandler(mockDare);
    const result = handler instanceof Function;

    assert.equal(result, true);
});
