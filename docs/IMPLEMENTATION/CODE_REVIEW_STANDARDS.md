# Code Review Standards and Checklists

**Purpose**: Establish consistent code review criteria and catch issues before merge
**Audience**: Code reviewers, all developers
**Last Updated**: 2026-09-03
**Related Files**: See [GOLDEN_RULES.md](GOLDEN_RULES.md), [DEBUGGING_PATTERNS.md](DEBUGGING_PATTERNS.md), [DATABASE_TYPE_SAFETY.md](DATABASE_TYPE_SAFETY.md)

---

## Code Review Workflow

### For Release System Changes

**Always Check**:

- [ ] Which stage(s) affected? (Verify against 7-stage design)
- [ ] Is it atomic? (Never modify-then-restore)
- [ ] MakeAppearanceBundle() called before appearance read?
- [ ] Delays in loops (50ms minimum)?
- [ ] Specific lock types (not just truthy check)?
- [ ] Database mutations via executeWithRetry()?
- [ ] Fallback behavior for missing locations/configs?
- [ ] Error logs include character ID and operation?
- [ ] Tested state transitions independently?
- [ ] Does parole escalation still work correctly?

**Red Flags**:

- Strip followed by re-add
- Missing appearance refresh
- Generic lock checks
- Direct database mutations
- No fallback for missing config
- Bare `if (item.Property?.Lock)`
- Mutation without version increment

---

### For Feature System Changes

**Always Check**:

- [ ] Implements VeratownFeatureSystem interface?
- [ ] enable() and disable() idempotent?
- [ ] All handlers wrapped with guardHandler()?
- [ ] Checks resources exist before using?
- [ ] Audit trail updated if behavior-tracking?
- [ ] Error isolation prevents cascading failures?
- [ ] Consistent error logging format?

**Red Flags**:

- Missing interface implementation
- enable() creates duplicate state
- Handlers not wrapped
- No existence checks
- Failures crash other systems
- Inconsistent logging

---

### For Database Changes

**Always Check**:

- [ ] Uses executeWithRetry() for mutations?
- [ ] Numeric IDs (memberNumber) used as keys?
- [ ] Privacy implications considered?
- [ ] Retention policy documented?
- [ ] No unbounded growth (collections capped)?
- [ ] Queries indexed appropriately?

**Type Safety** (NEW):

- [ ] All timestamp fields use `asTimestamp(Date.now())`?
- [ ] All version fields use `asVersion()` and increment on mutation?
- [ ] All counter/score fields use `asGameCounter()`?
- [ ] New profile creation uses factory functions: `createCasinoState()`, `createDareState()`, etc.?
- [ ] Profile validation called when importing external data: `validateCharacterProfileTypes()`?
- [ ] Schema registry checked for field definitions?
- [ ] No plain `Date.now()` or loose numbers used for storage?
- [ ] Database operations return int64 timestamps (not floats)?
- [ ] Version incremented on every profile mutation (cache invalidation)?

**Documentation**:

- [ ] Added to: `docs/PHASE_4_PRAGMATIC_INTEGRATION_COMPLETE.md`?
- [ ] Used factory functions from: `mongodbTypeValidation.ts`?
- [ ] Followed patterns in: `bin/games/shared/mongodbGeneratedInterfaces.ts`?

**Red Flags**:

- Plain timestamps
- Version never changes
- Timestamps not updated with mutations
- No validation at boundaries
- Direct database calls

---

### For Appearance/Equipment Changes

**Always Check**:

- [ ] Is the operation idempotent? (Safe to repeat)
- [ ] Does it verify state before mutation?
- [ ] Does it handle missing slots gracefully?
- [ ] Are delays in loops (50ms minimum)?
- [ ] Is MakeAppearanceBundle() called before reads?
- [ ] Does it have fallback for failed mutations?

**Red Flags**:

- AddItem without checking current state
- RemoveItem without verification
- Assuming slots always exist
- Tight loops without delays
- No refresh before reading
- No fallback on failure

---

### For Monitoring/State Systems

**Always Check**:

- [ ] Can trigger start more than one monitor? NO = good
- [ ] Is handler idempotent?
- [ ] Is monitor cleaned up correctly?
- [ ] Does monitor use try/finally?
- [ ] Is state machine self-healing?
- [ ] Are mutations idempotent?
- [ ] Does logging track state transitions?
- [ ] Would this work after reconnects?

**Red Flags**:

