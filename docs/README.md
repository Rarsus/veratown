# Ropeybot Documentation

Welcome to the Ropeybot documentation. Start here to find what you need.

## 📖 Quick Navigation

- **New to the project?** → Start with [Quick Start](QUICK_START.md)
- **Setting up locally?** → See [Setup & Build](GUIDES/BUILD_SETUP.md)
- **Want to deploy?** → Check [Deployment Options](DEPLOYMENT/)
- **Preparing a release?** → Use the [Phase 4 Go-Live Checklist](DEPLOYMENT/PHASE_4_GO_LIVE_CHECKLIST.md)
- **Need system details?** → Read [Architecture](ARCHITECTURE/)
- **Developing a feature?** → Follow [Developer Guide](GUIDES/DEVELOPMENT.md)
- **Checking implementation status?** → Read [Current Implementation Status](../IMPLEMENTATION_STATUS_2026_09_07.md)
- **Planning Phase 2B?** → Read [Current Hybrid Strategy Plan](../HYBRID_STRATEGY_CURRENT_PLAN.md)
- **Integrating KidnappersGame?** → Read the [Phase 2B handoff](../PHASE_2B_HANDOFF.md)
- **Executing Phase 3?** → Read the [Phase 3 integration plan](../PHASE_3_INTEGRATION_PLAN.md)
- **Checking the Phase 3 baseline?** → Read the [combined baseline and merge inventory](../PHASE_3_BASELINE_INVENTORY.md)
- **Checking document lifecycle?** → Read the [Documentation Status Registry](../DOCUMENTATION_STATUS.md)

---

## 📂 Documentation Structure

### [Architecture](ARCHITECTURE/)

System design, data models, patterns, and architectural decisions.

- Keypad System architecture
- Unified State management
- Game system designs (Casino, Dare, Veratown)
- Plugin architecture and patterns
- Database and collection design

### [Deployment](DEPLOYMENT/)

Getting the bot running in production and staging environments.

- Railway deployment
- Google Cloud deployment
- Local Docker setup
- Verification and checklist
- Environment configuration

### [Implementation](IMPLEMENTATION/)

Development practices, testing strategy, and logging.

- Logging system guide and usage
- Testing approach (Node.js test module)
- Code standards and patterns
- Performance considerations
- KidnappersGame [developer and operations guide](../KIDNAPPERS_GAME_DEVELOPER_GUIDE.md)

### [Features](FEATURES/)

Documentation for game systems and bot features.

- Casino system
- Dare system
- Veratown areas and systems
- Bot invisibility features
- Item and content systems
- KidnappersGame [player guide](../KIDNAPPERS_GAME_PLAYER_GUIDE.md)

### [Guides](GUIDES/)

How-to guides and tutorials.

- Setup and installation
- Developer workflow
- MongoDB Atlas configuration
- Asset sync workflow
- Troubleshooting common issues

### [Reference](REFERENCE/)

API references, configuration, and system information.

- Release system
- Environment variables
- Database schema reference
- Configuration file format

### [Maintenance](MAINTENANCE/)

System administration and operations.

- Backup strategies
- Monitoring and logging
- Troubleshooting
- Performance tuning

### [Archived](archived/)

Historical documentation from previous phases and epics.

- Phase completion summaries
- Epic documentation
- Past migration guides
- Historical analysis

Current status reports and execution plans are kept at the repository root. Archived status snapshots are historical only and must not be used to determine readiness.
Document lifecycle is governed by [DOCUMENTATION_STATUS.md](../DOCUMENTATION_STATUS.md); `docs/refactor/` is legacy reference, not active phase guidance.

---

## 🔍 Find Documentation By Topic

| Topic                                  | Location                                                             |
| -------------------------------------- | -------------------------------------------------------------------- |
| How do I set up the bot locally?       | [Setup Guide](GUIDES/BUILD_SETUP.md)                                 |
| How do I use the logger?               | [Logging Guide](IMPLEMENTATION/LOGGING_GUIDE.md)                     |
| What's the Keypad system architecture? | [ARCHITECTURE/KEYPAD_SYSTEM_REFACTORING_BLUEPRINT.md](ARCHITECTURE/) |
| How do I deploy to Railway?            | [DEPLOYMENT/RAILWAY_DEPLOYMENT.md](DEPLOYMENT/)                      |
| Where are the game systems documented? | [FEATURES/](FEATURES/)                                               |
| What's the database design?            | [ARCHITECTURE/COMPLEX_COLLECTION_ARCHITECTURE.md](ARCHITECTURE/)     |
| How do I run tests?                    | [CONTRIBUTING.md](../CONTRIBUTING.md)                                |
| What environment variables are needed? | [GUIDES/ENVIRONMENT_VARIABLES.md](GUIDES/)                           |
| How do I play KidnappersGame?          | [Player guide](../KIDNAPPERS_GAME_PLAYER_GUIDE.md)                   |
| How do I integrate KidnappersGame?     | [Phase 2B handoff](../PHASE_2B_HANDOFF.md)                           |
| How do I execute Phase 3?              | [Phase 3 integration plan](../PHASE_3_INTEGRATION_PLAN.md)           |

---

## 📝 Contributing Documentation

When adding or updating documentation:

1. **Place in correct folder** based on topic (Architecture, Guides, etc.)
2. **Update navigation** in the relevant folder's README.md
3. **Link from here** if it's a major doc
4. **Use clear titles** that indicate content
5. **Link between related docs** for easy navigation

See [CONTRIBUTING.md](../CONTRIBUTING.md) for code contribution guidelines.

---

## 🚀 Key Files

- [README.md](../README.md) - Project overview
- [CHANGELOG.md](../CHANGELOG.md) - Version history
- [CONTRIBUTING.md](../CONTRIBUTING.md) - How to contribute
- [Quick Start](QUICK_START.md) - Get started quickly

---

**Last Updated**: 2026-09-07
**Total Documentation Files**: 60+ files organized by purpose  
**See Also**: [Archived Documentation](archived/) for historical reference
