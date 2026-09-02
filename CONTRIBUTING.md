# Contributing to Ropeybot

We welcome contributions to Ropeybot! This document outlines our development practices, testing requirements, and submission process.

## Code Standards

- **TypeScript**: All code must be written in TypeScript with strict type checking
- **Formatting**: Use Prettier for all code formatting (auto-fixed on commit)
- **Testing**: All new features must include unit tests via `node:test`
- **Logging**: Use centralized logger from `/bin/logging/` - never console.log

### Pre-commit Checks

The repository includes an automated pre-commit hook that:

1. Checks code formatting with Prettier
2. Auto-fixes formatting if issues found
3. Allows commit to proceed with corrected files

Simply commit as usual - formatting will be handled automatically.

## Testing

Run tests before submitting:

```bash
# Run all tests
pnpm test:unit

# Run specific test file
pnpm test:unit -- bin/logging/__tests__/logger.test.ts

# Run with coverage
pnpm test:unit -- --coverage
```

Tests use Node.js native `test` module (`node:test`) and `assert/strict`.

## Development Workflow

1. **Create a feature branch**: `git checkout -b feature/your-feature`
2. **Implement changes** with tests
3. **Run tests**: `pnpm test:unit` (must pass)
4. **Commit**: Pre-commit hook auto-fixes formatting
5. **Push**: `git push origin feature/your-feature`
6. **Submit PR** with clear description of changes

## Documentation

- Update relevant docs in `/docs/` for feature changes
- Follow existing structure and naming conventions
- Add navigation READMEs when creating new doc sections

## Logging Best Practices

Use the centralized logger for all output:

```typescript
import { createLogger } from "@/logging";

const logger = createLogger("MySystem");
logger.info("Operation started", { userId, action });
logger.error("Operation failed", error, { userId, action });
```

See [Logging Guide](docs/IMPLEMENTATION/LOGGING_GUIDE.md) for details.

## Questions?

Refer to:

- [Developer Guide](docs/GUIDES/DEVELOPMENT.md)
- [Architecture Documentation](docs/ARCHITECTURE/)
- [Deployment Guides](docs/DEPLOYMENT/)

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).
