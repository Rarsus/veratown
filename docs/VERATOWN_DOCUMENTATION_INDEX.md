# Veratown+ Documentation Index

Complete documentation suite for Veratown+, a persistent-world roleplay bot with integrated games, multi-bot architecture, and dynamic region management.

**Documentation Last Updated**: 2026-08-04  
**Project Version**: 1.0 (Casino Integration & Region Management Complete)

---

## Quick Navigation

### 🚀 For Deployment & Operations
- **[Railway Deployment](RAILWAY_DEPLOYMENT.md)** - **Easiest option** (10 min, $5/month, auto-deploy from GitHub)
- **[Environment Variables](ENVIRONMENT_VARIABLES.md)** - Configure bot via env vars (required for cloud deployment)
- **[MongoDB Atlas Setup](MONGODB_ATLAS_SETUP.md)** - Cloud database guide (recommended, free tier available)
- **[Google Cloud Quick Start](GOOGLE_CLOUD_QUICK_START.md)** - 30-minute setup for Compute Engine + GitHub Actions
- **[Google Cloud Deployment Guide](GOOGLE_CLOUD_DEPLOYMENT.md)** - Complete options (Compute Engine, GKE, Cloud Run) with detailed configuration
- **[docs/BUILD_SETUP.md](BUILD_SETUP.md)** - Local build and Docker setup guide

