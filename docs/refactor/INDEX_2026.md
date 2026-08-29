---
title: "Veratown+ Refactor Program Index"
subtitle: "Navigation hub for all refactoring documentation"
date: "August 29, 2026"
status: "Current"
---

# Veratown+ Refactor Program - Documentation Index

This is your navigation hub for all refactoring and improvement documentation. Use this to find the right document for your needs.

---

## 📊 Program Overview

**Status:** Phase 1 Ready | 91-115 hours planned | 2-3 weeks timeline  
**Focus:** Modularization, Integration, Testing, Documentation, Performance

---

## 🎯 Start Here Based on Your Role

### For Project Managers

1. **[ACTIONABLE_ROADMAP.md](./ACTIONABLE_ROADMAP.md)** - High-level epics, features, timeline, effort estimates
2. **[PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md)** (create if needed) - Quick status updates, progress tracking

### For Senior Developers / Architects

1. **[ACTIONABLE_ROADMAP.md](./ACTIONABLE_ROADMAP.md)** - Complete roadmap with risk analysis
2. **[ARCHITECTURAL_ANALYSIS.md](../VERATOWN_ARCHITECTURE_ANALYSIS.md)** - Current system analysis
3. **[IMPROVEMENTS.md](../IMPROVEMENTS.md)** - Detailed proposals for modularization

### For Mid-Level Developers

1. **[ACTIONABLE_ROADMAP.md](./ACTIONABLE_ROADMAP.md)** - Find your assigned feature
2. **[USER_STORIES.md](./USER_STORIES.md)** - Detailed implementation guide for your feature
3. **[ARCHITECTURAL_DECISIONS.md](../ARCHITECTURAL_DECISIONS.md)** - Understand why systems are designed this way

### For QA / Test Engineers

