# Architecture Violations Checklist - Generic vs Character-Specific

**Date:** 2026-08-31  
**Status:** Identified and prioritized for remediation  
**Reference:** See `copilot-instructions.md` section "THREE-LAYER DATA ARCHITECTURE PATTERN"

---

## Summary

Following the successful refactoring of the Dare system to clean three-layer architecture (Phase 5), an audit identified **3 critical violations** and **2 medium-priority issues** where generic reference data is mixed with character-specific data or system state.

**Impact:** Each violation requires 1-3 hours to fix following the Dare system pattern as golden path.

---

## 🔴 CRITICAL VIOLATIONS (Fix ASAP)

### 1. keypadAccessGroups Collection

**File:** Likely `bin/games/veratown/keypadAccessGroupManager.ts`  
**Issue:** Door access definitions contain `memberNumbers[]` (character data in reference data)

**Current Pattern:**

```typescript
// keypadAccessGroups collection
{
    doorKey: "door_1",
    groups: {
        admin: {
            memberNumbers: [1, 2, 3],  // ❌ LAYER 1 DATA IN LAYER 3!
            permissions: ["unlock", "lock"]
        }
    }
}
```

**Problem:**

- Layer 3 (reference data) should never contain character numbers
- Character membership changes shouldn't require modifying door definitions
- Impossible to query "which characters have admin access" efficiently
- Mixed responsibilities: door definition + membership management

**Solution (Two Collections):**

```typescript
// Collection 1: keypadAccessGroups (LAYER 3 - Reference Data)
{
    _id: "group_1",
    doorKey: "door_1",
    groupName: "admin",
    permissions: ["unlock", "lock"]
    // NO memberNumbers
}

// Collection 2: keypadGroupMemberships (LAYER 1 - Character Data)
{
    _id: "membership_1",
    doorKey: "door_1",
    groupName: "admin",
    memberNumber: 1,
    grantedBy: 100,
    grantedAt: 1693478400000
}
```

**Implementation Steps:**

1. Create new `KeypadAccessService` (Layer 3) - manages access definitions
2. Add membership management to `UnifiedCharacterStore` (Layer 1)
3. Update `KeypadAccessGroupManager` to use both services
4. Migrate existing `keypadAccessGroups` data (add membership documents)
5. Update queries: `findMembersWithAccess()` now joins two collections
6. Test in isolation with mocked services

**Estimated Effort:** 2-3 hours  
**Files to Modify:**

- `bin/games/veratown/keypadAccessGroupManager.ts`
- `bin/games/unifiedCharacterStore.ts` (add methods)
- Database migration script

**Status:** ⏳ PENDING

---

### 2. locationEventExecutions Collection

**File:** Likely `bin/games/veratown/locationEventSystem.ts`  
**Issue:** Event execution records contain `affectedMembers[]` mixed with reference data

**Current Pattern:**

```typescript
// locationEventExecutions collection
{
    eventId: "event_1",
    executedAt: 1693478400000,
    affectedMembers: [1, 2, 3],  // ❌ LAYER 1 DATA
    outcome: "punishment_applied"
}
```

**Problem:**

- Audit trail of WHICH characters were affected is Layer 1 data
- Event definitions (what CAN happen) are Layer 3 data
- Mixed together makes it impossible to query character history independently
- Updates to one character's record require finding and modifying location event doc

**Solution (Separate Layers):**

```typescript
// Collection 1: locationEvents (LAYER 3 - Reference Data)
{
    _id: "event_1",
    locationId: "loc_1",
    eventType: "prisoner_escape_attempt",
    description: "Attempted to pick lock",
    potentialOutcomes: ["punishment", "release", "ignored"],
    severity: 3
}

// Collection 2: Character audit trail (LAYER 1 - In UnifiedCharacterProfile)
{
    memberNumber: 1,
    veratown: {
        eventHistory: [
            {
                eventId: "event_1",
                executedAt: 1693478400000,
                outcome: "punishment_applied",
                locationId: "loc_1"
            }
        ]
    }
}
```

**Implementation Steps:**

1. Move event execution records into `UnifiedCharacterProfile.veratown.eventHistory`
2. Create `LocationEventService` (Layer 3) for event definitions only
3. Update audit queries to use character profile, not locationEventExecutions
4. Migrate historical data to character profiles
5. Delete locationEventExecutions collection (or keep for backup, mark deprecated)

**Estimated Effort:** 1-2 hours  
**Files to Modify:**

- `bin/games/veratown/locationEventSystem.ts`
- `bin/games/unifiedCharacterStore.ts`
- Database migration script

**Status:** ⏳ PENDING

---

### 3. furnitureState Collection

