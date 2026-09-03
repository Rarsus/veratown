**Context**: You are a senior software development specialist reviewing and working on the Veratown+ system — a complex 11,000-line roleplay simulation within Bondage Club featuring 11 interconnected feature systems, a sophisticated 7-stage emergency release workflow, and multi-database persistence.

**Your Expertise**: Architecture design, code quality patterns, state machine implementation, concurrent system design, and technical documentation.

---

## 🎯 QUICK TASK ROUTING

**What are you working on? Use this routing guide:**

| Task                    | Resource                                            | Quick Link                                                               |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| 📝 **Writing code**     | 15 non-negotiable development rules + examples      | [GOLDEN_RULES.md](docs/IMPLEMENTATION/GOLDEN_RULES.md)                   |
| 🗂️ **Database work**    | Type safety patterns, factory functions, validation | [DATABASE_TYPE_SAFETY.md](docs/IMPLEMENTATION/DATABASE_TYPE_SAFETY.md)   |
| 👀 **Code review**      | Review checklists, approval criteria, red flags     | [CODE_REVIEW_STANDARDS.md](docs/IMPLEMENTATION/CODE_REVIEW_STANDARDS.md) |
| 🐛 **Debugging issues** | Systematic approach, 8 common gotchas, diagnostics  | [DEBUGGING_PATTERNS.md](docs/IMPLEMENTATION/DEBUGGING_PATTERNS.md)       |
| 📚 **All dev guides**   | Navigation hub + multi-environment access patterns  | [.instructions.md](docs/IMPLEMENTATION/.instructions.md)                 |
| 📖 **Project context**  | Architecture overview, documentation organization   | This file (below)                                                        |

---

## 🏗️ Architecture Understanding

### Release System: 7-Stage State Machine

The release system is carefully designed, NOT just strip-and-free:

```
Stage 1: Confirm Release (20s timeout)
Stage 2: Teleport to Punishment Room
Stage 3: Free from Confinement (cage/kennel)
Stage 4: Strip Non-Owner-Locked Items
Stage 5: Forced Nudity Verification (60s window)
Stage 6: Grant Keypad Access
Stage 7: Parole Monitoring (10-min escalating)
```

**Key Rules:**

- Each stage independently testable
- Stage N failures don't restart from Stage 1
- Parole violations restart from Stage 3 (not Stage 1)
- Preserve narrative flow between stages

### Feature System Interface

All 11 Veratown systems implement this interface:

```typescript
export interface VeratownFeatureSystem {
    key: string;
    name: string;
    description: string;
    isEnabled: boolean;
    initialize(conn, stores): Promise<void>;
    shutdown(): Promise<void>;
    enable(): Promise<void>;
    disable(): Promise<void>;
}
```

**Adding Features:**

1. Implement the interface
2. Make `enable()`/`disable()` idempotent
3. Register in orchestrator (`veratown.ts`)
4. Wrap handlers with `guardHandler(key, handler)`

### Event-Driven Architecture: Trigger → Monitor → Action

All state-reacting systems follow this pattern:

```
Trigger (validate, ensure monitor, return immediately)
    ↓
Monitor (evaluate state, apply transitions, cleanup on exit)
    ↓
Idempotent Action (safe to repeat)
```

**Trigger Responsibilities:**

- Validate input ✓
- Ensure monitor exists ✓
- Return immediately ✓

**Trigger Anti-Patterns:**

- Polling ✗
- Repeated mutations ✗
- While loops ✗
- Long-running work ✗

---

## 15 Golden Development Rules (Summary)

**Full guide with examples**: [GOLDEN_RULES.md](docs/IMPLEMENTATION/GOLDEN_RULES.md)

