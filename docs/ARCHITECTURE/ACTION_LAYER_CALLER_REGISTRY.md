---
title: "Action-Layer Caller and Ownership Registry"
subtitle: "Production Bondage Club callers, owners, rollout controls, and evidence gates"
date: "September 28, 2026"
version: "1.0"
status: "Maintained control-plane registry; no family-wide production migration claimed"
---

# Action-Layer Caller and Ownership Registry

This is the control-plane inventory for production code that imports `bc-bot`
or sends a Bondage Club message. It is intentionally caller-oriented: an
adapter or service may be action-owned while the feature caller that invokes it
remains legacy-owned. A row is not production-migrated until its owner,
recovery state, rollback owner, rollout switch, and next evidence gate are
explicit.

The inventory was checked against the production `bin/**/*.ts` import and
`SendMessage` surfaces on September 28, 2026. Test doubles and test-only
imports are excluded from the ownership rows below.

## Ownership Rules

- Domain contracts and workflows do not import `bc-bot`; BC translation stays
  in adapters or integration boundaries.
- One operation ID has one owner. A legacy fallback is selected before work
  starts and must not run concurrently with the action owner.
- `queued` is a local dispatch result, not proof that BC delivered a packet.
- A recovery state is not complete without restart/reconnect behavior,
  idempotency, and a durable or explicitly ephemeral record.
- A promotion decision requires this registry, retained redacted evidence, and
  a signed go/no-go record. Missing evidence keeps the switch disabled.

## Caller Registry

| Caller surface                              | Production paths                                                                                                                                                                                                                                                                                                         | Current owner                                                                                                                                          | Rollout control                                                                             | Recovery state                                                                                                           | Rollback owner                                                                     | Next gate                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| BC action adapters                          | `bin/action-layer/adapters/bc-appearance.ts`, `bc-communication.ts`, `bc-map-object.ts`, `bc-map-trigger.ts`                                                                                                                                                                                                             | Action adapter owns translation and failure classification; workflows own business state                                                               | Family-specific switches; all new migration switches default off                            | Adapter tests cover invalid input, exceptions, and cleanup; controlled-room reconnect evidence remains open              | Calling workflow before dispatch; adapter cannot silently invoke legacy behavior   | Connector packet/outcome qualification and caller rollback rehearsal                        |
| Veratown communication pilots               | `locationMonitorSystem.ts`, `windowSystem.ts`, `kennelSystem.ts`, `cageSystem.ts`, `bunnyParkSystemImplementation.ts`, `keypadDoorSystemRefactored.ts`, `showerSystem.ts`, `furnitureBondageSystem.ts`, `catDogSystem.ts`, `trashcanSystem.ts`                                                                           | Communication action service owns opted-in notifications; feature workflow owns mutation and public narration                                          | `action_layer_communication_notifications_enabled=false`                                    | Process-local scheduler shutdown and duplicate suppression are tested; durable replay and reconnect evidence remain open | Each feature workflow retains the legacy notification path while the switch is off | Real-room transport matrix, caller rollback, and replay decision                            |
| Veratown appearance and restraint workflows | `bunnyPunishmentService.ts`, `bunnyPunishmentEngine.ts`, `bunnyParkSystemImplementation.ts`, `veratownReleaseSystem.ts`, `shared/appearanceLifecycle.ts`, `shared/liveAppearanceRemovalCoordinator.ts`                                                                                                                   | Bunny restraint application and selected release removal have action-owned pilot operations; broader appearance mutation remains workflow/legacy-owned | `action_layer_bunny_restraints_enabled=false`; `action_layer_release_removal_enabled=false` | Bunny journal recovery, CAS, expiry, and projection are covered locally; controlled-room restart/reconnect remains open  | Bunny/release workflow owner selects the legacy path before dispatch               | Controlled-room recovery, in-flight rollback, and performance qualification                 |
| Veratown map and door pilots                | `locationMonitorSystem.ts`, `tileTriggerSystem.ts`, `keypadDoorSystemRefactored.ts`, `keypadSystemIntegration.ts`, `handlers/keypadCommandDispatcher.ts`, `handlers/keypadCommandHandler.ts`                                                                                                                             | Registry and BC map adapters own trigger/object translation; access policy and timers remain workflow-owned                                            | Active pilot handles; no family-wide migration switch                                       | Scoped handles, stale callback rejection, room replacement, and shutdown are tested                                      | Feature workflow owns fallback and lease release                                   | Controlled-room reconnect/rollback and authoritative object-state evidence                  |
| Veratown legacy direct messaging            | `veratownNarrationUtils.ts`, `veratown.ts`, `adminCommands.ts`, `kennelCommands.ts`, `veratownReleaseSystem.ts`, `shared/postureHelper.ts`, `shared/appearanceSync.ts`, `shared/featureHelpers.ts`                                                                                                                       | Legacy feature workflow or helper owns direct BC calls                                                                                                 | No action-layer switch; remain disabled for migration claims                                | Existing feature-specific cleanup only; no action-layer recovery claim                                                   | Same legacy owner                                                                  | Define transport-neutral contract and operation ownership before migration                  |
| Casino and dare games                       | `games/casino.ts`, `games/casino/blackjack.ts`, `games/casino/roulette.ts`, `games/shared/messageSender.ts`, `games/dare.ts`, `games/dare/commandHandlers.ts`, `games/dare/dareEffectApplier.ts`                                                                                                                         | Legacy game workflow owns BC messaging and effects                                                                                                     | No action-layer switch                                                                      | Game lifecycle tests exist; no action-layer restart/replay claim                                                         | Legacy game workflow                                                               | Separate communication/effect contract and controlled-room comparison                       |
| Kidnapper and help systems                  | `games/kidnappers/kidnappersGameCommands.ts`, `kidnappersGameMessaging.ts`, `kidnappersGameCaptureService.ts`, `games/help/helpAndGuideSystem.ts`                                                                                                                                                                        | Legacy game or help workflow owns BC calls                                                                                                             | No action-layer switch                                                                      | Feature-specific cleanup only                                                                                            | Legacy workflow                                                                    | Define command/reply correlation and durable replay semantics                               |
| Hub and roleplay rooms                      | `hub/logic/administrationLogic.ts`, `kidnappersGameRoom.ts`, `maidsPartyNightSinglePlayerAdventure.ts`, `roleplaychallengeGameRoom.ts`, `hub/logic/loggingLogic.ts`, `hub/gameroomMatchmaking.ts`                                                                                                                        | Legacy room owner owns direct connector calls, narration, movement, and effects                                                                        | No action-layer switch                                                                      | Room shutdown is owned by the room lifecycle; no migration recovery claim                                                | Legacy room owner                                                                  | Inventory operation families, then migrate one low-risk notification with a rollback record |
| Connection/configuration boundary           | `botConnections.ts`, `config.ts`, `main.ts`, `discord/commands/diagnostics.ts`, `discord/types.ts`                                                                                                                                                                                                                       | Runtime connection and diagnostics remain integration-owned                                                                                            | N/A                                                                                         | Connector lifecycle and room ownership are centralized; qualification evidence must redact credentials                   | Runtime owner / deployment operator                                                | Railway deployment and log evidence; no credentials in retained artifacts                   |
| Shared BC model and state utilities         | `games/shared/unifiedCharacterStore.ts`, `unifiedCharacterTypes.ts`, `locationUtils.ts`, `deviceFactory.ts`, `effectInterface.ts`, `effectApplier.ts`, `effectValidator.ts`, `gamePlugin.ts`, `gamePluginCommandRouter.ts`, `commandParserFactory.ts`, `abstractMessageFeatureSystem.ts`, `abstractTileFeatureSystem.ts` | Legacy/shared feature abstractions own their current BC boundary                                                                                       | No action-layer switch                                                                      | No production action-layer recovery claim                                                                                | Owning feature abstraction                                                         | Keep import boundary clean while introducing explicit ports                                 |

