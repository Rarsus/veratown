# Architectural Audit: Collection & System Analysis

## Three-Layer Architecture Compliance Review

**Date:** 2026-08-31  
**Focus:** Identifying generic vs character-specific data mixing patterns

---

## Executive Summary

**Issues Found:** 3 HIGH, 2 MEDIUM  
**Common Pattern:** Several collections inappropriately mix reference data (Layer 3) with character-specific data (Layer 1/2), similar to the Dare system issues previously fixed.

---

## Part 1: Critical Violations

### 🔴 VIOLATION #1: keypadAccessGroups (CRITICAL)

**Collection Name:** `keypadAccessGroups`  
**Manages:** Door access group configuration + membership  
**Current Implementation:** [bin/games/veratown/keypadAccessGroupManager.ts](bin/games/veratown/keypadAccessGroupManager.ts)

**Issue Type:** Generic + Character-Specific Data Mixed  
**Severity:** HIGH

**Current Schema Problem:**

```typescript
interface KeypadDoorAccessGroups {
    doorKey: string; // ✅ Layer 3 (Reference)
    groups: Record<string, KeypadAccessGroupConfig>;
    // └─> Contains memberNumbers[]     // ❌ Layer 1 (Character-Specific)
}

interface KeypadAccessGroupConfig {
    doorKey: string; // ✅ Reference data
    groupName: string; // ✅ Reference data
    code: string; // ✅ Reference data
    memberNumbers: number[]; // ❌ Character-Specific data!
    createdAt: number;
    updatedAt: number;
}
```

**Problem Details:**

1. **Layer 3 (Reference):** Door definitions, group names, access codes
2. **Layer 1 (Character-Specific):** Which members belong to each group
3. **Current Result:** ONE document mixes both layers
4. **When Updated:** Every time a member is added/removed, entire group config writes

**Example of the Problem:**

```typescript
// Current implementation (in keypadAccessGroupManager.ts lines 169-188)
public async addMember(
    doorKey: string,
    groupName: string,
    memberNumber: number,
): Promise<void> {
    const groups = await this.getDoorGroups(doorKey);  // Loads ENTIRE config
    const group = groups.groups[groupName];            // Including all code/permissions

    group.memberNumbers.push(memberNumber);            // Add member
    groups.updatedAt = Date.now();

    // Writes ENTIRE door config + all member lists
    await this.collection.updateOne({ doorKey }, { $set: groups });
}
```