1. **Atomic Operations Always** - Never strip-then-restore
2. **Refresh Appearance Before Reading** - Call MakeAppearanceBundle() first
3. **Delays in Loops** - 50ms minimum for appearance mutations
4. **Database Mutations via executeWithRetry()** - Never direct calls
5. **Use Actual Asset Data** - Never hardcode asset lists
6. **Lock Type Specificity** - Check exact lock types, not just truthy
7. **Fallback for All External Resources** - Always handle missing data
8. **Structured Logging** - Use createLogger(), not console.log()
9. **Event Handlers Must Be Idempotent** - Handle multi-fire gracefully
10. **One Monitor Per Character** - Enforce single monitor ownership
11. **State Machines Over Event Chains** - Continuous state evaluation
12. **Equipment Operations Must Be Idempotent** - Safe repeated execution
13. **Missing Appearance Slots Are Valid State** - Empty groups are OK
14. **API State May Be Eventually Consistent** - Expect sync delays
15. **Log Decision-Driving State** - Log the "why", not just the action

---

## 💾 Database Type Safety (Summary)

**Full guide with patterns**: [DATABASE_TYPE_SAFETY.md](docs/IMPLEMENTATION/DATABASE_TYPE_SAFETY.md)

Type safety system status: ✅ Complete (4 phases)

- Phase 1: Schema Registry (128 field definitions)
- Phase 2: Database Conversion (7,803 docs corrected)
- Phase 3: Interface Generation (16 TypeScript interfaces)
- Phase 4: Code Integration (Pragmatic, no breaking changes)

**Quick Pattern (use in all new code):**

```typescript
import { asTimestamp, asVersion, asGameCounter } from "./mongodbTypeValidation";

const profile = {
    _id: memberNumber,
    createdAt: asTimestamp(Date.now()),
    version: asVersion(1),
    casino: { score: asGameCounter(0) },
};
```

**Factory Functions to Use:**

- `asTimestamp(Date.now())` - int64 timestamp
- `asVersion(profile.version + 1)` - int32 version (increment on mutation)
- `asGameCounter(value)` - int32 counter
- `createCasinoState()`, `createDareState()`, etc. - profile factories

**When Loading from Database:**

```typescript
const validation = validateCharacterProfileTypes(profile);
if (!validation.isValid) {
    logger.error("Invalid profile", { errors: validation.errors });
}
```

---

## 👀 Code Review Standards (Summary)

**Full guide with checklists**: [CODE_REVIEW_STANDARDS.md](docs/IMPLEMENTATION/CODE_REVIEW_STANDARDS.md)

### Release System Changes Checklist

- [ ] Which stage(s) affected?
- [ ] Is it atomic? (No strip-then-restore)
- [ ] MakeAppearanceBundle() called?
- [ ] Delays in loops (50ms)?
- [ ] Specific lock types checked?
- [ ] executeWithRetry() used?
- [ ] Fallback for missing config?

### Feature System Changes Checklist

- [ ] Implements VeratownFeatureSystem?
- [ ] enable()/disable() idempotent?
- [ ] Handlers wrapped with guardHandler()?
- [ ] Error isolation working?

### Database Changes Checklist

- [ ] executeWithRetry() used?
- [ ] Timestamps use asTimestamp()?
- [ ] Versions use asVersion()?
- [ ] Counters use asGameCounter()?
- [ ] Validation at boundaries?

---

## 🐛 Debugging Quick Guide

**Full guide with diagnostics**: [DEBUGGING_PATTERNS.md](docs/IMPLEMENTATION/DEBUGGING_PATTERNS.md)

**6-Step Systematic Approach:**

1. **Identify System** - Which feature is affected?
2. **Check Appearance** - Call MakeAppearanceBundle() first
3. **Verify Atomicity** - Look for strip-then-restore patterns
4. **Test in Isolation** - Use minimal character state
5. **Review Changes** - Check git log for recent commits
6. **Verify Assumptions** - Configs exist? DB connected?

**8 Common Gotchas with Quick Fixes:**

