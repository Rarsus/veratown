---
title: "Bunny Action-Layer Promotion Record"
subtitle: "Explicitly approved promotion preparation and current go/no-go decision"
date: "September 28, 2026"
version: "1.4"
status: "Controlled production restraint ownership promoted; final architecture-wide migration remains open"
---

# Bunny Action-Layer Promotion Record

## Decision identity

| Field          | Value                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Record ID      | `promotion-20260928-bunny-001`                                                                                                          |
| Epic / issue   | `#235`                                                                                                                                  |
| Decision owner | Requesting operator; explicit approval received 2026-09-28                                                                              |
| Feature family | Bunny punishment restraint application                                                                                                  |
| Runtime switch | `action_layer_bunny_restraints_enabled=true`                                                                                            |
| Runtime change | Enabled in Railway production; the verified restart/cycle evidence was recorded after deployment `079bc0a2-9541-4eaf-9356-9f129f481c3c` |
| Decision       | `GO` for controlled Bunny restraint ownership and the live canary; `NO-GO` for final architecture-wide migration                        |

Explicit approval authorized the promotion process. Bunny restraint ownership
was enabled after the environment mapping landed in commit `af05c66` and the
Railway instance reached `SUCCESS`/`RUNNING`. Release removal remains
legacy-owned and its switch was not changed.

## Gate status

| Gate                                           | Status     | Evidence / note                                                                                                                                                                                                        |
| ---------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bunny action ownership and rollback unit tests | `PASS`     | 55 focused tests passed, including action ownership and rollback contracts                                                                                                                                             |
| TypeScript, formatting, and whitespace         | `PASS`     | `pnpm types`, Prettier, and `git diff --check` passed                                                                                                                                                                  |
| Short 15-character workload                    | `PASS`     | 150/150 actions completed; zero failures; queues empty; retained redacted artifact                                                                                                                                     |
| Full 30-minute 15-character qualification      | `DEFERRED` | No longer an early hard requirement; schedule with the late-track performance and cutover evidence                                                                                                                     |
| Controlled-room Bunny confirmation             | `PASS`     | Live `bunny-step` completed in the configured dedicated test room; retained artifact `75dc9564-78bf-4ad1-b4f0-cdade436d164.json`                                                                                       |
| Controlled-room connector reconnect            | `PASS`     | Live reconnect completed and rejoined `Veratown`; retained artifact `e5e20d99-bdad-4816-b7c6-23352070ebb7.json`                                                                                                        |
| Process-restart recovery                       | `PASS`     | After the complete bot restart, startup reached Bunny recovery, location reload, and containment readiness; Miss Vera `250927` then completed a fresh apply/expiry cycle with clean durable state                      |
| In-flight rollback                             | `PASS`     | Accepted in GitHub issue `#243`; the action lease and new-operation legacy routing evidence were accepted and the issue was closed                                                                                     |
| MongoDB Bunny state cleanup                    | `PASS`     | TestVeraTown was guarded-deleted and recreated clean; zero active artifacts and zero artifact/restraint overlaps remain                                                                                                |
| Railway health and runtime evidence            | `PASS`     | Deployment `079bc0a2-9541-4eaf-9356-9f129f481c3c` is `SUCCESS`; `ACTION_LAYER_BUNNY_RESTRAINTS_ENABLED=true`; startup reached Bunny recovery, location reload, full containment readiness, and stable room connections |
| Durable cycle evidence                         | `PASS`     | Operation `bunny-250927-1790669931518-1` recorded both applied pieces, completed journal and release records, artifact `expired`/cleaned, and final `currentRestraints: []`                                            |

## Database cleanup

The `TestVeraTown` profile was rechecked before deletion: its Bunny artifact was
expired, current restraints were empty, and current/expected appearance did not
contain the recorded Bunny pieces. Profile `_id 261407` was then deleted with
exact ID, name, expired-artifact, and empty-restraint guards. The profile was
recreated automatically as a clean shell record with no Bunny artifact and no
current restraints.

Two historical expired Bunny artifacts remain for `Lara` and `Miss Vera`. They
were not deleted because the requested cleanup targeted the verified test
profile and historical records are not active migration blockers.

## Legacy deletion markers

The following markers identify old Bunny paths that remain necessary until the
promotion and rollback window are complete:

- `LEGACY-BUNNY-DELETE-APPLICATION` in `bunnyPunishmentService.ts`: legacy
  restraint application branch.
- `LEGACY-BUNNY-DELETE-RELEASE` in `bunnyPunishmentService.ts`: legacy release
  mutation path; replace with an action removal contract first.
- `LEGACY-BUNNY-DELETE-FACADE` in `bunnyPunishmentService.ts`: compatibility
  facade after park callers accept the workflow directly.
- `LEGACY-BUNNY-DELETE-NOTIFICATION-FALLBACK` in
  `bunnyParkSystemImplementation.ts`: legacy notification fallback after the
  communication rollout is promoted and rollback is retired.

Do not delete these markers or their code until the corresponding gate is
`PASS`, the legacy path has no remaining caller, and a rollback decision has
been recorded.

## Promotion decision

**Current decision: `GO` for controlled production restraint ownership and the
live canary; `NO-GO` for final architecture-wide migration.** The Bunny
restraint switch is enabled in Railway production, the restarted instance
reached full startup readiness, and the post-restart Miss Vera cycle completed
with durable apply and expiry evidence. The application path now flushes item
updates before the compatibility snapshot; authoritative item observation is
asynchronous evidence and is not an application prerequisite. Release removal
remains independently controlled. The full performance suite is deferred to
the late track; bounded performance qualification remains required for the
broader action-layer cutover.

The final migration decision may change to `GO` after the late-track
performance evidence and residual-risk decision are accepted. This record does
not claim release-removal migration or architecture-wide feature migration.

The executable rehearsal design for the remaining gates is maintained in
[BUNNY_REAL_ROOM_RESTART_ROLLBACK_REHEARSAL.md](BUNNY_REAL_ROOM_RESTART_ROLLBACK_REHEARSAL.md).