### �📘 For Players & Game Masters
- **[Quick Start Guide](#quick-start-guide)** - Get running in 5 minutes
- **[Game Features](#game-features)** - What you can do in Veratown
- **[Commands Reference](#commands-reference)** - All player & admin commands
- **[Troubleshooting](#troubleshooting)** - Common issues & fixes

### 🔧 For Developers
- **[Architecture Deep Dive](VERATOWN_ARCHITECTURE.md)** - Technical design & systems
- **[Development Guide](VERATOWN_COMPLETE_GUIDE.md#development-guide)** - Add new features
- **[Multi-Bot System](VERATOWN_COMPLETE_GUIDE.md#multi-bot-architecture)** - Coordination patterns
- **[Database Design](VERATOWN_ARCHITECTURE.md#database-design)** - MongoDB schemas

### 🗺️ For Map Designers
- **[Map & Regions Reference](VERATOWN_MAP_REGIONS_IMPROVEMENTS.md)** - Complete map layout
- **[Furniture Map Objects](FURNITURE_MAP_OBJECTS.md)** - 13 bondage furniture types with map objects, commands, and examples
- **[Door System](VERATOWN_DOORS.md)** - Keypad doors, group codes, tile styles, and exit protection
- **[Region Definitions](VERATOWN_MAP_REGIONS_IMPROVEMENTS.md#region-definitions)** - All regions with coordinates
- **[Map Tools](VERATOWN_MAP_REGIONS_IMPROVEMENTS.md#map-editor--tools)** - Edit, export, import
- **[Planned Improvements](VERATOWN_MAP_REGIONS_IMPROVEMENTS.md#planned-improvements)** - Future features

### 📊 Original Documentation
- **[docs/VERATOWN.md](VERATOWN.md)** - Original feature documentation (for reference)
- **[docs/REGION_MANAGEMENT.md](REGION_MANAGEMENT.md)** - Region system overview
- **[docs/BUILD_SETUP.md](BUILD_SETUP.md)** - Build & deployment guide

---

## Quick Start Guide

### Installation (Docker)

```bash
# 1. Clone repository
git clone https://github.com/FriendsOfBC/ropeybot.git
cd ropeybot

# 2. Create config
cp config.sample.json config.json
# Edit config.json with your bot credentials

# 3. Run with MongoDB
docker-compose up -d --build

# 4. Verify startup
docker logs ropeybot | tail -20
```

### Installation (Local)

```bash
# 1. Install dependencies
pnpm install

# 2. Create config
cp config.sample.json config.json

# 3. Run
pnpm start
```

### Configuration Template

```json
{
    "user": "YourBotName",
    "password": "bot_password",
    "user2": "ShowerBot",      // optional
    "password2": "bot_password",
    "user3": "CasinoBot",      // optional - enables casino
    "password3": "bot_password",
    "game": "veratown",
    "mongo_uri": "mongodb://mongo:27017",
    "mongo_db": "veratown",
    "mongo_tls": false,
    "room": {
        "Name": "Veratown",
        "Description": "A persistent roleplay world",
        "Space": "X"
    }
}
```

---

## Game Features

### 10 Core Features

| Feature | Type | Players | Commands | Status |
|---------|------|---------|----------|--------|
| **Cages** | Restraint | 1/cage | N/A (auto) | ✅ Full |
| **Kennels** | Roleplay | 1/kennel | N/A (auto) | ✅ Full |
| **Furniture Bondage** | Configurable | Varies | `/bot location` | ✅ Full |
| **Showers** | Sequence | 1 at a time | N/A (auto) | ✅ Full |
| **Beds** | Auto-equip | 1/bed | N/A (emotion-based) | ✅ Full |
| **Bunny Park** | Punishment | Unlimited | N/A (auto) | ✅ Full |
| **Windows** | Narration | Unlimited | N/A (auto) | ✅ Full |
| **Trashcan** | Constraint | Unlimited | N/A (auto) | ✅ Full |
| **Dare Game** | Game | 4-6 | `/bot dare` | ✅ Full |
| **Casino** | Games | Unlimited | `/bot chips/roulette/blackjack` | ✅ Full (Conn3) |

### Feature Highlights

**Cages**: 3 locations with automatic timer-based release. Consent-based with detailed entry notice.

**Furniture Bondage**: Fully configurable bondage furniture with customizable restraints, optional durations, and admin management.

**Dare Game**: 10-round turn-based game with forfeits. Integrated with Casino chip economy.

**Casino**: Roulette & Blackjack with persistent chip balances. Runs on separate bot (Game Mistress) to avoid appearance conflicts.

**Region Management**: All multi-tile features track character entry/exit to prevent duplicate execution.

---

## Commands Reference

### Player Commands (via `/bot`)

```
HELP & INFO
/bot help              - Display all available commands
/bot feature list      - List available features
/bot changelog         - View recent updates
/bot pick              - Random select another player

DARE GAME
/bot dare join         - Enter dare game
/bot dare leave        - Exit dare game
/bot dare start        - Begin round (when admin)

CASINO
/bot chips             - Check chip balance
/bot roulette [amt]    - Play roulette (bet amount or forfeit)
/bot blackjack [amt]   - Play blackjack
/bot help              - Casino rules & forfeit table

GENERAL
/bot freeandleave      - Remove all restraints and leave room
```

### Admin Commands

```
FEATURE MANAGEMENT
/bot feature enable|disable <name>   - Toggle feature
  Names: cage, kennel, shower, bed, bunnyPark, window, trashcan, dare, casino

MAP MANAGEMENT
/bot map update                       - Save current map to database
/bot map reset                        - Restore default map
/bot map export                       - Export layout for backup

LOCATION DATABASE
/bot location add <key> <name> <type> <x> <y> [data_json]   - Add location
/bot location get <key>                                      - View location
/bot location update <key> <field> <value>                  - Update (dot notation: data.field)
/bot location delete <key>                                   - Delete location
/bot location list                                           - List all

REGION MANAGEMENT
/bot location region add <key> <x1> <y1> <x2> <y2> <type>   - Add region
/bot location region get <key>                               - View region
/bot location region update <key> <x1> <y1> <x2> <y2> <type> - Update
/bot location region delete <key>                            - Delete
/bot location region list                                    - List all
/bot location region validate                                - Check conflicts

CHARACTER MANAGEMENT
/bot strip <name>                    - Remove clothing
/bot adminhelp                       - All admin commands

MAINTENANCE
/bot maintenance                     - Begin shutdown sequence
```

---

## Architecture Overview

### Multi-Bot System

**3 Independent Connections**:

1. **Main Reception Bot** (`user`/`password`)
   - Receptionist, feature coordination
   - Manages 8 core Veratown features
   - Routes admin commands
   - Appearance: Clean (no game items)

2. **Shower Narrator Bot** (`user2`/`password2`) - Optional
   - Narrates shower sequences
   - Keeps main bot free for other operations
   - Parked safely between uses

3. **Casino Bot** (`user3`/`password3`) - Optional
   - Operates Casino feature (Roulette, Blackjack)
   - Game Mistress character
   - Independent CommandParser (casino commands on this bot only)
   - Appearance: Has game items (roulette wheels, etc)

**Why Multiple Bots?**

- **Appearance Isolation**: Casino can't modify main bot's appearance
- **Command Routing**: Each bot has independent message handlers
- **Independence**: Features don't block each other
- **Graceful Degradation**: Works if user2/user3 not configured

### Region Management System

**Problem**: Multi-tile features would trigger repeatedly as players move around.

**Solution**: RegionManager tracks character entry/exit per region.

```typescript
// In feature command handler:
if (regionManager.markCharacterEntered("dare_region", sender.MemberNumber)) {
    // Execute game initialization - only happens ONCE per region entry
    await startGame();
} else {
    // Player already in region - skip
}
```

**Benefits**:
- Commands execute once per region entry (not per tile)
- Prevents spam/duplicate execution
- Supports multi-tile features naturally

### Database Architecture

**MongoDB Backend** (optional, enables advanced features):

```
veratownLocations collection
├── Point locations (exact coordinates)
├── Region locations (boundary boxes)
├── Feature metadata
└── Game state
```

**Static Fallback**: If database unavailable, uses hardcoded region definitions.

---

## Development Guide

### Adding a New Feature

1. **Create feature class** (`bin/games/veratown/myFeatureSystem.ts`):

```typescript
import { VeratownFeatureSystem } from "./featureSystem";

export class MyFeatureSystem implements VeratownFeatureSystem {
    public key = "myfeature";
    public label = "My Feature";
    public enabled = true;

    constructor(private conn: API_Connector) {}

    public registerTriggers(): void {
        // Register tile/region triggers, commands, handlers
        this.conn.chatRoom?.map.addTileTrigger(
            {X: 10, Y: 10},
            (character) => {
                this.conn.SendMessage("Whisper", character.MemberNumber, "Hello!");
            }
        );
    }
}
```

2. **Add to Veratown** (`bin/games/veratown.ts`):

```typescript
import { MyFeatureSystem } from "./veratown/myFeatureSystem";

// In constructor:
this.myFeature = this.initFeature(
    () => new MyFeatureSystem(this.conn, this.locationStore, FALLBACK)
);

// Add to features array via initFeature() (automatic)
// Update help text to mention new feature
```

3. **Register commands**:

```typescript
// In MyFeatureSystem.registerTriggers():
this.commandParser.register("mycommand", (sender, args) => {
    // Handle command
});
```

4. **Deploy**:

```bash
pnpm bundle
docker-compose restart ropeybot
```

### Testing Locally

```bash
# Build
pnpm bundle

# Run
pnpm start

# In another terminal (or in BC):
/bot help              # Test help text
/bot feature list      # Verify feature loads
```

---

## Troubleshooting

### Casino Commands Not Working

**Symptoms**: `/bot chips` ignored or "command not found"

**Check**:
```bash
# Verify user3 configured
grep user3 config.json

# Verify casino bot online
docker logs ropeybot | grep "Casino\|Game Mistress"
```

**Fix**:
1. Ensure `user3` and `password3` in config.json
2. Restart bot: `docker-compose restart ropeybot`
3. Verify in casino region (commands only work there)

### Region Commands Failing

**Symptoms**: `/bot location` commands return "admin only" or error

**Check**:
1. Are you admin in the room?
2. Is MongoDB running? `docker-compose ps | grep mongo`
3. Check logs: `docker logs ropeybot | grep -i error`

**Fix**:
```bash
# Verify MongoDB connectivity
docker logs ropeybot-mongo | tail -10

# Ensure bot admin status
/bot adminhelp  # If this works, you're admin
```

### Bot Won't Start

**Check startup sequence**:
```bash
docker logs ropeybot | head -50
```

**Common issues**:

1. **MongoDB connection failed**:
   - Check `mongo_uri` in config.json
   - Verify MongoDB running: `docker-compose ps`

2. **Login failed**:
   - Check credentials in config.json
   - Verify bot account exists on BC

3. **Room not found**:
   - Check `room.Name` in config.json
   - Verify room exists or create manually

### Performance Issues

**Check for lagging**:
```bash
docker logs ropeybot | grep -i throttl
```

**Solutions**:
1. Reduce message frequency in features
2. Optimize database queries
3. Check MongoDB performance: `docker stats`

---

## Full Documentation Files

### Complete Guides
- [VERATOWN_COMPLETE_GUIDE.md](VERATOWN_COMPLETE_GUIDE.md) - Everything in one place
- [VERATOWN_ARCHITECTURE.md](VERATOWN_ARCHITECTURE.md) - Technical deep dive
- [VERATOWN_MAP_REGIONS_IMPROVEMENTS.md](VERATOWN_MAP_REGIONS_IMPROVEMENTS.md) - Map & regions

### Reference
- [docs/VERATOWN.md](VERATOWN.md) - Original feature documentation
- [docs/REGION_MANAGEMENT.md](REGION_MANAGEMENT.md) - Region system
- [docs/BUILD_SETUP.md](BUILD_SETUP.md) - Build & deployment
- [docs/BONDAGE.md](BONDAGE.md) - Item & bondage mechanics
- [docs/LOCKS.md](LOCKS.md) - Lock types & API
- [docs/HOWTOS.md](HOWTOS.md) - Development patterns

### Maintenance
- [docs/IMPROVEMENTS.md](IMPROVEMENTS.md) - Code review results
- [docs/CREDITS.md](CREDITS.md) - Contributors
- [docs/REPOSITORY_ANALYSIS.md](REPOSITORY_ANALYSIS.md) - Repo structure

---

## Key Statistics

| Metric | Value |
|--------|-------|
| **Features** | 9 (8 Veratown + 1 Casino) |
| **Regions** | 8 defined |
| **Map Size** | 50×50 tiles |
| **Max Players** | Unlimited (per feature) |
| **Connections** | 3 optional (main + shower + casino) |
| **MongoDB Collections** | 1 (veratownLocations) |
| **Admin Commands** | 20+ |
| **Player Commands** | 12+ |
| **Build Size** | ~5.2 MB (esbuild bundle) |
| **Build Time** | ~300-400ms |

---

## Support & Contributing

### Getting Help

1. **Check troubleshooting**: See [Troubleshooting](#troubleshooting) section above
2. **Search docs**: Use Ctrl+F to search this index and linked docs
3. **Check GitHub Issues**: https://github.com/FriendsOfBC/ropeybot/issues
4. **View logs**: `docker logs ropeybot | tail -50`

### Contributing

1. Fork repository
2. Create feature branch
3. Make changes
4. Update documentation
5. Test locally
6. Submit PR

See [docs/CONTRIBUTIONS.md](CONTRIBUTIONS.md) for details (if it exists).

---

## Version History

### v1.0 (Current) - 2026-08-04
- ✅ Complete multi-bot architecture (3 connections)
- ✅ Casino integration with separate bot (conn3)
- ✅ Region management system with MongoDB persistence
- ✅ 9 features fully integrated
- ✅ Comprehensive documentation suite

### v0.9 - 2026-07-31
- Region manager built and tested
- Casino reintegration with conn3
- Documentation created

### v0.8 - 2026-07-28
- Appearance conflict fixed
- Multi-bot system refined

---

## Quick Links

- **GitHub**: https://github.com/FriendsOfBC/ropeybot
- **Discord**: [Link if available]
- **Issues**: https://github.com/FriendsOfBC/ropeybot/issues
- **Docker Image**: ghcr.io/FriendsOfBC/ropeybot:main

---

## License

Ropeybot code is licensed under Apache 2.0. Some game code (Dare, Casino forfeits) used with permission from original authors.

See LICENSE file for details.

---

**Documentation Maintainer**: Development Team  
**Last Updated**: 2026-08-04  
**Next Review**: 2026-08-31 (or when major features added)
