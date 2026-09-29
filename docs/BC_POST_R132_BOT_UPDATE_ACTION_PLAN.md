# Bondage-College Post-R132 Bot Update Action Plan

## Decision Summary

This plan covers the Bondage-College history after the R132 release check and
through the current local head. It is a bot migration plan, not a request to
copy the entire upstream repository into ropeybot.

| Priority | Change family                                                                      | Bot decision                                                                                                        |
| -------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P0       | Map data extraction and `MapManager` refactor                                      | Synchronize the canonical map registry, then add parity and round-trip tests.                                       |
| P1       | Asset definitions, extended-item baselines, locks, crafting, and bundle conversion | Regenerate the copied runtime data and prove bundle compatibility before enabling new assets in production.         |
| P1       | Map adapter and movement behavior                                                  | Keep the current public adapter boundary, but test it against current map data and real server map fixtures.        |
| P1       | New assets and item metadata                                                       | Import definitions used by bot appearance, inventory, or activity flows; treat images and UI metadata as optional.  |
| P2       | Sight, hearing, blindness, deafness, and lock-unlock semantics                     | Perform a dependency check and compatibility tests; no bot runtime rewrite is justified by the current code search. |
| P2       | Socket and server type strictification                                             | Re-run connector fixtures and compare wire payloads. Do not change the protocol layer without a failing fixture.    |
| P3       | UI, wardrobe, localization, editor, audio, and client-only fixes                   | Record as audited no-action changes.                                                                                |

## Baseline and Scope

- Bondage-College R132 release baseline: `4fc3d726e6d931fd8a80158470ce07e910f1eb41` (`2026-09-16`).
- Bondage-College analysis head: `1b27db4524` (`2026-09-29`).
- Map-refactor merge: `59e027bf28`, with the relevant map work in `acd025ee55`,
  `fea42fd607`, `778acdb018`, `666fb68d5c`, and `90bddd0ea2`.
- Ropeybot currently advertises `R132` and uses copied data under
  `src/bcdata`.
- This analysis found no uncommitted changes in either repository. No live bot
  or Railway flow is part of this plan.

The existing [R132 migration status](R132_MIGRATION_STATUS.md) already records
map-source parity and byte-for-byte item-property compression as open work.
This document turns those open items into an ordered implementation plan.

## P0: Restore Canonical Map Data Parity

### Finding

Bondage-College moved map ownership into `BondageClub/Assets/MapData.js` and
then moved the map manager into `Map.js`. The old view-oriented map lists are
no longer the canonical source.

The current comparison is concrete:

- The ropeybot copy has 365 unique map IDs.
- Current upstream data has 373 unique map IDs.
- 8 IDs are new upstream: `211`, `400`, `401`, `402`, `403`, `404`, `595`,
  and `3281`.
- 31 existing IDs retain their IDs and styles but change category labels,
  including `FloorDecoration` to `LivingRoom`, `School`, `Bathroom`, and
  `Functional` categories.
- No old unique map ID was removed in this comparison.

The category changes matter because `API_Map.setTile()` accepts an optional
type and resolves through `ChatRoomMapViewTileList`. The current Veratown
systems primarily use names, objects, coordinates, and triggers, so this is a
data/API compatibility risk rather than evidence of an immediate behavior
break.

### Required implementation

1. Make `BondageClub/Assets/MapData.js` the source for the copied map registry.
   Preserve the ropeybot-facing `MapTile`, `MapObject`, and list exports unless
   a caller needs a deliberate API change.
2. Add map synchronization to `scripts/sync-bc-assets.sh`, or create a small
   dedicated map-data extraction script if the upstream file contains runtime
   code that should not be copied wholesale.
3. Preserve stable numeric IDs. Do not silently deduplicate entries with
   different semantic types; report duplicate IDs and resolve them explicitly.
4. Update the map parity test to compare IDs, styles, types, and the upstream
   source revision. The existing local uniqueness test is not source parity.
