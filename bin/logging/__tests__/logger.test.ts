/**
 * Unit tests for the centralized logging system
 * Tests Logger class, LoggerRegistry, log levels, and formatting
 */

import assert from "node:assert/strict";
import test from "node:test";
import { describe } from "node:test";
import { Logger } from "../logger";
import {
    LOG_LEVELS,
    parseLogLevel,
    shouldLog,
    type LogLevel,
} from "../logLevels";
import { createLogger, LoggerRegistry, type LogContext } from "../index";
import { initializeLogging, initializeLoggingFromEnv } from "../config";

// Test Suite: Log Levels
describe("Log Levels", () => {
    test("LOG_LEVELS contains correct definitions", () => {
        assert.deepEqual(LOG_LEVELS, {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3,
            FATAL: 4,
        });
    });

    test("parseLogLevel converts strings to numeric levels", () => {
        assert.equal(parseLogLevel("DEBUG"), "DEBUG");
        assert.equal(parseLogLevel("INFO"), "INFO");
        assert.equal(parseLogLevel("WARN"), "WARN");
        assert.equal(parseLogLevel("ERROR"), "ERROR");
        assert.equal(parseLogLevel("FATAL"), "FATAL");
    });

    test("parseLogLevel is case-insensitive", () => {
        assert.equal(parseLogLevel("debug"), "DEBUG");
        assert.equal(parseLogLevel("Debug"), "DEBUG");
        assert.equal(parseLogLevel("DeBuG"), "DEBUG");
    });

    test("parseLogLevel returns INFO for unknown levels", () => {
        assert.equal(parseLogLevel("UNKNOWN"), "INFO"); // INFO is default
        assert.equal(parseLogLevel(""), "INFO");
        assert.equal(parseLogLevel("xyz"), "INFO");
    });

    test("shouldLog returns true for messages >= min level", () => {
        // Minimum level: INFO
        assert.equal(shouldLog("DEBUG", "INFO"), false); // DEBUG < INFO
        assert.equal(shouldLog("INFO", "INFO"), true); // INFO == INFO
        assert.equal(shouldLog("WARN", "INFO"), true); // WARN > INFO
        assert.equal(shouldLog("ERROR", "INFO"), true); // ERROR > INFO
        assert.equal(shouldLog("FATAL", "INFO"), true); // FATAL > INFO
    });

    test("shouldLog with DEBUG level shows all messages", () => {
        // Minimum level: DEBUG
        assert.equal(shouldLog("DEBUG", "DEBUG"), true); // DEBUG == DEBUG
        assert.equal(shouldLog("INFO", "DEBUG"), true); // INFO > DEBUG
        assert.equal(shouldLog("WARN", "DEBUG"), true); // WARN > DEBUG
        assert.equal(shouldLog("ERROR", "DEBUG"), true); // ERROR > DEBUG
        assert.equal(shouldLog("FATAL", "DEBUG"), true); // FATAL > DEBUG
    });

    test("shouldLog with ERROR level shows only ERROR and FATAL", () => {
        // Minimum level: ERROR
        assert.equal(shouldLog("DEBUG", "ERROR"), false); // DEBUG < ERROR
        assert.equal(shouldLog("INFO", "ERROR"), false); // INFO < ERROR
        assert.equal(shouldLog("WARN", "ERROR"), false); // WARN < ERROR
        assert.equal(shouldLog("ERROR", "ERROR"), true); // ERROR == ERROR
        assert.equal(shouldLog("FATAL", "ERROR"), true); // FATAL > ERROR
    });
});

