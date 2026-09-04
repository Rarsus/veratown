import assert from "node:assert/strict";
import { test } from "node:test";
import {
    AuthenticationError,
    DatabaseError,
    ValidationError,
    isRetryableError,
} from "./errors";

test("application errors classify, serialize, and redact secrets", () => {
    const error = new DatabaseError("database unavailable", {
        operation: "save",
        password: "do-not-leak",
        nested: { apiKey: "also-secret" },
    });

    assert.equal(error.code, "DATABASE_ERROR");
    assert.equal(error.category, "DATABASE");
    assert.equal(error.retryable, true);
    assert.deepEqual(error.toJSON().context, {
        operation: "save",
        password: "[REDACTED]",
        nested: { apiKey: "[REDACTED]" },
    });
    assert.deepEqual(error.toResponse(), {
        error: {
            code: "DATABASE_ERROR",
            message: "database unavailable",
            retryable: true,
        },
    });
});

test("permanent and transient errors have explicit retry policy", () => {
    assert.equal(isRetryableError(new ValidationError("invalid input")), false);
    assert.equal(isRetryableError(new AuthenticationError("denied")), false);
    assert.equal(isRetryableError(new DatabaseError("temporary failure")), true);
});
