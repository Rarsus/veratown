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