- Duplicate monitor starts possible
- Non-idempotent handler
- Missing cleanup
- No try/finally
- Event-chain only (no continuous state check)
- State mutation without verification
- Silent failures
- Logs only actions, not state

---

## Common Review Scenarios

### Scenario 1: "We Need to Add Item Preservation"

**Your Analysis**:

1. Why selective stripping instead of strip-then-restore? (Race condition prevention)
2. Which lock types? (Must be specific: OwnerPadlock/OwnerTimerPadlock only)
3. Where in the 7-stage flow? (Usually Stage 4)
4. How to handle re-release on parole? (Restart from Stage 3, preserve same items)

**Code Review Questions**:

- Is MakeAppearanceBundle() called before reading appearance?
- Are delays present in any removal loops?
- Are specific lock types checked (not just `item.Property?.Lock`)?
- What happens if item.Property is undefined?
- Does version increment after the operation?

**Example Approval Comment**:

```
✅ Ready to merge

Correctly uses:
- Selective stripping (no race condition)
- Specific lock type checks
- MakeAppearanceBundle() before read
- Version increment after mutation
- Proper delay in loop (75ms)

References Rule 1, 2, 6, 14 from GOLDEN_RULES.md
See docs/IMPLEMENTATION/GOLDEN_RULES.md
```

---

### Scenario 2: "Feature X Needs to Detect Cosmetics"

**Your Response**:

- Use `isCosplay(item)` from assetHelpers, don't create hardcoded list
- Verify against actual BC asset data
- Check for edge cases: hybrid items (cosmetic collar vs. bondage collar)
- Document assumption (relies on BC asset definitions)

**Code Review Questions**:

- Is it using asset helper functions?
- Are there hardcoded asset lists? (Request removal)
- Are edge cases considered?
- Is assumption about asset data documented?

---

### Scenario 3: "Release System Performance Issue"

**Investigation**:

- How often is appearance checked? (Should be 5-second intervals)
- Is profile data cached? (Should be in-memory)
- Are region entry events firing per-tile? (Should be once per region)
- Is notification rate-limited? (Should have 5s minimum cooldown)

**Code Review Questions**:

- What's the polling interval?
- Is the query indexed?
- How many documents matched?
- Is caching implemented?

---

### Scenario 4: "Release Failed and Character Lost Items"

**Diagnosis**:

- Was there a strip-and-restore pattern? (Look for atomic violation)
- Did bot crash between operations? (Check database transaction atomicity)
- Was MakeAppearanceBundle() called? (Stale appearance issue?)
- Which stage failed? (Check error logs with context)

**Code Review Questions**:

- Is this a known atomic operation violation?
- Was the failure in middle of transaction?
- Are error logs sufficient to diagnose?
- Can this be reproduced with test data?

---

### Scenario 5: "New Admin Feature Needed"

**Checklist**:

- Is it a location CRUD operation? (Use `/bot location add|remove|list`)
- Is it map management? (Use `/bot map export|import|update`)
- Is it feature control? (Use `/bot feature enable|disable`)
- If entirely new:
    - Is it hierarchical under `/bot`?
    - Are permission checks consistent with other admin commands?
    - Is help text generated automatically?
    - Are errors logged with context?

---

## Type Safety Review Checklist

When reviewing any database operation:

### New Profile Creation

```typescript
// ✅ GOOD - Use all factory functions
const profile = {
    _id: memberNumber,
    name: characterName,
    createdAt: asTimestamp(Date.now()),
    updatedAt: asTimestamp(Date.now()),
    version: asVersion(1),
    casino: createCasinoState(),
    dare: createDareState(),
    veratown: createVeratownState(),
};
```

```typescript
// ❌ BAD - Plain timestamps and numbers
const profile = {
    _id: memberNumber,
    name: characterName,
    createdAt: Date.now(), // Missing asTimestamp()
    version: 1, // Missing asVersion()
    casino: { score: 0 }, // Missing createCasinoState()
};
```

### Updating Profile

```typescript
// ✅ GOOD - Version increment + timestamp
await this.executeWithRetry(
    () =>
        this.store.updateProfile(id, {
            ...data,
            version: asVersion(profile.version + 1),
            updatedAt: asTimestamp(Date.now()),
        }),
    2,
    "update_profile",
);
```

```typescript
// ❌ BAD - No version increment
await this.store.updateProfile(id, data);
// ❌ BAD - No timestamp update
await this.store.updateProfile(id, {
    ...data,
    version: profile.version + 1, // Missing asVersion()
});
```

