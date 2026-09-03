# Debugging Patterns and Troubleshooting

**Purpose**: Diagnose and fix common issues in Veratown system development
**Audience**: Developers troubleshooting issues, code reviewers
**Last Updated**: 2026-09-03
**Related Files**: See [GOLDEN_RULES.md](GOLDEN_RULES.md), [CODE_REVIEW_STANDARDS.md](CODE_REVIEW_STANDARDS.md), [DATABASE_TYPE_SAFETY.md](DATABASE_TYPE_SAFETY.md)

---

## Debugging Approach

When investigating issues, follow this systematic process:

### 1. Identify the System

**Ask**: Which system is failing?

- Release system
- Monitoring system
- Appearance mutation
- Database operation
- Event handling

**Action**: Check logs with appropriate prefix:

```bash
grep "\[ReleaseSystem\]" logs/system.log
grep "\[BedSystem\]" logs/system.log
grep "\[DatabaseError\]" logs/system.log
```

### 2. Check Appearance State

**If appearance-related**:

```typescript
// Verify refresh is called
character.MakeAppearanceBundle();

// Check current state
const items = character.Appearance.Items;
const slots = Object.keys(items);
```

**Red Flag**: Error "Couldn't find item to update in slot ItemDevices" → Likely normal (empty slot)

### 3. Verify Atomicity

**Ask**: Is there a strip-then-restore pattern?

Look for:

```typescript
stripBulk(...)
// ... some operation ...
reAddOwnerLocked(...)
```

If crash between these lines → items permanently lost.

### 4. Test Isolation

**Can you reproduce with minimal state?**

- Create test character with specific state
- Run operation in isolation
- Check if issue reproduces

### 5. Review Recent Changes

```bash
git log --oneline -20 -- [affected file]
git diff HEAD~5..HEAD -- [affected file]
```

### 6. Verify Assumptions

- Do required locations exist?
- Are configs loaded?
- Is database connected?
- Are permissions correct?

---

## Common Gotchas and Solutions

### Gotcha 1: Appearance Cache Stale

**Symptoms**:

- Character appears clothed to system
- But appears nude in-game (or vice versa)
- State mismatch between systems

**Root Cause**:

```typescript
// ❌ BAD - Reading stale cache
if (hasItem(character, "ItemDevices")) {
    // ...
}
```

**Fix**:

```typescript
// ✅ GOOD - Refresh before read
character.MakeAppearanceBundle();
if (hasItem(character, "ItemDevices")) {
    // ...
}
```

**Diagnosis**: Check logs for appearance operations without preceding MakeAppearanceBundle()

---

### Gotcha 2: Race Condition in Release

**Symptoms**:

- Items disappear permanently
- Or double-apply on restart
- Inconsistent state between restarts

**Root Cause**:

```typescript
// ❌ BAD - Race condition
stripBulk({ item: true }, true);
await reAddOwnerLocked(items);
// If crash here, restraints lost forever
```

**Fix**:

```typescript
// ✅ GOOD - Atomic operation
slowlyStripBulk({ clothing: true, item: false });
for (item of unlocked) {
    RemoveItem(item);
}
```

**Diagnosis**:

- Check for strip-then-restore in logs
- Verify no crashes between operations
- Run `npx tsc --noEmit` to check code

---

### Gotcha 3: All Locks Treated Equally

**Symptoms**:

- Admin locks prevent emergency release
- System removes too many items
- Player loses admin-locked restraints

**Root Cause**:

```typescript
// ❌ BAD - Treats all locks the same
if (item.Property?.Lock) {
    RemoveItem(item);
}
```

**Fix**:

```typescript
// ✅ GOOD - Specific lock types only
if (
    item.Property?.Lock === "OwnerPadlock" ||
    item.Property?.Lock === "OwnerTimerPadlock"
) {
    RemoveItem(item);
}
```

**Diagnosis**: Check release logs for which items removed

---

### Gotcha 4: Missing Fallback

**Symptoms**:

- Feature completely breaks if config missing
- No meaningful error message
- Cascade failure to other systems