**File:** Likely `bin/games/veratown/furnitureInteractionSystem.ts`  
**Issue:** Live occupancy tracking (who's in bed/cage/etc) is not atomic with character state

**Current Pattern:**

```typescript
// furnitureState collection (LAYER 2? LAYER 1? BOTH!)
{
    furnitureId: "bed_1",
    occupants: [1, 2, 3],        // ❌ LAYER 1 (character in furniture)
    equipmentApplied: ["pillow"], // LAYER 3 (furniture definition)
    lastOccupancyChange: 1693478400000
}
```

**Problem:**

- Occupancy is character-specific state (should be in profile)
- Equipment definitions are generic reference data (should be separate)
- Furniture state changes require atomic updates across BOTH collections
- Race condition: character might disconnect between occupancy update and profile save

**Solution (Atomic with Character State):**

```typescript
// Character Profile (LAYER 1)
{
    memberNumber: 1,
    veratown: {
        currentFurniture: {
            furnitureId: "bed_1",
            occupiedAt: 1693478400000
        }
    }
}

// Collection: furnitureDefinitions (LAYER 3 - Reference Data)
{
    _id: "bed_1",
    name: "Comfortable Bed",
    category: "sleeping",
    equipment: ["pillow", "blanket"],
    capacity: 2
}

// Collection: furnitureState (LAYER 2 - System State, sparse)
{
    furnitureId: "bed_1",
    capacity: 2,
    occupancyCount: 1,
    lastOccupancyChange: 1693478400000
}
```

**Implementation Steps:**

1. Move occupancy info to `UnifiedCharacterProfile.veratown.currentFurniture`
2. Create `FurnitureDefinitionService` for equipment/capacity (Layer 3)
3. Keep minimal `furnitureState` for efficiency counters (Layer 2)
4. Update character entry/exit to update profile atomically
5. Migrate existing occupancy data to character profiles
6. Update queries: "who's in bed?" → search profiles, not furnitureState

**Estimated Effort:** 2-3 hours  
**Files to Modify:**

- `bin/games/veratown/furnitureInteractionSystem.ts`
- `bin/games/unifiedCharacterStore.ts`
- Database migration script

**Status:** ⏳ PENDING

---

## 🟡 MEDIUM PRIORITY ISSUES

### 4. playerRoles Assignment

**File:** Likely `bin/games/veratown/playerRoleSystem.ts`  
**Issue:** Role assignments for characters should embed in `UnifiedCharacterProfile`, not separate collection

**Current Pattern:**

```typescript
// playerRoles collection (separate)
{
    _id: "role_1",
    memberNumber: 1,
    roleName: "Warden",
    grantedAt: 1693478400000
}

// Character Profile (missing role info)
{
    memberNumber: 1,
    characterName: "Alice",
    veratown: { /* no role */ }
}
```

**Problem:**

- Character role is character-specific state (should be Layer 1)
- Creates need for joins on every character query
- Role changes not atomic with character state
- Redundant - duplicates data that belongs in one place

**Correct Pattern:**

```typescript
// Character Profile (LAYER 1)
{
    memberNumber: 1,
    characterName: "Alice",
    veratown: {
        role: {
            name: "Warden",
            grantedAt: 1693478400000,
            grantedBy: 100
        }
    }
}

// roleDefinitions collection (LAYER 3 - Reference Data)
{
    _id: "role_warden",
    name: "Warden",
    description: "Prison authority",
    permissions: ["lock", "unlock", "confine"],
    hierarchy: 1
}
```

**Implementation Steps:**

1. Add `veratown.role` field to `UnifiedCharacterProfile`
2. Create `RoleDefinitionService` for role metadata (Layer 3)
3. Migrate role assignments from playerRoles to profiles
4. Update role assignment logic in `PlayerRoleSystem`
5. Delete playerRoles collection or keep for backup

**Estimated Effort:** 2-3 hours  
**Files to Modify:**

- `bin/games/veratown/playerRoleSystem.ts`
- `bin/games/unifiedCharacterStore.ts`
- Database migration script

**Status:** ⏳ PENDING

---

### 5. appearanceAuditLog

**Status:** ✓ **ACCEPTABLE** - Correctly follows Layer 1 pattern

**Reasoning:**

- Audit records are character-specific (who changed appearance and when)
- Should be embedded in character profile OR in separate collection keyed by memberNumber
- Current implementation appears to isolate per-character correctly
- **No changes needed**

---

## Implementation Roadmap

### Priority Order (Dependencies First)

**Phase A: Reference Data (Layer 3) - ~3 hours**

1. Create `LocationEventService`
2. Create `FurnitureDefinitionService`
3. Create `RoleDefinitionService`
4. Update/create `KeypadAccessService`

**Phase B: Character State (Layer 1) - ~4 hours**

1. Add `eventHistory`, `currentFurniture`, `role` to UnifiedCharacterProfile
2. Add membership management methods
3. Migrate audit trail logic

**Phase C: System State (Layer 2) - ~2 hours**

1. Simplify `furnitureState` to efficiency counters only
2. Update game state services

**Phase D: Integration & Testing - ~3 hours**

1. Update all query paths
2. Create migration scripts
3. Run full test suite
4. Update documentation

**Total Estimated Effort:** 12-16 hours (~2 development sprints)

---

## Success Criteria

✅ All violations fixed when:

1. No memberNumbers appear in collections that define generic data
2. Character-specific data is embedded in `UnifiedCharacterProfile` or keyed by memberNumber
3. Each service manages only ONE layer (no crossing boundaries)
4. All 483+ tests pass
5. Code review checklist passes (see copilot-instructions.md)
6. Documentation updated with new architecture

---

## Reference: Dare System Successful Fix

The Dare system refactoring (Phase 5, 2026-08-31) followed this exact pattern and serves as the golden path:

**Time:** ~4 hours of focused work  
**Outcome:** Separated 3-in-1 DareStore into three clean services  
**Testing:** All 483 tests passing  
**Compilation:** Zero TypeScript errors

This checklist applies the same proven pattern to remaining violations.

---

## How to Report Violations

When you find a new potential violation:

1. **Ask:** "Does this data contain memberNumbers/characterNames?"
2. **Check:** Is it in a collection meant for reference data?
3. **If YES:** Open issue with pattern from this checklist
4. **Add to:** This violation list with file location and description
5. **Template:** Use the sections above as documentation template

---

**Last Updated:** 2026-08-31  
**Owner:** Architecture Review  
**Related:** `copilot-instructions.md`, `DATABASE_ARCHITECTURE_ANALYSIS.md`, `PLUGGABLE_ARCHITECTURE_PATTERN.md`
