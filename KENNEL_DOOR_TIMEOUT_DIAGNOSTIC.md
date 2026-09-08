# Kennel Door Timeout Diagnostic Guide

## Issue Summary

**Problem**: Kennel door doesn't close after the expected 5-second delay
**Expected Behavior**: Character enters kennel → door opens (d: 0) → 5 seconds pass → door closes (d: 1)
**Actual Behavior**: Door remains open indefinitely

## Test Status

✅ **All 13 unit tests pass** - The door closing logic works correctly in controlled environments

## Investigation Results

### Code Path (Verified Correct)

1. Character enters kennel tile or puts on Kennel device
2. `kennelSystem.ts:335` - `syncAppearanceMutation` adds Kennel device with door open
3. `kennelSystem.ts:376` - `scheduleDoorClose()` is called
4. `kennelSystem.ts:455` - `await this.delay(KENNEL_DOOR_CLOSE_DELAY_MS)` waits 5 seconds
5. `kennelSystem.ts:482-525` - Attempts to close door up to 3 times with retry logic
6. Door property changes from `{ d: 0, p: 1 }` (open) to `{ d: 1, p: 1 }` (closed)

### Recent Improvements (Added Enhanced Logging)

- Better visibility into when door close delay completes
- Additional diagnostics when door close is abandoned
- More detailed error context in failure logs
- State verification when close fails

## Diagnostic Checklist

### 1. Check Railway Logs for These Patterns

**Success Pattern** (door working):

```
Kennel door closed successfully [memberNumber=X, location="kennel", attempts=1, verified=true, typeRecord={"d":1,"p":1}, delayCompleted=true, syncSuccessful=true]
```

**Failure Patterns** (door not working):

a) **Door close abandoned** (kennel removed before close):

```
Kennel door close abandoned - kennel removed or replaced [memberNumber=X, hasKennel=false, ...]
```

b) **Sync failure** (state not persisting):

```
Kennel door close failed [memberNumber=X, attempts=1, kennelState={"d":0,"p":1}, isStillWearingKennel=true]
```

c) **Initial scheduling failed**:

```
Scheduling door close in 5 seconds [memberNumber=X, delayMs=5000]
```

Should be followed by:

```
Kennel door close delay completed, attempting close [memberNumber=X]
```

If this log is missing, the delay never completed.

### 2. Verify Delay is Completing

Look for this sequence in logs:

```
[19:13:24.588] Scheduling door close in 5 seconds [memberNumber=7, delayMs=5000]
[19:13:29.588] Kennel door close delay completed, attempting close [memberNumber=7]
[19:13:29.612] Kennel door closed successfully [memberNumber=7, ...]
```

**Timeline should be ~5 seconds between first and second log** ⚠️

### 3. Check for Race Conditions

If you see multiple "Scheduling door close" logs for the same character without a complete close:

```
[19:13:24.588] Scheduling door close in 5 seconds [memberNumber=7]
[19:13:24.600] Scheduling door close in 5 seconds [memberNumber=7]  ← Task replaced!
```

This indicates the kennel device is being removed/re-added during the delay.

### 4. Verify Character State

When door doesn't close, check:

- Is character still in kennel tile? (`isStillInKennelTile=true/false`)
- Is character still wearing kennel device? (`isStillWearingKennel=true/false`)
- What is the kennel state? (`kennelState={"d":0,"p":1}` means door still open)

### 5. Check for Sync Failures

Look for liveCharacterStateSync errors around the time door should close:

```
[LiveCharacterStateSync] ERROR: Failed to sync character 7
[AppearanceSync] ERROR: Failed to persist appearance
```

These would explain why the door property doesn't persist.

## Possible Root Causes (In Priority Order)

### 🔴 Most Likely: State Sync Failure

**Evidence**: Door close logs appear but `syncSuccessful=false` or no logs at all

**Root Cause**: `liveCharacterStateSync.syncCharacter()` is failing or timing out

**Action**:

