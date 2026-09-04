/**
 * Application error contract shared by services, integrations, and transports.
 *
 * Context is deliberately sanitized before it is retained or serialized so
 * errors can safely be passed to logs, responses, and audit records.
 */

export type ErrorCategory =
    | "VALIDATION"
    | "CONNECTION"
    | "BUSINESS_LOGIC"
    | "DATABASE"
    | "AUTHENTICATION"
    | "TIMEOUT";

export type ErrorCode =
    | "VALIDATION_ERROR"
    | "CONNECTION_ERROR"
    | "BUSINESS_LOGIC_ERROR"
    | "DATABASE_ERROR"
    | "AUTHENTICATION_ERROR"
    | "TIMEOUT_ERROR";

export type SafeErrorContext = Record<string, unknown>;

const SENSITIVE_KEY =
    /password|passwd|secret|token|api[-_]?key|authorization|cookie|credential/i;

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map((item) => redact(item, seen));
    if (!value || typeof value !== "object") return value;
    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        result[key] = SENSITIVE_KEY.test(key)
            ? "[REDACTED]"
            : redact(item, seen);
    }
    return result;
}

export function sanitizeErrorContext(
    context?: Record<string, unknown>,
): SafeErrorContext {
    return (redact(context ?? {}) as SafeErrorContext) || {};
}

export interface SerializedAppError {
    name: string;
    code: ErrorCode;
    category: ErrorCategory;
    message: string;
    retryable: boolean;
    context: SafeErrorContext;
}

export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly category: ErrorCategory;
    public readonly retryable: boolean;
    public readonly context: SafeErrorContext;

    constructor(
        message: string,
        code: ErrorCode,
        category: ErrorCategory,
        retryable: boolean,
        context?: Record<string, unknown>,
        options?: { cause?: unknown },
    ) {
        super(message, options);
        this.name = new.target.name;
        this.code = code;
        this.category = category;
        this.retryable = retryable;
        this.context = sanitizeErrorContext(context);
    }

    public toJSON(): SerializedAppError {
        return {
            name: this.name,
            code: this.code,
            category: this.category,
            message: this.message,
            retryable: this.retryable,
            context: this.context,
        };
    }

    public toResponse(): {
        error: { code: ErrorCode; message: string; retryable: boolean };
    } {
        return {
            error: {
                code: this.code,
                message: this.message,
                retryable: this.retryable,
            },
        };
    }

    public toAuditRecord(): SerializedAppError {
        return this.toJSON();
    }
}

export class ValidationError extends AppError {
    constructor(message: string, context?: Record<string, unknown>) {
        super(message, "VALIDATION_ERROR", "VALIDATION", false, context);
    }
}

export class ConnectionError extends AppError {
    constructor(
        message: string,
        context?: Record<string, unknown>,
        options?: { cause?: unknown },
    ) {
        super(
            message,
            "CONNECTION_ERROR",
            "CONNECTION",
            true,
            context,
            options,
        );
    }
}

export class BusinessLogicError extends AppError {
    constructor(message: string, context?: Record<string, unknown>) {
        super(
            message,
            "BUSINESS_LOGIC_ERROR",
            "BUSINESS_LOGIC",
            false,
            context,
        );
    }
}

export class DatabaseError extends AppError {
    constructor(
        message: string,
        context?: Record<string, unknown>,
        options?: { cause?: unknown },
    ) {
        super(message, "DATABASE_ERROR", "DATABASE", true, context, options);
    }
}

export class AuthenticationError extends AppError {
    constructor(message: string, context?: Record<string, unknown>) {
        super(
            message,
            "AUTHENTICATION_ERROR",
            "AUTHENTICATION",
            false,
            context,
        );
    }
}

export class TimeoutError extends AppError {
    constructor(
        message: string,
        context?: Record<string, unknown>,
        options?: { cause?: unknown },
    ) {
        super(message, "TIMEOUT_ERROR", "TIMEOUT", true, context, options);
    }
}

export function isRetryableError(error: unknown): boolean {
    return error instanceof AppError && error.retryable;
}

export function asAppError(
    error: unknown,
    fallback = "DATABASE" as ErrorCategory,
    context?: Record<string, unknown>,
): AppError {
    if (error instanceof AppError) return error;
    const message = error instanceof Error ? error.message : String(error);
    const options = error instanceof Error ? { cause: error } : undefined;
    switch (fallback) {
        case "CONNECTION":
            return new ConnectionError(message, context, options);
        case "TIMEOUT":
            return new TimeoutError(message, context, options);
        case "BUSINESS_LOGIC":
            return new BusinessLogicError(message, context);
        case "AUTHENTICATION":
            return new AuthenticationError(message, context);
        case "VALIDATION":
            return new ValidationError(message, context);
        default:
            return new DatabaseError(message, context, options);
    }
}
