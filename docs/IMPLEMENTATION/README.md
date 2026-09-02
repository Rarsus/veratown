# Implementation Documentation

Development practices, testing, logging, and coding standards for Ropeybot.

## Core Implementation Guides

- **[Logging Guide](LOGGING_GUIDE.md)** - How to use the centralized logging system
- **[Testing Strategy](TESTING.md)** - Unit tests, test patterns, and coverage (if available)
- **[Code Standards](GOLDEN_RULES.md)** - Coding patterns and best practices (if available)

## Development Practices

- **TypeScript** - All code must be TypeScript with strict type checking
- **Node.js Test Module** - Tests use `node:test` and `assert/strict`
- **Prettier** - Automatic code formatting (auto-fixed on commit)
- **Git Pre-commit** - Hooks validate formatting before commit

## Logging System

The centralized logging system provides structured logs with:

- 5 log levels: DEBUG, INFO, WARN, ERROR, FATAL
- Context support for tracking operations
- Emoji prefixes for easy scanning
- ISO timestamps for all entries

**Usage**:

```typescript
import { createLogger } from "@/logging";

const logger = createLogger("SystemName");
logger.info("Message", { context: "data" });
logger.error("Failed", error, { userId, action });
```

See [Logging Guide](LOGGING_GUIDE.md) for full API documentation.

---

## 🧪 Running Tests

```bash
# Run all tests
pnpm test:unit

# Run specific test file
node --test bin/logging/__tests__/logger.test.ts

# Run with verbose output
node --test --verbose bin/logging/__tests__/logger.test.ts
```

Test coverage: 38+ logging tests, 400+ total tests

---

## 📝 Code Quality Checks

```bash
# Format code
npx prettier --write .

# Check formatting (no changes)
npx prettier --check .

# Pre-commit hook runs automatically on git commit
```

---

**See Also**:

- [Main Documentation Index](../README.md)
- [Developer Guide](../GUIDES/DEVELOPMENT.md)
- [Contributing Guidelines](../../CONTRIBUTING.md)
