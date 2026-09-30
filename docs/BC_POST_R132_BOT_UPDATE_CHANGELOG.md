# Bondage-College Post-R132 Bot Update Changelog

This document records the ropeybot changes made in response to the Bondage-College
history after the R132 release baseline. It is intentionally a bot migration
record, not a wholesale upstream client merge.

## Scope and Source Revisions

- Bondage-College R132 baseline: `4fc3d726e6d931fd8a80158470ce07e910f1eb41` (`2026-09-16`).
- Bondage-College source revision used for the synchronized runtime data:
  `1b27db45240cc71b09404823dc127244f5f54fa8` (`2026-09-29`).
- Map-refactor family: `59e027bf28`, including `acd025ee55`, `fea42fd607`,
  `778acdb018`, `666fb68d5c`, and `90bddd0ea2`.
- The generated source manifest is `src/bcdata/BondageCollegeAssetManifest.json`.

## Implementation Timeline

### P0: Canonical map synchronization

Bondage-College moved canonical map ownership into `BondageClub/Assets/MapData.js`
and the map manager into `Map.js`. Ropeybot now extracts the canonical map data
through `scripts/sync-bc-map.ts` and records the upstream revision in
`src/bcdata/ChatRoomMap.ts`.

Implemented in ropeybot commit `ee07628`:

- Synchronized all current upstream map IDs and type/style pairs.
- Preserved the existing `MapTile`, `MapObject`, and map lookup APIs.
- Added duplicate-ID and source-parity checks.
- Added round-trip coverage for map lookup, tile/object writes, and region
  trigger behavior.
- Included the new map IDs, including the party pumpkin object at ID `595`.

### P1: Movement and action-layer compatibility

Implemented in ropeybot commit `70ae132` and follow-up action-layer work:

- Kept the public movement adapter stable while introducing structural
  `BCMovementCharacter` contracts at the boundary.
- Added authoritative movement confirmation and connector-loss failure paths.
- Preserved uppercase Bondage-College coordinates at the adapter boundary and
  lowercase action-layer coordinates internally.
- Kept map triggers, map objects, and movement behavior behind explicit
  action/adapter operations with operation, result, and failure semantics.

This avoids coupling domain behavior to legacy `bc-bot` implementation details
and leaves the adapter boundary suitable for later upstream map changes.

### P1: Runtime asset and appearance compatibility

Implemented in ropeybot commit `fd68532`:

- Added `scripts/sync-bc-assets-manifest.ts` and the generated asset manifest.
- Preserved the custom `src/bcdata/Female3DCGExtended.ts` TypeScript wrapper.
- Added central fallback lookup in `src/item.ts` rather than replacing the
  generated asset table wholesale.
- Added targeted post-R132 definitions in
  `src/bcdata/PostR132AssetDefinitions.ts` for:
    - `ItemHandheld/Rattle`
    - `ItemDevices/BirdCage`
    - `ItemNipples/NippleClamps1`
    - `ItemNipplesPiercings/ShortStraightPiercings`
    - `ItemNipplesPiercings/ThroughPiercings`
    - `ItemNose/ExpandingNoseHook`
    - `ItemHood/LatexHood`
- Added typed and modular extended definitions for the nose hook and latex hood.
- Retained already synchronized `Book` and `ToyHammer` definitions instead of
  duplicating them in the overlay.
- Preserved default-property compression for typed, modular, vibrator, lock,
  text, and expression-related appearance bundles.
- Kept unknown or unsupported appearance items isolated so safe items are not
  discarded as a side effect.

The focused asset gate in
`bin/action-layer/__tests__/postR132Assets.test.ts` verifies the generated and
overlay-backed definitions, including inventory IDs, activities, effects,
locks, poses, and extended option/module keys.

### P1: Bundle, lock, craft, and vibrator compatibility

The appearance compatibility matrix covers:

- Uniform and default color compression.
- Empty property omission.
- Typed `TypeRecord` defaults and non-default options.
- Modular `TypeRecord` defaults and non-default options.
- Vibrator default mode/intensity/effect compression.
- Text item properties.
- Lock metadata for safeword, exclusive, timer-password, and related locks.
- Preservation of lock effects and timer/password fields.
- Crafted item handling and safe mixed-appearance normalization.

The connector sanitization path deep-copies appearance data before removing
passwords from diagnostics, so later mutations cannot alter captured source
items.

### Test repair and state normalization

Implemented in ropeybot commit `fa85a87`:

- Updated `UnifiedCharacterStore.withoutTimestamps()` to ignore nullable
  persistence fields, generated `*At` fields, and `lastFlagChange`.
- Updated default-profile comparison to normalize persisted and default profile
  candidates before comparison.
- Corrected chip assertions to distinguish total owned chips from the locked
  subset.
