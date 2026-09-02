# Standardized Logging System

This document describes the centralized logging system used throughout the ropeybot codebase.

## Overview

The logging system provides **structured, consistent logging** across all systems with:

- ✅ Configurable log levels (DEBUG, INFO, WARN, ERROR, FATAL)
- ✅ Structured context objects for rich logging data
- ✅ Consistent timestamp and formatting
- ✅ Environment-based configuration
- ✅ Emoji indicators for quick visual scanning
- ✅ Error stack traces and context

## Quick Start

### Basic Usage

```typescript
import { createLogger } from "./logging";

const logger = createLogger("MySystem");

// Info message with context
logger.info("Game started", { gameId: 1, players: 5 });

// Warning
logger.warn("Connection unstable", { attempt: 2 });

// Error with Error object
logger.error("Operation failed", error, { operation: "saveGame" });

// Debug (only logged if LOG_LEVEL=DEBUG)
logger.debug("Internal state", { state: gameState });

// Fatal (application-breaking)
logger.fatal("Database connection failed", dbError);
```

### Sample Output

```
ℹ️  [2026-09-02T10:15:30.123Z] [MySystem] INFO: Game started [gameId=1, players=5]
⚠️  [2026-09-02T10:15:31.456Z] [MySystem] WARN: Connection unstable [attempt=2]
❌ [2026-09-02T10:15:32.789Z] [MySystem] ERROR: Operation failed [operation="saveGame", errorName=TimeoutError, errorMessage="Operation timed out"]
🔴 [2026-09-02T10:15:33.012Z] [MySystem] FATAL: Database connection failed
```

## Log Levels

| Level     | Emoji | Use Case                                 | Environment      |
| --------- | ----- | ---------------------------------------- | ---------------- |
| **DEBUG** | 🔵    | Detailed diagnostic info for development | Development only |
| **INFO**  | ℹ️    | General informational messages           | All environments |
| **WARN**  | ⚠️    | Potentially problematic situations       | All environments |
| **ERROR** | ❌    | Error conditions and exceptions          | All environments |
| **FATAL** | 🔴    | Application-breaking errors              | All environments |

## Configuration

### Setting Log Level via Environment Variable

```bash
# Only show warnings and above
LOG_LEVEL=WARN npm start

# Show all messages including debug
LOG_LEVEL=DEBUG npm start

# Default is INFO
npm start
```

### Setting Log Level Programmatically

```typescript
import { LoggerRegistry } from "./logging";

// Affects all loggers
LoggerRegistry.setGlobalLogLevel("DEBUG");

// Get a specific logger
const logger = LoggerRegistry.getLogger("MySystem");
logger.info("This will be logged");

// Get the application-level logger
const appLogger = LoggerRegistry.getAppLogger();
appLogger.info("Application event");
```

### Initialization

Log level is automatically configured on startup from the `LOG_LEVEL` environment variable:

```typescript
// main.ts
import { initializeLoggingFromEnv } from "./logging/config";

async function startBot() {
    // Initialize logging first
    initializeLoggingFromEnv();

    // Rest of startup...
}
```

## Best Practices

### 1. Always Include Context

Bad:

```typescript
logger.info("Player connected");
```

Good:

```typescript
logger.info("Player connected", {
    playerName: player.name,
    memberId: player.memberNumber,
    roomId: room.id,
});
```

### 2. Use Appropriate Log Levels

```typescript
// DEBUG: Internal state, flow of execution
logger.debug("Processing turn", { turnIndex: 5 });

// INFO: Application milestones, state changes
logger.info("Game started", { gameId: 1 });

// WARN: Recoverable issues, degraded operation
logger.warn("Player reconnected after timeout", { playerId: 123 });

// ERROR: Operations that failed
logger.error("Failed to save game", error, { gameId: 1 });

// FATAL: Unrecoverable errors, shutdown
logger.fatal("Database unreachable", connectionError);
```

### 3. Always Pass Error Objects

```typescript
// Bad - error information lost
logger.error("Operation failed", undefined, { message: error.message });

// Good - full error with stack trace
logger.error("Operation failed", error, { operationName: "updateProfile" });
```