### Loading Profile

```typescript
// ✅ GOOD - Validate on load
const profile = await db
    .collection("unifiedCharacterProfiles")
    .findOne({ _id: id });
const validation = validateCharacterProfileTypes(profile);
if (!validation.isValid) {
    logger.error("Invalid profile", { errors: validation.errors });
    // Handle error
}
```

```typescript
// ❌ BAD - No validation
const profile = await db
    .collection("unifiedCharacterProfiles")
    .findOne({ _id: id });
console.log(profile.casino.score); // Might be wrong type
```

---

## Documentation Standards for Reviews

When reviewing documentation changes:

### ADR (Architecture Decision Record) Format

Verify inclusion of:

1. **Decision**: What choice was made?
2. **Reasoning**: Why was this best?
3. **Trade-offs**: What's the cost?
4. **Alternatives**: What else was considered?
5. **Implementation**: How does code reflect this?

### Lessons Learned Format

Verify inclusion of:

1. **Finding**: What pattern works or fails?
2. **Why**: Root cause or principle?
3. **Evidence**: Example from codebase
4. **Lesson**: Actionable guidance for future work

### Code Comments Format

Verify inclusion of:

1. **Purpose**: What does this do?
2. **Why**: Why is it necessary?
3. **Gotcha**: What could break?
4. **Reference**: Link to docs/decision if complex

---

## Red Flags Across All Reviews

| Red Flag                              | Reason                   | Reference   |
| ------------------------------------- | ------------------------ | ----------- |
| No MakeAppearanceBundle() before read | Stale appearance         | Rule 2      |
| Strip then add pattern                | Race condition           | Rule 1      |
| Direct database mutation              | No retry logic           | Rule 4      |
| Hardcoded asset lists                 | Breaks on BC update      | Rule 5      |
| Generic lock checks                   | Wrong semantics          | Rule 6      |
| No fallback for missing data          | Cascade failure          | Rule 7      |
| console.log instead of logger         | Missing context          | Rule 8      |
| Non-idempotent event handler          | Duplicate execution      | Rule 9      |
| Multiple monitors possible            | State corruption         | Rule 10     |
| Event-driven only                     | Misses state changes     | Rule 11     |
| Non-idempotent mutations              | Double-apply             | Rule 12     |
| Assumes slots exist                   | Crash on empty           | Rule 13     |
| Assumes write immediately visible     | Inconsistency            | Rule 14     |
| Logs only action, not state           | Impossible to debug      | Rule 15     |
| Timestamp as number                   | Precision loss           | Type Safety |
| Version never incremented             | Cache invalidation fails | Type Safety |
| No profile validation                 | Type mismatches          | Type Safety |

---

## Quick Approval Template

**For straightforward changes**:

```
✅ Ready to merge

Verified:
- [Rule 1] Atomic operations
- [Rule 4] executeWithRetry used
- [Rule 8] Structured logging
- [Type Safety] Factory functions used
- [Test] Verified with test case X

No blockers.
```

**For complex changes**:

```
✅ Ready to merge (with follow-ups)

Verified:
- [Rule X] ✅
- [Rule Y] ✅
- Documentation updated

Suggestions (non-blocking):
1. Consider adding validation for edge case X
2. Add monitoring for performance concern Y

Follow-up tasks:
- [ ] Performance profiling in production
- [ ] Add test for scenario Z
```

**For requires changes**:

```
⏸️ Needs revision

Blocker:
- [Rule X] Atomic operation violation detected

Required changes:
1. Use selective stripping instead of strip-then-restore
2. Add MakeAppearanceBundle() before appearance read

Reference: docs/IMPLEMENTATION/GOLDEN_RULES.md
```

---

## When to Escalate to Architect

**Escalate when reviewing**:

- Changes to 7-stage release flow
- New database collection addition
- Cross-system dependency introduction
- Performance concerns with scaling implications
- Fundamental architecture changes

**Do NOT escalate for**:

- Location configuration updates
- Cosmetic narration changes
- Individual feature system additions
- Bug fixes within single system
- Documentation updates

---

**See Also**:

- [GOLDEN_RULES.md](GOLDEN_RULES.md) - Full rules with examples
- [DEBUGGING_PATTERNS.md](DEBUGGING_PATTERNS.md) - Common issues
- [DATABASE_TYPE_SAFETY.md](DATABASE_TYPE_SAFETY.md) - Type patterns
