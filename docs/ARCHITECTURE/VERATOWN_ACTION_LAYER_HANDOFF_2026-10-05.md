---
title: "Veratown Action-Layer Migration Handoff"
date: "2026-10-05"
status: "Complete; pushed to main as aa6ff90"
---

# Veratown Action-Layer Migration Handoff

This note records the Bunny, Cage, Kennel, and CatDog appearance-action
migration and its documentation/issue closeout.

## Repository State

- Branch: `main`
- Last synced commit before this closeout: `055d6c6`
- Closeout commit: `aa6ff90` (`refactor(veratown): complete appearance action
closeout`), pushed to `origin/main`.
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
  `KennelSystem`. The `/bot kennel lock` and `/bot kennel escape` command paths
  also delegate to confirmed action operations; no legacy mutation callbacks
  remain in `kennelCommands.ts`.
- CatDog bondage and vibrator mutations use typed appearance actions. The
  no-supported-vibration-control case remains silent.
- Veratown registers its active connectors with the shared appearance service;
  the BC adapter uses same-room peers and source-attributed server broadcasts
  for confirmation.
- The action-layer BC adapter now has a typed `lockExistingItem` operation for
  the pre-existing Cage/Kennel timer-lock migration case.
- The Bunny configuration name now describes the current Heavy Yoke and
  Spreader restraint set; no WoodenSign is applied.

## Last Focused Results

- Bunny Park: 26/26.
- Cage: 18/18.
- Kennel: 20/20, including a new confirmed timed-lock action test.
- CatDog: 10/10.
- BC appearance adapter: 21/21 after adding `lockExistingItem`.
- A previous full Veratown run had one unrelated Narrator movement test failure
  (`NarratorBot sends only after authoritative movement and returns home`),
  caused by its fixture lacking target-member teleport support. It was not
  changed as part of this migration.

## Issue Review

- Bunny restraint bugs and promotion/rollback issues found in the review are
  already closed.
- #286 and #287 remain open. Their acceptance criteria cover broader
  release-family boundaries (teleport, forced nudity, parole, keypad access,
  and durable release ownership), not the appearance-action migration here.
- #273 remains open as a separate KeypadDoor stale-callback and rollback gate.
- No issue was closed as part of this migration.

## Closeout Validation

- Action-layer tests pass 143/143.
- Bunny, Cage, Kennel, and CatDog focused suites pass 74/74; Kennel includes
  the new confirmed timed-lock action test (20/20).
- `npm run types` passes.
- `npm run bundle` passes and validates 566 extended BC asset definitions.
- Prettier and `git diff --check` pass for the closeout changes.

## Scope Boundary

This migration covers appearance mutations for Bunny, Cage, Kennel, and
CatDog. Other Veratown appearance systems (for example Shower, Bed, Furniture,
admin release, and the broader seven-stage release workflow) were not claimed
as migrated here. Room propagation confirms BC room state, not durable account
storage; persistence remains owned by the feature's state service.
