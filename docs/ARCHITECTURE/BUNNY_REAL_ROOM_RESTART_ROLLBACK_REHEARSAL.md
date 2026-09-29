---
title: "Bunny Real-Room Restart, Rollback, and Canary Rehearsal"
subtitle: "Controlled production evidence design for the remaining Bunny promotion gates"
date: "September 29, 2026"
version: "1.1"
status: "Executed for restart/canary; rollback accepted separately; evidence review complete"
---

# Bunny Real-Room Restart, Rollback, and Canary Rehearsal

This runbook defined the controlled tests used to close the Bunny restraint
promotion gates. The restart/cycle evidence is now complete for Miss Vera
(`250927`); rollback evidence was accepted separately in GitHub issue `#243`.
It uses the real-room qualification bot for the Bondage Club side of the
workflow and explicit Railway project, environment, and service IDs for
container operations.

The tests ran against a dedicated test character and room. They must not
use a player account, a shared public room, or the release-removal switch.
Every phase writes redacted evidence to a unique directory and records the
Bunny operation ID, deployment ID, instance ID, journal versions, and final
profile/artifact state.

## Controls and selectors

Use the production IDs already approved for the Bunny rehearsal:

```sh
export RAILWAY_PROJECT_ID=e74f1828-d39b-4b71-b713-9711cd6503c6
export RAILWAY_ENVIRONMENT_ID=5a944c49-1656-44c4-9151-bcd14f06fc1a
export RAILWAY_SERVICE_ID=e219c657-fb0c-4e97-b00c-4f7ed199eccb
export QUALIFICATION_EVIDENCE_DIR="$PWD/out/qualification-evidence/bunny-rehearsal-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$QUALIFICATION_EVIDENCE_DIR"
```

Before each phase, confirm:

```sh
RAILWAY_CALLER=skill:use-railway@1.6.0 \
RAILWAY_AGENT_SESSION=epic-execution-20260929 \
railway variable list \
  --project "$RAILWAY_PROJECT_ID" \
  --environment "$RAILWAY_ENVIRONMENT_ID" \
  --service "$RAILWAY_SERVICE_ID" \
  --json | grep -E 'ACTION_LAYER_(BUNNY_RESTRAINTS_ENABLED|RELEASE_REMOVAL_ENABLED)'
```

The required state is `ACTION_LAYER_BUNNY_RESTRAINTS_ENABLED=true`. The release
removal variable must be absent or `false`. Do not change either variable during
the restart rehearsal.

The real-room bot requires the existing `.env.real-room.local` values for the
server, dedicated account, room, target member, Bunny positions, and short
release duration. Keep that file local and out of evidence. The runbook only
uses the safe `bunny-step` scenario, which already requires
`BC_TEST_ALLOW_BUNNY_PUNISHMENT=true` and refuses to connect without an evidence
destination.

## Phase 0: Baseline and clean state

1. Run the local guards:

    ```sh
    pnpm test:qualification:real-room
    node --import tsx --test --test-concurrency=1 \
      bin/action-layer/__tests__/qualification.test.ts \
      bin/action-layer/__tests__/rollout.test.ts
    pnpm types
    ```

2. Confirm the dedicated test character has no `ItemArms/HeavyYoke` or
   `ItemFeet/HeavySpreaderMetal` before connecting.
3. Confirm the latest Railway deployment is `SUCCESS` with a `RUNNING` instance
   and record both identifiers.
4. Run one ordinary Bunny step as a baseline. Retain the generated evidence
   file and the matching production operation/journal record. The baseline must
   finish with release cleanup and no active Bunny artifact.

The baseline is a prerequisite, not the canary. It proves the room, account,
map, Bunny tile, and evidence directory are usable before a restart is added.

## Phase 1: Process-restart recovery during an active Bunny operation

The real-room bot waits for punishment appearance and release. Set the
configured release duration high enough to create a restart window, but below
the qualification maximum of 120 seconds. Use approximately 90 seconds for a
first rehearsal.

Start the bot in one terminal:

```sh
BC_TEST_SCENARIO=bunny-step \
BC_TEST_ALLOW_BUNNY_PUNISHMENT=true \
BC_TEST_EXPECTED_RELEASE_MS=90000 \
QUALIFICATION_EVIDENCE_DIR="$QUALIFICATION_EVIDENCE_DIR" \
pnpm qualification:real-room
```

In a second terminal, follow the Railway runtime logs. Do not restart on a
startup message; restart only after the Bunny punishment operation is visible
and the dedicated test character has the two expected restraint keys.

```sh
RAILWAY_CALLER=skill:use-railway@1.6.0 \
RAILWAY_AGENT_SESSION=epic-execution-20260929 \
railway logs \
  --project "$RAILWAY_PROJECT_ID" \
  --environment "$RAILWAY_ENVIRONMENT_ID" \
  --service "$RAILWAY_SERVICE_ID" \
  --latest --lines 300
```

Record the operation ID and then restart the exact service:

```sh
RAILWAY_CALLER=skill:use-railway@1.6.0 \
RAILWAY_AGENT_SESSION=epic-execution-20260929 \
railway service restart \
  --project "$RAILWAY_PROJECT_ID" \
  --environment "$RAILWAY_ENVIRONMENT_ID" \
  --service "$RAILWAY_SERVICE_ID" \
  --yes --json | tee "$QUALIFICATION_EVIDENCE_DIR/railway-restart.json"
```