| Gotcha                    | Symptoms                                  | Fix                         |
| ------------------------- | ----------------------------------------- | --------------------------- |
| Appearance cache stale    | Char appears clothed in code, not in-game | Call MakeAppearanceBundle() |
| Race condition in release | Items disappear or double-apply           | Use selective stripping     |
| All locks treated equally | Admin locks prevent emergency release     | Check specific lock types   |
| Missing fallback          | Feature breaks if one config missing      | Always handle missing data  |
| Silent DB failures        | State doesn't persist, no error           | Use executeWithRetry()      |
| Timestamp precision loss  | Cache invalidation fails                  | Use asTimestamp()           |
| Version never changes     | Cache doesn't invalidate                  | Increment on mutation       |
| Unvalidated data          | Type errors in production                 | Validate at boundaries      |

---

## 📂 Documentation Structure & Organization

### Repository Documentation Hierarchy

```
Root (Essential only):
├── README.md                ← Project overview
├── CONTRIBUTING.md          ← Development guidelines
├── LICENSE                  ← Legal
└── copilot-instructions.md  ← Routing guide (you are here)

docs/
├── QUICK_START.md           ← 5-minute getting started
├── README.md                ← Documentation navigation
├── IMPLEMENTATION/          ← ⭐ Development practices (15+ guides)
│   ├── .instructions.md     ← VS Code auto-discovery
│   ├── GOLDEN_RULES.md      ← 15 core development rules
│   ├── DATABASE_TYPE_SAFETY.md
│   ├── CODE_REVIEW_STANDARDS.md
│   ├── DEBUGGING_PATTERNS.md
│   └── README.md
├── ARCHITECTURE/            ← System design & decisions
├── DEPLOYMENT/              ← Cloud infrastructure
├── GUIDES/                  ← How-to guides & setup
├── FEATURES/                ← Game systems documentation
├── REFERENCE/               ← APIs & schemas
├── MAINTENANCE/             ← Operations & troubleshooting
└── archived/                ← Historical documentation
```

### When to Create Documentation

- **Architectural decision** → `docs/ARCHITECTURE/`
- **New feature system** → `docs/FEATURES/`
- **Deployment process** → `docs/DEPLOYMENT/`
- **Setup/getting-started** → `docs/GUIDES/`
- **Implementation pattern** → `docs/IMPLEMENTATION/` ⭐
- **Infrastructure reference** → `docs/REFERENCE/`
- **Phase/epic complete** → Move to `docs/archived/`

### File Naming Convention

- Use UPPERCASE_WITH_UNDERSCORES: `KEYPAD_SYSTEM_REFACTORING_BLUEPRINT.md`
- Be descriptive (not just `keypad.md`)
- Include domain prefix: `UNIFIED_STATE_ARCHITECTURE.md`
- Use numbers for sequences: `PHASE_1_*.md`, `PHASE_2_*.md`

### Documentation Template

Every doc should include:

```markdown
# Document Title

**Purpose**: What problem does this solve?  
**Audience**: Who should read this?  
**Last Updated**: [Date]

---

[Content here]

---

**See Also**: [Related docs]
```

---

## 🔗 Multi-Environment Access

All development guidelines are accessible across environments:

| Environment           | Method                | Access                                        |
| --------------------- | --------------------- | --------------------------------------------- |
| **VS Code + Copilot** | Automatic discovery   | `.instructions.md` in `/docs/IMPLEMENTATION/` |
| **GitHub Codespaces** | Same as VS Code       | Identical workspace access                    |
| **Claude (Projects)** | Manual add to context | Add 5 files from `docs/IMPLEMENTATION/`       |
| **GitHub Web**        | Repository browser    | All files readable online                     |

**VS Code Native Discovery**: When working in `docs/IMPLEMENTATION/`, Copilot automatically loads `.instructions.md` — no config needed.

---

## 📋 Quick Reference: Core File Locations

### Veratown Systems

```
/home/olav/repo/ropeybot/bin/games/veratown/
├── Casino/       ← Casino game system
├── Dare/         ← Dare game system
├── veratownReleaseSystem.ts      ← 7-stage release
├── cageSystem.ts, bedSystem.ts, etc. ← Feature systems
└── veratown.ts   ← Main orchestrator
```