5. Add round-trip tests for `setTile`, `getObject`, `setObject`, tile triggers,
   enter-region triggers, leave-region triggers, and map bundles containing the
   new IDs.

### Affected ropeybot surfaces

- `src/bcdata/ChatRoomMap.ts`
- `src/apiMap.ts`
- `bin/action-layer/adapters/bc-map-trigger.ts`
- `bin/action-layer/adapters/bc-map-object.ts`
- `bin/action-layer/adapters/bc-movement.ts`
- `bin/games/shared/__tests__/r132MapParity.test.ts`
- `scripts/sync-bc-assets.sh`

### Acceptance criteria

- Every current upstream map ID and type/style pair is represented or is
  explicitly documented as intentionally excluded.
- Current Veratown door, kennel, cage, shower, window, furniture, and keypad
  tests remain green.
- A decompressed server map can be read and rewritten without changing its
  dimensions, tile/object string lengths, or unrelated positions.
- No live deployment occurs until the focused test suite passes.

## P1: Reconcile the Map Adapter Boundary

The current bot API is internally coherent: `API_Map` exposes
`setObject`, `addTileTrigger`, `addEnterRegionTrigger`,
`addLeaveRegionTrigger`, `mapTeleport`, and `MapPosition` with the shapes used
by the action-layer adapters. The upstream map-manager refactor does not by
itself change the Socket.IO `MapData` or `MapPosition` payload observed in the
connector.

Therefore, do not rewrite the adapters as part of the upstream refactor. Add
compatibility coverage instead:

1. Feed current upstream map data through `setMapFromData()` and assert that
   name-to-ID lookup selects the expected entry.
2. Exercise both uppercase BC coordinates and lowercase action-layer
   coordinates at the adapter boundary.
3. Verify that region triggers use inclusive bounds and do not fire on a
   position that remains inside the same region.
4. Verify that map object writes preserve existing map string positions.
5. Add a fixture for the occupied punishment-room pad. The release workflow's
   fallback region is a bot behavior and must remain independent of the map
   registry update.

## P1: Synchronize Asset and Appearance Data

### Current drift

The local comparison shows that the copied runtime files are not identical to
current upstream data:

- `Female3DCG.js`: upstream is 5,334 bytes larger.
- `Female3DCGExtended.js`: upstream is 1,399 bytes larger.
- `Female3DCG_Types.d.ts`: same byte size, but still requires semantic diff
  and compile validation.

The existing sync script copies only the three Female3DCG files and deliberately
preserves ropeybot's TypeScript wrapper for `Female3DCGExtended`. It does not
sync map data or record an upstream revision.

### Required implementation

1. Run the asset sync against the pinned upstream baseline after the map work
   is isolated. Do not mix unrelated generated or image-only files into the
   first code change.
2. Compare the generated files semantically, especially asset group, asset
   name, property baseline, `TypeRecord`, `Craft`, `Effects`, `Timer`,
   `Expression`, and `State` fields.
3. Preserve the custom ropeybot extended-item hooks while importing upstream
   baseline changes.
4. Add an asset-data manifest containing upstream commit, source file hashes,
   and the intentional wrapper transformation.
5. Keep images and CSV editor metadata out of the runtime sync unless a bot
   command actually needs them. They can be imported separately for a client
   or asset package release.

### Behavior-bearing upstream changes to cover

The following post-R132 changes can affect serialized appearance or bot
commands even when they do not alter the Socket.IO protocol:

- `1a91604389`, `dfdd388a01`: crafted item data is copied deeply when worn or
  converted, preventing later mutation of the source item.
- `50db16c64e`, `b18ca18ca2`, `88767e2203`, `f8f860032a`: extended-item and
  typed-item baseline properties are resolved and preserved during bundle
  conversion.
- `3a014171d8`, `e8f5ccce5b`, `5cfe81445f`, `dbb954958e`: lock properties,
  lock timers, minimization, and decompression initialization are made more
  explicit.
- `737f75aca9`, `30fead4117`: vibrator state and advanced vibrator properties
  are retained as baseline data.