Capture the deployment transition and startup evidence:

```sh
RAILWAY_CALLER=skill:use-railway@1.6.0 \
RAILWAY_AGENT_SESSION=epic-execution-20260929 \
railway status --json | tee "$QUALIFICATION_EVIDENCE_DIR/railway-status-after-restart.json"

RAILWAY_CALLER=skill:use-railway@1.6.0 \
RAILWAY_AGENT_SESSION=epic-execution-20260929 \
railway logs \
  --project "$RAILWAY_PROJECT_ID" \
  --environment "$RAILWAY_ENVIRONMENT_ID" \
  --service "$RAILWAY_SERVICE_ID" \
  --latest --lines 500 \
  | tee "$QUALIFICATION_EVIDENCE_DIR/railway-runtime-after-restart.log"
```

### Restart pass criteria

The phase passes only when all conditions hold:

- The bot's original operation ID remains the same before and after restart.
- The new instance reaches `SUCCESS`/`RUNNING` and completes configuration,
  database, Bunny recovery, location reload, and containment readiness.
- The active journal record is restored instead of recreated.
- The dedicated character does not receive a duplicate Bunny application.
- The original operation reaches release and cleanup after restart.
- The final artifact is terminal/expired, the restraint projection is empty, and
  the journal contains no second active operation for the same member.
- The bot evidence, Railway restart/status/log files, and database snapshot are
  all retained under the same evidence directory.

A restart that merely produces a healthy new process is not sufficient. The
operation must resume or reconcile from durable state and finish without a
second owner or duplicate restraint application.

## Phase 2: In-flight rollback rehearsal

A Railway restart is not a rollback rehearsal. Restarting destroys the
process-local `ActionLayerRolloutController`, while rollback must preserve the
currently active action lease and route only _new_ Bunny operations to legacy.

Before running this phase, add or expose a narrowly gated test control with all
of these properties:

- enabled only when a dedicated test-control variable is explicitly true;
- callable only by the dedicated qualification account or an authenticated
  local operator;
- records a control operation ID and timestamp in the same evidence directory;
- calls `ActionLayerRolloutController.rollback()` in the live process;
- cannot change release-removal ownership or any unrelated rollout switch;
- is disabled by default and removed or disabled before the rehearsal closes.

The control may be an authenticated admin command or an internal test adapter,
but it must be event-driven. Do not implement rollback by polling a MongoDB
marker or by treating a container restart as rollback.

Run the first `bunny-step` and hold the operation at the active action phase
using the test control's deterministic barrier. Invoke rollback while the
operation owns its lease. Then trigger one second Bunny operation with a second
dedicated test character or a sequentially prepared account.

The rollback phase passes only when:

- the first operation retains exactly one action lease and completes or fails
  deterministically under that owner;
- rollback does not cancel, duplicate, or re-run the first operation;
- the second operation is selected for the legacy path after rollback;
- the two operation IDs, selected paths, lease transitions, and final
  appearance observations are recorded;
- no character has both action and legacy restraint application for the same
  operation ID; and
- the test-control flag is disabled and the production process is redeployed
  after the evidence is captured.

Until this control exists, the rollback gate remains `MISSING`. The existing
local rollout tests prove the controller contract but do not prove live process
integration.

## Phase 3: Controlled production canary

After Phase 1 passes and the rollback control is removed or disabled, run a
fresh single-character `bunny-step` with the normal short release duration.
Observe the operation in Railway logs and retain the real-room evidence. Do not
run concurrent users or a performance workload.

The canary passes when:

- the operation selects the Bunny action path in production;
- warning, both restraint keys, release, and disconnect are observed;
- Railway remains `SUCCESS`/`RUNNING` for the observation window;
- no duplicate operation, duplicate restraint, unexpected legacy fallback, or
  active artifact remains after cleanup; and
- the release-removal switch remains disabled.

Then run a second ordinary `reconnect` scenario for the dedicated bot to prove
connector reconnect after the canary. This is supporting evidence, not a
substitute for process-restart recovery.

## Evidence review and issue closure

The operator must attach a redacted summary to #254 containing:

| Artifact               | Required contents                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Real-room evidence     | Scenario, run ID, operation ID, timestamps, restraint observations, release, disconnect                     |
| Railway restart record | Exact project/environment/service, old/new deployment and instance IDs, restart timestamp                   |
| Runtime logs           | Workflow recovery, Bunny recovery, location reload, readiness, operation owner, no duplicate/error evidence |
| Durable state snapshot | Journal version history, artifact status, cleanup timestamp, final restraint projection                     |
| Rollback record        | Control ID, active lease, selected path before/after rollback, second operation path                        |
| Canary record          | Fresh post-rehearsal Bunny operation and final cleanup                                                      |

The verified restart/cycle and live canary changed `Process-restart recovery`
and `Live production canary` to `PASS` in the promotion record. The rollback
gate was accepted and closed under #243. #254 can therefore be closed with
`state_reason: completed`. #311 remains open for the late-track performance
and capacity work, and release-removal rollout remains independently
controlled.