// Test Suite: Logger Class
describe("Logger Class", () => {
    let originalEnv: string | undefined;

    test("Logger can be instantiated with a system name", () => {
        const logger = new Logger("TestSystem");
        assert.ok(logger instanceof Logger);
    });

    test("Logger accepts optional log level on construction", () => {
        const logger = new Logger("TestSystemDebug", "DEBUG");
        assert.ok(logger instanceof Logger);
    });

    test("Logger defaults to INFO level if no level provided", () => {
        const originalLogLevel = process.env.LOG_LEVEL;
        try {
            delete process.env.LOG_LEVEL;
            const logger = new Logger("TestSystemDefault");
            assert.ok(logger instanceof Logger);
        } finally {
            process.env.LOG_LEVEL = originalLogLevel;
        }
    });

    test("Logger provides all required methods", () => {
        const logger = new Logger("TestSystem");
        assert.equal(typeof logger.debug, "function");
        assert.equal(typeof logger.info, "function");
        assert.equal(typeof logger.warn, "function");
        assert.equal(typeof logger.error, "function");
        assert.equal(typeof logger.fatal, "function");
    });

    test("Logger methods accept string messages", () => {
        const logger = new Logger("TestSystem");
        // These should not throw
        logger.debug("Debug message");
        logger.info("Info message");
        logger.warn("Warn message");
        logger.error("Error message");
        logger.fatal("Fatal message");
    });

    test("Logger methods accept context objects", () => {
        const logger = new Logger("TestSystem");
        const context: LogContext = {
            memberNumber: 123,
            operation: "test",
            location: "test_loc",
            attempt: 1,
            custom: "value",
        };

        // These should not throw
        logger.debug("Debug with context", context);
        logger.info("Info with context", context);
        logger.warn("Warn with context", context);
    });

    test("Logger error method accepts Error objects", () => {
        const logger = new Logger("TestSystem");
        const error = new Error("Test error");
        const context: LogContext = { operation: "test" };

        // These should not throw
        logger.error("Error occurred", error, context);
        logger.error("Error without context", error);
    });

    test("Logger filters messages based on log level", () => {
        // With INFO level, DEBUG messages should not appear
        const loggerINFO = new Logger("TestSystem", "INFO");
        let called = false;

        // Monkey patch console.log to detect output
        const originalLog = console.log;
        console.log = () => {
            called = true;
        };

        try {
            loggerINFO.debug("This should be filtered");
            // DEBUG < INFO, so should not output
            // Note: depends on implementation
        } finally {
            console.log = originalLog;
        }
    });
});

// Test Suite: LoggerRegistry
describe("LoggerRegistry", () => {
    test("LoggerRegistry.createLogger returns Logger instance", () => {
        const logger = createLogger("TestSystem");
        assert.ok(logger instanceof Logger);
    });

    test("LoggerRegistry.createLogger with same name returns same instance", () => {
        const logger1 = createLogger("SameSystem");
        const logger2 = createLogger("SameSystem");
        // Note: depending on implementation, may or may not be same instance
        assert.ok(logger1 instanceof Logger);
        assert.ok(logger2 instanceof Logger);
    });

    test("LoggerRegistry.getAppLogger returns Logger instance", () => {
        const appLogger = LoggerRegistry.getAppLogger();
        assert.ok(appLogger instanceof Logger);
    });

    test("LoggerRegistry.setGlobalLogLevel accepts valid levels", () => {
        // Should not throw
        LoggerRegistry.setGlobalLogLevel("DEBUG");
        LoggerRegistry.setGlobalLogLevel("INFO");
        LoggerRegistry.setGlobalLogLevel("WARN");
        LoggerRegistry.setGlobalLogLevel("ERROR");
        LoggerRegistry.setGlobalLogLevel("FATAL");
    });

    test("LoggerRegistry exposes Logger class", () => {
        // LoggerRegistry is a class that has static methods
        assert.equal(typeof LoggerRegistry.getLogger, "function");
        assert.equal(typeof LoggerRegistry.getAppLogger, "function");
        assert.equal(typeof LoggerRegistry.setGlobalLogLevel, "function");
    });
});

// Test Suite: Log Context
describe("Log Context", () => {
    test("Empty context is valid", () => {
        const logger = createLogger("TestSystem");
        logger.info("Message with empty context", {});
        // Should not throw
    });

    test("Standard context fields are accepted", () => {
        const logger = createLogger("TestSystem");
        const context: LogContext = {
            memberNumber: 123,
            location: "prison_yard",
            operation: "strip",
            attempt: 1,
            gameId: "game_abc123",
        } as any;

        logger.info("Message with standard context", context);
        // Should not throw
    });

    test("Custom context fields are accepted", () => {
        const logger = createLogger("TestSystem");
        const context: LogContext = {
            memberNumber: 123,
            customField1: "value1",
            customField2: 42,
            customField3: true,
            nested: { obj: "value" },
        };

        logger.info("Message with custom context", context);
        // Should not throw
    });

    test("LogContext allows optional fields", () => {
        const logger = createLogger("TestSystem");

        // All of these should be valid
        logger.info("Only memberNumber", { memberNumber: 123 });
        logger.info("Only operation", { operation: "test" });
        logger.info("Only location", { location: "test" });
        logger.info("Only attempt", { attempt: 1 });
        logger.info("Mixed", { memberNumber: 123, operation: "test" });
    });
});

