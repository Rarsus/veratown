# Documentation Status Registry

**Status:** Active governance  
**Updated:** September 7, 2026

This registry defines which documentation is authoritative, useful reference,
legacy research, or historical archive. File contents may contain their own
status labels, but path classification controls navigation and maintenance.

## Statuses

| Status           | Meaning                                                                          | Maintenance rule                                                                         |
| ---------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Active           | Required for current implementation, operations, phase gates, or agent behavior. | Keep accurate; update with code and GitHub state.                                        |
| Reference        | Stable technical, feature, deployment, or user guidance.                         | Update when behavior/contracts change.                                                   |
| Legacy reference | Historical design or refactor material retained for research.                    | Do not use as implementation authority; update only when explicitly documenting history. |
| Archived         | Superseded snapshot, completed migration, obsolete plan, or deprecated report.   | Do not update for current progress; preserve for traceability.                           |

## Active Documents

- `README.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `copilot-instructions.md`
- `IMPLEMENTATION_STATUS_2026_09_07.md`
- `HYBRID_STRATEGY_CURRENT_PLAN.md`
- `PHASE_2A_HANDOFF.md`
- `PHASE_2B_HANDOFF.md`
- `PHASE_3_INTEGRATION_PLAN.md`
- `docs/README.md`
- `docs/IMPLEMENTATION/README.md`
- `docs/IMPLEMENTATION/GOLDEN_RULES.md`
- `docs/IMPLEMENTATION/CODE_REVIEW_STANDARDS.md`
- `docs/IMPLEMENTATION/DEBUGGING_PATTERNS.md`
- `docs/IMPLEMENTATION/LOGGING_GUIDE.md`
- `docs/CONTAINMENT_READINESS.md`
- `docs/CONTAINMENT_RECOVERY.md`
- `KIDNAPPERS_GAME_DEVELOPER_GUIDE.md`
- `KIDNAPPERS_GAME_PLAYER_GUIDE.md`
- `docs/KIDNAPPERS_GAME_TESTING.md`

GitHub issues and executable CI/staging evidence are authoritative for phase
completion. Active documents explain and link to that evidence; they do not
replace it.

## Reference Documents

The following trees are maintained technical or user reference unless a file
contains an explicit deprecation banner:

- `docs/ARCHITECTURE/`
- `docs/DEPLOYMENT/`
- `docs/FEATURES/`
- `docs/GUIDES/`
- `docs/IMPLEMENTATION/` except files explicitly marked archived
- `docs/MAINTENANCE/`
- `docs/REFERENCE/`
- `docs/items/`
- Stable root-level system guides that are linked by `README.md`

Reference documents must identify their last validation date when they describe
runtime behavior, deployment commands, schemas, or generated interfaces.

## Legacy Reference

- `docs/refactor/` is retained as legacy reference. Its plans and completion
  reports describe earlier refactor work and are not current phase authority.
- Historical architecture reviews and completed migration analyses outside the
  archive should be moved here or archived when replaced by a current guide.

## Archived Documents

- `docs/archived/` is historical and must not be used to determine readiness.
- Files with `_DEPRECATED` in their name or a `DEPRECATED` banner are archived,
  even if they remain linked for traceability.
- The original September 4 Hybrid Strategy plan and September 3 GitHub status
  reports are archived under `docs/archived/`.
- The superseded `IMPLEMENTATION_STATUS_2026_09_05.md` path is represented by
  `docs/archived/IMPLEMENTATION_STATUS_2026_09_05_DEPRECATED.md`; the active
  status is `IMPLEMENTATION_STATUS_2026_09_07.md`.

## Marking Rules

When adding or changing documentation:

- Add a short `Status` and `Updated` line to a document that is a plan,
  checklist, report, or operational contract.
- Add a `DEPRECATED` banner before moving a superseded document to the archive.
- Link active replacements from the deprecated document.
- Do not leave “ready to start,” “blocked,” or “in progress” claims in active
  documents unless they match current GitHub state and executable evidence.
- Prefer one canonical active document over multiple competing summaries.
- Update `docs/README.md`, this registry, and the relevant active guide when a
  document changes lifecycle state.

## Validation

The minimum documentation check is:

```sh
git diff --check
```

For phase/status changes, also verify current GitHub issue state and run the
narrowest available executable quality gate before reporting completion.