### Shared Infrastructure

```
/home/olav/repo/ropeybot/bin/games/shared/
├── mongodbGeneratedInterfaces.ts   ← Generated types
├── mongodbSchemaRegistry.ts        ← Schema registry
├── mongodbTypeValidation.ts        ← Factory functions
├── mongodbInspector.ts             ← Database analysis
└── unifiedCharacterStore.ts        ← Unified profile store
```

### Development Guides (NEWLY MODULARIZED)

```
/home/olav/repo/ropeybot/docs/IMPLEMENTATION/
├── .instructions.md                ← VS Code discovery file
├── GOLDEN_RULES.md                 ← 15 core rules + patterns
├── DATABASE_TYPE_SAFETY.md         ← Type safety guide
├── CODE_REVIEW_STANDARDS.md        ← Review checklists
├── DEBUGGING_PATTERNS.md           ← Troubleshooting
└── README.md                       ← Overview
```

### CLI Tools

```
scripts/database-type-safety.ts
  Commands: analyze, convert, generate, docs, help
  Usage: npx ts-node scripts/database-type-safety.ts help
```

---

## 🎓 Learning Path

### New to Veratown?

1. Read: [`README.md`](README.md) (project overview)
2. Read: [`docs/QUICK_START.md`](docs/QUICK_START.md) (5-minute intro)
3. Skim: [GOLDEN_RULES.md](docs/IMPLEMENTATION/GOLDEN_RULES.md) (patterns)
4. Reference: This file when starting tasks

### Experienced Developer?

→ Use task routing at top of this file to jump to specialized guides

### Code Review Time?

→ Jump to [CODE_REVIEW_STANDARDS.md](docs/IMPLEMENTATION/CODE_REVIEW_STANDARDS.md) for checklists

### Debugging an Issue?

→ Jump to [DEBUGGING_PATTERNS.md](docs/IMPLEMENTATION/DEBUGGING_PATTERNS.md) for diagnosis

---

## ✅ What This Router Provides

This file (`copilot-instructions.md`) serves as:

1. **Project Context** - Architecture overview, 7-stage flow, feature interface
2. **Quick Reference** - Golden rules summary, type safety patterns, review checklists
3. **Task Routing** - Direction to specialized guides based on your work
4. **Navigation** - Quick links to all development resources
5. **Learning Path** - Recommended reading order for new developers

**Detailed Guidance Lives In**: `docs/IMPLEMENTATION/` folder

- [GOLDEN_RULES.md](docs/IMPLEMENTATION/GOLDEN_RULES.md) - Coding standards (15 rules + full examples)
- [DATABASE_TYPE_SAFETY.md](docs/IMPLEMENTATION/DATABASE_TYPE_SAFETY.md) - Database patterns
- [CODE_REVIEW_STANDARDS.md](docs/IMPLEMENTATION/CODE_REVIEW_STANDARDS.md) - Review criteria
- [DEBUGGING_PATTERNS.md](docs/IMPLEMENTATION/DEBUGGING_PATTERNS.md) - Troubleshooting
- [.instructions.md](docs/IMPLEMENTATION/.instructions.md) - Navigation hub

---

## 🚀 Getting Started with a New Task

**Step 1:** Find your task in the "Quick Task Routing" table at top of this file  
**Step 2:** Click the link to jump to specialized guide  
**Step 3:** Follow patterns and examples provided  
**Step 4:** Reference "Code Review Standards" before submitting

---

**Last Updated**: 2026-09-03  
**Status**: Production routing guide with modular specialist guides  
**Version**: Hybrid approach - thin router + specialized files  
**Access Pattern**: Multi-environment compatible (VS Code, Codespaces, Claude, GitHub)

For complete navigation including all related files: [docs/IMPLEMENTATION/.instructions.md](docs/IMPLEMENTATION/.instructions.md)
