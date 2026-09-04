import assert from "node:assert/strict";
import test from "node:test";
import {
    ConfigValidationError,
    configurationIssue,
    validateConfig,
} from "./config";
import { AppError } from "./errors";

const validConfig = (overrides: Record<string, unknown> = {}) => ({
    user: "main",
    password: "secret",
    game: "roleplay",
    ...overrides,
});

test("configuration applies deterministic safe defaults", () => {
    const config = validateConfig(validConfig());

    assert.equal(config.env, "live");
    assert.equal(config.game, "roleplay");
    assert.deepEqual(config.room, {});
    assert.deepEqual(config.superusers, []);
    assert.deepEqual(config.members, []);
    assert.equal(config.mongo_tls, true);
    assert.equal(config.discord_enabled, false);
});

test("configuration rejects missing and malformed required values", () => {
    assert.throws(
        () => validateConfig(validConfig({ user: "", superusers: ["admin"] })),
        (error: unknown) => {
            assert.ok(error instanceof ConfigValidationError);
            assert.match(error.message, /user/);
            assert.match(error.message, /superusers/);
            return true;
        },
    );
});

test("configuration rejects conflicting account and database settings", () => {
    assert.throws(
        () =>
            validateConfig(
                validConfig({
                    user2: "shower",
                    mongo_uri: "mongodb://localhost",
                }),
            ),
        (error: unknown) => {
            assert.ok(error instanceof ConfigValidationError);
            assert.match(error.message, /user2 and password2/);
            assert.match(error.message, /mongo_uri and mongo_db/);
            return true;
        },
    );
});

test("environment-specific services require their complete configuration", () => {
    assert.throws(
        () =>
            validateConfig(
                validConfig({
                    discord_enabled: true,
                    discord_token: "token",
                }),
            ),
        (error: unknown) => {
            assert.ok(error instanceof ConfigValidationError);
            assert.match(error.message, /discord_token and discord_guild_id/);
            return true;
        },
    );

    assert.throws(
        () => validateConfig({ user: "main", password: "secret" }),
        (error: unknown) => {
            assert.ok(error instanceof ConfigValidationError);
            assert.match(error.message, /mongo_uri and mongo_db/);
            return true;
        },
    );
});

test("environment parsing failures use the validation error contract", () => {
    const error = configurationIssue("MONGODB_TLS", "must be a boolean");

    assert.ok(error instanceof ConfigValidationError);
    assert.ok(error instanceof AppError);
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.equal(error.retryable, false);
    assert.deepEqual(error.issues[0]?.path, ["MONGODB_TLS"]);
    assert.match(error.message, /MONGODB_TLS/);
});