- Closed all known unit-test failures without weakening production behavior.

## Upstream Change Families Mapped to Bot Work

The following Bondage-College commit families were reviewed and mapped to the
smallest applicable ropeybot change:

- `c59bbae8df` through `4db547732d`: Book/item and layer definitions. Already
  present in synchronized generated data; no duplicate overlay was added.
- `32f66af661`: Toyhammer and squeaky-toy media. The runtime definition is
  present; audio and client media remain outside bot scope.
- `b9db290605`: Rattle, bird cage, ABDL titles, and spit-out activity. Rattle
  and bird cage are represented by the runtime overlay. ABDL category data is
  already present. `SpitOutGag` has no ropeybot activity consumer.
- `86c6aa39ad`: Expanding Nose Hook, including typed options.
- `a18b3c4060`: Latex Hood, including modular options.
- `86060b84b7`: Nipple Button Clamps.
- `c24c0611e2`: Short Straight Piercings.
- `02a7130050`: Through Piercings.
- `e3eade0521`: Party pumpkin map object, covered by canonical map sync and
  map parity tests.
- `1a91604389`, `dfdd388a01`: Crafted-item deep-copy behavior reviewed against
  ropeybot bundle and diagnostic-copy paths.
- `50db16c64e`, `b18ca18ca2`, `88767e2203`, `f8f860032a`: Extended and typed
  baseline preservation covered by appearance bundle tests.
- `3a014171d8`, `e8f5ccce5b`, `5cfe81445f`, `dbb954958e`: Lock properties,
  timers, minimization, and decompression reviewed and covered by lock tests.
- `737f75aca9`, `30fead4117`: Vibrator state and advanced properties covered by
  vibrator compression tests.
- `0786659d4e`: Slave-collar `TypeRecord` compatibility reviewed; no failing
  ropeybot consumer was found.
- `6773c8fe47`, `a448ac5772`, `5f7b78fd2a`: Type-record minimization,
  decompression, and partial-craft behavior reviewed against local bundle
  normalization.

## P2 and P3 Decisions

No runtime changes were made for the following upstream client-side changes:

- Sight/hearing range clamps, deafness effects, blindness-related unlock rules,
  asylum-confinement limits, and struggle-minigame behavior. No ropeybot
  command or trigger computes these values.
- Socket and server type strictification where the serialized event contract
  remains unchanged. Connector fixtures and TypeScript validation pass.
- Wardrobe search, preview, CSS, mobile rendering, editor lifecycle, drawing,
  pointer-input, translation, localization, audio, image, CSV, and browser-only
  changes without a bot consumer.
- Shop-value and job-wage changes, because ropeybot has no caller for those
  calculations.

This is deliberate scope control. A future feature that consumes one of these
rules must introduce a named compatibility function and boundary tests before
being enabled.

## Validation Evidence

The migration gates completed successfully:

- Focused map parity, map trigger/object, and movement adapter tests: pass.
- Focused appearance bundle and post-R132 asset tests: pass.
- Connector and communication fixture suites: pass.
- `pnpm types`: pass.
- `pnpm test:unit`: 915 tests passed, 0 failed.
- Production bundle: pass.
- Action-layer one-cycle qualification: pass.
- Map and asset stale checks: pass.

The post-R132 asset test explicitly confirms that synchronized `Book` and
`ToyHammer` data resolve through the generated table, while the seven missing
behavior-bearing definitions resolve through the overlay with representative
upstream fields intact.

## Checkpoints and Railway

Ropeybot checkpoints were committed and pushed to `main` after the map/action
slice, the asset overlay, and the test-repair slice:

- `ee07628` - map and asset metadata synchronization.
- `70ae132` - region-based movement acceptance and release workflow support.
- `fd68532` - post-R132 asset compatibility overlay.
- `fa85a87` - UnifiedCharacterStore test and normalization repair.

Railway project: `veratown`, production environment, service `veratown`.
Pushes to `main` trigger deployments. At the last checkpoint observation,
`fd68532` was the successful running revision and `fa85a87` was building with
`deploymentStopped: true`; the deployment status must be rechecked after the
next pushed documentation checkpoint.

## Residual Risk and Follow-up

- A controlled live-room qualification remains the final runtime check for
  appearance updates, locks, crafting, vibrator modes, maps, and newly added
  assets.
- Railway health must be confirmed for the final documentation checkpoint.
- Bondage-College currently reports 11 Dependabot vulnerabilities on its
  default branch; those are unrelated to this migration and were not changed.
- Future upstream asset updates should run the sync scripts and focused gates
  before changing the overlay.
- Rollback remains data-and-bundle based: restore the prior ropeybot generated
  data and deployment revision without rewriting the Bondage-College checkout.
