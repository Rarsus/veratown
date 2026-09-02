# Changelog

All notable changes to Ropeybot are documented here.

## [Unreleased]

### Added

- Comprehensive unit test suite for centralized logging system (38 tests)
- Pre-commit hook enhancement: Auto-fixes Prettier formatting issues
- Documentation reorganization and archival system

### Changed

- Migrated all 52 files to centralized `/bin/logging/` logger
- Removed deprecated `systemLogger.ts`
- Restructured documentation for improved clarity and navigation

### Fixed

- Logging context handling now supports memberNumber, location, operation, attempt, gameId, and custom fields
- Pre-commit workflow no longer blocks on formatting issues

## [Previous Versions]

See [docs/archived/](docs/archived/) for historical phase and epic documentation.

---

## How to Report Issues

- Report bugs via GitHub Issues with reproduction steps
- Check [Troubleshooting Guide](docs/GUIDES/TROUBLESHOOTING.md) first
- Include relevant logs when reporting

## Contribution Guidelines

See [CONTRIBUTING.md](CONTRIBUTING.md) for development practices and testing requirements.

## Release Schedule

Releases follow semantic versioning. Check [Release System](docs/REFERENCE/RELEASE_SYSTEM.md) for details on versioning and deployment process.