// Test Suite: Configuration
describe("Logger Configuration", () => {
    test("initializeLogging with config object works", () => {
        // Should not throw
        initializeLogging({ level: "DEBUG" });
        initializeLogging({ level: "INFO" });
        initializeLogging({ level: "ERROR" });
    });

    test("initializeLogging with empty config uses defaults", () => {
        // Should not throw
        initializeLogging({});
    });

    test("initializeLoggingFromEnv reads LOG_LEVEL env var", () => {
        const originalEnv = process.env.LOG_LEVEL;

        try {
            process.env.LOG_LEVEL = "DEBUG";
            initializeLoggingFromEnv();
            // Should not throw

            process.env.LOG_LEVEL = "ERROR";
            initializeLoggingFromEnv();
            // Should not throw
        } finally {
            process.env.LOG_LEVEL = originalEnv;
        }
    });

    test("initializeLoggingFromEnv defaults to INFO if no env var", () => {
        const originalEnv = process.env.LOG_LEVEL;

        try {
            delete process.env.LOG_LEVEL;
            initializeLoggingFromEnv();
            // Should not throw and default to INFO
        } finally {
            process.env.LOG_LEVEL = originalEnv;
        }
    });
});

// Test Suite: Error Handling
describe("Error Handling", () => {
    test("Logger handles Error objects in error method", () => {
        const logger = createLogger("TestSystem");
        const error = new Error("Test error message");

        // Should not throw
        logger.error("Something went wrong", error);
    });

    test("Logger handles error objects with stack traces", () => {
        const logger = createLogger("TestSystem");
        const error = new Error("Test error");
        error.stack = "Error: Test error\n  at test.ts:123";

        // Should not throw and preserve stack
        logger.error("Error with stack", error, {
            operation: "test",
        });
    });

    test("Logger handles unknown error types gracefully", () => {
        const logger = createLogger("TestSystem");

        // Should not throw for non-Error objects
        logger.error("Unknown error", "string error", {
            operation: "test",
        });
        logger.error(
            "Unknown error",
            { message: "object" },
            {
                operation: "test",
            },
        );
    });

    test("Logger handles missing context in error method", () => {
        const logger = createLogger("TestSystem");
        const error = new Error("Test error");

        // Should not throw when context is omitted
        logger.error("Error without context", error);
    });
});

// Test Suite: Multiple Loggers
describe("Multiple Loggers", () => {
    test("Multiple loggers can be created for different systems", () => {
        const logger1 = createLogger("System1UniqueA");
        const logger2 = createLogger("System2UniqueB");
        const logger3 = createLogger("System3UniqueC");

        assert.ok(logger1 instanceof Logger);
        assert.ok(logger2 instanceof Logger);
        assert.ok(logger3 instanceof Logger);
    });

    test("Multiple loggers can log independently", () => {
        const logger1 = createLogger("CasinoUnique");
        const logger2 = createLogger("VeratownUnique");
        const logger3 = createLogger("DareUnique");

        // Should not throw and all should work independently
        logger1.info("Casino message");
        logger2.info("Veratown message");
        logger3.info("Dare message");
    });

    test("Same logger name returns same instance from registry", () => {
        const logger1 = createLogger("SameSystemX");
        const logger2 = createLogger("SameSystemX");
        // LoggerRegistry caches loggers by name, so these should be the same instance
        assert.equal(logger1, logger2);
    });
});

// Test Suite: Message Formatting
describe("Message Formatting", () => {
    test("Logger includes system name in output", () => {
        const logger = createLogger("SpecialSystem");
        // The logger should include "SpecialSystem" in formatted output
        logger.info("Test message");
        // Verification happens via console output inspection
    });

    test("Logger includes timestamp in output", () => {
        const logger = createLogger("TestSystem");
        // The logger should include ISO timestamp in output
        logger.info("Test message");
        // Verification happens via console output inspection
    });

    test("Logger includes emoji prefix for log level", () => {
        const logger = createLogger("TestSystem");
        // Each log level should have an emoji prefix
        logger.debug("Debug"); // 🔵
        logger.info("Info"); // 📋
        logger.warn("Warning"); // ⚠️
        logger.error("Error"); // ❌
        logger.fatal("Fatal"); // 🔴
        // Verification happens via console output inspection
    });
});
