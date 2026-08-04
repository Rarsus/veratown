# Database Backup Manifest

## Pre-Refactoring Backups

### Backup Strategy
Since mongodump is not available in this environment, backups are managed through:
1. **Git Commits** - All code changes are version-controlled
2. **Branch Management** - Each phase can be rolled back via git
3. **Database Recovery** - If MongoDB container is persistent, volume snapshot can be restored

### Phase 1: Shared Utilities Extraction
- **Date**: 2026-08-04 11:45 CEST
- **Commit**: (to be added after phase)
- **Status**: Code-only changes, no database modifications
- **Rollback**: `git revert [commit-hash]`

### Phase 2: Casino as VeratownFeatureSystem
- **Date**: (to be added)
- **Commit**: (to be added after phase)
- **Status**: Code refactoring only
- **Rollback**: `git revert [commit-hash]`

### Phase 3: Dare Organization (Optional)
- **Date**: (to be added)
- **Commit**: (to be added after phase)
- **Status**: Code refactoring only
- **Rollback**: `git revert [commit-hash]`

### Phase 4: main.ts Simplification
- **Date**: (to be added)
- **Commit**: (to be added after phase)
- **Status**: Code refactoring only
- **Rollback**: `git revert [commit-hash]`

### Phase 5: Testing & Documentation
- **Date**: (to be added)
- **Commit**: (to be added after phase)
- **Status**: Documentation and tests
- **Rollback**: `git revert [commit-hash]`

### Phase 6: Region Management System
- **Date**: 2026-08-04 14:20 CEST
- **Commit**: 13752f8
- **Status**: Complete - Database persistence with fallback
- **Rollback**: `git revert 13752f8 && docker-compose restart ropeybot`
- **Changes**:
  - RegionManager class with in-memory region tracking
  - VeratownLocationStore extended to support region boundaries
  - Admin commands for region CRUD: !location region add/get/update/delete/list/validate
  - Static region fallbacks (game_region, dare_region)
  - Conflict detection between database and static definitions
  - Character entry/exit tracking with NEW entry detection
- **Database**: No schema changes, regions stored as type="region" documents with region boundaries

---

## How to Restore from Git

If any phase needs to be rolled back:

```bash
# See commit history
git log --oneline

# Revert specific commit
git revert [commit-hash]

# Or reset to before refactoring started
git reset --hard [pre-refactoring-commit]

# Then restart container
docker-compose restart ropeybot
```

---

## Notes

- All changes are backward-compatible where possible
- Standalone Dare/Casino modes kept for non-Veratown deployments
- Database schema unchanged - no migrations needed
- Config format unchanged

---

## PHASE 1 COMPLETION ✅

**Date**: 2026-08-04 11:50 CEST  
**Commit**: 27bc902  
**Changes**:
- Created bin/games/shared/locationUtils.ts with loadRegionFromDatabase()
- Created bin/games/shared/commandParserFactory.ts  
- Updated dare.ts and casino.ts to use shared utilities
- Eliminated ~40 lines of duplicate code
- Reduced casino.loadGameRegion() by 50%

**Testing**: ✓ Compilation ✓ Docker startup ✓ Bot connects successfully

**Rollback**: `git revert 27bc902` then `docker-compose restart ropeybot`

---

## PHASE 2 COMPLETION ✅

**Date**: 2026-08-04 12:15 CEST  
**Commit**: 0f0fc5a  
**Changes**:
- Casino now implements VeratownFeatureSystem interface
- Split initialization: constructor (properties) + registerTriggers (commands/events)
- Casino constructor accepts optional CommandParser for unified parsing
- Add 'enabled' checks to all event handlers
- Integrated Casino into Veratown feature lifecycle
- Casino uses shared locationUtils for region loading

**Benefits**:
- `/bot feature disable casino` now works
- `/bot feature list` includes casino
- Unified CommandParser (1 vs 3 previously)
- Full fault isolation via guardHandler
- Consistent initialization pattern with other systems

**Testing**: ✓ Compilation ✓ Docker startup ✓ Bot connects successfully

**Rollback**: `git revert 0f0fc5a` then `docker-compose restart ropeybot`

---


---

## PHASE 4 COMPLETION ✅

**Date**: 2026-08-04 12:20 CEST  
**Commit**: 3e44e99  
**Changes**:
- Removed standalone "casino" case from game selector
- Casino now exclusively initialized through Veratown feature system
- Pool roulette Casino setup unchanged (advanced deployment path)
- Simplified main.ts logic

**Benefits**:
- Single entry point for Casino (Veratown)
- Fewer code paths in main.ts
- Clearer game mode separation
- Easier to understand and maintain

**Testing**: ✓ Compilation ✓ Docker startup ✓ Bot connects successfully

**Rollback**: `git revert 3e44e99` then `docker-compose restart ropeybot`

---

