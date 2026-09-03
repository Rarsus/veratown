# Keypad/Door Access System Refactoring Blueprint

**Date:** 2026-08-31  
**Status:** Design Phase (Ready for Implementation)  
**Duration:** Estimated 10-14 days (1 developer) or 6-8 days (2 developers)  
**Complexity:** High (critical system, distributed state)

See **[Implementation Timeline & Effort Breakdown](#implementation-timeline--effort-breakdown)** section below for detailed estimates.

---

## Executive Summary

The current keypad/door system stores access configuration in **two separate places:**

- **Locations collection:** Door tiles, unlock duration, coordinates, built-in group codes, whitelist
- **keypadAccessGroups collection:** Custom groups and their member lists

This violates three-layer architecture: character membership (Layer 1) is stored in a generic collection (Layer 3).

**This refactoring will:**

1. Unify keypad definitions into dedicated collections (Layer 3)
2. Move character membership to UnifiedCharacterProfile (Layer 1)
3. Support multiple keypads per door
4. Maintain all existing functionality (codes, admin override, whitelist, custom groups)
   **This refactoring will:**
5. Unify keypad definitions into dedicated collections (Layer 3)
6. Move character membership to UnifiedCharacterProfile (Layer 1)
7. Support multiple keypads per door
8. Maintain all existing functionality (codes, admin override, whitelist, custom groups)
9. Improve query performance and atomicity

---

## Implementation Timeline & Effort Breakdown

### Quick Summary

| Scenario             | Duration   | Notes                                         |
| -------------------- | ---------- | --------------------------------------------- |
| **1 Developer**      | 10-14 days | Full-time, includes all phases + buffer       |
| **2 Developers**     | 6-8 days   | Parallel work on services + commands          |
| **Experienced Team** | 5-7 days   | Previous refactoring experience (Dare system) |
| **Including Buffer** | 12-16 days | Add 20-30% for unknowns, testing refinements  |

### Detailed Breakdown by Phase

#### Day 1: Preparation (All Scenarios)

**Effort:** 1 day (sequential, not parallelizable)

- [ ] Code review of current system (2-3 hrs)
    - Read KeypadDoorSystem (1244 lines)
    - Read KeypadAccessGroupManager (385 lines)
    - Review location integration (veratownLocationStore, locationTemplates)
    - **Estimated:** 2-3 hours

- [ ] Design review with team (1-2 hrs)
    - Walk through blueprint sections with implementation team
    - Clarify location integration approach
    - Identify potential blockers
    - **Estimated:** 1-2 hours

- [ ] Setup infrastructure (1-2 hrs)
    - Create MongoDB collection schemas with validators
    - Create index definitions
    - Setup test fixtures and mock data
    - Create migration script stubs
    - **Estimated:** 1-2 hours

- [ ] Database preparation (1 hr)
    - Backup existing collections
    - Create staging database for testing
    - Prepare rollback procedures
    - **Estimated:** 1 hour

**Subtotal Day 1:** 5-8 hours

---

#### Days 2-3: Service Implementation (Parallelizable)

**Effort:** 4-5 days total work, 2-3 days if 2 developers in parallel

##### Developer A: Layer 1 & Layer 2 Services (2-3 days)

- [ ] Extend UnifiedCharacterTypes with keypadAccess interface (1-2 hrs)
    - Add KeypadAccessRecord type
    - Update UnifiedCharacterProfile interface
    - Add MongoDB validators
    - Create test fixtures
    - **Estimated:** 1-2 hours

- [ ] Extend UnifiedCharacterStore with keypad methods (3-4 hrs)
    - Implement addKeypadAccess()
    - Implement removeKeypadAccess()
    - Implement getKeypadAccess()
    - Implement hasKeypadAccess()
    - Write unit tests (4-6 tests)
    - **Estimated:** 3-4 hours

- [ ] Create KeypadAccessService (Layer 2) (4-5 hrs)
    - Implement grantAccess() method
    - Implement revokeAccess() method
    - Implement canAccessDoor() method
    - Implement getMembersWithAccess() method
    - Handle admin override logic
    - Write unit tests (6-8 tests)
    - **Estimated:** 4-5 hours

**Subtotal Developer A:** 8-11 hours = 1-1.5 days

##### Developer B: Layer 3 & Command System (2-3 days)

- [ ] Create KeypadDefinitionService (Layer 3) (3-4 hrs)
    - Implement getDoorDefinition()
    - Implement getAllDoorDefinitions()
    - Implement createDoor(), updateDoor(), deleteDoor()
    - Implement getGroupsForDoor()
    - Implement verifyCode()
    - Write unit tests (5-7 tests)
    - **Estimated:** 3-4 hours

- [ ] Create KeypadCommandHandler base class (2-3 hrs)
    - Implement execute() framework
    - Implement permission checking
    - Implement validation framework
    - Implement error response formatting
    - Write base class tests (3-4 tests)
    - **Estimated:** 2-3 hours

- [ ] Implement 12 command handlers (6-8 hrs)
    - GrantAccessCommand (15-20 min)
    - RevokeAccessCommand (15-20 min)
    - ListAccessCommand (15-20 min)
    - CreateGroupCommand (15-20 min)
    - DeleteGroupCommand (15-20 min)
    - ListGroupsCommand (15-20 min)
    - SetCodeCommand (15-20 min)
    - LockDoorCommand (15-20 min)
    - UnlockDoorCommand (15-20 min)
    - EnableDoorCommand (15-20 min)
    - DisableDoorCommand (15-20 min)
    - HelpCommand (20-30 min)
    - Write command handler tests (12 tests × 30-45 min each = 6-9 hrs)
    - **Estimated:** 6-8 hours

**Subtotal Developer B:** 11-15 hours = 1.5-2 days

**Parallel Completion:** Max(1-1.5 days, 1.5-2 days) = **1.5-2 days with 2 developers**

---

#### Day 3-4: KeypadDoorSystem Refactoring & Location Integration (Can be parallel)

**Effort:** 2-3 days

- [ ] Add backward compatibility layer (1-2 hrs)
    - Create readOldLocationConfig()
    - Handle both old (embedded) and new (doorKey reference) formats
    - Test auto\_ door creation
    - **Estimated:** 1-2 hours

- [ ] Update KeypadDoorSystem to use new services (3-4 hrs)
    - Refactor onLocationsReloaded() to fetch door definitions
    - Update tile trigger registration
    - Remove old config parsing logic
    - Update access checking to use KeypadAccessService
    - Remove duplication (currently 1244 lines → target ~400 lines)
    - Write integration tests (4-6 tests)
    - **Estimated:** 3-4 hours

- [ ] Integrate KeypadCommandDispatcher (2-3 hrs)
    - Create KeypadCommandDispatcher class
    - Register all 12 command handlers
    - Integrate with existing admin command system
    - Write dispatcher tests (3-4 tests)
    - **Estimated:** 2-3 hours

- [ ] Location integration validation (1-2 hrs)
    - Implement findOrphanedKeypads()
    - Implement disableAllKeypadsForDoor()
    - Hook to location change events
    - Test location→door linking
    - **Estimated:** 1-2 hours

**Subtotal Days 3-4:** 7-11 hours = 1-1.5 days

---

#### Day 4-5: Data Migration (Sequential, careful execution)

**Effort:** 2-3 days

##### Phase 1-3: Door & Group Definition Migration (1-1.5 days)

- [ ] Extract existing door configs from locations (1-2 hrs)
    - Query all keypad_door locations
    - Parse location.data for door config
    - Create keypadDoorDefinitions documents
    - Test migration scripts
    - **Estimated:** 1-2 hours

- [ ] Create keypadDoorDefinitions collection (30 min)
    - Insert all extracted door definitions
    - Create indexes (doorKey, location, etc.)
    - Validate all inserted
    - **Estimated:** 30 minutes

- [ ] Create keypadGroupDefinitions collection (30 min)
    - Extract codes from locations
    - Extract codes from keypadAccessGroups
    - Create keypadGroupDefinitions documents
    - Insert and create indexes
    - **Estimated:** 30 minutes

- [ ] Update keypad_door locations to use doorKey (1 hr)
    - Add data.doorKey to each location
    - Validate backward compatibility
    - Test with both old and new formats
    - **Estimated:** 1 hour

**Subtotal Phase 1-3:** 3-4 hours

##### Phase 4-5: Character Data Migration (1-1.5 days)

- [ ] Migrate whitelist members to character profiles (1-2 hrs)
    - Query all locations with whitelistMemberNumbers
    - For each member, addKeypadAccess(doorKey, "whitelist")
    - Verify counts match before/after
    - Create rollback script
    - **Estimated:** 1-2 hours

- [ ] Migrate custom groups to character profiles (1-2 hrs)
    - Query keypadAccessGroups collection
    - For each group membership, addKeypadAccess(doorKey, groupName)
    - Verify counts match
    - Create rollback script
    - **Estimated:** 1-2 hours

- [ ] Build optional membership index (30 min)
    - Create keypadGroupMemberships collection
    - Sync from character profiles
    - Create indexes for performance
    - **Estimated:** 30 minutes

**Subtotal Phase 4-5:** 2.5-4 hours

##### Validation & Backup (1-2 hrs)

- [ ] Data integrity validation
    - Before/after count comparisons
    - Sample verification of migrated data
    - Cross-collection consistency checks
    - **Estimated:** 1-2 hours

- [ ] Backup & safety checks
    - Backup both old and new collections
    - Test rollback procedures
    - Document migration results
    - **Estimated:** 30 minutes

**Subtotal Validation:** 1.5-2.5 hours

**Subtotal Days 4-5:** 7-10.5 hours = **1-1.5 days sequential**

---

#### Day 5-6: Comprehensive Testing (Sequential, can't parallelize effectively)

**Effort:** 2-3 days

- [ ] Unit test additions (4-6 hrs)
    - KeypadDefinitionService: 6-8 tests
    - KeypadAccessService: 8-10 tests
    - Individual command handlers: 12 × 3-4 tests = 36-48 tests
    - KeypadDoorSystem integration: 5-6 tests
    - Location integration: 5-6 tests
    - **Estimated:** 4-6 hours

- [ ] Integration test suite (3-4 hrs)
    - End-to-end command workflows: 4-5 tests
    - Location change event handling: 3-4 tests
    - Access grant/revoke consistency: 3-4 tests
    - Admin override scenarios: 3-4 tests
    - Migration validation: 2-3 tests
    - **Estimated:** 3-4 hours

- [ ] Manual testing checklist (4-5 hrs)
    - Keypad code entry (all access levels)
    - Admin unlock/lock operations
    - Auto-open tile functionality
    - Inside region protection
    - Multiple keypads per door
    - Location enable/disable
    - Door enable/disable
    - Admin command testing (all 12 commands)
    - **Estimated:** 4-5 hours

- [ ] Staging deployment & validation (2-3 hrs)
    - Deploy to staging database
    - Run full test suite (483+ tests must pass)
    - Manual testing on live-like environment
    - Verify no regressions
    - **Estimated:** 2-3 hours

- [ ] Rollback testing (1-2 hrs)
    - Test rollback procedures
    - Verify data recovery
    - Document rollback steps
    - **Estimated:** 1-2 hours

**Subtotal Days 5-6:** 14-19 hours = **2-2.5 days**

---

#### Day 6-7: Documentation & Deployment (Sequential)

**Effort:** 1-2 days

- [ ] Update code documentation (1-2 hrs)
    - Add JSDoc to all service methods
    - Document command handler patterns
    - Add examples to services
    - Document migration approach for future reference
    - **Estimated:** 1-2 hours

- [ ] Admin guide for new commands (1-2 hrs)
    - Create command reference document
    - Migration guide (old → new commands)
    - Common scenarios with command examples
    - Troubleshooting section
    - **Estimated:** 1-2 hours

- [ ] Production deployment (1-2 hrs)
    - Final code review
    - Deploy to production
    - Run health checks
    - Monitor for errors
    - Prepare to roll back if needed
    - **Estimated:** 1-2 hours

- [ ] Post-deployment cleanup (1 hr)
    - Remove old command implementations
    - Archive old collections
    - Clean up backward compatibility layer (after 1-2 weeks)
    - Update internal documentation
    - **Estimated:** 1 hour

**Subtotal Days 6-7:** 4-7 hours = **0.5-1 day**

---

### Timeline Summary

#### Single Developer

```
Day 1:  Preparation          (5-8 hrs, full day)
Day 2:  Services Part A      (8-11 hrs, 1+ day)
Day 3:  Services Part B      (11-15 hrs, 1.5+ day)
Day 4:  Refactor + Commands  (7-11 hrs, 1+ day)
Day 5:  Migration Phase      (7-10.5 hrs, 1+ day)
Day 6:  Testing              (14-19 hrs, 2+ days)
Day 7:  Testing (cont.)      (overflow from Day 6)
Day 8:  Deployment & Docs    (4-7 hrs, 0.5-1 day)

Total: 10-14 days (with buffers for debugging)
```

#### Two Developers (Parallel)

```
Day 1:  Preparation              (5-8 hrs, both)
Days 2-3:
  - Dev A: Services Layer 1/2    (8-11 hrs = 1-1.5 days)
  - Dev B: Services Layer 3/Cmds (11-15 hrs = 1.5-2 days)
  - Run in parallel             → 1.5-2 days total

Day 3-4: Refactor + Integration (7-11 hrs, can split)
Day 5:   Migration               (7-10.5 hrs, both)
Day 6-7: Testing                 (14-19 hrs, both)
Day 7:   Deployment & Docs       (4-7 hrs, Dev A)

Total: 6-8 days (with parallel work)
```

---

### Risk Factors & Buffer

**Factors that could extend timeline:**

1. **Test failures during migration:** +1-2 days
    - Unexpected data inconsistencies
    - Edge cases in character access logic
    - Region/location edge cases

2. **Unforeseen location integration issues:** +1-2 days
    - Tight coupling with other systems
    - Event handling edge cases
    - Backward compatibility gaps

3. **Command handler refinements:** +0.5-1 day
    - Admin feedback on command interface
    - Error message improvements
    - Permission model tweaks

4. **Performance issues on prod data:** +0.5-1.5 days
    - Query performance under load
    - Index tuning
    - Caching strategy adjustments

5. **Rollback scenarios:** +1 day
    - Testing all rollback paths
    - Data recovery procedures
    - Communication protocols

**Recommended buffer:** Add **20-30%** to estimate

- Single dev: 12-18 days total
- Two devs: 7.5-10 days total

---

### Dependencies & Prerequisites

✅ **Must Complete Before Starting:**

- Blueprint document (DONE - this file)
- Location integration design (DONE)
- Command architecture design (DONE)
- MongoDB migration scripts outline (DONE)
- Test environment setup (partially - need schema preparation)

⚠️ **Should Have Available:**

- 2 developers (or 1 very senior dev)
- Access to production database for backup
- Staging environment matching production
- Ability to pause new features during migration

📋 **Nice to Have:**

- Previous Dare system refactoring experience (3-layer pattern knowledge)
- MongoDB admin access
- Performance monitoring tools
- Alert/monitoring setup for post-deployment

---

### Team Composition Recommendations

**Option 1: Two Full-Stack Developers (Recommended)**

- **Timeline:** 6-8 days
- **Cost:** 2 devs × 8 days
- **Parallelization:** Services development can be split efficiently
- **Risk Mitigation:** Two pairs of eyes on critical paths

**Option 2: One Senior Developer + One Mid-Level Developer**

- **Timeline:** 8-10 days
- **Cost:** Junior gets ramp-up time, senior owns critical paths
- **Knowledge Transfer:** Good for team learning
- **Risk:** Slightly slower than two full-stack devs

**Option 3: One Experienced Developer (Solo)**

- **Timeline:** 12-16 days
- **Cost:** 1 dev × 14 days average
- **Risk:** Single point of failure, no parallel work possible
- **Advantage:** Deep understanding, clear decision-making

---

### Critical Path Analysis

**The critical path (no parallel work possible):**

1. **Preparation (1 day)** - Must happen first
2. **Service Implementation (1.5-2 days)** - Can parallelize
3. **KeypadDoorSystem Refactor (1 day)** - Depends on services
4. **Migration (1-1.5 days)** - Depends on new collections
5. **Testing (2-2.5 days)** - Depends on migration
6. **Deployment (0.5-1 day)** - Final step

**Minimum sequential path:** 7.5-9 days
**With 2 devs doing services in parallel:** 6-8 days
**With buffers (20-30%):** 7.5-10 days (2 devs) or 12-18 days (1 dev)

---

## Current State Analysis

### Data Distribution Problem

```
CURRENT (❌ WRONG):
┌─────────────────────────────────────────┐
│ locations[keypadLocationKey]            │  Layer 3 (Generic)
├─────────────────────────────────────────┤
│ - doorX, doorY                          │
│ - lockedTile, unlockedTile              │
│ - unlockDurationMs                      │
│ - codes: { admin, whitelist, guest }    │
│ - whitelistMemberNumbers: [1,2,3]  ❌   │  ← Character data!
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ keypadAccessGroups[doorLocationKey]    │  Layer 3 (Generic)
├─────────────────────────────────────────┤
│ - groups:                               │
│   - admin: { code, memberNumbers: [] }  │  ❌ Character data!
│   - whitelist: { code, memberNumbers: [] }
│   - guest: { code, memberNumbers: [] }  │
│   - custom: { code, memberNumbers: [] } │  ❌ Character data!
└─────────────────────────────────────────┘

🚫 Result: Character data scattered across Layer 3
🚫 Result: Queries require scanning multiple collections
🚫 Result: Updates to character access not atomic with profile
```

### Current Functionality Map

| Feature                                   | Current Implementation                                          | Storage                        |
| ----------------------------------------- | --------------------------------------------------------------- | ------------------------------ |
| Door definition (tiles, coordinates)      | In locations[key].data                                          | locations                      |
| Built-in groups (admin, whitelist, guest) | In locations[key].data.codes                                    | locations                      |
| Whitelist members                         | whitelistMemberNumbers array in locations                       | locations                      |
| Unlock duration                           | unlockDurationMs in locations                                   | locations                      |
| Custom groups                             | Created dynamically via KeypadAccessGroupManager                | keypadAccessGroups             |
| Custom group members                      | memberNumbers array in custom groups                            | keypadAccessGroups             |
| Door access check                         | Read codes + check whitelistMemberNumbers + check custom groups | locations + keypadAccessGroups |
| Admin override (lock/unlock)              | Manual command via !door unlock                                 | In-memory timer                |
| Auto-open tiles                           | autoOpenTile X/Y in locations                                   | locations                      |
| Inside region protection                  | insideRegion coordinates in locations                           | locations                      |

---

## Proposed Architecture

### Three-Layer Separation

```
PROPOSED (✅ CORRECT):

Layer 3: Generic Definitions (Read-Heavy, Reference Data)
┌─────────────────────────────────────────┐
│ keypadDoorDefinitions                   │
├─────────────────────────────────────────┤
│ {                                       │
│   _id: "door_prison_1",                │
│   doorKey: "prison_door_cell_1",       │
│   location: { x: 20, y: 10 },          │
│   tile: { locked: "MetalDown",         │
│            unlocked: "SteelDoorOpen" }, │
│   unlockDurationMs: 10000,             │
│   insideRegion: { ... },               │
│   autoOpenTile: { X: 25, Y: 15 }       │
│ }                                       │
└─────────────────────────────────────────┘

Layer 3: Generic Definitions
┌─────────────────────────────────────────┐
│ keypadGroupDefinitions                  │
├─────────────────────────────────────────┤
│ {                                       │
│   _id: "group_def_admin",              │
│   doorKey: "prison_door_cell_1",       │
│   groupName: "admin",                  │
│   groupType: "builtin",                │
│   code: "",                            │
│   description: "Full door control",    │
│   permissions: ["unlock", "lock",      │
│                 "override"]            │
│ }                                       │
│ {                                       │
│   groupName: "maintenance",            │
│   groupType: "custom",                 │
│   code: "maint1234",                   │
│   description: "Daily maintenance",    │
│ }                                       │
└─────────────────────────────────────────┘

Layer 1: Character-Specific (Profile Embedded)
┌─────────────────────────────────────────┐
│ UnifiedCharacterProfile                 │
│ { memberNumber: 1,                      │
│   veratown: {                           │
│     keypadAccess: [                     │
│       {                                 │
│         doorKey: "prison_door_cell_1", │
│         groupName: "admin",            │
│         grantedAt: 1693478400000,      │
│         grantedBy: 100,                │
│         expiresAt: null                │
│       },                               │
│       {                                 │
│         doorKey: "prison_door_cell_1", │
│         groupName: "maintenance",      │
│         grantedAt: 1693478400000,      │
│         grantedBy: 100                 │
│       }                                 │
│     ]                                   │
│   }                                     │
│ }                                       │
└─────────────────────────────────────────┘

Layer 1: Indexed Membership (Optional, for admin queries)
┌─────────────────────────────────────────┐
│ keypadGroupMemberships (indexed)        │
├─────────────────────────────────────────┤
│ {                                       │
│   doorKey: "prison_door_cell_1",       │
│   groupName: "admin",                  │
│   memberNumber: 1,                     │
│   grantedAt: 1693478400000,            │
│   grantedBy: 100                       │
│ }                                       │
└─────────────────────────────────────────┘
```

---

## MongoDB Collections Schema

### Layer 3: keypadDoorDefinitions

**Purpose:** Store door physical configuration and behavior  
**Collection:** `keypadDoorDefinitions`  
**Access Pattern:** Bulk load at startup, read-only

```typescript
export interface KeypadDoorDefinitionDoc {
    _id: string;

    // Identity
    doorKey: string; // Unique identifier: "prison_door_cell_1"
    doorName?: string; // Display name: "Prison Cell Door"
    locationKey?: string; // Reference to locations collection if needed

    // Door Location & Display
    location: {
        x: number; // Tile X coordinate
        y: number; // Tile Y coordinate
    };

    tile: {
        locked: string; // Tile name when locked: "MetalDown"
        unlocked: string; // Tile name when unlocked: "SteelDoorOpen"
    };

    // Unlock Configuration
    unlockDurationMs: number; // How long door stays unlocked: 10000

    // Inside Region (blocks re-locking while occupied)
    insideRegion?: {
        topLeft: { x: number; y: number };
        bottomRight: { x: number; y: number };
    };

    // Auto-open Tile (triggers unlock when character enters)
    autoOpenTile?: {
        x: number;
        y: number;
    };

    // Metadata
    enabled: boolean; // Can be disabled/enabled by admins
    createdAt: number;
    updatedAt: number;
}
```

**Indexes:**

```typescript
db.collection("keypadDoorDefinitions").createIndex({ doorKey: 1 });
db.collection("keypadDoorDefinitions").createIndex({
    "location.x": 1,
    "location.y": 1,
});
db.collection("keypadDoorDefinitions").createIndex({ enabled: 1 });
```

### Layer 3: keypadGroupDefinitions

**Purpose:** Store group definitions, codes, and permissions  
**Collection:** `keypadGroupDefinitions`  
**Access Pattern:** Loaded with doors, read-heavy, occasional writes (code changes)

```typescript
export interface KeypadGroupDefinitionDoc {
    _id: string;

    // Identity
    doorKey: string; // Which door this group applies to
    groupName: string; // "admin", "whitelist", "guest", "maintenance", etc.
    groupType: "builtin" | "custom";

    // Access Code
    code: string; // Access code (empty string for override-only groups)

    // Metadata
    description?: string; // "Full control", "Daily maintenance"
    hierarchy?: number; // Admin=1, Whitelist=2, Guest=3, Custom=10+

    // Permissions (which actions this group can perform)
    permissions: string[]; // ["unlock", "lock", "override", "change-code"]

    // Audit
    createdAt: number;
    updatedAt: number;
    createdBy?: number; // Member number if admin-created
}
```

**Indexes:**

```typescript
db.collection("keypadGroupDefinitions").createIndex({ doorKey: 1 });
db.collection("keypadGroupDefinitions").createIndex(
    { doorKey: 1, groupName: 1 },
    { unique: true },
);
db.collection("keypadGroupDefinitions").createIndex({ groupType: 1 });
```

### Layer 1: Character Profile Extension

**Purpose:** Store which doors/groups each character has access to  
**Location:** Embed in `UnifiedCharacterProfile.veratown`  
**Access Pattern:** Single character lookup, atomic with profile updates

```typescript
// In UnifiedCharacterProfile:
{
    memberNumber: 1,
    veratown: {
        // ... existing fields ...

        keypadAccess: [
            {
                doorKey: string;          // "prison_door_cell_1"
                groupName: string;        // "admin", "maintenance"
                grantedAt: number;        // Timestamp
                grantedBy: number;        // Which admin granted this
                expiresAt?: number;       // Optional expiration timestamp
            }
        ]
    }
}
```

### Layer 1: keypadGroupMemberships (Optional, for Admin UI)

**Purpose:** Indexed collection for fast "who has access to door X?" queries  
**Collection:** `keypadGroupMemberships`  
**Access Pattern:** Admin UI queries, read-heavy

```typescript
export interface KeypadGroupMembershipDoc {
    _id: string;

    // Identity
    doorKey: string;
    groupName: string;
    memberNumber: number;

    // Tracking
    grantedAt: number;
    grantedBy: number; // Which admin granted this access
    grantedReason?: string; // "Role assignment", "Custom grant", etc.
    expiresAt?: number; // Optional expiration

    // Sync marker
    syncedFromProfile: boolean; // Was this synced from character profile
}
```

**Indexes:**

```typescript
db.collection("keypadGroupMemberships").createIndex({ doorKey: 1 });
db.collection("keypadGroupMemberships").createIndex({
    doorKey: 1,
    groupName: 1,
});
db.collection("keypadGroupMemberships").createIndex({ memberNumber: 1 });
db.collection("keypadGroupMemberships").createIndex({
    doorKey: 1,
    memberNumber: 1,
});
db.collection("keypadGroupMemberships").createIndex({ expiresAt: 1 });
```

---

## Service Architecture

### Layer 3: KeypadDefinitionService

**Purpose:** Access door and group definitions (read-heavy)  
**Location:** `bin/games/veratown/services/keypadDefinitionService.ts`

```typescript
export class KeypadDefinitionService {
    constructor(private db: Db) {}

    // Door Operations
    async getDoorDefinition(
        doorKey: string,
    ): Promise<KeypadDoorDefinitionDoc | null>;
    async getAllDoorDefinitions(): Promise<KeypadDoorDefinitionDoc[]>;
    async createDoor(door: KeypadDoorDefinitionDoc): Promise<void>;
    async updateDoor(
        doorKey: string,
        updates: Partial<KeypadDoorDefinitionDoc>,
    ): Promise<void>;
    async deleteDoor(doorKey: string): Promise<void>;

    // Group Operations
    async getGroupDefinition(
        doorKey: string,
        groupName: string,
    ): Promise<KeypadGroupDefinitionDoc | null>;
    async getGroupsForDoor(
        doorKey: string,
    ): Promise<KeypadGroupDefinitionDoc[]>;
    async createGroup(group: KeypadGroupDefinitionDoc): Promise<void>;
    async updateGroup(
        doorKey: string,
        groupName: string,
        updates: Partial<KeypadGroupDefinitionDoc>,
    ): Promise<void>;
    async deleteGroup(doorKey: string, groupName: string): Promise<void>;

    // Queries
    async getDoorAt(
        x: number,
        y: number,
    ): Promise<KeypadDoorDefinitionDoc | null>;
    async verifyCode(doorKey: string, code: string): Promise<string | null>; // Returns groupName if code matches
    async getDefaultGroupForDoor(
        doorKey: string,
    ): Promise<KeypadGroupDefinitionDoc | null>;
}
```

### Layer 2: KeypadAccessService

**Purpose:** Manage character access state (reads/writes character data)  
**Location:** `bin/games/veratown/services/keypadAccessService.ts`

```typescript
export class KeypadAccessService {
    constructor(
        private db: Db,
        private definitionService: KeypadDefinitionService,
        private unifiedStore: UnifiedCharacterStore,
    ) {}

    // Character Access Management (uses UnifiedCharacterStore)
    async grantAccess(
        memberNumber: number,
        doorKey: string,
        groupName: string,
        grantedBy: number,
        reason?: string,
    ): Promise<void>;

    async revokeAccess(
        memberNumber: number,
        doorKey: string,
        groupName?: string, // If undefined, revokes all groups at this door
    ): Promise<void>;

    async getCharacterAccess(
        memberNumber: number,
    ): Promise<KeypadAccessRecord[]>;
    async getCharacterAccessToDoor(
        memberNumber: number,
        doorKey: string,
    ): Promise<KeypadAccessRecord[]>;

    // Access Check (main door opening logic)
    async canAccessDoor(
        memberNumber: number,
        doorKey: string,
        code?: string,
    ): Promise<{
        canAccess: boolean;
        groupName?: string;
        reason: string;
    }>;

    // Admin Override
    async isAdminOverride(
        memberNumber: number,
        doorKey: string,
    ): Promise<boolean>;

    // Membership Queries (optional, for admin UI)
    async getDoorsAccessibleByMember(memberNumber: number): Promise<string[]>;
    async getMembersWithAccessToDoor(
        doorKey: string,
    ): Promise<KeypadGroupMembershipDoc[]>;
    async getMembersInGroup(
        doorKey: string,
        groupName: string,
    ): Promise<KeypadGroupMembershipDoc[]>;
}
```

### Existing: UnifiedCharacterStore (Extended)

**Purpose:** Character-level keypad access data management  
**Changes:** Add keypadAccess tracking methods

```typescript
export class UnifiedCharacterStore {
    // ... existing methods ...

    // New keypad-related methods
    async addKeypadAccess(
        memberNumber: number,
        access: KeypadAccessRecord,
    ): Promise<void>;

    async removeKeypadAccess(
        memberNumber: number,
        doorKey: string,
        groupName?: string,
    ): Promise<void>;

    async getKeypadAccess(memberNumber: number): Promise<KeypadAccessRecord[]>;

    async hasKeypadAccess(
        memberNumber: number,
        doorKey: string,
        groupName?: string,
    ): Promise<boolean>;
}
```

---

## Location/Region Integration

**Critical Concern:** How do door definitions, keypad locations, and region management interact?

### Current Architecture Problem

**Current State:**

```
A "keypad_door" location contains BOTH:
- Keypad positioning (x, y on map)
- Door definition (doorX, doorY, tiles, codes, whitelist)

Problem:
- Can't define a door without creating a location
- Can't have multiple keypads for one door
- Door config is mixed with location config
- Door definition is not independent/reusable
```

### Proposed Model: Doors First, Then Keypads

**Key Principle:** Doors are game design assets (Layer 3), Keypads are location instances (Layer 3 definitions linked to locations).

```
┌─────────────────────────────────────────┐
│ keypadDoorDefinitions (Layer 3)         │
├─────────────────────────────────────────┤
│ doorKey: "prison_cell_1_door"           │
│ doorX: 20, doorY: 10                    │
│ lockedTile: "MetalDown"                 │
│ unlockedTile: "SteelDoorOpen"           │
│ unlockDurationMs: 10000                 │
│ insideRegion: { TL/BR }                 │
│ autoOpenTile: { X, Y }                  │
│ enabled: true                           │
│ createdAt, updatedAt                    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ veratownLocations[keypad_door]          │
├─────────────────────────────────────────┤
│ key: "prison_keypad_1"                  │
│ type: "keypad_door"                     │
│ name: "Prison Cell Keypad"              │
│ x: 15, y: 8  (Keypad position)          │
│ data: {                                 │
│   doorKey: "prison_cell_1_door"    ✅   │  Reference to door
│   description: "Unlocks main cell"      │
│ }                                       │
│ enabled: true                           │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ UnifiedCharacterProfile.veratown[]      │ Layer 1
├─────────────────────────────────────────┤
│ keypadAccess: [                         │
│   {                                     │
│     doorKey: "prison_cell_1_door", ✅   │  References door
│     groupName: "admin",                 │
│     grantedAt, grantedBy, ...          │
│   }                                     │
│ ]                                       │
└─────────────────────────────────────────┘
```

**Benefits:**
✅ Doors are independently definable  
✅ Multiple keypads can open same door  
✅ Doors can exist without active keypads  
✅ Door definition separated from location definition  
✅ Region management independent of door management

### Data Model Changes

#### keypadDoorDefinitions Collection (NEW)

**Purpose:** Fixed door asset definitions - NOT tied to locations  
**Write Frequency:** Rarely (design time, admin updates)  
**Layer:** 3 (Reference Data)

```typescript
export interface KeypadDoorDefinitionDoc {
    _id: string;
    doorKey: string; // Unique identifier: "prison_cell_1_door"

    // Door tile position
    doorX: number;
    doorY: number;

    // Tile appearance
    lockedTile: string; // "MetalDown"
    unlockedTile: string; // "SteelDoorOpen"
    unlockDurationMs: number; // 10000

    // Optional: Protection when someone is inside
    insideRegion?: {
        TopLeft: { X: number; Y: number };
        BottomRight: { X: number; Y: number };
    };

    // Optional: Auto-open tile (only if insideRegion not set)
    autoOpenTile?: {
        X: number;
        Y: number;
    };

    // Metadata
    enabled: boolean;
    description?: string; // "Main prison cell door"
    createdAt: number;
    updatedAt: number;
}
```

#### veratownLocations.data Changes (FOR KEYPAD LOCATIONS)

**Change:** Replace embedded door config with doorKey reference

```typescript
// BEFORE:
{
    key: "prison_keypad_1",
    type: "keypad_door",
    name: "Prison Cell Keypad",
    x: 15,
    y: 8,
    data: {
        doorX: 20,        // ❌ Redundant with door definition
        doorY: 10,        // ❌ Redundant with door definition
        lockedTile: "MetalDown",      // ❌ Redundant
        unlockedTile: "SteelDoorOpen", // ❌ Redundant
        // ... all door config here
    }
}

// AFTER:
{
    key: "prison_keypad_1",
    type: "keypad_door",
    name: "Prison Cell Keypad",
    x: 15,            // Keypad position on map
    y: 8,
    data: {
        doorKey: "prison_cell_1_door",  // ✅ Reference to door definition
        description: "Unlocks main cell"
    }
}
```

### Integration with VeratownLocationStore

The location system is the **source of truth for keypads**. Here's the integration flow:

#### 1. Create a Keypad Location

```typescript
// Admin creates a keypad location via location store
await locationStore.addLocation({
    key: "prison_keypad_1",
    name: "Prison Cell Keypad",
    type: "keypad_door",
    x: 15,
    y: 8,
    data: {
        doorKey: "prison_cell_1_door", // Reference
        description: "Unlocks main cell door",
    },
    enabled: true,
});

// LocationStore emits "locationChanged" event
// KeypadDoorSystem listens for this event
// KeypadDoorSystem:
//   1. Loads the door definition from keypadDoorDefinitions
//   2. Registers the keypad with KeypadAccessService
//   3. Sets up tile triggers for the keypad location (x, y)
//   4. Sets up tile triggers for the door (doorX, doorY)
```

#### 2. Update a Keypad Location

```typescript
// Admin updates keypad location
await locationStore.updateLocation("prison_keypad_1", {
    enabled: false, // Disable the keypad
});

// LocationStore emits "locationChanged" event
// KeypadDoorSystem:
//   1. Removes tile triggers for the keypad
//   2. Removes the keypad from active keypads
//   3. BUT: The door definition remains (could enable different keypad)
```

#### 3. Delete a Keypad Location

```typescript
// Admin deletes the keypad location
await locationStore.deleteLocation("prison_keypad_1");

// LocationStore emits "locationChanged" event
// KeypadDoorSystem:
//   1. Removes tile triggers
//   2. Removes keypad from active list
//   3. Door definition remains for potential re-linking
```

#### 4. Create/Update Door Definition (Independent)

```typescript
// Admin creates a door definition (no location needed yet)
await keypadDefinitionService.createDoor({
    doorKey: "prison_cell_2_door",
    doorX: 50,
    doorY: 40,
    lockedTile: "MetalDown",
    unlockedTile: "SteelDoorOpen",
    unlockDurationMs: 10000,
    description: "Second prison cell",
    enabled: true,
});

// This does NOT automatically create a location
// Door is now in Layer 3, awaiting a keypad location to activate it
// When admin creates a keypad location with doorKey: "prison_cell_2_door",
// the KeypadDoorSystem will activate the door
```

### KeypadDoorSystem Refactoring

**Current Loading Logic:**

```typescript
// Loads from locations, extracts door config from each
this.doors = locations
    .filter((loc) => loc.type === "keypad_door" && loc.enabled)
    .map((location) => {
        const config = readConfig(location); // Extracts doorX, doorY, etc.
        return { location, config };
    });
```

**New Loading Logic:**

```typescript
// Load keypad locations + door definitions together
this.doors = locations
    .filter((loc) => loc.type === "keypad_door" && loc.enabled)
    .map(async (location) => {
        const doorKey = location.data?.doorKey;
        if (!doorKey) {
            logger.warn(`Keypad ${location.key} missing doorKey`);
            return undefined;
        }

        const doorDef =
            await keypadDefinitionService.getDoorDefinition(doorKey);
        if (!doorDef) {
            logger.warn(
                `Door definition ${doorKey} not found for keypad ${location.key}`,
            );
            return undefined;
        }

        // Combine: keypad location + door definition
        return {
            location: location, // Keypad position (x, y)
            doorDefinition: doorDef, // Door properties (doorX, doorY, tiles)
        };
    })
    .filter((door) => door !== undefined);
```

**Updated KeypadDoor Type:**

```typescript
interface KeypadDoor {
    location: VeratownLocationDoc; // Keypad location (x, y) + data.doorKey
    doorDefinition: KeypadDoorDefinitionDoc; // Door asset definition
}
```

### Event Flow: Location → Keypad Activation

```
Admin creates location via Discord command
    ↓
locationStore.addLocation({
    type: "keypad_door",
    data: { doorKey: "prison_cell_1_door" }
})
    ↓
VeratownLocationStore.emit("locationChanged")
    ↓
KeypadDoorSystem listener catches event
    ↓
KeypadDoorSystem.onLocationsReloaded()
    ↓
For each keypad_door location:
  - Fetch door definition (via keypadDefinitionService)
  - Load group definitions (for codes)
  - Register tile triggers
  - Add to active doors list
    ↓
Keypad is now interactive (tile click triggers code entry)
    ↓
KeypadAccessService checks member access (layer 1 + layer 2)
    ↓
If access granted, door unlocks
```

### Backward Compatibility Migration

**Existing keypad_door locations still work** via compatibility layer:

```typescript
// For old locations with embedded door config:
async function readOldLocationConfig(
    location: VeratownLocationDoc,
): Promise<KeypadDoorDefinitionDoc | null> {
    const data = location.data ?? {};

    // Check if door definition exists
    const doorKey = data.doorKey as string;
    if (doorKey) {
        // New style - reference to door definition
        return keypadDefinitionService.getDoorDefinition(doorKey);
    }

    // Old style - create temporary door definition from location data
    if (data.doorX !== undefined && data.doorY !== undefined) {
        return {
            _id: `auto_${location.key}`,
            doorKey: `auto_${location.key}`,
            doorX: data.doorX,
            doorY: data.doorY,
            lockedTile: data.lockedTile,
            unlockedTile: data.unlockedTile,
            unlockDurationMs: data.unlockDurationMs ?? 10000,
            insideRegion: data.insideTopLeftX ? {/* ... */} : undefined,
            autoOpenTile: data.autoOpenTileX
                ? { X: data.autoOpenTileX, Y: data.autoOpenTileY }
                : undefined,
            enabled: location.enabled,
            createdAt: location.createdAt,
            updatedAt: location.updatedAt,
        };
    }

    return null;
}
```

**During Migration (Phase 1):**

- Extract all door configs from existing keypad_door locations
- Create keypadDoorDefinitions with extracted configs
- Update locations to use doorKey references
- Test backward compatibility layer still works

### Admin Commands for Location Management

All location/keypad management goes through KeypadLocationCommands (separate from KeypadCommandHandler):

```typescript
// Create a door definition (design time)
/bot door define create prison_cell_1_door \
    doorX:20 doorY:10 \
    lockedTile:MetalDown unlockedTile:SteelDoorOpen \
    unlock:10000 \
    inside:topleftX:21,topleftY:9,bottomrightX:39,bottomrightY:20

// Create a keypad location (deployment time)
/bot location create prison_keypad_1 keypad_door \
    x:15 y:8 \
    doorKey:prison_cell_1_door \
    name:"Prison Cell Keypad"

// Link different door to existing keypad location
/bot location update prison_keypad_1 \
    data.doorKey:prison_cell_2_door

// List all doors with their active keypads
/bot door define list
// Shows:
// - prison_cell_1_door (active: 2 keypads, 4 members with access)
// - prison_cell_2_door (active: 1 keypad, 2 members with access)
// - backup_door (active: no keypads)

// List all keypads for a door
/bot door keypads prison_cell_1_door
// Shows:
// - prison_keypad_1 (x:15 y:8, enabled)
// - maintenance_keypad_1 (x:25 y:30, enabled)
```

### Query Patterns with Location Integration

```typescript
// "What doors are accessible from this location?"
async function getDoorsInRegion(region: MapRegion): Promise<KeypadDoor[]> {
    const locations = await locationStore.loadLocations();
    const keypadLocations = locations.filter(
        (loc) =>
            loc.type === "keypad_door" &&
            loc.enabled &&
            isInRegion(loc, region),
    );

    return Promise.all(
        keypadLocations.map(async (loc) => {
            const doorDef = await keypadDefinitionService.getDoorDefinition(
                loc.data?.doorKey,
            );
            return { location: loc, doorDefinition: doorDef };
        }),
    );
}

// "Which locations need a door definition?"
async function findOrphanedKeypads(): Promise<VeratownLocationDoc[]> {
    const locations = await locationStore.loadLocations();
    const orphaned = [];

    for (const loc of locations) {
        if (loc.type !== "keypad_door") continue;

        const doorKey = loc.data?.doorKey;
        if (!doorKey) {
            orphaned.push(loc); // Missing doorKey
            continue;
        }

        const doorDef =
            await keypadDefinitionService.getDoorDefinition(doorKey);
        if (!doorDef) {
            orphaned.push(loc); // Door definition not found
        }
    }

    return orphaned;
}

// "Disable all keypads for a door"
async function disableAllKeypadsForDoor(doorKey: string): Promise<void> {
    const locations = await locationStore.loadLocations();

    for (const loc of locations) {
        if (loc.type === "keypad_door" && loc.data?.doorKey === doorKey) {
            await locationStore.updateLocation(loc.key, { enabled: false });
        }
    }
}
```

### Testing Location Integration

```typescript
describe("KeypadDoorSystem with Location Integration", () => {
    test("loads keypads when location created", async () => {
        // Create door definition first
        await keypadDefinitionService.createDoor({
            doorKey: "test_door",
            doorX: 20,
            doorY: 10,
            lockedTile: "MetalDown",
            unlockedTile: "SteelDoorOpen",
            unlockDurationMs: 10000,
            enabled: true,
        });

        // Create keypad location
        await locationStore.addLocation({
            key: "test_keypad",
            type: "keypad_door",
            x: 15,
            y: 8,
            data: { doorKey: "test_door" },
            enabled: true,
        });

        // Trigger location reload
        keypadDoorSystem.onLocationsReloaded(
            await locationStore.loadLocations(),
        );

        // Verify keypad is active
        const doors = keypadDoorSystem.getDoors();
        expect(doors).toHaveLength(1);
        expect(doors[0].location.key).toBe("test_keypad");
        expect(doors[0].doorDefinition.doorKey).toBe("test_door");
    });

    test("handles missing door definition gracefully", async () => {
        // Create keypad location WITHOUT door definition
        await locationStore.addLocation({
            key: "orphaned_keypad",
            type: "keypad_door",
            x: 15,
            y: 8,
            data: { doorKey: "nonexistent_door" },
            enabled: true,
        });

        // Should log warning, not throw
        keypadDoorSystem.onLocationsReloaded(
            await locationStore.loadLocations(),
        );

        // Keypad should not be in active list
        const doors = keypadDoorSystem.getDoors();
        expect(
            doors.find((d) => d.location.key === "orphaned_keypad"),
        ).toBeUndefined();
    });
});
```

---

## Command Architecture & CRUD Operations

**Goal:** Consistent, DRY command interface supporting all CRUD operations with clear permission model

### Command Structure (Hierarchical)

```
/bot door [resource] [action] [params...]

Resources:
  - access      : Manage character access to doors
  - group       : Manage access groups
  - code        : Manage access codes
  - help        : Display command help

Examples:
  /bot door access list                          # Admin: list all members with access
  /bot door access grant <member> <group>        # Admin: grant access
  /bot door access revoke <member> [group]       # Admin: revoke access
  /bot door group list                           # All: list groups at this door
  /bot door group create <name> <code>           # Admin: create custom group
  /bot door group delete <name>                  # Admin: delete group
  /bot door code set <group> <code>              # Admin: update group code
  /bot door help [resource]                      # Display help
```

### Command Handler Architecture (DRY Pattern)

**Base class to reduce duplication:**

```typescript
/**
 * Abstract base for all keypad commands
 * Handles: permission checks, parsing, validation, error responses
 */
export abstract class KeypadCommandHandler {
    protected conn: API_Connector;
    protected accessService: KeypadAccessService;
    protected definitionService: KeypadDefinitionService;

    /**
     * Override this to define what this command does
     */
    abstract execute(
        context: CommandContext,
        args: string[],
    ): Promise<CommandResult>;

    /**
     * Override to define required permission
     */
    abstract requiredPermission(args: string[]): PermissionLevel;

    /**
     * Override to define expected argument count
     */
    abstract expectedArgs(): number | [number, number]; // exact or [min, max]

    /**
     * Override for command-specific validation
     */
    protected async validate(args: string[]): Promise<void> {}

    /**
     * Handle command invocation with common logic
     */
    async handle(context: CommandContext, args: string[]): Promise<void> {
        try {
            // 1. Check permission
            const required = this.requiredPermission(args);
            const actual = context.getPermissionLevel();
            if (!this.hasPermission(actual, required)) {
                this.reply(
                    context,
                    `Insufficient permissions. Required: ${required}`,
                );
                return;
            }

            // 2. Validate args
            const expectedCount = this.expectedArgs();
            if (Array.isArray(expectedCount)) {
                const [min, max] = expectedCount;
                if (args.length < min || args.length > max) {
                    this.reply(
                        context,
                        `Invalid argument count. Expected ${min}-${max}, got ${args.length}`,
                    );
                    return;
                }
            } else {
                if (args.length !== expectedCount) {
                    this.reply(
                        context,
                        `Invalid argument count. Expected ${expectedCount}, got ${args.length}`,
                    );
                    return;
                }
            }

            // 3. Command-specific validation
            await this.validate(args);

            // 4. Execute
            const result = await this.execute(context, args);

            // 5. Send response
            if (result.success) {
                this.reply(context, result.message);
            } else {
                this.reply(context, `❌ ${result.message}`);
            }
        } catch (error) {
            this.logger.error("Command execution failed", error as Error);
            this.reply(context, `❌ Error: ${(error as Error).message}`);
        }
    }

    protected reply(context: CommandContext, message: string): void {
        this.conn.reply(context.message, message);
    }

    protected hasPermission(
        actual: PermissionLevel,
        required: PermissionLevel,
    ): boolean {
        const levels = { guest: 0, whitelist: 1, admin: 2 };
        return levels[actual] >= levels[required];
    }
}

// Permission model
type PermissionLevel = "guest" | "whitelist" | "admin";

// Command context
interface CommandContext {
    character: API_Character;
    message: API_Message;
    doorKey: string;
    door: KeypadDoorDefinitionDoc;

    getPermissionLevel(): PermissionLevel;
}

// Result type
interface CommandResult {
    success: boolean;
    message: string;
}
```

### CRUD Commands for Access Management

**Grant Access (CREATE):**

```typescript
export class GrantAccessCommand extends KeypadCommandHandler {
    expectedArgs(): [number, number] {
        return [2, 3]; // grant <member> <group> [reason]
    }

    requiredPermission(): PermissionLevel {
        return "admin";
    }

    async validate(args: string[]): Promise<void> {
        const memberNumber = Number(args[0]);
        if (!Number.isInteger(memberNumber)) {
            throw new Error("First argument must be a member number");
        }

        const groupName = args[1];
        const group = await this.definitionService.getGroupDefinition(
            this.doorKey,
            groupName,
        );
        if (!group) {
            throw new Error(`Group '${groupName}' does not exist at this door`);
        }
    }

    async execute(
        context: CommandContext,
        args: string[],
    ): Promise<CommandResult> {
        const memberNumber = Number(args[0]);
        const groupName = args[1];
        const reason = args[2] || "Admin grant";

        await this.accessService.grantAccess(
            memberNumber,
            context.doorKey,
            groupName,
            context.character.MemberNumber,
            reason,
        );

        return {
            success: true,
            message: `Member ${memberNumber} granted access to group '${groupName}' at door ${context.doorKey}`,
        };
    }
}

// Usage: /bot door access grant 12345 maintenance "Daily maintenance shift"
```

**Revoke Access (DELETE):**

```typescript
export class RevokeAccessCommand extends KeypadCommandHandler {
    expectedArgs(): [number, number] {
        return [1, 2]; // revoke <member> [group]
    }

    requiredPermission(): PermissionLevel {
        return "admin";
    }

    async validate(args: string[]): Promise<void> {
        const memberNumber = Number(args[0]);
        if (!Number.isInteger(memberNumber)) {
            throw new Error("First argument must be a member number");
        }
    }

    async execute(
        context: CommandContext,
        args: string[],
    ): Promise<CommandResult> {
        const memberNumber = Number(args[0]);
        const groupName = args[1]; // undefined revokes all groups at this door

        await this.accessService.revokeAccess(
            memberNumber,
            context.doorKey,
            groupName,
        );

        const revoked = groupName ? `group '${groupName}'` : "all groups";
        return {
            success: true,
            message: `Member ${memberNumber} revoked from ${revoked} at door ${context.doorKey}`,
        };
    }
}

// Usage:
// /bot door access revoke 12345 maintenance
// /bot door access revoke 12345            (revoke all)
```

**List Access (READ):**

```typescript
export class ListAccessCommand extends KeypadCommandHandler {
    expectedArgs(): [number, number] {
        return [0, 1]; // list [filter: all|group_name]
    }

    requiredPermission(): PermissionLevel {
        return "whitelist";
    }

    async execute(
        context: CommandContext,
        args: string[],
    ): Promise<CommandResult> {
        const filter = args[0] || "all";

        const members = await this.accessService.getMembersWithAccessToDoor(
            context.doorKey,
        );

        if (members.length === 0) {
            return {
                success: true,
                message: "No members have access to this door",
            };
        }

        let filtered = members;
        if (filter !== "all") {
            filtered = members.filter((m) => m.groupName === filter);
        }

        const grouped = this.groupBy(filtered, (m) => m.groupName);
        const lines = Object.entries(grouped).map(
            ([group, mems]) =>
                `  ${group}: ${mems.map((m) => m.memberNumber).join(", ")}`,
        );

        return {
            success: true,
            message: `Access at door ${context.doorKey}:\n${lines.join("\n")}`,
        };
    }

    private groupBy<T, K>(arr: T[], fn: (x: T) => K): Record<string, T[]> {
        const result: Record<string, T[]> = {};
        for (const item of arr) {
            const key = String(fn(item));
            if (!result[key]) result[key] = [];
            result[key].push(item);
        }
        return result;
    }
}

// Usage:
// /bot door access list              (all members)
// /bot door access list maintenance  (filter by group)
```

### CRUD Commands for Group Management

**Create Group (CREATE):**

```typescript
export class CreateGroupCommand extends KeypadCommandHandler {
    expectedArgs(): number {
        return 2; // create <name> <code>
    }

    requiredPermission(): PermissionLevel {
        return "admin";
    }

    async validate(args: string[]): Promise<void> {
        const [groupName, code] = args;

        if (groupName.length < 2 || groupName.length > 50) {
            throw new Error("Group name must be 2-50 characters");
        }

        if (code.length < 2 || code.length > 100) {
            throw new Error("Code must be 2-100 characters");
        }

        if (code.includes("(") || code.includes(")")) {
            throw new Error("Code cannot contain parentheses");
        }

        const existing = await this.definitionService.getGroupDefinition(
            this.doorKey,
            groupName,
        );
        if (existing) {
            throw new Error(`Group '${groupName}' already exists at this door`);
        }
    }

    async execute(
        context: CommandContext,
        args: string[],
    ): Promise<CommandResult> {
        const [groupName, code] = args;

        const group: KeypadGroupDefinitionDoc = {
            _id: `group_${context.doorKey}_${groupName}`,
            doorKey: context.doorKey,
            groupName,
            groupType: "custom",
            code,
            description: `Custom group: ${groupName}`,
            permissions: ["unlock"],
            createdAt: Date.now(),
            createdBy: context.character.MemberNumber,
        };

        await this.definitionService.createGroup(group);

        return {
            success: true,
            message: `Group '${groupName}' created at door ${context.doorKey}`,
        };
    }
}

// Usage: /bot door group create maintenance maint1234
```

**Delete Group (DELETE):**

```typescript
export class DeleteGroupCommand extends KeypadCommandHandler {
    expectedArgs(): number {
        return 1; // delete <name>
    }

    requiredPermission(): PermissionLevel {
        return "admin";
    }

    async validate(args: string[]): Promise<void> {
        const groupName = args[0];

        if (["admin", "whitelist", "guest"].includes(groupName)) {
            throw new Error(`Cannot delete built-in group '${groupName}'`);
        }

        const group = await this.definitionService.getGroupDefinition(
            this.doorKey,
            groupName,
        );
        if (!group) {
            throw new Error(`Group '${groupName}' does not exist`);
        }
    }

    async execute(
        context: CommandContext,
        args: string[],
    ): Promise<CommandResult> {
        const groupName = args[0];

        await this.definitionService.deleteGroup(context.doorKey, groupName);

        return {
            success: true,
            message: `Group '${groupName}' deleted from door ${context.doorKey}`,
        };
    }
}

// Usage: /bot door group delete maintenance
```

**List Groups (READ):**

```typescript
export class ListGroupsCommand extends KeypadCommandHandler {
    expectedArgs(): number {
        return 0; // list
    }

    requiredPermission(): PermissionLevel {
        return "guest";
    }

    async execute(
        context: CommandContext,
        args: string[],
    ): Promise<CommandResult> {
        const groups = await this.definitionService.getGroupsForDoor(
            context.doorKey,
        );

        if (groups.length === 0) {
            return {
                success: true,
                message: "No access groups configured at this door",
            };
        }

        const lines = groups.map(
            (g) =>
                `  ${g.groupName}: ${g.code ? "code-protected" : "override-only"}`,
        );

        return {
            success: true,
            message: `Access groups at door ${context.doorKey}:\n${lines.join("\n")}`,
        };
    }
}

// Usage: /bot door group list
```

### CRUD Commands for Code Management

**Set Code (UPDATE):**

```typescript
export class SetCodeCommand extends KeypadCommandHandler {
    expectedArgs(): number {
        return 2; // set <group> <code>
    }

    requiredPermission(args: string[]): PermissionLevel {
        const group = args[0];
        // Only admins can set admin code; whitelist can set whitelist/guest
        return group === "admin" ? "admin" : "whitelist";
    }

    async validate(args: string[]): Promise<void> {
        const [groupName, code] = args;

        if (code.length < 2 || code.length > 100) {
            throw new Error("Code must be 2-100 characters");
        }

        if (code.includes("(") || code.includes(")")) {
            throw new Error("Code cannot contain parentheses");
        }

        const group = await this.definitionService.getGroupDefinition(
            this.doorKey,
            groupName,
        );
        if (!group) {
            throw new Error(`Group '${groupName}' does not exist`);
        }
    }

    async execute(
        context: CommandContext,
        args: string[],
    ): Promise<CommandResult> {
        const [groupName, code] = args;

        await this.definitionService.updateGroup(context.doorKey, groupName, {
            code,
            updatedAt: Date.now(),
        });

        return {
            success: true,
            message: `Code updated for group '${groupName}' at door ${context.doorKey}`,
        };
    }
}

// Usage: /bot door code set maintenance newmaint9999
```

### Command Registration & Dispatcher

```typescript
/**
 * Central command dispatcher - routes all commands to handlers
 */
export class KeypadCommandDispatcher {
    private handlers = new Map<string, KeypadCommandHandler>();

    constructor(
        private conn: API_Connector,
        private accessService: KeypadAccessService,
        private definitionService: KeypadDefinitionService,
    ) {
        this.registerHandlers();
    }

    private registerHandlers(): void {
        // Access management
        this.register("access grant", new GrantAccessCommand());
        this.register("access revoke", new RevokeAccessCommand());
        this.register("access list", new ListAccessCommand());

        // Group management
        this.register("group create", new CreateGroupCommand());
        this.register("group delete", new DeleteGroupCommand());
        this.register("group list", new ListGroupsCommand());

        // Code management
        this.register("code set", new SetCodeCommand());

        // Help
        this.register("help", new HelpCommand());
    }

    /**
     * Parse and dispatch command
     * Format: /bot door <resource> <action> [args...]
     */
    async dispatch(context: CommandContext, fullArgs: string[]): Promise<void> {
        if (fullArgs.length < 2) {
            this.conn.reply(
                context.message,
                "Usage: /bot door <resource> <action> [args...]",
            );
            return;
        }

        const resource = fullArgs[0];
        const action = fullArgs[1];
        const cmdKey = `${resource} ${action}`;
        const args = fullArgs.slice(2);

        const handler = this.handlers.get(cmdKey);
        if (!handler) {
            this.conn.reply(context.message, `Unknown command: ${cmdKey}`);
            return;
        }

        await handler.handle(context, args);
    }

    private register(key: string, handler: KeypadCommandHandler): void {
        this.handlers.set(key, handler);
    }
}
```

### Help System (Self-Documenting)

```typescript
export class HelpCommand extends KeypadCommandHandler {
    expectedArgs(): [number, number] {
        return [0, 1]; // help [command]
    }

    requiredPermission(): PermissionLevel {
        return "guest";
    }

    async execute(
        context: CommandContext,
        args: string[],
    ): Promise<CommandResult> {
        const topic = args[0]?.toLowerCase();

        const help: Record<string, string> = {
            access: `Access Management:
  /bot door access list [filter]          - List members with access
  /bot door access grant <member> <group> - Grant access to member
  /bot door access revoke <member> [grp]  - Revoke access from member`,

            group: `Group Management:
  /bot door group list                    - List available groups
  /bot door group create <name> <code>    - Create custom group (admin only)
  /bot door group delete <name>           - Delete custom group (admin only)`,

            code: `Code Management:
  /bot door code set <group> <code>       - Update group code
                                           (admin for admin group, whitelist for others)`,

            all: `Keypad Door Commands:
  /bot door access [args...]              - Manage member access
  /bot door group [args...]               - Manage groups
  /bot door code [args...]                - Manage codes
  /bot door help [topic]                  - Show this help`,
        };

        const text = help[topic || "all"] || help.all;
        return {
            success: true,
            message: text,
        };
    }
}

// Usage:
// /bot door help               (show all)
// /bot door help access        (show access commands)
```

### Integration in KeypadDoorSystem

```typescript
export class KeypadDoorSystem implements VeratownFeatureSystem {
    private dispatcher: KeypadCommandDispatcher;

    constructor(
        private conn: API_Connector,
        // ...
        private accessService: KeypadAccessService,
        private definitionService: KeypadDefinitionService,
    ) {
        this.dispatcher = new KeypadCommandDispatcher(
            conn,
            accessService,
            definitionService,
        );
    }

    private async onDoorCommand(msg: API_Message): Promise<void> {
        const door = this.findDoorAt(msg.sender);
        if (!door) {
            this.conn.reply(
                msg.message,
                "Stand on a keypad to use door commands",
            );
            return;
        }

        const doorDef = await this.definitionService.getDoorDefinition(
            door.doorKey,
        );
        if (!doorDef) {
            this.conn.reply(msg.message, "Door configuration not found");
            return;
        }

        // Extract args: "!door access grant 12345 admin" → ["access", "grant", "12345", "admin"]
        const args = msg.message.Content.split(/\s+/).slice(1); // skip "!door"

        const context: CommandContext = {
            character: msg.sender,
            message: msg.message,
            doorKey: door.doorKey,
            door: doorDef,
            getPermissionLevel: () =>
                this.getPermissionLevel(msg.sender, door.doorKey),
        };

        await this.dispatcher.dispatch(context, args);
    }

    private getPermissionLevel(
        character: API_Character,
        doorKey: string,
    ): PermissionLevel {
        if (character.IsRoomAdmin()) return "admin";
        // Check if in whitelist or has any access
        // ...
        return "guest";
    }
}
```

---

## Query Patterns & Logic Flow

### Query 1: Player Enters Door Tile → Check Access

```typescript
async function handleDoorCodeEntry(
    character: API_Character,
    code: string,
    doorKey: string,
) {
    const definitionService = serviceContainer.get(KeypadDefinitionService);
    const accessService = serviceContainer.get(KeypadAccessService);

    // Step 1: Get door definition
    const door = await definitionService.getDoorDefinition(doorKey);
    if (!door || !door.enabled) {
        reply("This door is not available.");
        return;
    }

    // Step 2: Check if admin override
    const isAdmin = character.IsRoomAdmin();
    if (isAdmin) {
        // Admins automatically have access
        unlockDoor(door, "admin", character);
        return;
    }

    // Step 3: Try to match code against groups
    let matchedGroup: string | null = null;

    if (code) {
        const groups = await definitionService.getGroupsForDoor(doorKey);
        for (const group of groups) {
            if (group.code === code) {
                matchedGroup = group.groupName;
                break;
            }
        }
    }

    if (!matchedGroup) {
        reply("Invalid code.");
        return;
    }

    // Step 4: Verify character has access to this group
    const canAccess = await accessService.canAccessDoor(
        character.MemberNumber,
        doorKey,
        code,
    );

    if (!canAccess.canAccess) {
        reply(`Access denied. ${canAccess.reason}`);
        return;
    }

    // Step 5: Unlock door
    unlockDoor(door, matchedGroup, character);
}
```

### Query 2: Admin Unlocks Door (Override)

```typescript
async function handleAdminUnlock(
    character: API_Character,
    doorKey: string,
    durationSeconds: number,
) {
    const definitionService = serviceContainer.get(KeypadDefinitionService);

    if (!character.IsRoomAdmin()) {
        reply("Only admins can unlock doors.");
        return;
    }

    const door = await definitionService.getDoorDefinition(doorKey);
    if (!door) {
        reply("Door not found.");
        return;
    }

    // Admin override - unlock immediately
    unlockDoor(door, "admin", character, durationSeconds * 1000);
    reply(`Door unlocked for ${durationSeconds} seconds.`);
}
```

### Query 3: "What doors can character 1 access?" (Fast Profile Lookup)

```typescript
async function getCharacterDoors(memberNumber: number) {
    const character = await unifiedStore.getCharacter(memberNumber);
    if (!character?.veratown?.keypadAccess) {
        return [];
    }

    // Fast - single profile lookup
    return character.veratown.keypadAccess.map((a) => a.doorKey);
}
```

### Query 4: "Who has access to prison_door_cell_1?" (Admin UI Query)

```typescript
async function getDoorMembers(doorKey: string) {
    const accessService = serviceContainer.get(KeypadAccessService);

    // Uses optional indexed membership collection
    const members = await accessService.getMembersWithAccessToDoor(doorKey);

    return members.map((m) => ({
        memberNumber: m.memberNumber,
        groups: members
            .filter((x) => x.memberNumber === m.memberNumber)
            .map((x) => x.groupName),
    }));
}
```

---

## Data Migration Strategy

### Phase 1: Create New Collections

```typescript
// Create Layer 3 door definitions collection
async function createDoorDefinitions() {
    const db = getDatabase();

    await db.createCollection("keypadDoorDefinitions", {
        validator: {
            $jsonSchema: {
                required: ["doorKey", "location", "tile", "unlockDurationMs"],
                properties: {
                    doorKey: { type: "string" },
                    location: { type: "object" },
                    enabled: { type: "boolean" },
                },
            },
        },
    });

    await db.collection("keypadDoorDefinitions").createIndex({ doorKey: 1 });
}

// Create Layer 3 group definitions collection
async function createGroupDefinitions() {
    const db = getDatabase();

    await db.createCollection("keypadGroupDefinitions", {
        validator: {
            $jsonSchema: {
                required: ["doorKey", "groupName", "groupType"],
                properties: {
                    doorKey: { type: "string" },
                    groupName: { type: "string" },
                    groupType: { enum: ["builtin", "custom"] },
                },
            },
        },
    });

    await db.collection("keypadGroupDefinitions").createIndex(
        {
            doorKey: 1,
            groupName: 1,
        },
        { unique: true },
    );
}

// Create Layer 1 membership collection (optional)
async function createMembershipCollection() {
    const db = getDatabase();

    await db.createCollection("keypadGroupMemberships");

    await db.collection("keypadGroupMemberships").createIndex({
        doorKey: 1,
        memberNumber: 1,
    });
}
```

### Phase 2: Migrate Locations → keypadDoorDefinitions

```typescript
async function migrateDoorsFromLocations() {
    const db = getDatabase();

    const keypadLocations = await db
        .collection("veratownLocations")
        .find({ type: "keypad_door" })
        .toArray();

    for (const location of keypadLocations) {
        const doorDef: KeypadDoorDefinitionDoc = {
            _id: `door_${location.key}`,
            doorKey: location.key,
            doorName: location.name,
            locationKey: location.key,
            location: {
                x: location.x,
                y: location.y,
            },
            tile: {
                locked: location.data.lockedTile,
                unlocked: location.data.unlockedTile,
            },
            unlockDurationMs: location.data.unlockDurationMs,
            insideRegion: location.data.insideRegion,
            autoOpenTile: location.data.autoOpenTile,
            enabled: location.enabled,
            createdAt: location.createdAt,
            updatedAt: location.updatedAt,
        };

        await db.collection("keypadDoorDefinitions").insertOne(doorDef);
    }
}
```

### Phase 3: Migrate Codes → keypadGroupDefinitions

```typescript
async function migrateCodesFromLocations() {
    const db = getDatabase();

    const keypadLocations = await db
        .collection("veratownLocations")
        .find({ type: "keypad_door" })
        .toArray();

    for (const location of keypadLocations) {
        const codes = location.data.codes || {};

        // Migrate built-in groups
        for (const groupName of ["admin", "whitelist", "guest"]) {
            if (codes[groupName]) {
                const groupDef: KeypadGroupDefinitionDoc = {
                    _id: `${location.key}_${groupName}`,
                    doorKey: location.key,
                    groupName,
                    groupType: "builtin",
                    code: codes[groupName],
                    hierarchy: { admin: 1, whitelist: 2, guest: 3 }[groupName],
                    createdAt: location.createdAt,
                    updatedAt: location.updatedAt,
                };

                await db
                    .collection("keypadGroupDefinitions")
                    .insertOne(groupDef);
            }
        }
    }
}
```

### Phase 4: Migrate Whitelist → Character Profiles

```typescript
async function migrateWhitelistToProfiles() {
    const db = getDatabase();
    const unifiedStore = new UnifiedCharacterStore(db);

    const keypadLocations = await db
        .collection("veratownLocations")
        .find({ type: "keypad_door" })
        .toArray();

    for (const location of keypadLocations) {
        const whitelistMembers = location.data.whitelistMemberNumbers || [];

        for (const memberNumber of whitelistMembers) {
            await unifiedStore.addKeypadAccess(memberNumber, {
                doorKey: location.key,
                groupName: "whitelist",
                grantedAt: location.updatedAt,
                grantedBy: 100, // System grant
            });
        }
    }
}
```

### Phase 5: Migrate Custom Groups → Character Profiles

```typescript
async function migrateCustomGroupsToProfiles() {
    const db = getDatabase();
    const unifiedStore = new UnifiedCharacterStore(db);

    const customGroups = await db
        .collection("keypadAccessGroups")
        .find({})
        .toArray();

    for (const doorGroups of customGroups) {
        for (const groupName in doorGroups.groups) {
            const group = doorGroups.groups[groupName];

            // Skip built-in groups (already migrated from whitelist)
            if (["admin", "whitelist", "guest"].includes(groupName)) {
                continue;
            }

            for (const memberNumber of group.memberNumbers) {
                await unifiedStore.addKeypadAccess(memberNumber, {
                    doorKey: doorGroups.doorKey,
                    groupName,
                    grantedAt: group.createdAt,
                    grantedBy: 100,
                });
            }
        }
    }
}
```

### Phase 6: Populate Optional Membership Index

```typescript
async function rebuildMembershipIndex() {
    const db = getDatabase();

    // Clear existing data
    await db.collection("keypadGroupMemberships").deleteMany({});

    // Rebuild from character profiles
    const characters = await db
        .collection("unifiedCharacterProfiles")
        .find({ "veratown.keypadAccess": { $exists: true } })
        .toArray();

    const docs = [];

    for (const character of characters) {
        for (const access of character.veratown.keypadAccess) {
            docs.push({
                doorKey: access.doorKey,
                groupName: access.groupName,
                memberNumber: character.memberNumber,
                grantedAt: access.grantedAt,
                grantedBy: access.grantedBy,
                syncedFromProfile: true,
            });
        }
    }

    if (docs.length > 0) {
        await db.collection("keypadGroupMemberships").insertMany(docs);
    }
}
```

---

## Code Changes Overview

### 1. KeypadDoorSystem Refactoring

**Before (Current):**

```typescript
// Reads from locations + keypadAccessGroups
const door = readConfig(location); // From locations data
const doorKey = `door_${door.config.doorX}_${door.config.doorY}`;
const groupConfig = await this.keypadAccessGroupManager.getDoorGroups(doorKey);
```

**After (Refactored):**

```typescript
// Reads from unified definitions + character profiles
const door = await definitionService.getDoorDefinition(doorKey);
const canAccess = await accessService.canAccessDoor(
    memberNumber,
    doorKey,
    code,
);
```

### 2. Admin Commands Refactoring

**Change-code Command:**

```typescript
// Before: Updates location AND keypadAccessGroups
door.config.codes[group] = code;
await this.persistDoor(door);

// After: Updates keypadGroupDefinitions via service
await accessService.updateGroupCode(doorKey, group, code);
```

**Add/Remove Member:**

```typescript
// Before: Updates keypadAccessGroups[doorKey].groups[customGroup].memberNumbers
await this.keypadAccessGroupManager.addMember(doorKey, groupName, memberNumber);

// After: Updates character profile via UnifiedCharacterStore
await accessService.grantAccess(
    memberNumber,
    doorKey,
    groupName,
    adminMemberNumber,
);
```

### 3. New Service Integration in veratown.ts

```typescript
import { KeypadDefinitionService } from "./services/keypadDefinitionService";
import { KeypadAccessService } from "./services/keypadAccessService";

// In constructor
const definitionService = new KeypadDefinitionService(db);
const accessService = new KeypadAccessService(
    db,
    definitionService,
    unifiedStore,
);

// Pass to KeypadDoorSystem
const keypadDoorSystem = new KeypadDoorSystem(
    conn,
    commandParser,
    locationStore,
    reloadLocationsCallback,
    definitionService, // NEW
    accessService, // NEW
);
```

---

## Testing Strategy

### Unit Tests (keypadAccessService.test.ts)

```typescript
describe("KeypadAccessService", () => {
    describe("canAccessDoor", () => {
        test("admin override grants access without group membership", async () => {
            const memberNumber = 123;
            const doorKey = "test_door";

            // Admin member should have access regardless of profile
            const result = await service.canAccessDoor(memberNumber, doorKey);
            expect(result.canAccess).toBe(true);
            expect(result.groupName).toBe("admin");
        });

        test("character with group membership can access door", async () => {
            const memberNumber = 123;
            const doorKey = "test_door";

            // Grant access to "maintenance" group
            await service.grantAccess(
                memberNumber,
                doorKey,
                "maintenance",
                100,
            );

            const result = await service.canAccessDoor(memberNumber, doorKey);
            expect(result.canAccess).toBe(true);
            expect(result.groupName).toBe("maintenance");
        });

        test("character without access is denied", async () => {
            const memberNumber = 456;
            const doorKey = "test_door";

            const result = await service.canAccessDoor(memberNumber, doorKey);
            expect(result.canAccess).toBe(false);
        });
    });
});
```

### Integration Tests (keypadDoorSystem.integration.test.ts)

```typescript
describe("KeypadDoorSystem Integration", () => {
    test("end-to-end: enter code, access door, close door", async () => {
        // Setup
        const doorKey = "test_door";
        await definitionService.createDoor(testDoor);
        await definitionService.createGroup({
            doorKey,
            groupName: "guest",
            code: "1234",
        });

        const memberNumber = 456;
        await accessService.grantAccess(memberNumber, doorKey, "guest", 100);

        // Simulate character entering code
        const character = createMockCharacter(memberNumber);
        const result = await system.handleDoorCode(character, "1234", doorKey);

        expect(result.success).toBe(true);
        expect(result.unlockedUntil).toBeGreaterThan(Date.now());
    });
});
```

---

## Command Architecture Benefits & Comparison

### DRY Pattern Implementation

The new **KeypadCommandHandler** base class eliminates massive code duplication:

**Before (Old Pattern):** Each command duplicates:

- Permission checking logic (copy-pasted for every command)
- Argument parsing and validation (repeated everywhere)
- Error handling and response formatting (duplicated 20+ times)
- Door/group lookups (scattered, inconsistent)

**Result:** ~500-800 lines of repeated boilerplate per command

**After (New Pattern):**

- Single `KeypadCommandHandler` base class handles all common logic
- Each command implements only: `execute()`, `requiredPermission()`, `expectedArgs()`, `validate()`
- Consistent error handling, logging, and responses

**Result:** ~150-200 lines per command (60-75% reduction)

### Command Suite Coverage

| Operation            | Old System                       | New System               | DRY | Atomic |
| -------------------- | -------------------------------- | ------------------------ | --- | ------ |
| Grant member access  | 1 command (add-user)             | GrantAccessCommand       | ✅  | ✅     |
| Revoke member access | 1 command (remove-user)          | RevokeAccessCommand      | ✅  | ✅     |
| List members         | 1 command (list, list-whitelist) | ListAccessCommand        | ✅  | ✅     |
| Create group         | 1 command (group-create)         | CreateGroupCommand       | ✅  | ✅     |
| Delete group         | 1 command (group-delete)         | DeleteGroupCommand       | ✅  | ✅     |
| List groups          | 1 command (group-list)           | ListGroupsCommand        | ✅  | ✅     |
| Change code          | 1 command (change-code)          | SetCodeCommand           | ✅  | ✅     |
| Lock door            | 1 command (lock)                 | LockDoorCommand (new)    | ✅  | ✅     |
| Unlock door          | 1 command (unlock)               | UnlockDoorCommand (new)  | ✅  | ✅     |
| Enable door          | 1 command (enable)               | EnableDoorCommand (new)  | ✅  | ✅     |
| Disable door         | 1 command (disable)              | DisableDoorCommand (new) | ✅  | ✅     |

**New CRUD Commands (not in old system):**

- access grant/revoke/list (unified, consistent)
- group create/delete/list (unified)
- code set (consistent permission model)
- help system (integrated, searchable)

### Permission Model Improvement

**Before (Implicit):**

```typescript
// Scattered throughout code
if (!msg.sender.IsRoomAdmin()) {
    reply("Only admins can do this");
    return;
}
// Some checks missing or inconsistent
```

**After (Declarative):**

```typescript
// Each command declares requirements clearly
requiredPermission(args: string[]): PermissionLevel {
    const group = args[0];
    return group === "admin" ? "admin" : "whitelist";
}

// Base class enforces consistently
```

### Error Handling Improvement

**Before:**

```typescript
// Inconsistent error messages scattered through code
this.conn.reply(msg.message, "Invalid argument count.");
this.conn.reply(
    msg.message,
    `Usage: !door change-code <${isAdmin ? "admin|" : ""}whitelist|guest> <code>`,
);
// Some errors not caught at all
```

**After:**

```typescript
// Consistent error responses from base class
"❌ Invalid argument count. Expected 2, got 3";
"❌ Error: Group 'invalid' does not exist at this door";
// All validation errors caught and formatted consistently
```

### Testability Improvement

**Before:** Commands scattered across 1000+ line class; hard to test individually

**After:** Each command is standalone, mockable, testable independently:

```typescript
describe("GrantAccessCommand", () => {
    test("grants access when member exists", async () => {
        const cmd = new GrantAccessCommand(mockServices);
        const result = await cmd.execute(mockContext, ["12345", "admin"]);
        expect(result.success).toBe(true);
    });

    test("rejects when group doesn't exist", async () => {
        const cmd = new GrantAccessCommand(mockServices);
        expect(() => cmd.validate(["12345", "nonexistent"])).toThrow(
            "Group 'nonexistent' does not exist",
        );
    });
});
```

### Code Organization Improvement

| Aspect                    | Before                                         | After                                              |
| ------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| **File Structure**        | All commands in KeypadDoorSystem (1000+ lines) | Each command in separate file or organized module  |
| **Consistency**           | Inconsistent error formats, permission checks  | All commands follow same pattern                   |
| **Adding New Commands**   | Copy-paste entire function                     | Extend KeypadCommandHandler, implement 3-4 methods |
| **Updating All Commands** | Find/replace multiple patterns                 | Change base class once                             |
| **Testing**               | Requires mocking entire system                 | Each command tested independently                  |

---

## Implementation Checklist

### Preparation Phase (Day 1)

- [ ] Create KEYPAD_SYSTEM_REFACTORING_BLUEPRINT.md (this document)
- [ ] Create migration scripts stub
- [ ] Review current code with team
- [ ] Design final schema (review with DB admin)
- [ ] Create test fixtures and mock data
- [ ] Review command architecture and DRY pattern

### Development Phase (Days 2-3)

- [ ] Create KeypadDefinitionService (Layer 3)
- [ ] Create KeypadAccessService (Layer 2)
- [ ] Extend UnifiedCharacterStore with keypadAccess methods (Layer 1)
- [ ] Write unit tests for all services
- [ ] **Location Integration Setup:**
    - [ ] Create keypadDoorDefinitions collection with schema
    - [ ] Add backward compatibility layer in KeypadDoorSystem
    - [ ] Hook KeypadDoorSystem to VeratownLocationStore events
    - [ ] Implement onLocationsReloaded() with door definition lookup
    - [ ] Add error handling for orphaned keypads (missing doorKey or doorDef)
    - [ ] Write location integration tests
- [ ] **Create KeypadCommandHandler base class (DRY foundation)**
- [ ] **Implement command handlers:**
    - [ ] GrantAccessCommand
    - [ ] RevokeAccessCommand
    - [ ] ListAccessCommand
    - [ ] CreateGroupCommand
    - [ ] DeleteGroupCommand
    - [ ] ListGroupsCommand
    - [ ] SetCodeCommand
    - [ ] LockDoorCommand
    - [ ] UnlockDoorCommand
    - [ ] EnableDoorCommand
    - [ ] DisableDoorCommand
    - [ ] HelpCommand
- [ ] **Create KeypadCommandDispatcher**
- [ ] **Write unit tests for all command handlers (test individually)**
- [ ] Refactor KeypadDoorSystem to use new dispatcher
- [ ] Write integration tests (commands end-to-end)

### Migration Phase (Day 4)

- [ ] **Prepare door definitions migration:**
    - [ ] Extract door configs from existing keypad_door locations
    - [ ] Create keypadDoorDefinitions for each unique door config
    - [ ] Test backward compatibility layer with new definitions
- [ ] Run Phase 1-3 migration scripts (definitions)
- [ ] Run Phase 4-5 migration scripts (character data)
- [ ] **Update keypad_door locations to use doorKey references**
- [ ] **Validate location → door definition linking:**
    - [ ] Scan all keypad_door locations, verify doorKey exists
    - [ ] Log any orphaned keypads (missing doorKey or doorDef)
    - [ ] Fix orphaned keypads before going live
- [ ] Validate data integrity
- [ ] Build membership index (Phase 6)
- [ ] Backup before going live

### Testing & Deployment Phase (Day 5)

- [ ] Run full test suite (should pass all 483+ tests)
- [ ] Manual testing on staging
- [ ] Verify admin commands work correctly
- [ ] Verify door access patterns
- [ ] Deploy to production
- [ ] Monitor for errors

### Cleanup Phase (Post-Deployment)

- [ ] Remove old keypadAccessGroups collection usage from code
- [ ] Update veratownLocationStore to not read door configs from locations
- [ ] Consider archiving old collections
- [ ] Update documentation

---

## Rollback Plan

If issues occur during migration:

1. **Stop deployment:** Do not delete old collections
2. **Restore code:** Revert to previous KeypadDoorSystem version
3. **Restore data:** Old collections remain unchanged
4. **Notify team:** Document what went wrong
5. **Post-mortem:** Identify root cause and fix

**Safe point:** After Phase 3 migration, old location/keypadAccessGroups data is still available.

---

## Summary Table

| Aspect                                  | Current                                       | Proposed                                       |
| --------------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| **Door Definition Location**            | locations[key].data (embedded)                | keypadDoorDefinitions[key] (separate)          |
| **Door ↔ Location Relationship**        | 1:1 tight coupling                            | M:1 (multiple keypads per door)                |
| **Keypad Location Link**                | Embedded door config                          | doorKey reference                              |
| **Group Definition Location**           | locations[key].data.codes                     | keypadGroupDefinitions[key]                    |
| **Custom Group Membership**             | keypadAccessGroups.groups[name].memberNumbers | Character profile veratown.keypadAccess[]      |
| **Query "what access does char have?"** | Scan all locations + keypadAccessGroups       | Single profile lookup ✅                       |
| **Query "who has access to door?"**     | Scan all profiles or index membership         | Indexed membership query ✅                    |
| **Update access atomicity**             | Two separate updates                          | Single atomic profile write ✅                 |
| **Admin override**                      | Manual commands                               | Same, refactored for new services              |
| **Support multiple keypads per door**   | No                                            | Yes (via doorKey separation)                   |
| **Location Integration**                | Tight coupling (door config in location)      | Loose coupling (doorKey reference)             |
| **Location Deletion**                   | Deletes door (implicit)                       | Only deletes keypad location; door def remains |
| **Door Definition Reuse**               | Not possible                                  | Yes (multiple keypads → same door)             |

---

## Future Enhancements

Once refactored, additional features become possible:

1. **Access Expiration:** Built-in expiration dates on grants
2. **Access Audit Trail:** Full history of who granted/revoked access
3. **Role-Based Access:** Automatic access based on character role
4. **Temporal Access:** Different codes/access times for different hours/days
5. **Access Delegation:** Trusted members can grant access to others
6. **Access Requests:** Characters request access, admins approve/deny

---

## Old vs New Command Interface Comparison

### Admin Commands - Full Contrast

#### Adding a Member to Door (Grant Access)

**OLD System:**

```
!door add-user <member>

Issues:
- Name is ambiguous (add-user to what? group? whitelist?)
- Only works for built-in whitelist group
- For custom groups, had to use separate group commands
- No consistent format across different access levels
```

**NEW System:**

```
/bot door access grant <member> <group> [reason]

Improvements:
- Resource (access) + Action (grant) is clear and consistent
- Works for any group (admin, whitelist, guest, custom)
- Includes optional audit reason
- Consistent with all other CRUD operations
- ✅ DRY: Uses base class permission/validation/error handling
```

#### Removing a Member from Door

**OLD System:**

```
!door remove-user <member>

Issues:
- Only removes from whitelist
- No way to revoke specific group access
- Confusing if member was in multiple groups
```

**NEW System:**

```
/bot door access revoke <member> [group]

Improvements:
- Can specify which group to revoke from
- If group omitted, revokes from all groups at door
- Clear intent and consistent naming
- ✅ DRY: Single command handles all scenarios
```

#### Listing Members with Access

**OLD System:**

```
!door list
!door list-whitelist

Issues:
- Two separate commands for partial information
- No filtering capability
- Admin had to run both to see full picture
- Inconsistent command names
```

**NEW System:**

```
/bot door access list [filter]

Improvements:
- Single command shows all members
- Optional filter by group name
- Consistent naming with other access commands
- Can filter: "list admin", "list maintenance", etc.
- ✅ DRY: Single implementation handles all cases
```

#### Managing Custom Groups

**OLD System:**

```
!door group-create <name>
!door group-delete <name>
!door group-list
!door group-add <group> <member>
!door group-remove <group> <member>
!door group-code <group> <code>

Issues:
- 6 different commands to manage groups
- Inconsistent verb order (group-create vs add vs remove)
- Argument order differs between commands
- Member management separate from group management
```

**NEW System:**

```
/bot door group list
/bot door group create <name> <code>
/bot door group delete <name>
/bot door access grant <member> <group>
/bot door access revoke <member> <group>
/bot door code set <group> <code>

Improvements:
- Related operations grouped logically:
  - `group` commands: manage group definitions
  - `access` commands: manage member access
  - `code` commands: manage codes
- Consistent argument order: resource, action, params
- Standard CRUD verbs: create, delete, list, grant, revoke, set
- ✅ DRY: Shared validation, error handling, permission checks
```

#### Changing Access Codes

**OLD System:**

```
!door change-code <group> <code>
!door code <group> <code>
!door change <group> <code>

Issues:
- Three aliases for same operation (confusing)
- Code change scattered in help and documentation
- Different permission checks for different codes (inconsistent)
```

**NEW System:**

```
/bot door code set <group> <code>

Improvements:
- Single, clear command
- `code set` is immediately understandable
- Permission model clear: admin for admin codes, whitelist for others
- ✅ DRY: Single command handler, consistent permission logic
```

#### Door Control (Lock/Unlock)

**OLD System:**

```
!door lock
!door unlock [seconds]
!door enable
!door disable

Issues:
- Inconsistent command naming
- No structured permission model
- Error messages vary
- Scattered permission checks
```

**NEW System:**

```
/bot door lock
/bot door unlock [seconds]
/bot door enable
/bot door disable

Improvements:
- Clear, consistent naming
- All use base class for permission/validation
- Consistent error messages
- ✅ DRY: Base class handles all logging and responses
```

### Complete Command Summary

| Category              | Old Commands                                                    | New Commands                             | Benefit                                                  |
| --------------------- | --------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| **Access Management** | add-user, remove-user, list, list-whitelist                     | access grant, access revoke, access list | 🎯 Unified under "access" resource; consistent patterns  |
| **Group Management**  | group-create, group-delete, group-list, group-add, group-remove | group create, group delete, group list   | 🎯 Clear CRUD operations; group commands for definitions |
| **Code Management**   | change-code, code, change                                       | code set                                 | 🎯 Single clear command; consistent permission model     |
| **Door Control**      | lock, unlock, enable, disable                                   | lock, unlock, enable, disable            | ✅ Refactored to use DRY base class                      |
| **Help**              | help (partial)                                                  | help [topic]                             | 🎯 Integrated help system with topic filtering           |

### Migration Guide for Admins

**Old** → **New** Mapping:

| Old                                   | New                                         | Notes                         |
| ------------------------------------- | ------------------------------------------- | ----------------------------- |
| `!door add-user 12345`                | `/bot door access grant 12345 whitelist`    | Explicit group now required   |
| `!door remove-user 12345`             | `/bot door access revoke 12345`             | Revokes all groups by default |
| `!door remove-user 12345 group1`      | `/bot door access revoke 12345 group1`      | Can revoke specific group     |
| `!door list`                          | `/bot door access list`                     | Same function                 |
| `!door group-create mygroup`          | `/bot door group create mygroup newcode123` | Code now required at creation |
| `!door group-add mygroup 12345`       | `/bot door access grant 12345 mygroup`      | Moved to access commands      |
| `!door group-code mygroup newcode`    | `/bot door code set mygroup newcode`        | Consistent set operation      |
| `!door change-code whitelist code123` | `/bot door code set whitelist code123`      | Same operation, clearer name  |
| `!door lock`                          | `/bot door lock`                            | Same                          |
| `!door unlock 30`                     | `/bot door unlock 30`                       | Same                          |
| `!door help`                          | `/bot door help`                            | Now supports topics           |

---

## FAQs

**Q: Will door functionality change for players?**  
A: No. Door opening mechanism stays identical. Only internal architecture changes.

**Q: What about performance?**  
A: Should improve. Character access lookups become O(1) profile reads instead of scanning multiple collections.

**Q: Can we run old and new code simultaneously?**  
A: Not recommended. Complete migration in one deployment.

**Q: What if a character has expired access?**  
A: KeypadAccessService.canAccessDoor() checks expiration before granting access.

**Q: How do we handle admin access during migration?**  
A: Room admins are always granted access by IsRoomAdmin() check, no storage needed.

---

## Location Integration FAQs

**Q: How does door definition creation relate to location creation?**  
A: Door definitions (Layer 3) are created independently via admin commands. Locations (keypad_door type) reference doors via doorKey. You can define many doors but only activate keypads for the ones you need.

**Q: Can I have multiple keypads open the same door?**  
A: Yes! This is a key improvement. Create multiple keypad_door locations with the same doorKey, each at different x/y positions.

**Q: What happens if I delete a keypad location?**  
A: Only the keypad location is deleted. The door definition remains (Layer 3), so you can create a new keypad for it later.

**Q: What happens if I delete a door definition?**  
A: If any keypad locations reference that door, they become orphaned. The system will log warnings. Admins should fix them before deployment.

**Q: Can a location use an auto-import/default door if doorKey is missing?**  
A: Yes, via backward compatibility layer. If doorKey is missing and the location has embedded door config (old format), it creates a temporary auto\_ door definition. This allows gradual migration.

**Q: How does the location watcher keep KeypadDoorSystem in sync?**  
A: VeratownLocationStore emits "locationChanged" events. KeypadDoorSystem listens and calls onLocationsReloaded(). This reloads all keypad locations and their door definitions.

**Q: What if location.data.doorKey points to a non-existent door?**  
A: KeypadDoorSystem logs a warning and skips that keypad. It won't be interactive. Admin must either create the door definition or update the location.

**Q: Can I enable/disable a door independently from its keypads?**  
A: No, enable/disable is per-location. But you can enable/disable all keypads for a door via: `disableAllKeypadsForDoor(doorKey)`.

**Q: How do I know which locations need fixing after migration?**  
A: Run findOrphanedKeypads() during migration to find locations with missing doorKey or missing door definitions. Fix them before deployment.

**Q: Can regions and doors coexist in the same location collection?**  
A: Yes. veratownLocations is type-agnostic. Different location types (keypad_door, region, cage, etc.) are independent.

**Q: What if I update a keypad location's x/y coordinates?**  
A: KeypadDoorSystem removes old tile triggers, registers new ones. The door definition (doorX/doorY) stays the same. Keypad position and door position are independent.
