# Ropeybot Documentation

Welcome to the Ropeybot documentation. Start here to find what you need.

## 📖 Quick Navigation

- **New to the project?** → Start with [Quick Start](QUICK_START.md)
- **Setting up locally?** → See [Setup & Build](GUIDES/BUILD_SETUP.md)
- **Want to deploy?** → Check [Deployment Options](DEPLOYMENT/)
- **Need system details?** → Read [Architecture](ARCHITECTURE/)
- **Developing a feature?** → Follow [Developer Guide](GUIDES/DEVELOPMENT.md)
- **Checking implementation status?** → Read [Current Implementation Status](../IMPLEMENTATION_STATUS_2026_09_05.md)
- **Planning Phase 2B?** → Read [Current Hybrid Strategy Plan](../HYBRID_STRATEGY_CURRENT_PLAN.md)

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

### [Features](FEATURES/)

Documentation for game systems and bot features.

- Casino system
- Dare system
- Veratown areas and systems
- Bot invisibility features
- Item and content systems

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

**Last Updated**: 2026-09-05
**Total Documentation Files**: 60+ files organized by purpose  
**See Also**: [Archived Documentation](archived/) for historical reference
