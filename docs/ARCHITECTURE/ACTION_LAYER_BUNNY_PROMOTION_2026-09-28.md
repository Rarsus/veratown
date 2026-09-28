---
title: "Bunny Action-Layer Promotion Record"
subtitle: "Explicitly approved promotion preparation and current go/no-go decision"
date: "September 28, 2026"
version: "1.2"
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

| Gate                                           | Status                  | Evidence / note                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bunny action ownership and rollback unit tests | `PASS`                  | 55 focused tests passed, including action ownership and rollback contracts                                                                                                                                                                           |
| TypeScript, formatting, and whitespace         | `PASS`                  | `pnpm types`, Prettier, and `git diff --check` passed                                                                                                                                                                                                |
| Short 15-character workload                    | `PASS`                  | 150/150 actions completed; zero failures; queues empty; retained redacted artifact                                                                                                                                                                   |
| Full 30-minute 15-character qualification      | `DEFERRED`              | No longer an early hard requirement; schedule with the late-track performance and cutover evidence                                                                                                                                                   |
| Controlled-room Bunny confirmation             | `PASS`                  | Live `bunny-step` completed in the configured dedicated test room; retained artifact `75dc9564-78bf-4ad1-b4f0-cdade436d164.json`                                                                                                                     |
| Controlled-room connector reconnect            | `PASS`                  | Live reconnect completed and rejoined `Veratown`; retained artifact `e5e20d99-bdad-4816-b7c6-23352070ebb7.json`                                                                                                                                      |
| Process-restart recovery                       | `MISSING`               | A controlled deployment/process restart with an in-flight Bunny operation remains open                                                                                                                                                               |
| In-flight rollback                             | `MISSING`               | Controlled-room rollback rehearsal remains open                                                                                                                                                                                                      |
| MongoDB Bunny state cleanup                    | `PASS`                  | TestVeraTown was guarded-deleted and recreated clean; zero active artifacts and zero artifact/restraint overlaps remain                                                                                                                              |
| Railway health and runtime evidence            | `PASS`                  | Deployment `e2173b02-a2c2-4550-afa1-5186ec8f2a4e` for `c5da0f0` is `SUCCESS`/`RUNNING`; startup readiness and room connectivity are present, with prior filtered logs showing Bunny persistence/release for operation `bunny-261407-1790620281528-2` |
| Redacted evidence retained                     | `PASS` for current runs | Bunny-step and reconnect artifacts are retained under `out/qualification-evidence`; full-soak evidence is absent                                                                                                                                     |

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

**Current decision: `NO-GO`.** The action-layer implementation has passed the
live Bunny-step, connector reconnect, and current Railway evidence gates, but
production enablement remains blocked by process-restart recovery and the
in-flight rollback rehearsal. The full performance suite is deferred to the
late track; slightly degraded but bounded performance is acceptable when
stability and recovery are materially better.

The next decision may change to `GO` after the active stability and connector
gates are recorded as `PASS` in this document, residual performance risk is
accepted, and the rollout switch is changed deliberately in the approved
production configuration. Late-track performance evidence remains required
before final cutover.
