---
title: "Bunny Action-Layer Promotion Record"
subtitle: "Explicitly approved promotion preparation and current go/no-go decision"
date: "September 28, 2026"
version: "1.0"
status: "Promotion initiated with explicit approval; NO-GO until required gates pass"
---

# Bunny Action-Layer Promotion Record

## Decision identity

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| Record ID      | `promotion-20260928-bunny-001`                                     |
| Epic / issue   | `#235`                                                             |
| Decision owner | Requesting operator; explicit approval received 2026-09-28         |
| Feature family | Bunny punishment restraint application                             |
| Runtime switch | `action_layer_bunny_restraints_enabled=false`                      |
| Runtime change | None; production switch remains disabled                           |
| Decision       | `NO-GO` for production enablement; promotion preparation initiated |

Explicit approval authorizes the promotion process and evidence collection. It
does not waive a missing safety gate or authorize enabling the switch before
the documented evidence is complete.

## Gate status

| Gate                                           | Status               | Evidence / note                                                                                                         |
| ---------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Bunny action ownership and rollback unit tests | `PASS`               | 55 focused tests passed, including action ownership and rollback contracts                                              |
| TypeScript, formatting, and whitespace         | `PASS`               | `pnpm types`, Prettier, and `git diff --check` passed                                                                   |
| Short 15-character workload                    | `PASS`               | 150/150 actions completed; zero failures; queues empty; retained redacted artifact                                      |
| Full 30-minute 15-character qualification      | `MISSING`            | Long run was stopped before a final result; do not claim this gate                                                      |
| Controlled-room Bunny confirmation             | `MISSING`            | Real-room 15/25-user qualification awaits dedicated test accounts                                                       |
| Restart/reconnect recovery                     | `MISSING`            | Controlled-room rehearsal remains open                                                                                  |
| In-flight rollback                             | `MISSING`            | Controlled-room rollback rehearsal remains open                                                                         |
| MongoDB Bunny state cleanup                    | `PASS`               | TestVeraTown was guarded-deleted and recreated clean; zero active artifacts and zero artifact/restraint overlaps remain |
| Railway health and runtime evidence            | `MISSING`            | Current promotion deployment evidence is not attached                                                                   |
| Redacted evidence retained                     | `PASS` for short run | `out/qualification/action-layer-1790616811046.json`; full-soak evidence is absent                                       |

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

**Current decision: `NO-GO`.** The action-layer implementation is
promotion-ready, but production enablement remains blocked by the missing
30-minute performance result, controlled-room restart/reconnect evidence,
rollback rehearsal, live-room qualification, and current Railway evidence.

The next decision may change to `GO` only after every required gate is recorded
as `PASS` in this document and the rollout switch is changed deliberately in
the approved production configuration.