- `0786659d4e`: slave-collar `TypeRecord` keys are recognized correctly.
- `6773c8fe47`, `a448ac5772`, `5f7b78fd2a`: typerecord minimization,
  decompression, and partial-craft selection change bundle contents.

### Acceptance criteria

- Existing appearance, cage, lock, expression, crafting, and vibrator tests
  pass with regenerated data.
- For representative plain, typed, crafted, locked, timed, and vibrator
  items, ropeybot's bundle output is semantically equivalent to the upstream
  expected fields.
- A malformed or unknown property is preserved or rejected according to the
  existing ropeybot policy; it is never silently converted into an unlocked
  or empty item.
- The current release safety rule remains unchanged: ambiguous or locked items
  are preserved.

## P1: Import New Runtime Asset Definitions

The upstream history adds runtime definitions that can matter to inventory,
appearance, activity, or asset-aware command logic:

- `c59bbae8df` through `4db547732d`: Book and its item/layer definitions.
- `32f66af661`: squeaky Toyhammer, including its audio-related asset work.
- `b9db290605`: rattle, bird cage, three ABDL titles, and a spit-out
  activity.
- `86c6aa39ad`: Expanding Nose Hook.
- `a18b3c4060`: Latex Hood.
- `86060b84b7`: Nipple Button Clamps.
- `c24c0611e2`: Short Straight Piercings.
- `02a7130050`: Through Piercings.
- `e3eade0521`: party pumpkin map object.

For each definition, classify the use before importing it:

| Use                                                                | Action                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Appearance construction, removal, lock checks, or inventory lookup | Import the JS/type definition and add a focused test.        |
| Activity text or bot-authored room action                          | Import the name/effect fields and test the emitted action.   |
| Image, preview, audio, CSV layer, or wardrobe-only metadata        | No ropeybot runtime change; record as optional package work. |

Do not hardcode an asset list in Veratown. Use the synchronized asset data and
retain the existing validation for unknown groups, names, and properties.

## P1: Bundle, Lock, and Crafting Compatibility Gate

Before enabling any new item-driven behavior, build a small compatibility
matrix around the code in `src` and the appearance action layer:

| Fixture                | Required assertions                                              |
| ---------------------- | ---------------------------------------------------------------- |
| Plain item             | Group/name/color/property round-trips.                           |
| Typed item             | `TypeRecord` and typed properties survive conversion.            |
| Crafted item           | Craft fields are deep-copied and partial fields are not widened. |
| Lock item              | Lock type, password state, timers, and baseline fields survive.  |
| Vibrator               | State and mode-specific properties survive compression.          |
| Unknown/empty property | Existing normalization policy is applied deterministically.      |
| Mixed appearance       | One unsupported item does not cause safe items to be stripped.   |

This gate addresses the known R132 gap: current ropeybot bundles are valid, but
byte-for-byte parity with BC's compression is not proven. Byte equality is not
required if the wire contract is semantically equivalent, but differences must
be explained by a fixture and documented.

## P2: Perception and Interaction Semantics

Upstream also changes client-side semantics:

- `90bddd0ea2` clamps sight and hearing ranges.
- `86f001fc4f` adds crafting effects that modify deafness.
- `97d6d0e1ff` applies those effects to deafness icons.
- `57bbf57403` allows unlocking while blinded.
- `29c0a7b712` adds an asylum-confinement sanity limit.

The current ropeybot search found no direct implementation of BC sight/hearing,
blindness, deafness, or struggle minigame rules, and no direct use of upstream
shop-value calculations. These changes therefore require a dependency check,
not an invented bot feature.

Required checks:

1. Confirm no Veratown command or trigger computes perception, unlock
   eligibility, asylum duration, or asset shop value from copied data.
2. If a future feature does compute one of these values, place the rule behind
   a named compatibility function and add boundary tests for zero, negative,
   maximum, and missing values.
3. Keep these upstream changes in the no-runtime-change section until such a
   dependency is demonstrated.

## P2: Protocol and Type Contract Verification

