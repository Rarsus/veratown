import assert from "node:assert/strict";
import { test } from "node:test";
import {
    AuthenticationError,
    asAppError,
    BusinessLogicError,
    ConnectionError,
    DatabaseError,
    sanitizeErrorContext,
    TimeoutError,
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
            context: {
                operation: "save",
                password: "[REDACTED]",
                nested: { apiKey: "[REDACTED]" },
            },
        },
    });
});

test("permanent and transient errors have explicit retry policy", () => {
    assert.equal(isRetryableError(new ValidationError("invalid input")), false);
    assert.equal(isRetryableError(new AuthenticationError("denied")), false);
    assert.equal(
        isRetryableError(new DatabaseError("temporary failure")),
        true,
    );
});

test("application errors preserve their category, cause, and safe context", () => {
    const cause = new Error("network unavailable");
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const errors = [
        new ConnectionError("connection", { cookie: "private" }, { cause }),
        new BusinessLogicError("logic"),
        new TimeoutError("timeout", { token: "private" }, { cause }),
    ];

    assert.deepEqual(
        errors.map((error) => [error.code, error.category, error.retryable]),
        [
            ["CONNECTION_ERROR", "CONNECTION", true],
            ["BUSINESS_LOGIC_ERROR", "BUSINESS_LOGIC", false],
            ["TIMEOUT_ERROR", "TIMEOUT", true],
        ],
    );
    assert.equal((errors[0] as Error & { cause?: unknown }).cause, cause);
    assert.deepEqual(sanitizeErrorContext(circular), { self: "[Circular]" });
    assert.deepEqual(sanitizeErrorContext(), {});
});

test("asAppError returns application errors and maps fallbacks", () => {
    const existing = new ValidationError("invalid");
    assert.equal(asAppError(existing), existing);

    const fallbackCategories = [
        ["CONNECTION", ConnectionError],
        ["TIMEOUT", TimeoutError],
        ["BUSINESS_LOGIC", BusinessLogicError],
        ["AUTHENTICATION", AuthenticationError],
        ["VALIDATION", ValidationError],
        ["DATABASE", DatabaseError],
    ] as const;
    for (const [category, Type] of fallbackCategories) {
        const wrapped = asAppError("failed", category, { authorization: "x" });
        assert.ok(wrapped instanceof Type);
        assert.deepEqual(wrapped.context, { authorization: "[REDACTED]" });
    }

    const cause = new Error("database failed");
    const wrapped = asAppError(cause);
    assert.ok(wrapped instanceof DatabaseError);
    assert.equal((wrapped as Error & { cause?: unknown }).cause, cause);
    assert.deepEqual(wrapped.toAuditRecord(), wrapped.toJSON());
});
