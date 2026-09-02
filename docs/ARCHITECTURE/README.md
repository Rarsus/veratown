# Architecture Documentation

This section contains the system design, architectural decisions, and design patterns used throughout Ropeybot.

## Core Architecture

- **[Unified State Architecture](UNIFIED_STATE_ARCHITECTURE.md)** - Character store and unified state management
- **[Architectural Decisions](ARCHITECTURAL_DECISIONS.md)** - Key design choices and rationale
- **[Pluggable Architecture Pattern](PLUGGABLE_ARCHITECTURE_PATTERN.md)** - How the system extends with new games

## Game Systems

- **[Veratown Architecture](VERATOWN_ARCHITECTURE.md)** - Veratown prison area design
- **[Veratown Plugin Architecture](VERATOWN_PLUGIN_ARCHITECTURE.md)** - Extending Veratown systems
- **[Keypad System Refactoring Blueprint](KEYPAD_SYSTEM_REFACTORING_BLUEPRINT.md)** - Detailed keypad system design

## Data & Persistence

- **[Database Architecture Analysis](DATABASE_ARCHITECTURE_ANALYSIS.md)** - Collection design and schema
- **[Complex Collection Architecture](COMPLEX_COLLECTION_ARCHITECTURE.md)** - Advanced data modeling

## Analysis & Review

- **[Architectural Audit Systems](ARCHITECTURAL_AUDIT_SYSTEMS.md)** - System audit findings
- **[Architecture Violations Summary](ARCHITECTURE_VIOLATIONS_SUMMARY.md)** - Violation catalog and fixes
- **[Code Review Architecture Verification](CODE_REVIEW_ARCHITECTURE_VERIFICATION.md)** - Verification process
- **[Region System](REGION_SYSTEM.md)** - Region-based game state management
- **[Implementation vs Design Analysis](IMPLEMENTATION_vs_DESIGN_ANALYSIS.md)** - Comparison of current vs. planned

## Phase Documentation

- **[Epic 1.3 Architecture Layer](EPIC1.3-ARCHITECTURE-LAYER.md)** - Epic 1.3 architecture specifics

---

## 🔍 Quick Answers

| Question                                | Answer                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| How is the game state managed?          | See [Unified State Architecture](UNIFIED_STATE_ARCHITECTURE.md)                   |
| What's the database design?             | See [Database Architecture Analysis](DATABASE_ARCHITECTURE_ANALYSIS.md)           |
| How does Keypad work?                   | See [Keypad System Refactoring Blueprint](KEYPAD_SYSTEM_REFACTORING_BLUEPRINT.md) |
| How are games plugged in?               | See [Pluggable Architecture Pattern](PLUGGABLE_ARCHITECTURE_PATTERN.md)           |
| What architectural decisions were made? | See [Architectural Decisions](ARCHITECTURAL_DECISIONS.md)                         |

---

**See Also**: [Main Documentation Index](../README.md)
