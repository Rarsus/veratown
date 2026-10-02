---
title: "Inventory Action Canary Promotion Record"
date: "October 1, 2026"
status: "NO-GO — keep the inventory switch disabled"
---

# Inventory Action Canary Promotion Record

## Decision identity

| Field                     | Value                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Record ID                 | `inventory-20261001-roulette-wheel-1`                                                                        |
| Epic / issue              | [#234](https://github.com/Rarsus/veratown/issues/234), [#302](https://github.com/Rarsus/veratown/issues/302) |
| Caller                    | `RouletteGame.getWheel()` — add the casino bot's LuckyWheel                                                  |
| Operation                 | `inventory.add` for one `ItemDevices/LuckyWheel` slot                                                        |
| Operation ID              | Per-attempt UUID; retained only by the in-process adapter                                                    |
| Decision owner            | Roulette workflow before dispatch; BC adapter owns translation                                               |
| Recovery / rollback owner | Roulette workflow                                                                                            |
| Runtime                   | Local tests only                                                                                             |
| Rollout switch            | `ACTION_LAYER_INVENTORY_ENABLED=false`                                                                       |

## Local evidence

| Gate                                     | Result | Evidence                                                           |
| ---------------------------------------- | ------ | ------------------------------------------------------------------ |
| Inventory contract and memory adapter    | PASS   | `bin/action-layer/__tests__/in-memory-inventory.test.ts`           |
| BC adapter permission/lifecycle tests    | PASS   | `bin/action-layer/__tests__/bc-inventory.test.ts`                  |
| Roulette canary and legacy rollback path | PASS   | `bin/games/casino/__tests__/rouletteInventory.integration.test.ts` |
| TypeScript                               | PASS   | `pnpm types`                                                       |
| Formatting and whitespace                | PASS   | Prettier check and `git diff --check`                              |

The repeatable one-cycle command is not fully green in this environment:
`postR132Assets.test.ts` has an unrelated upstream-asset assertion mismatch, and
the keypad integration test cannot start MongoDB because the sandbox cannot
download the MongoDB binary. All other one-cycle checks, including the inventory
caller, passed.

## Controlled-room gates

| Gate                                 | Result  | Notes                                                     |
| ------------------------------------ | ------- | --------------------------------------------------------- |
| Real-room add success                | MISSING | No approved live-room run was performed                   |
| Real-room permission denial          | MISSING | Local permission rejection is not connector evidence      |
| Real-room timeout / unknown outcome  | MISSING | Requires retained connector observation                   |
| Real-room disconnect and reconnect   | MISSING | Local lifecycle tests only                                |
| Real-room duplicate operation        | MISSING | Local adapter idempotency tests only                      |
| Real-room rollback rehearsal         | MISSING | Local path-selection test only                            |
| MongoDB durable state                | N/A     | This BC inventory slice does not write game-profile state |
| Performance / retained live artifact | MISSING | No live artifact exists                                   |

## Rollback and decision

**NO-GO.** Keep `action_layer_inventory_enabled` false. Do not describe this
caller as production-migrated or close the canary gate based on local tests.

The rollout lease selects one owner before work starts. An action-path failure
does not trigger a concurrent `applyBundle()` fallback. Within the same
`RouletteGame` instance, an uncertain result requires an authoritative inventory
observation before a later rollback-path operation can use the legacy mutation.
That guard is process-local and does not establish restart recovery. The BC
adapter does not retry uncertain writes and does not claim BC transfer support.

Revisit promotion only after the controlled-room matrix above is completed,
redacted connector evidence is retained, and the reviewer accepts this record.