1. **[ACTIONABLE_ROADMAP.md](./ACTIONABLE_ROADMAP.md#epic-3-test-coverage--quality-assurance)** - EPIC 3 features
2. **Test specifications in USER_STORIES.md** - Acceptance criteria and test cases

### For New Team Members

1. **[ONBOARDING.md](../ONBOARDING.md)** (to be created in EPIC 4) - Quick start guide
2. **[ACTIONABLE_ROADMAP.md](./ACTIONABLE_ROADMAP.md)** - Understand what we're building
3. **[VERATOWN_ARCHITECTURE.md](../VERATOWN_ARCHITECTURE.md)** - Deep dive into current system

---

## 📁 Documentation Structure

### Core Planning Documents

| Document                                                             | Purpose                                                                             | For                       | Length   |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------- | -------- |
| [ACTIONABLE_ROADMAP.md](./ACTIONABLE_ROADMAP.md)                     | Complete refactor program with 5 epics, 20+ features, timeline, resource allocation | PMs, Architects, All Devs | 15 pages |
| [USER_STORIES.md](./USER_STORIES.md)                                 | Detailed implementation guide for each story (existing - check for updates)         | Developers                | Variable |
| [CODEBASE_EXPLORATION_SUMMARY.md](./CODEBASE_EXPLORATION_SUMMARY.md) | Analysis of current code patterns, test framework, file locations (existing)        | Developers                | 8 pages  |

### Architecture & Analysis

| Document                                                                  | Purpose                                                       | For        | Status      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------- | ----------- |
| [VERATOWN_ARCHITECTURE_ANALYSIS.md](../VERATOWN_ARCHITECTURE_ANALYSIS.md) | System-by-system deep dive, helper usage, patterns (existing) | Architects | ✅ Complete |
| [ARCHITECTURAL_DECISIONS.md](../ARCHITECTURAL_DECISIONS.md)               | Why systems are designed as they are (existing)               | All Devs   | ✅ Complete |
| [IMPROVEMENTS.md](../IMPROVEMENTS.md)                                     | Modularization opportunities identified (existing)            | Architects | ✅ Complete |

### Reference & Guides (To Be Created in EPIC 4)

| Document                       | Purpose                             | For        |
| ------------------------------ | ----------------------------------- | ---------- |
| `docs/architecture/ADR_*.md`   | Architecture Decision Records (10+) | All Devs   |
| `docs/api/VERATOWN_SYSTEMS.md` | API reference for each system       | Developers |
| `docs/api/HELPERS.md`          | API reference for helpers           | Developers |
| `docs/ONBOARDING.md`           | New developer quick start           | New Devs   |
| `docs/CONTRIBUTING.md`         | Code standards, comment guidelines  | All Devs   |

### Historical Documents (Reference)

| Document                                                               | Purpose                        | Status       |
| ---------------------------------------------------------------------- | ------------------------------ | ------------ |
| [REFACTOR_ROADMAP.md](./REFACTOR_ROADMAP.md)                           | Original roadmap (Sprints 1-3) | ✅ Completed |
| [SPRINT1_COMPLETION_REPORT.md](./SPRINT1_COMPLETION_REPORT.md)         | Sprint 1 results               | ✅ Completed |
| [SPRINT2_IMPLEMENTATION_REPORT.md](./SPRINT2_IMPLEMENTATION_REPORT.md) | Sprint 2 results               | ✅ Completed |
| [INDEX.md](./INDEX.md)                                                 | Original documentation index   | Archived     |
| [README.md](./README.md)                                               | Original refactor overview     | Archived     |

---

## 🎯 Program Epics Overview

### EPIC 1: Modularization & Refactoring

**Goal:** Reduce duplication by 80%, improve testability  
**Features:** 12 features across Casino, Dare, Veratown  
**Effort:** 28-35 hours  
**Timeline:** Phase 1-2

**Key Features:**

- 1.1: Casino modularization (ForfeitService, BioManager, BetValidator, GameTimer)
- 1.2: Dare modularization (TurnOrderManager, TurnTimerManager, DisconnectTracker, etc.)
- 1.3: Veratown enhancements (Keypad door groups)

---

### EPIC 2: Casino Integration into Veratown

**Goal:** Unified player experience, shared architecture  
**Features:** 4 features  
**Effort:** 12-15 hours  
**Timeline:** Phase 2

**Key Features:**

- 2.1: Create CasinoVenueSystem (location-based casino)
- 2.2: Separate game logic from UI
- 2.3: Unified chip economy (Veratown database)
- 2.4: Optional narrator bot

---

### EPIC 3: Test Coverage & Quality Assurance

**Goal:** +40% test coverage, catch regressions  
**Features:** 5 features  
**Effort:** 25-32 hours  
**Timeline:** Phase 3

**Key Features:**

- 3.1: Helper module tests (20+ tests)
- 3.2: System integration tests (10+ tests)
- 3.3: Casino unit tests (30+ tests)
- 3.4: Dare system tests (25+ tests)
- 3.5: E2E test framework (5 scenarios)

---

### EPIC 4: Documentation & Team Enablement

**Goal:** Enable new developers, reduce onboarding time to <3 hours  
**Features:** 5 features  
**Effort:** 17-21 hours  
**Timeline:** Phase 4

**Key Features:**

- 4.1: Architecture Decision Records (10+)
- 4.2: API Reference Documentation
- 4.3: Onboarding Guide
- 4.4: Code Comment Standards
- 4.5: Video Walkthroughs (optional)

---

### EPIC 5: Performance Optimization

**Goal:** 30-50% faster queries, 20-30% reduced memory  
**Features:** 3 features  
**Effort:** 9-12 hours  
**Timeline:** Phase 5

**Key Features:**

- 5.1: Performance monitoring
- 5.2: Database optimization
- 5.3: Memory optimization

---

## 🔄 Current Status

### Completed

- ✅ EPIC 1.0: Helper framework (7 modules, 100% compliance)
- ✅ Sprint 1-3: Core system fixes (all systems using helpers)
- ✅ PosturePreserver: Parole stripping posture preservation
- ✅ Current Architecture Analysis (See VERATOWN_ARCHITECTURE_ANALYSIS.md)

### In Progress

- ⏳ Phase 1: Starting modularization work

### Planned

- 🔲 EPIC 2: Casino integration
- 🔲 EPIC 3: Test expansion
- 🔲 EPIC 4: Documentation
- 🔲 EPIC 5: Performance

---

## 📊 Key Metrics

| Metric                         | Current      | Target   | Status      |
| ------------------------------ | ------------ | -------- | ----------- |
| Duplicated lines (casino/dare) | ~200-250     | <50      | 📊 EPIC 1   |
| Test count                     | 46           | 100+     | 📊 EPIC 3   |
| System helper adoption         | 11/11 (100%) | 11/11    | ✅ Complete |
| Avg DB query time              | Unknown      | <50ms    | 📊 EPIC 5   |
| Memory per bot                 | Unknown      | <100MB   | 📊 EPIC 5   |
| New dev onboarding             | 8+ hours     | <3 hours | 📊 EPIC 4   |

---

## 🚀 How to Use This Documentation

### Implementing a Feature

1. Go to [ACTIONABLE_ROADMAP.md](./ACTIONABLE_ROADMAP.md)
2. Find your feature (e.g., "Feature 1.1.1: Extract ForfeitService Module")
3. Read the acceptance criteria
4. Check [USER_STORIES.md](./USER_STORIES.md) for implementation details
5. Reference [ARCHITECTURAL_DECISIONS.md](../ARCHITECTURAL_DECISIONS.md) for design rationale
6. Write tests based on acceptance criteria
7. Reference existing systems (see VERATOWN_ARCHITECTURE_ANALYSIS.md)

### Understanding Architecture

1. Start with [VERATOWN_ARCHITECTURE_ANALYSIS.md](../VERATOWN_ARCHITECTURE_ANALYSIS.md)
2. Read [ARCHITECTURAL_DECISIONS.md](../ARCHITECTURAL_DECISIONS.md)
3. Check `.instructions.md` for Golden Rules
4. Review example implementations (e.g., BedSystem, CageSystem)

### Onboarding New Developer

1. Start with "For New Team Members" section above
2. Read [ONBOARDING.md](../ONBOARDING.md) (when created)
3. Complete quick-start checklist
4. Review [ACTIONABLE_ROADMAP.md](./ACTIONABLE_ROADMAP.md#epic-4-documentation--team-enablement) for learning resources

### Tracking Progress

1. Check [ACTIONABLE_ROADMAP.md](./ACTIONABLE_ROADMAP.md#timeline--prioritization)
2. Monitor EPIC completion in each phase
3. Update PROJECT_SUMMARY.md with weekly progress
4. Report blockers and risks

---

## 🔗 Quick Links by Topic

### Casino System

- Modularization plan: [ACTIONABLE_ROADMAP.md#epic-11](./ACTIONABLE_ROADMAP.md)
- Veratown integration: [ACTIONABLE_ROADMAP.md#epic-2](./ACTIONABLE_ROADMAP.md)
- Current analysis: [VERATOWN_ARCHITECTURE_ANALYSIS.md](../VERATOWN_ARCHITECTURE_ANALYSIS.md)
- Improvement proposals: [IMPROVEMENTS.md](../IMPROVEMENTS.md#casino-system)

### Dare System

- Modularization plan: [ACTIONABLE_ROADMAP.md#epic-12](./ACTIONABLE_ROADMAP.md)
- Current analysis: [VERATOWN_ARCHITECTURE_ANALYSIS.md](../VERATOWN_ARCHITECTURE_ANALYSIS.md)
- Improvement proposals: [IMPROVEMENTS.md](../IMPROVEMENTS.md#dare-game)

### Veratown Systems

- Architecture: [VERATOWN_ARCHITECTURE_ANALYSIS.md](../VERATOWN_ARCHITECTURE_ANALYSIS.md)
- Design decisions: [ARCHITECTURAL_DECISIONS.md](../ARCHITECTURAL_DECISIONS.md)
- System breakdown: [IMPROVEMENTS.md](../IMPROVEMENTS.md#veratown)

### Helper Modules

- Architecture: [VERATOWN_ARCHITECTURE_ANALYSIS.md](../VERATOWN_ARCHITECTURE_ANALYSIS.md#shared-helpers-library)
- Golden Rules: [.instructions.md](../../.instructions.md)
- Test plan: [ACTIONABLE_ROADMAP.md#feature-31](./ACTIONABLE_ROADMAP.md)

### Testing

- Test plan: [ACTIONABLE_ROADMAP.md#epic-3](./ACTIONABLE_ROADMAP.md)
- Current tests: [CODEBASE_EXPLORATION_SUMMARY.md](./CODEBASE_EXPLORATION_SUMMARY.md#2-test-framework-setup)
- Test examples: [USER_STORIES.md](./USER_STORIES.md#testing-strategy)

### Documentation

- Documentation plan: [ACTIONABLE_ROADMAP.md#epic-4](./ACTIONABLE_ROADMAP.md)
- Existing docs: [VERATOWN_ARCHITECTURE.md](../VERATOWN_ARCHITECTURE.md)
- Code review checklist: [.instructions.md](../../.instructions.md)

---

## 📞 Getting Help

### Questions About

- **Features/Stories:** Check [ACTIONABLE_ROADMAP.md](./ACTIONABLE_ROADMAP.md) or [USER_STORIES.md](./USER_STORIES.md)
- **Architecture:** Check [VERATOWN_ARCHITECTURE_ANALYSIS.md](../VERATOWN_ARCHITECTURE_ANALYSIS.md) or [ARCHITECTURAL_DECISIONS.md](../ARCHITECTURAL_DECISIONS.md)
- **Golden Rules:** Check [.instructions.md](../../.instructions.md)
- **Patterns:** Check [IMPROVEMENTS.md](../IMPROVEMENTS.md#modularization-opportunities)
- **Implementation:** Check example systems in `bin/games/veratown/`
- **Testing:** Check test files in `bin/games/veratown/shared/__tests__/`

### Common Questions

**Q: Where do I put my new feature?**  
A: See [VERATOWN_ARCHITECTURE_ANALYSIS.md](../VERATOWN_ARCHITECTURE_ANALYSIS.md#architecture-overview) for structure. Check existing system (e.g., CageSystem) for pattern.

**Q: What patterns should I follow?**  
A: Check [.instructions.md](../../.instructions.md) for Golden Rules and [VERATOWN_ARCHITECTURE_ANALYSIS.md](../VERATOWN_ARCHITECTURE_ANALYSIS.md#shared-helpers-library) for helpers.

**Q: How do I test my changes?**  
A: See [ACTIONABLE_ROADMAP.md#epic-3](./ACTIONABLE_ROADMAP.md) for test plan and [USER_STORIES.md](./USER_STORIES.md#testing-strategy) for examples.

**Q: What if my feature doesn't fit the pattern?**  
A: Document it as a proposal in this roadmap. Follow [ARCHITECTURAL_DECISIONS.md](../ARCHITECTURAL_DECISIONS.md) format for design decisions.

---

## 📈 Success Criteria

Program is successful when:

- ✅ All EPIC 1-2 features implemented with tests passing
- ✅ 40% test coverage increase (EPIC 3)
- ✅ New developers productive in <3 hours (EPIC 4)
- ✅ Database queries <50ms average (EPIC 5)
- ✅ Zero regressions in playtesting
- ✅ Team trained on patterns and can maintain compliance

---

## 📝 Document Maintenance

This index is maintained as the source of truth for the refactor program.

**Update this document when:**

- New EPIC or feature is added to roadmap
- Feature is completed (check off)
- New documentation is created
- Status changes (in progress, completed, blocked)

**Last Updated:** 2026-08-29  
**Maintained By:** Senior Development Team  
**Review Frequency:** Weekly during active phases

---

## 🔐 Access & Distribution

- **Repository:** ropeybot
- **Path:** `docs/refactor/`
- **Distribution:** Team access via git
- **Status:** Current - Active development

---

**For detailed feature specifications, see [ACTIONABLE_ROADMAP.md](./ACTIONABLE_ROADMAP.md)**
