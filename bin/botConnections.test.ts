import assert from "node:assert/strict";
import test from "node:test";
import {
    getBotAccountRoles,
    validateBotAccountConfiguration,
} from "./botConnections";
import { ConfigFile } from "./config";

function config(overrides: Partial<ConfigFile>): ConfigFile {
    return {
        user: "main",
        password: "password",
        env: "test",
        game: "veratown",
        superusers: [],
        members: [],
        user2: "",
        password2: "",
        room: {} as ConfigFile["room"],
        ...overrides,
    };
}

test("Veratown selects main, shower, and casino roles", () => {
    assert.deepEqual(
        getBotAccountRoles(
            config({
                user2: "shower",
                password2: "password",
                user3: "casino",
                password3: "password",
            }),
        ),
        [
            { role: "main", username: "main" },
            { role: "shower", username: "shower" },
            { role: "casino", username: "casino" },
        ],
    );
});

test("non-Veratown games do not load Veratown secondary roles", () => {
    assert.deepEqual(
        getBotAccountRoles(
            config({
                game: "roleplay",
                user2: "shower",
                password2: "password",
                user3: "casino",
                password3: "password",
            }),
        ),
        [{ role: "main", username: "main" }],
    );
});

test("duplicate active bot accounts are rejected", () => {
    assert.throws(() =>
        validateBotAccountConfiguration(
            config({ user2: "MAIN", password2: "password" }),
        ),
    );
});