1. Check for liveCharacterStateSync errors in logs
2. Verify MongoDB connection is stable
3. Check character document in MongoDB - verify kennel session exists
4. Check if appearance mutations are being persisted

### 🟡 Medium Likely: Character Leaves Before Close

**Evidence**: No door close logs OR "door close abandoned" logs

**Root Cause**: Character moves away from kennel tile or removes device before 5-second timeout

**Action**:

1. Ask user if they're moving character immediately after entering kennel
2. Character must stay still for 5+ seconds for door to close
3. This is expected behavior, not a bug

### 🟡 Medium Likely: Reconciliation Race Condition

**Evidence**: Multiple "Scheduling door close" logs, previous task not completing

**Root Cause**: `onCharacterSync` or `onCharacterItemRemove` triggers reconciliation while delay is running

**Action**:

1. Check if kennel device is being added/removed rapidly
2. Verify no other systems are modifying appearance
3. Check for item update errors in logs

### 🟢 Low Likely: Event Loop Blocking

**Evidence**: Large gap between logs, delay logs missing, high CPU usage

**Root Cause**: Node.js event loop is blocked by long-running operation

**Action**:

1. Monitor CPU and memory usage
2. Check for blocking operations (synchronous file I/O, etc.)
3. Look for performance degradation logs

## Data Collection Template

When reporting the issue, please collect:

```
TIMESTAMP: [when door failed to close]
CHARACTER_ID: [member number]

LOGS:
1. Character enters kennel - search logs for "Kennel entry completed"
2. Door close scheduled - search for "Scheduling door close"
3. Door close attempted - search for "Door close delay completed"
4. Door close result - search for "Kennel door closed" or "Kennel door close failed"

CONTEXT:
- Is character still wearing kennel device? [yes/no]
- Did character move away from kennel? [yes/no/unknown]
- Are there any error logs near this time? [describe]
- What was character doing? [entering, already in kennel, etc.]
```

## Workarounds

While investigating:

1. **Prevent Early Exit**: Instruct users to stay still for at least 5 seconds after entering kennel
2. **Manual Door Trigger**: Could implement a manual `/kennel-door-close` command if needed
3. **Timeout Extension**: Could increase KENNEL_DOOR_CLOSE_DELAY_MS if slow connections are the issue

## Implementation Notes

### How Door State Works

- `TypeRecord.d = 0` → Door Open (character can leave)
- `TypeRecord.d = 1` → Door Closed (character contained)
- Door property is part of the Kennel item's `Property.TypeRecord` field
- Changes are synced to server via `liveCharacterStateSync.syncCharacter()`

### Retry Logic

- Initial attempt immediately after delay
- Up to 3 total attempts
- Exponential backoff: 100ms × 2^(attempt-1)
    - Attempt 1: immediate
    - Attempt 2: 100ms delay
    - Attempt 3: 200ms delay

### Idempotent Behavior

- Multiple reconciliations for same character are merged (via IdempotentMonitor)
- Door close task is replaced if character gets new kennel device
- Task is abandoned if kennel is removed (detected by object reference check)

## Next Steps

1. **Enable Enhanced Logging**: Already deployed with better diagnostics
2. **Collect Logs**: Gather logs from next occurrence
3. **Analyze Pattern**: Determine which root cause applies
4. **Implement Fix**: Based on findings, apply appropriate fix

---

## Technical References

- Implementation: [kennelSystem.ts](bin/games/veratown/kennelSystem.ts)
- Tests: [kennelSystem.test.ts](bin/games/veratown/__tests__/kennelSystem.test.ts)
- Config: [veratownConfig.ts:239](bin/games/veratown/veratownConfig.ts#L239) - KENNEL_DOOR_CLOSE_DELAY_MS
- Sync: [liveCharacterStateSync.ts](bin/games/veratown/liveCharacterStateSync.ts)
- Types: [unifiedCharacterTypes.ts](bin/games/shared/unifiedCharacterTypes.ts) - KennelSession interface