### 4. Use Consistent Context Keys

Standard context keys:

- `memberId` or `memberNumber` - Character ID
- `playerName` or `player` - Character name
- `gameId` - Game/game session ID
- `roomId` - Chat room ID
- `attempt` - Attempt number for retries
- `operation` - Name of operation being performed
- `duration` - Time taken (in ms)
- `location` - Physical or logical location in system
- `error` / `errorName` / `errorMessage` - Error details (added automatically)

## Usage Examples

### In Game Systems

```typescript
import { createLogger } from "../../logging";

export class CasinoGame {
    private logger = createLogger("Casino");

    async startRound(roundId: number, players: number[]) {
        this.logger.info("Round started", {
            roundId,
            playerCount: players.length,
        });
    }

    async placeBet(playerId: number, amount: number) {
        try {
            // ... bet logic
            this.logger.info("Bet placed", {
                playerId,
                amount,
                roundId: this.currentRound,
            });
        } catch (error) {
            this.logger.error("Failed to place bet", error, {
                playerId,
                amount,
                operation: "placeBet",
            });
        }
    }
}
```

### In Database Operations

```typescript
import { createLogger } from "../logging";

export class CharacterStore {
    private logger = createLogger("CharacterStore");

    async getCharacter(memberId: number) {
        this.logger.debug("Fetching character", { memberId });
        try {
            const char = await this.db
                .collection("characters")
                .findOne({ _id: memberId });
            this.logger.debug("Character fetched", { memberId, found: !!char });
            return char;
        } catch (error) {
            this.logger.error("Failed to fetch character", error, { memberId });
            throw error;
        }
    }
}
```

### In Feature Systems

```typescript
import { createLogger } from "../../logging";
import type { VeratownFeatureSystem } from "./featureSystem";

export class KennelSystem implements VeratownFeatureSystem {
    private logger = createLogger("KennelSystem");
    readonly key = "kennel";
    readonly label = "Kennel";
    enabled = true;

    registerTriggers() {
        this.logger.info("Registering kennel triggers");
        // ... register triggers
    }

    async addToKennel(playerId: number, durationMs: number) {
        this.logger.info("Adding to kennel", { playerId, durationMs });
        try {
            // ... add to kennel logic
            this.logger.info("Kennel entry recorded", { playerId });
        } catch (error) {
            this.logger.error("Failed to add to kennel", error, { playerId });
        }
    }
}
```

## Migration Guide

If you encounter code still using `console.log`, `console.warn`, or direct BC-bot `logger` calls:

### Before:

```typescript
console.log("User connected: " + user.name);
console.warn("API call failed");
logger.error("Critical error:", error);
```

### After:

```typescript
import { createLogger } from "./logging";

const logger = createLogger("MySystem");

logger.info("User connected", { user: user.name });
logger.warn("API call failed");
logger.error("Critical error", error);
```

## Architecture

The logging system consists of:

- **`Logger`** - Core logger class with all log methods
- **`LogLevel`** - Enum-like type for log levels
- **`LogContext`** - Type for context objects
- **`LogEntry`** - Internal format for log entries
- **`LoggerRegistry`** - Global registry for logger instances
- **`LoggingConfig`** - Configuration interface
- **`createLogger()`** - Factory function for creating loggers
- **`initializeLogging()`** - Configuration initialization

All loggers in the application share the same log level, set via environment or programmatically.

## FAQ

**Q: Can I use console.log for debugging?**
A: Use `logger.debug()` instead - it's only shown when `LOG_LEVEL=DEBUG`.

**Q: How do I log to a file?**
A: Currently logs go to stdout/stderr. File logging can be added by extending the Logger class with a transport mechanism.

**Q: Should I log every function call?**
A: No. Log important state changes, errors, and milestones. Debug level can be used for tracing.

**Q: What if I need to log something before logging is initialized?**
A: It's safe - logging initializes early in `startBot()`. If you have code that runs before that, just use console.log temporarily.

**Q: Can different systems have different log levels?**
A: Currently, all systems share the global level. Per-system configuration can be added if needed.