**Root Cause**:

```typescript
// ❌ BAD - No fallback
const location = store.getLocation(key);
console.log(location.name); // Crashes if null
```

**Fix**:

```typescript
// ✅ GOOD - Fallback provided
const location = store.getLocation(key);
if (!location) {
    logger.error("Location not found", { key });
    return; // or use default
}
```

**Diagnosis**:

- Check for null pointer exceptions
- Verify config is loaded
- Test with missing config

---

### Gotcha 5: Silent Database Failures

**Symptoms**:

- State doesn't persist
- No error message in logs
- Changes disappear after restart

**Root Cause**:

```typescript
// ❌ BAD - Direct mutation without retry
await db.collection("profiles").updateOne(filter, update);
// Transient errors silently fail
```

**Fix**:

```typescript
// ✅ GOOD - Wrapped in retry logic
await this.executeWithRetry(
    () => this.store.updateProfile(id, data),
    2,
    "operation_name",
);
```

**Diagnosis**:

- Check for direct database mutations
- Enable verbose database logging
- Review error logs
- Check network connectivity

---

### Gotcha 6: Timestamp Precision Loss

**Symptoms**:

- Cache invalidation fails
- Profile updates silently skip
- Version comparison broken
- Stale data served to clients

**Root Cause**:

```typescript
// ❌ BAD - Timestamps as IEEE 754 doubles lose precision
const profile = {
    createdAt: Date.now(), // Loses precision at ~1.78816e+12 ms
    updatedAt: Date.now(),
};
```

**Fix**:

```typescript
// ✅ GOOD - Use factory function for int64 storage
const profile = {
    createdAt: asTimestamp(Date.now()),
    updatedAt: asTimestamp(Date.now()),
};
```

**Diagnosis**:

- Run `npx ts-node scripts/database-type-safety.ts analyze`
- Check if timestamps are stored as int64 in database
- Verify factory functions used

---

### Gotcha 7: Version Never Changes

**Symptoms**:

- Cache doesn't invalidate on updates
- Stale data persists
- Clients see old state after server updates

**Root Cause**:

```typescript
// ❌ BAD - Version never incremented
await db
    .collection("profiles")
    .updateOne({ _id: memberNumber }, { $set: { casino: updatedState } });
```

**Fix**:

```typescript
// ✅ GOOD - Always increment version
await db.collection("profiles").updateOne(
    { _id: memberNumber },
    {
        $set: {
            casino: updatedState,
            version: asVersion(profile.version + 1),
            updatedAt: asTimestamp(Date.now()),
        },
    },
);
```

**Diagnosis**:

- Check if profile.version changes on mutations
- Look for code updating profile without incrementing version
- Run code review checklist

---

### Gotcha 8: Unvalidated External Data

**Symptoms**:

- Type errors in production
- Unexpected null/undefined crashes
- Inconsistent data state

**Root Cause**:

```typescript
// ❌ BAD - Assume data is always valid
const profile = await db.collection("profiles").findOne({ _id: id });
console.log(profile.casino.score); // Might be wrong type
```

**Fix**:

```typescript
// ✅ GOOD - Validate on import
const profile = await db.collection("profiles").findOne({ _id: id });
const validation = validateCharacterProfileTypes(profile);
if (!validation.isValid) {
    logger.error("Invalid profile", { errors: validation.errors });
    // Handle error
}
```

**Diagnosis**:

- Add validation at all external data boundaries
- Check for type assertion errors
- Run type safety analysis

---

## Failure Pattern Recognition

### Pattern 1: Duplicate Monitor Execution

**Symptoms**:

- Repeated item application
- Duplicate state transitions
- Actions execute multiple times
- Excessive monitoring logs

**Example Log**:

```
[BedSystem] Starting bed monitor for member 12345
[BedSystem] Starting bed monitor for member 12345  ← Duplicate!
[BedSystem] Applying bed
[BedSystem] Applying bed  ← Double-apply
[BedSystem] Starting bed monitor for member 12345  ← Another one!
```