**Access Patterns:** Used by [bin/games/veratown/keypadDoorSystem.ts](bin/games/veratown/keypadDoorSystem.ts#L204)

**Impact:**

- Every member change triggers full document rewrite
- Cannot query "which groups contain member X" efficiently
- Hard to audit member changes separately from group config
- Scales poorly as member lists grow

**Correct Architecture Should Be:**

**Layer 3 (Reference Data):** `keypadAccessGroups` - Door + Group definitions

```typescript
interface KeypadAccessGroup {
    doorKey: string;
    groupName: string;
    code: string;
    description?: string;
    createdAt: number;
    updatedAt: number;
}
```

**Layer 1 (Character-Specific):** `keypadGroupMemberships` - Who's in which group

```typescript
interface KeypadGroupMembership {
    doorKey: string;
    groupName: string;
    memberNumber: number;
    addedAt: number;
    addedBy?: number;
}
```

**Benefit:** Adding/removing a member is atomic operation on membership collection only, not the entire group config.

---

### 🔴 VIOLATION #2: locationEventExecutions with affectedMembers (HIGH)

**Collection Name:** `locationEventExecutions`  
**Manages:** Event execution history with affected characters  
**Current Implementation:** [bin/games/veratown/locationEventSystem.ts](bin/games/veratown/locationEventSystem.ts#L44-L58)

**Issue Type:** Generic Events + Character-Specific Execution Records Mixed  
**Severity:** HIGH

**Current Schema:**

```typescript
export interface LocationEventExecution {
    eventId: string; // ✅ Layer 3 Reference
    locationKey: string; // ✅ Layer 3 Reference
    triggeredAt: number;
    triggeredBy: "occupancy" | "daily" | "random" | "manual";
    affectedMembers: number[]; // ❌ Layer 1 Character-Specific!
    narrationSent: boolean;
    consequences: Array<{
        type: string;
        success: boolean;
        error?: string;
    }>;
    durationMs?: number;
    completedAt?: number;
    notes?: string;
}
```

**Problem:**

1. `locationEvents` collection is pure reference data (event templates)
2. `locationEventExecutions` mixes:
    - Event metadata (reference)
    - Execution records (system state)
    - Which characters were affected (character-specific)

**Access from:** [bin/games/veratown/locationEventSystem.ts](bin/games/veratown/locationEventSystem.ts#L229-L258) - `recordEventExecution()` method

**Example Problem:**

```typescript
// Recording execution (lines 213-232)
const execution: LocationEventExecution = {
    eventId,
    locationKey,
    triggeredAt: Date.now(),
    triggeredBy,
    affectedMembers, // ❌ Contains character-specific data
    // ... rest of record
};
await this.executionCollection.insertOne(execution);
```

**Correct Separation:**

**Layer 3:** `locationEvents` - Event definitions ✅ (Already correct)
**Layer 2/Audit:** `locationEventExecutions` - Execution records (generic)
**Layer 1:** Character-specific effects stored in `unifiedCharacterProfiles`

---

### 🔴 VIOLATION #3: furnitureState Contains Live Occupancy (HIGH)

**Collection Name:** `furnitureInteractionState`  
**Manages:** Furniture state + active occupants  
**Current Implementation:** [bin/games/veratown/furnitureInteractionSystem.ts](bin/games/veratown/furnitureInteractionSystem.ts#L35-L42)

**Issue Type:** Reference Data + Live System State Mixed  
**Severity:** HIGH

**Current Schema:**

```typescript
export interface FurnitureState {
    furnitureKey: string; // ✅ Layer 3 Reference
    occupants: number[]; // ❌ Layer 2 System State (who's using it)
    state: Record<string, unknown>; // ⚠️  Mixed: "made: true" vs "player_count"
    lastInteractionAt: number;
    lastInteractionBy?: number;
    createdAt: number;
    updatedAt: number;
}
```

**Problem:**

1. `furnitureKey` is a reference to a location
2. `occupants: number[]` is LIVE SYSTEM STATE (which character is actively using)
3. Every player action on furniture requires full document update
4. Furniture state is not atomic with character state

**Example Problem:**

```typescript
// When player sits on bed (lines 187-207)
public async addOccupant(
    furnitureKey: string,
    memberNumber: number,
): Promise<void> {
    const state = await this.getFurnitureState(furnitureKey);
    // ...
    state.occupants.push(memberNumber);
    state.updatedAt = Date.now();

    // Updates furniture state - not atomic with character state
    await this.collection.updateOne({ furnitureKey }, { $set: state });
}
```

**Consequences:**

- Race conditions: Two players could sit simultaneously
- Not atomic with character state changes
- Can't query "which furniture is player X on?" from character perspective
- Furniture state not rolled back if character update fails

**Correct Architecture:**

- **Layer 3:** `furnitureDefinitions` - Bed metadata, max occupancy, etc.
- **Layer 2:** Real-time occupancy could be queried from `unifiedCharacterProfiles` (check if character's `currentLocation` is a furniture key)
- **Layer 1:** Character's `currentLocation` = "bed_001" (stored in profile)

**Alternative (if furniture must track occupancy):**

- Keep as Layer 2 System State but ensure all furniture operations are bracketed with character state updates
- Use MongoDB transactions to keep synchronized

---

## Part 2: Medium-Severity Issues

### 🟠 ISSUE #1: playerRoles (Role Assignment) Should Be in UnifiedCharacterProfiles

**Collection Name:** `playerRoles` (Character-Specific)  
**Manages:** Which role each character has  
**Current Implementation:** [bin/games/veratown/playerRoleSystem.ts](bin/games/veratown/playerRoleSystem.ts#L142-L242)

**Issue Type:** Character State Not Unified  
**Severity:** MEDIUM

**Current Schema:**

```typescript
export interface CharacterRole {
    memberNumber: number; // ❌ Separate collection by memberNumber
    characterName?: string;
    role: PlayerRole;
    assignedAt: number;
    active: boolean;
    // ... more fields
}
```

**Correctly Separated:**

```typescript
// ✅ CORRECT: roleDefinitions is pure reference data (Layer 3)
export interface RoleDefinition {
    roleId: PlayerRole;
    displayName: string;
    description: string;
    permissions: RolePermission[];
    // ... metadata
}
```

**Problem:**

- `playerRoles` contains character-specific state (which role player has)
- Should be migrated to `unifiedCharacterProfiles.roleAssignment`
- Separate collection means:
    - Not atomic with other character state
    - Requires separate query to get character's role
    - Risk of inconsistency

**Correct Pattern:**

```typescript
// In unifiedCharacterProfiles
{
  memberNumber: 123,
  characterName: "Player",
  roleAssignment: {
    roleId: "guard",
    assignedAt: timestamp,
    assignedBy: 456,
    active: true,
    expiresAt?: timestamp
  }
  // ... other character state
}
```

**Action Required:** Migrate `playerRoles` data into `unifiedCharacterProfiles.roleAssignment` field

---

### 🟠 ISSUE #2: appearanceAuditLog Contains Character-Specific Audit Trail

**Collection Name:** `appearanceAuditLogs`  
**Manages:** Appearance change history per character  
**Current Implementation:** [bin/games/veratown/appearanceAuditTrail.ts](bin/games/veratown/appearanceAuditTrail.ts#L33-L50)

**Issue Type:** Character-Specific Audit Data Externalized  
**Severity:** MEDIUM (Acceptable for Audit, but inconsistent)

**Current Schema:**

```typescript
export interface AppearanceAuditLog {
    memberNumber: number; // ❌ Character-specific, separate collection
    characterName?: string;
    changes: AppearanceChange[];
    createdAt: number;
    updatedAt: number;
}
```

**Issue:**

- Audit trail is character-specific (should travel with character)
- Stored in separate collection from character state
- Good practice for audit data, but:
    - Requires separate query to check audit trail
    - Audit history is not atomic with character updates

**Why This Is Different:**

- ✅ Audit logs are correctly separated (appropriate for compliance)
- ✅ Accessed via TTL index (auto-cleanup after 30 days)
- ⚠️ But could be embedded in `unifiedCharacterProfiles` for tighter coupling

**Current Status:** Acceptable, but consider whether audit trail needs to be:

1. Atomic with appearance changes (suggest embedding)
2. Queryable separately for compliance (suggest separate collection - current approach)

**Recommendation:** Keep current implementation but note in UnifiedCharacterStore that appearance audit is separate.

---

## Part 3: Architecture Compliance Matrix

| Collection                  | Service                    | Layer 3 (Reference) | Layer 2 (System)            | Layer 1 (Character)                           | Current Status  | Severity |
| --------------------------- | -------------------------- | ------------------- | --------------------------- | --------------------------------------------- | --------------- | -------- |
| `veratownMap`               | VeratownMapStore           | ✅ Pure reference   | -                           | -                                             | ✅ CORRECT      | -        |
| `veratownLocations`         | VeratownLocationStore      | ✅ Pure reference   | -                           | -                                             | ✅ CORRECT      | -        |
| `roleDefinitions`           | PlayerRoleSystem           | ✅ Pure reference   | -                           | -                                             | ✅ CORRECT      | -        |
| `playerRoles`               | PlayerRoleSystem           | -                   | -                           | ❌ Character-specific, should be embedded     | 🔴 WRONG LAYER  | MEDIUM   |
| `locationEvents`            | LocationEventSystem        | ✅ Pure reference   | -                           | -                                             | ✅ CORRECT      | -        |
| `locationEventExecutions`   | LocationEventSystem        | -                   | ⚠️ Mixed audit + character  | ❌ Contains affectedMembers                   | 🔴 MIXED        | HIGH     |
| `keypadAccessGroups`        | KeypadAccessGroupManager   | ✅ Ref data         | -                           | ❌ Contains memberNumbers                     | 🔴 MIXED        | HIGH     |
| `furnitureInteractionState` | FurnitureInteractionSystem | ✅ Ref              | ❌ Live occupancy (Layer 2) | -                                             | 🔴 MIXED        | HIGH     |
| `appearanceAuditLogs`       | AppearanceAuditTrail       | -                   | -                           | ✅ Character-specific, but correctly isolated | 🟡 ACCEPTABLE   | MEDIUM   |
| `gameEvents`                | UnifiedCharacterStore      | -                   | ⚠️ Cross-system events      | -                                             | 🟡 NEEDS REVIEW | MEDIUM   |

---

## Part 4: Comparison to Dare System Fix (Reference)

The Dare system had similar issues:

- **Before:** Generic dare definitions mixed with character-specific dare state
- **After:**
    - `dares` = pure reference data (dare templates)
    - `dareParticipants` = character-specific state (who's in dare, status)
    - `unifiedCharacterProfiles.dareProgress` = character's current dare

**Same Pattern Applies Here:**

### keypadAccessGroups Pattern

- **Before:** One document per door with group definitions + member lists
- **After (Recommended):**
    - `keypadAccessGroups` = group definitions only (Layer 3)
    - `keypadGroupMemberships` = who's in what group (Layer 1)

### locationEventExecutions Pattern

- **Before:** Execution records contain affectedMembers list
- **After (Recommended):**
    - `locationEvents` = event definitions (Layer 3) ✅
    - `locationEventExecutions` = execution records (Layer 2/audit, NO character data)
    - Character effects stored in `unifiedCharacterProfiles` via character-specific update

### furnitureState Pattern

- **Before:** Furniture document tracks active occupants
- **After (Recommended):**
    - Option A: Track occupancy via `unifiedCharacterProfiles.currentLocation`
    - Option B: Keep in Layer 2 but use transactions with character state

---

## Part 5: Detailed Recommendations

### Immediate Actions (High Priority)

#### 1. Split keypadAccessGroups (2-3 hour refactor)

**Files to Modify:**

- `bin/games/veratown/keypadAccessGroupManager.ts` - Split into two services
- `bin/games/veratown/keypadDoorSystem.ts` - Update access patterns
- Schema migrations needed

**New Files:**

- `bin/games/veratown/keypadAccessGroupDefManager.ts` - Group definitions (Layer 3)
- `bin/games/veratown/keypadGroupMembershipManager.ts` - Memberships (Layer 1)

#### 2. Refactor locationEventExecutions (1-2 hour refactor)

**Files to Modify:**

- `bin/games/veratown/locationEventSystem.ts` - Don't store affectedMembers
- Update `recordEventExecution()` to separate concerns
- Create separate audit collection if needed: `locationEventAuditLog`

**Changes:**

```typescript
// Before
const execution: LocationEventExecution = {
    affectedMembers, // ❌ Remove this
    // ...
};

// After - execute effects on character side
for (const memberNumber of affectedMembers) {
    await characterStore.applyLocationEventEffect(memberNumber, eventId);
    // Effect is recorded in character's gameEvents, not event execution
}
```

#### 3. Migrate playerRoles → unifiedCharacterProfiles (2-3 hour refactor)

**Files to Modify:**

- `bin/games/veratown/playerRoleSystem.ts` - Update to query from UnifiedCharacterStore
- `bin/shared/unifiedCharacterStore.ts` - Add `roleAssignment` field
- `bin/shared/unifiedCharacterTypes.ts` - Add RoleAssignment interface

**Migration Script Needed:**

```typescript
// Migrate existing playerRoles to unifiedCharacterProfiles
for (const role of playerRoles.find()) {
    await unifiedProfiles.updateOne(
        { memberNumber: role.memberNumber },
        { $set: { roleAssignment: { roleId, assignedAt, active } } },
    );
}
```

### Medium Priority (Next Sprint)

#### 4. Review furnitureState occupancy tracking

- Option A: Store `currentLocation` in character profile
- Option B: Use MongoDB transactions to atomically update both
- Option C: Create `furnitureOccupancy` collection as Layer 2

#### 5. Add cross-game isolation tests

- Ensure Casino, Dare, and Veratown systems don't contaminate each other
- Verify no shared collections between game systems (except UnifiedCharacterProfiles)

---

## Part 6: Testing Checklist

After implementing fixes:

- [ ] `keypadAccessGroupManager` splits compile and pass unit tests
- [ ] Membership add/remove operations don't trigger full group config writes
- [ ] Can query "all groups containing member X" efficiently
- [ ] `locationEventExecutions` no longer contains member lists
- [ ] Location event effects are properly recorded in character profiles
- [ ] `playerRoles` migration completes without data loss
- [ ] Character role queries work from unified profile
- [ ] All Veratown systems remain isolated from Casino/Dare
- [ ] No cross-game contamination in collections

---

## Part 7: Files to Review

**Primary Services (In Priority Order):**

1. [bin/games/veratown/keypadAccessGroupManager.ts](bin/games/veratown/keypadAccessGroupManager.ts) - SPLIT NEEDED
2. [bin/games/veratown/locationEventSystem.ts](bin/games/veratown/locationEventSystem.ts) - REFACTOR NEEDED
3. [bin/games/veratown/playerRoleSystem.ts](bin/games/veratown/playerRoleSystem.ts) - MIGRATE NEEDED
4. [bin/games/veratown/furnitureInteractionSystem.ts](bin/games/veratown/furnitureInteractionSystem.ts) - REVIEW NEEDED
5. [bin/games/veratown/keypadDoorSystem.ts](bin/games/veratown/keypadDoorSystem.ts) - UPDATE DEPENDENCIES

**Consumer Files:**

- [bin/games/veratown.ts](bin/games/veratown.ts) - Initialize new services
- [bin/games/veratown/adminCommands.ts](bin/games/veratown/adminCommands.ts) - May need keypad command updates
- [bin/shared/unifiedCharacterStore.ts](bin/shared/unifiedCharacterStore.ts) - Add roleAssignment field

---

## Part 8: Success Criteria

✅ When complete, codebase should have:

1. **No mixing of Layer 1 + Layer 3:** Each collection contains data from only one layer
2. **Character state isolated:** All character-specific data in `unifiedCharacterProfiles` or dedicated character collections (audit logs)
3. **Reference data pure:** Layer 3 collections are static, system-wide metadata
4. **Clear ownership:** Each service owns one type of data (reference, system, or character)
5. **Atomic updates:** Character-specific changes are atomic to that character's profile
6. **Efficient queries:** No need to load entire collections then filter in application code

---

## Appendix: Three-Layer Architecture Reference

**Layer 1 (Character State):**

- Per-character data
- Stored in `unifiedCharacterProfiles`
- Examples: current location, bondage state, role assignment, game progress
- Atomic with character updates

**Layer 2 (System State):**

- Live game state not tied to individuals
- Timestamps, event tracking, occupancy counts
- Can be separate from character state
- Examples: furniture occupancy, event executions, location state
- May need transactions with Layer 1 for consistency

**Layer 3 (Reference Data):**

- Static, system-wide definitions
- Queried but rarely modified
- Not tied to individual characters
- Examples: dare templates, location definitions, role definitions, map geometry
- Bulk-loaded at startup

---

**Report Generated:** 2026-08-31  
**Audit Type:** Architectural Compliance - Generic vs Character-Specific Data