Post-R132 strictification includes `64c6d29a49` and the command/room typing
series, while `d5bac7ed8e` removes the upstream `ChatRoomData` type alias. The
changes are primarily compile-time and client-internal.

The current review found no clear breaking change to the wire-level
`MapData`, `MapPosition`, room, appearance, or character events used by
`src/apiConnector.ts`. Validate that conclusion by:

- Running the connector fixture suite against current `BondageClub/Tests/Server.json`.
- Comparing serialized event names and required fields, not just TypeScript
  names.
- Running full TypeScript validation after asset and map synchronization.
- Updating ropeybot types only where a fixture demonstrates a real contract
  difference.

## No-Action Audit

The following post-R132 groups were inspected and should not create bot code
work unless a later dependency is found:

- Wardrobe search, preview, CSS, key filters, rename behavior, and mobile
  rendering changes.
- Map-editor lifecycle, zoom, selection, drawing, dialog, and inspector fixes.
- Translation key migration and UTF-8 conversion.
- Bondage Brawl loading, audio, and browser-only rendering changes.
- Layering label, draw order, opacity, and visual clipping fixes.
- Input-device migrations from mouse events to pointer events.
- TypeScript strictification that does not alter emitted server payloads.
- New PNG, preview, audio, CSV, and localization files without a runtime
  definition or bot command consumer.
- Shop-value and job-wage changes, because no ropeybot caller currently uses
  those calculations.

This audit is useful: it prevents a full upstream client merge from expanding
the bot's attack surface or replacing stable action-layer abstractions for
changes the bot does not execute.

## Ordered Execution Plan

1. Pin the upstream revision and create a source manifest for map and asset
   inputs.
2. Extract and synchronize `MapData.js`; update the map parity and round-trip
   tests.
3. Run the focused map/action-layer suites and fix only actual boundary
   failures.
4. Synchronize `Female3DCG.js`, `Female3DCGExtended`, and type data while
   preserving ropeybot hooks.
5. Add the appearance/bundle compatibility matrix and resolve serialization
   differences.
6. Import and test runtime definitions for the new assets that have bot
   consumers. Keep client-only files out of the runtime patch.
7. Re-run connector fixtures and full TypeScript validation.
8. Build the production bundle and review the generated diff.
9. Deploy to Railway only after the focused and full checks pass, then run one
   live staging qualification instance. Do not run a local bot concurrently
   with Railway accounts.
10. Keep the previous R132 data and release workflow available for rollback;
    rollback should restore the copied data revision and bundle, not require a
    Bondage-College history rewrite.

## Validation Commands

The implementation pass should record the exact successful commands, at
minimum:

```text
./scripts/sync-bc-assets.sh
pnpm test -- bin/games/shared/__tests__/r132MapParity.test.ts
pnpm test -- bin/action-layer/__tests__/bc-map-trigger.test.ts bin/action-layer/__tests__/bc-map-object.test.ts bin/action-layer/__tests__/bc-movement.test.ts
pnpm exec tsc --noEmit
pnpm build
```

The command names should be adjusted to the repository's actual package
scripts if the current test runner exposes a narrower equivalent. No live
Railway validation belongs in this read-only planning task.

## Rollout and Rollback

- Keep the R132 asset/map manifest and the post-R132 manifest side by side in
  deployment metadata.
- Roll out data synchronization before enabling commands that depend on newly
  imported assets.
- Observe map update errors, appearance bundle rejection, unknown asset logs,
  and release workflow failures during the first staging run.
- Roll back by restoring the prior ropeybot data files and production bundle,
  then restart the single Railway instance. Do not roll back the upstream
  Bondage-College checkout as part of bot rollback.
- Re-run the focused map, appearance, and release tests after rollback.

## Exit Criteria

The migration is complete when map parity is source-checked, the bundle matrix
is green, current connector fixtures pass, no-action findings remain
documented, and one controlled Railway qualification run succeeds without
unknown map IDs, unknown runtime assets, or appearance normalization drift.