**Root Cause**:
Multiple monitors running against same character.

**Fix**:

```typescript
private readonly activeMonitors = new Set<number>();

if (this.activeMonitors.has(memberNumber)) {
    return; // Already monitoring
}

this.activeMonitors.add(memberNumber);
try {
    await this.monitorCharacter(memberNumber);
} finally {
    this.activeMonitors.delete(memberNumber);
}
```

**Diagnosis**:

- Search logs for multiple "Starting" messages for same member
- Check activeMonitors set size
- Verify trigger deduplication

---

### Pattern 2: Missing Appearance Slot

**Symptoms**:

```
Couldn't find item to update in slot ItemDevices
```

or:

```typescript
getItemData(...) === undefined
```

**Root Cause**:
Bondage Club removes empty appearance groups.

**Note**: This is NORMAL and expected behavior.

**Fix**:
Treat missing slots as valid state and verify existence before mutation.

```typescript
const item = character.Appearance.getItemData("ItemDevices");
if (!item) {
    return; // Empty slot is valid state
}
```

**Diagnosis**:

- Check if this error appears in logs
- This is rarely a bug - usually normal synchronization

---

### Pattern 3: Trigger Spam

**Symptoms**:

- One action appears to execute many times
- Multiple monitor starts for the same player
- Logs show repeated trigger execution in rapid succession

**Example Log**:

```
[trigger] Character entered region at (100,100)
[trigger] Character entered region at (100,101)  ← Adjacent tile
[trigger] Character entered region at (100,102)  ← Still same region
[monitor] Starting monitor
[monitor] Starting monitor  ← Multiple starts
```

**Root Cause**:
Map trigger fires multiple times due to:

- Movement between adjacent tiles
- Synchronization events
- Reconnect activity
- Map reloads

**Fix**:
Ensure triggers are idempotent and only start monitors if one does not already exist.

```typescript
private onCharacterEnterBed = async (character: API_Character) => {
    if (this.activeMonitors.has(character.MemberNumber)) {
        return; // Already monitoring
    }

    // ... start monitor ...
};
```

**Diagnosis**:

- Check for rapid repeated log entries
- Look at region entry event frequency
- Verify idempotency in trigger handler

---

## Diagnostic Techniques

### Technique 1: State Snapshot

When issue occurs, capture full state:

```typescript
logger.info("State snapshot", {
    memberNumber,
    isAsleep,
    hasBed,
    hasRestraints: hasEquipment(character),
    appearanceItems: Object.keys(character.Appearance.Items),
    monitorActive: this.activeMonitors.has(memberNumber),
    databaseVersion: profile.version,
    timestamp: asTimestamp(Date.now()),
});
```

### Technique 2: Trace Logs

Follow action through system:

```bash
# Find all related logs
grep "memberNumber:12345" logs/system.log | grep -E "\[(Release|Bed|Appearance)\]"

# Follow timestamps
grep "2026-09-03T14:3" logs/system.log | head -20
```

### Technique 3: Replay with Test Data

Create minimal reproduction:

```typescript
const testCharacter = {
    MemberNumber: 99999,
    Name: "Test",
    // Minimal state
};

const result = await system.process(testCharacter);
console.log("Result:", result);
```

### Technique 4: Binary Search

If issue appears after recent changes:

```bash
git bisect start
git bisect bad HEAD
git bisect good HEAD~10
# Run test, mark good/bad
# Narrows down problematic commit
```

### Technique 5: Database Inspection

Check stored state:

```bash
# MongoDB inspection
db.unifiedCharacterProfiles.findOne({ _id: 12345 })

# Check version field
db.unifiedCharacterProfiles.findOne(
    { _id: 12345 },
    { version: 1, updatedAt: 1 }
)

# Type check
db.unifiedCharacterProfiles.findOne({ _id: 12345 }).updatedAt.constructor
```

---

## Questions to Debug Any Issue

