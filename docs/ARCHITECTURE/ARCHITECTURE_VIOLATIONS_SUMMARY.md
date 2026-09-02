# Architectural Violations Summary - Quick Reference

## Critical Issues (Require Immediate Fix)

### 1. keypadAccessGroups - MIXED Reference + Character Data

- **Location:** [bin/games/veratown/keypadAccessGroupManager.ts](bin/games/veratown/keypadAccessGroupManager.ts)
- **Problem:** Door group definitions (Layer 3) mixed with memberNumbers (Layer 1)
- **Symptom:** Every member add/remove requires full document write
- **Fix:** Split into two collections
    - `keypadAccessGroups` → group definitions only
    - `keypadGroupMemberships` → memberNumber → groupName mappings
- **Impact:** Performance, atomic operations, auditability
- **Effort:** 2-3 hours

---

### 2. locationEventExecutions - Contains Character Data

- **Location:** [bin/games/veratown/locationEventSystem.ts](bin/games/veratown/locationEventSystem.ts#L44-L58)
- **Problem:** Execution records contain `affectedMembers: number[]` array
- **Symptom:** Can't separate event audit from character-specific effects
- **Fix:** Remove affectedMembers from execution record, store effects in character profiles
- **Impact:** Data architecture clarity, query efficiency
- **Effort:** 1-2 hours

---

### 3. furnitureState - Live Occupancy in Furniture Documents

- **Location:** [bin/games/veratown/furnitureInteractionSystem.ts](bin/games/veratown/furnitureInteractionSystem.ts#L35-L42)
- **Problem:** Furniture documents track active occupants (race conditions possible)
- **Symptom:** Not atomic with character state, two players could sit simultaneously
- **Fix:** Query occupancy from character `currentLocation` OR use transactions
- **Impact:** Consistency, concurrency, character state atomicity
- **Effort:** 2-3 hours

---

## Medium-Priority Issues

### 4. playerRoles - Should Be in UnifiedCharacterProfiles

- **Location:** [bin/games/veratown/playerRoleSystem.ts](bin/games/veratown/playerRoleSystem.ts#L142-L242)
- **Problem:** Character's role assignment is separate collection
- **Fix:** Migrate to `unifiedCharacterProfiles.roleAssignment` field
- **Impact:** Character state consistency
- **Effort:** 2-3 hours (includes migration script)

---

### 5. appearanceAuditLog - External Audit Trail (Acceptable)

- **Location:** [bin/games/veratown/appearanceAuditTrail.ts](bin/games/veratown/appearanceAuditTrail.ts)
- **Status:** Correctly separated (audit data), but confirm this is intentional
- **Assessment:** ✓ ACCEPTABLE (audit trails often stored separately)
- **Action:** Document as intentional design choice

---

## Architectural Violation Matrix

| #   | Collection                  | Service                    | Violation          | Severity      | Layer Issue              | Fix Type                         |
| --- | --------------------------- | -------------------------- | ------------------ | ------------- | ------------------------ | -------------------------------- |
| 1   | `keypadAccessGroups`        | KeypadAccessGroupManager   | Mixed ref + char   | 🔴 HIGH       | L3 + L1                  | Split collection                 |
| 2   | `locationEventExecutions`   | LocationEventSystem        | Contains char data | 🔴 HIGH       | L2 + L1                  | Remove affectedMembers           |
| 3   | `furnitureInteractionState` | FurnitureInteractionSystem | Occupancy tracking | 🔴 HIGH       | L3 + L2                  | Use char location OR transaction |
| 4   | `playerRoles`               | PlayerRoleSystem           | Wrong layer        | 🟠 MEDIUM     | L1 not in UnifiedProfile | Migrate to profile               |
| 5   | `roleDefinitions`           | PlayerRoleSystem           | Pure reference     | ✅ CORRECT    | L3 only                  | None                             |
| 6   | `locationEvents`            | LocationEventSystem        | Pure reference     | ✅ CORRECT    | L3 only                  | None                             |
| 7   | `veratownLocations`         | VeratownLocationStore      | Pure reference     | ✅ CORRECT    | L3 only                  | None                             |
| 8   | `veratownMap`               | VeratownMapStore           | Pure reference     | ✅ CORRECT    | L3 only                  | None                             |
| 9   | `appearanceAuditLogs`       | AppearanceAuditTrail       | Character audit    | 🟡 ACCEPTABLE | L1 audit (external)      | Document design                  |

---

## Comparison to Dare System Pattern

**Dare system was fixed by separating:**

- `dares` (templates) ← pure reference
- `dareParticipants` (who's in dare) ← character state
- `unifiedCharacterProfiles.dareProgress` (player's progress) ← character atomic state

**Same pattern needed for:**

### keypadAccessGroups

- ✅ Before: `keypadAccessGroups` = { doorKey, groups[].memberNumbers }
- ✅ After:
    - `keypadAccessGroups` = group configs
    - `keypadGroupMemberships` = member assignments

### locationEventExecutions

- ✅ Before: `locationEventExecutions` = { eventId, affectedMembers[], ... }
- ✅ After:
    - `locationEventExecutions` = { eventId, narrationSent, ... } (NO members)
    - Effects recorded in character profiles

### furnitureState

- ✅ Before: `furnitureState` = { furnitureKey, occupants[], ... }
- ✅ After (Option A):
    - Query from `unifiedCharacterProfiles` where `currentLocation: "bed_001"`
    - Or (Option B): use transactions with character updates

---

## Implementation Priority

### Week 1 (Sprint)

1. Fix `keypadAccessGroups` split (2-3h)
2. Fix `locationEventExecutions` refactor (1-2h)
3. Code review & testing (2-3h)

### Week 2 (Sprint)

4. Migrate `playerRoles` to unified profile (2-3h)
5. Refactor `furnitureState` (2-3h, depends on pattern choice)
6. Integration testing (2-3h)

### Ongoing

7. Add architectural compliance tests
8. Document three-layer pattern in DEVELOPER_GUIDE

---

## Files to Modify

| Priority | File                          | Action                   | Reason              |
| -------- | ----------------------------- | ------------------------ | ------------------- |
| 1️⃣       | keypadAccessGroupManager.ts   | Split into 2 services    | VIOLATION #1        |
| 1️⃣       | keypadDoorSystem.ts           | Update API calls         | Dependency of above |
| 1️⃣       | locationEventSystem.ts        | Remove affectedMembers   | VIOLATION #2        |
| 2️⃣       | playerRoleSystem.ts           | Query from UnifiedStore  | VIOLATION #4        |
| 2️⃣       | unifiedCharacterStore.ts      | Add roleAssignment field | Required for above  |
| 2️⃣       | furnitureInteractionSystem.ts | Refactor occupancy       | VIOLATION #3        |
| 3️⃣       | veratown.ts                   | Initialize new services  | Consumer of all     |
| 3️⃣       | adminCommands.ts              | Update keypad commands   | Dependency          |

---

## Success Metrics

- ✅ Zero collections mixing Layer 1 + Layer 3 data
- ✅ All character state in `unifiedCharacterProfiles`
- ✅ All reference data pure and static
- ✅ No cross-game contamination
- ✅ Unit tests passing for each service
- ✅ Integration tests passing
- ✅ No race conditions in concurrent access

---

**Total Estimated Effort:** 12-16 hours (2 sprints)  
**Risk Level:** MEDIUM (refactoring, but clear pattern from Dare system)  
**Breaking Changes:** Internal API changes to KeypadAccessGroupManager, LocationEventSystem
