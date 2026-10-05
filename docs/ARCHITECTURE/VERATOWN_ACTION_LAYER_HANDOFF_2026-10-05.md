---
title: "Veratown Action-Layer Migration Handoff"
date: "2026-10-05"
status: "Implementation paused; feature migration milestones pushed"
---

# Veratown Action-Layer Migration Handoff

This note is the restart point for the Bunny, Cage, Kennel, and CatDog
appearance-action migration. Implementation is paused at the user's request.

## Repository State

- Branch: `main`
- Last synced commit: `d757f95` (`refactor(kennel): route containment mutations through actions`)
- Worktree was clean at pause time.
- Earlier synced milestones: `7956417` (Bunny/CatDog action routing) and
  `aed4f69` (Cage action routing and `lockExistingItem`).

## Migration State

- Bunny restraint add/release uses `AppearanceActionService`; it requires
  confirmed snapshots, persists those snapshots, and does not retry an
  unconfirmed dispatch. The Bunny rollout defaults enabled. Bunny workflow,
  artifact, and audit orchestration remain in `BunnyPunishmentService`.
- Cage crate add/remove and conversion of an existing timed lock use typed
  appearance actions. The `syncCageAppearanceMutation` callback/fallback
  wrapper and direct cage `AddItem`/`RemoveItem` calls were removed.
- Kennel add/remove, legacy timer-lock conversion, and door `TypeRecord`
  updates use typed appearance actions. Unconfirmed door updates stop rather
  than entering the retry loop. Kennel session and audit policy remain in
  `KennelSystem`.
- CatDog bondage and vibrator mutations use typed appearance actions. The
  no-supported-vibration-control case remains silent.
- Veratown registers its active connectors with the shared appearance service;
  the BC adapter uses same-room peers and source-attributed server broadcasts
  for confirmation.
- The action-layer BC adapter now has a typed `lockExistingItem` operation for
  the pre-existing Cage/Kennel timer-lock migration case.

## Last Focused Results

- Bunny Park: 26/26.
- Cage: 18/18.
- Kennel: 19/19.
- CatDog: 10/10.
- BC appearance adapter: 21/21 after adding `lockExistingItem`.
- TypeScript passed after source migrations; rerun at the start of the next
  session because tests and fixtures changed afterward.
- A production bundle succeeded before the final Cage/Kennel migrations; build
  again before declaring the work complete.
- A previous full Veratown run had one unrelated Narrator movement test failure
  (`NarratorBot sends only after authoritative movement and returns home`),
  caused by its fixture lacking target-member teleport support. It was not
  changed as part of this migration.

## Next Session Start

1. Run `git status -sb`; confirm the handoff commit is synced and inspect any
   new user edits before touching those files.
2. Run `npm run types`, the action-layer suite, the four focused feature suites,
   and `npm run bundle`.
3. Audit the four production files for direct appearance mutations and legacy
   callbacks. Current expected exceptions are reads/permission checks, not
   mutation paths.
4. Update maintained docs that still describe legacy ownership or old behavior:
   `docs/bunny.md`, `docs/VERATOWN_CAT_DOG.md`,
   `docs/FEATURES/VERATOWN.md`, `docs/FEATURES/VERATOWN_COMPLETE_GUIDE.md`,
   `docs/ARCHITECTURE/ACTION_LAYER_CALLER_REGISTRY.md`,
   `docs/ARCHITECTURE/MIGRATED_FEATURES.md`, and the current-status section of
   `docs/ARCHITECTURE/ACTION_LAYER_OVERVIEW.md`. Do not edit archived reports.
5. Review open GitHub issues related to Bunny, Cage, Kennel, CatDog, and the
   action layer. Identify candidates for closure only when acceptance criteria
   and required evidence are met; do not close unrelated or evidence-gated
   issues.
6. Run final validation, commit the documentation/issue-status milestone, and
   push `main`.

## Scope Boundary

This migration covers appearance mutations for Bunny, Cage, Kennel, and
CatDog. Other Veratown appearance systems (for example Shower, Bed, Furniture,
admin release, and the broader seven-stage release workflow) were not claimed
as migrated here. Room propagation confirms BC room state, not durable account
storage; persistence remains owned by the feature's state service.