1. **What is the observed behavior?** (Be specific)
2. **What is the expected behavior?** (From documentation or previous working state)
3. **When did this start?** (After specific change? On specific date?)
4. **Can you reproduce it?** (Consistently or intermittently?)
5. **What changed recently?** (Code, config, data)
6. **Which system is involved?** (Release, Bed, Appearance, Database)
7. **Are there error logs?** (Check all log files, not just console)
8. **What is the state at failure time?** (Character position, equipment, version)
9. **Did it work before?** (Previous version? Previous deployment?)
10. **What assumptions are we making?** (About state, timing, availability)

---

## Performance Troubleshooting

### Slow Appearance Operations

**Check**:

- Are delays present in loops? (50ms minimum)
- Is MakeAppearanceBundle() called once per operation or repeatedly?
- Are you iterating all characters or filtering first?

**Optimize**:

```typescript
// ❌ Slow - Calls refresh in loop
for (character of characters) {
    character.MakeAppearanceBundle(); // N times
    // ...
}

// ✅ Better - Call once per character
character.MakeAppearanceBundle(); // Once
for (item of items) {
    // Apply items
    await wait(50);
}
```

### Slow Database Queries

**Check**:

```bash
# Run analysis
npx ts-node scripts/database-type-safety.ts analyze

# Check indexes exist
db.unifiedCharacterProfiles.getIndexes()
```

**Optimize**:

```typescript
// Ensure index on query filter
await collection.createIndex({ _id: 1 });
await collection.createIndex({ "casino.score": 1 });
```

### High CPU Usage

**Check**:

- Are there infinite loops?
- Are monitors spawning duplicates?
- Is polling interval too tight?

**Optimize**:

```typescript
// ❌ Too tight - CPU spike
while (true) {
    // Process
}

// ✅ Better - With interval
while (this.isMonitoring) {
    // Process
    await wait(5000); // 5 second interval
}
```

---

## Common Error Messages and Fixes

| Error Message                            | Cause                   | Fix                                     |
| ---------------------------------------- | ----------------------- | --------------------------------------- |
| "Couldn't find item to update in slot X" | Empty appearance group  | Handle gracefully, treat as valid state |
| "Cannot set property of undefined"       | Missing fallback        | Add null/undefined check                |
| "Version mismatch"                       | Concurrent updates      | Use optimistic locking with version     |
| "State doesn't persist"                  | No executeWithRetry()   | Wrap in retry wrapper                   |
| "Duplicate monitors"                     | No activeMonitors check | Add duplicate prevention                |
| "Cache invalidation fails"               | Version not incremented | Increment version on every mutation     |
| "Precision loss on timestamp"            | Plain Date.now()        | Use asTimestamp() factory               |
| "Type error after update"                | No validation           | Validate at boundaries                  |

---

## When to Create a Bug Report

If you've followed this debugging guide and still can't fix it:

1. Create detailed reproduction steps
2. Include full error logs with context
3. Show state before and after
4. Reference related code sections
5. Suggest potential root causes based on diagnosis

**Include**:

- Exact error message
- When it started
- Whether it's reproducible
- Recent related changes
- Full system logs
- Database state if applicable

---

## Prevention vs. Cure

### Prevention Through Logging

Log decision-driving state, not just actions:

```typescript
// ❌ Poor debugging
logger.info("Applying bed");

// ✅ Good debugging
logger.info("Applying bed", {
    memberNumber,
    isAsleep,
    hasBed,
    reason: "automatic sleep",
    stage: "monitor_transition",
});
```

### Prevention Through Testing

Test edge cases:

- Character with no locations
- Missing configuration
- Concurrent operations
- State transitions

### Prevention Through Code Review

Use [CODE_REVIEW_STANDARDS.md](CODE_REVIEW_STANDARDS.md) checklist to catch issues before merge.

---

**See Also**:

- [GOLDEN_RULES.md](GOLDEN_RULES.md) - Root causes of common issues
- [CODE_REVIEW_STANDARDS.md](CODE_REVIEW_STANDARDS.md) - Catch issues in review
- [DATABASE_TYPE_SAFETY.md](DATABASE_TYPE_SAFETY.md) - Debug type issues