## Direct `SendMessage` Inventory

The following production files contain direct `SendMessage` calls. They are
intentionally a subset of the broader import inventory and are the highest
priority callers for communication ownership review:

```text
bin/action-layer/adapters/bc-communication.ts                  action adapter
bin/games/casino/blackjack.ts                                  legacy casino
bin/games/casino/roulette.ts                                   legacy casino
bin/games/casino.ts                                             legacy casino
bin/games/dare.ts                                               legacy dare
bin/games/shared/messageSender.ts                               legacy shared helper
bin/games/veratown/veratownNarrationUtils.ts                    legacy narration
bin/hub/logic/administrationLogic.ts                            legacy administration
bin/hub/logic/kidnappersGameRoom.ts                             legacy room
bin/hub/logic/maidsPartyNightSinglePlayerAdventure.ts           legacy room
bin/hub/logic/roleplaychallengeGameRoom.ts                      legacy room
```

The Veratown pilot systems listed in the registry may call the communication
service for selected notifications while retaining other direct calls. A
`SendMessage` match therefore cannot by itself establish that the entire
feature family is migrated.

## Evidence Required for Promotion

Every promotion record must reference:

- operation IDs and caller/owner from this registry;
- the rollout switch and the selected owner for the operation;
- local contract, adapter, lifecycle, and integration results;
- live-room connector observations for whisper, chat, emote, connector
  failure, disconnect, reconnect, room identity, and cleanup;
- MongoDB state where the operation is durable;
- Railway deployment and log evidence where runtime behavior is claimed; and
- a redacted go/no-go record with rollback steps and residual risks.

The reusable local harness is `pnpm test:qualification:real-room`; live use
requires explicit environment opt-in, an existing approved room, and
`QUALIFICATION_EVIDENCE_DIR`. The default command remains disabled/dry-run.
Record each promotion or rollback decision with the reusable
[ACTION_LAYER_PROMOTION_RECORD.md](ACTION_LAYER_PROMOTION_RECORD.md) template.

## Update Protocol

A caller row must be updated in the same change as any new action-layer caller,
rollout switch, recovery implementation, or rollback decision. The reviewer
must reject a promotion when a caller is absent, an owner is ambiguous, a
switch defaults on without accepted evidence, or a retained artifact contains
credentials, cookies, tokens, session data, or connection strings.
