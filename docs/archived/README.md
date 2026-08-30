# Documentation Archive

This folder contains historical and superseded documentation files that are no longer actively maintained but preserved for reference.

## Archive Contents

### Historical Phase Completion Reports

- `PHASE1_COMPLETION_REPORT.md` - Snapshot of Phase 1 completion (Aug 29, 2026)
- `PHASE2_COMPLETION_STATUS.md` - Snapshot of Phase 2 completion status (Aug 30, 2026)

**When to use:** Historical reference of completed work. For current architecture, see `UNIFIED_STATE_ARCHITECTURE.md`

### Phase Planning Documents (Completed Work)

- `PHASE2.2_EVENT_SUBSCRIBERS.md` - Phase 2.2 planning (completed)
- `PHASE2.3_ADAPTER_INTEGRATION.md` - Phase 2.3 planning (completed)
- `PHASE2_ADAPTER_DEPLOYMENT.md` - Phase 2 adapter deployment planning (completed)

**When to use:** Understanding how planning progressed. For current implementation, see `PHASE2.4_GRADUAL_MIGRATION.md`

### Old Version Migration Documents

- `R131_MIGRATION_PLAN.md` - Upgrade plan from R131 version
- `R131_MIGRATION_STATUS.md` - R131 migration status tracking
- `R131_MIGRATION_QUICK_SUMMARY.md` - R131 migration quick reference

**When to use:** If debugging issues from old R131 version upgrade. Only relevant for historical context.

### Deprecated Bugfixes (Superseded by Newer Versions)

- `PAROLE_CACHE_FIX.md` - Original parole cache fix (superseded by V2)

**When to use:** Never. Use `PAROLE_CACHE_FIX_V2.md` in parent directory instead.

### Analysis & Status Reports (Point-in-Time Snapshots)

- `CONSOLIDATION_ANALYSIS_CASINO_DARE.md` - Casino/Dare system analysis (planning phase)
- `ROADMAP_STATUS_REPORT_2026_08_29.md` - Development status snapshot from Aug 29
- `DOCUMENTATION_UPDATE_SUMMARY.md` - Summary of documentation updates

**When to use:** Historical reference only. For current status, see `UNIFIED_STATE_ARCHITECTURE.md`

---

## How to Use Archived Documents

### Finding Archived Docs

```bash
# Search archived documentation
grep -r "search_term" docs/archived/

# List all archived files
ls -la docs/archived/
```

### When to Reference Archived Docs

1. **Debugging historical issues:** Understanding how old code was implemented
2. **Version compatibility:** If supporting old R131 version upgrades
3. **Design evolution:** Seeing how decisions were made during planning phases
4. **Troubleshooting legacy systems:** Understanding deprecated approaches

### When NOT to Reference Archived Docs

- For current architecture: Use `UNIFIED_STATE_ARCHITECTURE.md`
- For current implementation: Use `PHASE2.4_GRADUAL_MIGRATION.md`
- For system guides: Use appropriate `VERATOWN_*.md` or deployment docs
- For current fixes: Use parent directory versions (e.g., `PAROLE_CACHE_FIX_V2.md`)

---

## Current Documentation Structure

For active development, see these master references:

**Master Architecture:** [`UNIFIED_STATE_ARCHITECTURE.md`](../UNIFIED_STATE_ARCHITECTURE.md)  
**Implementation Guide:** [`PHASE2.4_GRADUAL_MIGRATION.md`](../PHASE2.4_GRADUAL_MIGRATION.md)  
**Veratown Systems:** [`VERATOWN_DOCUMENTATION_INDEX.md`](../VERATOWN_DOCUMENTATION_INDEX.md)  
**Deployment:** [`RAILWAY_DEPLOYMENT.md`](../RAILWAY_DEPLOYMENT.md)  
**Architecture Patterns:** [`EPIC1.3-ARCHITECTURE-LAYER.md`](../EPIC1.3-ARCHITECTURE-LAYER.md)

---

## Archive Maintenance

**Archived:** August 30, 2026  
**Reason:** Documentation cleanup after Phase 2.4c completion  
**Impact:** No breaking changes; all content available in archive if needed  
**Future:** Documents may be periodically added here as phases complete

For questions about specific archived documents, check git history:

```bash
git log --follow docs/archived/FILENAME.md
```
