# Complex Collection Architecture - Linking & Many-to-Many Solutions

**Date:** 2026-08-31  
**Context:** Guidance for refactoring `keypadAccessGroups` and `locationEventExecutions` to follow three-layer architecture

---

## The Core Problem: Linking Collections Across Layers

Both problematic collections represent **many-to-many relationships** that bridge multiple architectural layers:

```
keypadAccessGroups:
    Door (Layer 3: generic)
        ↔ Access Group (Layer 3: generic)
        ↔ Characters (Layer 1: character-specific)

locationEventExecutions:
    Location (Layer 3: generic)
        ↔ Event Definition (Layer 3: generic)
        ↔ Characters (Layer 1: character-specific)
        ↔ Outcomes (Layer 1: character-specific)
```

**The Anti-Pattern:** Storing character membership/outcomes INSIDE the generic definition collection.

---

## SOLUTION 1: keypadAccessGroups - Three-Collection Approach (RECOMMENDED)

### Problem Analysis

**Current (Flawed):**

```typescript
{
    _id: "group_1",
    doorKey: "vault_1",           // Layer 3: door definition
    groups: {
        admin: {
            memberNumbers: [1, 2, 3],  // ❌ Layer 1 data inside Layer 3!
            permissions: ["unlock", "lock", "view"]
        },
        maintenance: {
            memberNumbers: [4],
            permissions: ["view"]
        }
    }
}
```

**Issues:**

1. Character membership changes require modifying door definition
2. Impossible to query "what access does character 1 have?" without scanning all doors
3. Character profile has no record of what access they have
4. Updates are not atomic with character state
5. Access revocation requires two operations (remove from door, remove from character)

### Solution: Three-Collection Architecture

**Collection 1: keypadAccessDefinitions (LAYER 3 - Reference Data)**

```typescript
{
    _id: "def_vault_1",
    doorKey: "vault_1",
    doorName: "Main Vault",
    location: "treasury",

    // Access groups that CAN exist for this door
    accessGroups: [
        {
            groupName: "admin",
            description: "Full vault access",
            permissions: ["unlock", "lock", "view", "confiscate"],
            hierarchy: 1
        },
        {
            groupName: "maintenance",
            description: "Read-only access for maintenance",
            permissions: ["view"],
            hierarchy: 3
        }
    ],

    // Optional: default group for new members
    defaultGroup: "visitor",

    createdAt: 1693478400000
}
```

**Collection 2: keypadGroupMemberships (LAYER 1 - Character-Specific)**

```typescript
// Option A: Separate collection (if queries need "all members with access to door X")
{
    _id: "mem_1",
    doorKey: "vault_1",
    groupName: "admin",
    memberNumber: 1,

    grantedAt: 1693478400000,
    grantedBy: 100,              // Which admin granted this
    expiresAt: null,              // Optional: revocation schedule
    reason: "Head Administrator"
}

// Option B: Embed in character profile (simpler, if queries are "what access does character 1 have?")
// UnifiedCharacterProfile:
{
    memberNumber: 1,
    veratown: {
        keypadAccess: [
            {
                doorKey: "vault_1",
                groupName: "admin",
                grantedAt: 1693478400000,
                grantedBy: 100
            }
        ]
    }
}
```

**Collection 3: keypadAuditLog (LAYER 1 - Audit/Compliance)**

```typescript
{
    _id: "audit_1",
    doorKey: "vault_1",
    memberNumber: 1,
    timestamp: 1693478400000,
    action: "access_granted",    // OR "access_denied", "unlocked", "locked"
    groupName: "admin",
    performedBy: 100,
    reason: "Admin duty grant"
}
```

### Query Patterns with Three Collections

**"Give character 1 access to vault"** (Atomic operation):

```typescript
// Single write to Layer 1 (character data)
await unifiedStore.grantKeypadAccess(1, "vault_1", "admin");

// Internally, this does:
// 1. Verify access group exists in keypadAccessDefinitions (read Layer 3)
// 2. Add entry to character's keypadAccess array (write Layer 1)
// 3. Add audit log entry (write Layer 1)
```

**"What doors can character 1 access?"** (Fast - single character lookup):

```typescript
// Option A: From character profile (fastest)
const character = await unifiedStore.getCharacter(1);
const doors = character.veratown.keypadAccess.map((a) => a.doorKey);

// Option B: From membership collection (if needed for admin UI)
const memberships = await db
    .collection("keypadGroupMemberships")
    .find({ memberNumber: 1 })
    .toArray();
```

**"Who has access to vault_1?"** (Admin query - requires either collection):

```typescript
// Option A: From character profiles (full scan)
const allMembers = await db
    .collection("unifiedCharacterProfiles")
    .aggregate([
        { $match: { "veratown.keypadAccess.doorKey": "vault_1" } },
        { $project: { memberNumber: 1, "veratown.keypadAccess": 1 } },
    ])
    .toArray();

// Option B: From membership collection (indexed)
const memberships = await db
    .collection("keypadGroupMemberships")
    .find({ doorKey: "vault_1" })
    .toArray();
```

### Pros & Cons

| Approach                           | Pros                                                                    | Cons                                                                      | Best For                                           |
| ---------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| **Embed in Profile** (Option B)    | Simplest; atomic with character state; fast "what access" queries       | Requires scanning all profiles for "who has access"; slower admin queries | Small player bases (<1000); simple access patterns |
| **Separate Collection** (Option A) | Fast "who has access" queries; easier admin UI; indexed for performance | Requires two writes for grants/revocation                                 | Large player bases; complex access needs           |
| **Both**                           | Maximum flexibility; best for both access patterns                      | More storage; must keep in sync                                           | Enterprise-grade systems                           |

### RECOMMENDATION for keypadAccessGroups

**Use Option B (Embed + Separate Collection Hybrid):**

```typescript
// In UnifiedCharacterProfile (Layer 1)
{
    memberNumber: 1,
    veratown: {
        keypadAccess: [
            { doorKey: "vault_1", groupName: "admin", grantedAt: ... }
        ]
    }
}

// In keypadAccessDefinitions (Layer 3)
{
    doorKey: "vault_1",
    doorName: "Main Vault",
    accessGroups: [
        { groupName: "admin", permissions: [...] }
    ]
}

// Optional: keypadGroupMemberships (Layer 1, indexed for admin queries)
{
    doorKey: "vault_1",
    groupName: "admin",
    memberNumber: 1,
    grantedAt: 1693478400000
}
```

**Why:**

- Character queries are atomic (grant/revoke = single profile update)
- Admin queries are fast (query indexed membership collection)
- Clear layer separation (definitions separate from membership)
- Fault-tolerant (if membership collection desynchronizes, re-sync from profiles)

---

## SOLUTION 2: locationEventExecutions - Audit Trail Approach (RECOMMENDED)

### Problem Analysis

**Current (Flawed):**

```typescript
{
    _id: "exec_1",
    eventId: "event_escape_attempt",    // Layer 3: event definition
    locationId: "loc_prison",            // Layer 3: location definition
    executedAt: 1693478400000,

    affectedMembers: [1, 2, 3],         // ❌ Layer 1 data inside!
    outcomes: {
        1: "punished",
        2: "released",
        3: "ignored"
    },

    triggeredBy: 5                       // Layer 1 data
}
```

**Issues:**

1. Event outcomes (character-specific) mixed with event definitions (generic)
2. Query "what happened to character 1?" requires scanning all events
3. Character profile has no history of what they experienced
4. Event updates require simultaneous character updates (race conditions)

### Solution: Embed Outcomes in Character Profiles

**Collection 1: locationEventDefinitions (LAYER 3 - Reference Data)**

```typescript
{
    _id: "eventdef_escape_attempt",
    eventType: "escape_attempt",
    name: "Prisoner Escape Attempt",
    description: "Prisoner tries to pick locks or escape",
    locationTypes: ["prison", "cage"],

    // Possible outcomes, not mandatory membership
    possibleOutcomes: [
        {
            name: "captured",
            description: "Attempt fails, punishment applied",
            consequences: {
                bondage: true,
                duration: 86400000,  // 24 hours
                severity: 4
            }
        },
        {
            name: "released",
            description: "Escape succeeds, character freed",
            consequences: {
                bondage: false,
                grants: ["freedom"]
            }
        },
        {
            name: "ignored",
            description: "Guards don't notice",
            consequences: {}
        }
    ],

    severity: 3,
    createdAt: 1693478400000
}
```

**Collection 2: CHARACTER AUDIT TRAIL (LAYER 1 - Embedded)**

```typescript
// In UnifiedCharacterProfile
{
    memberNumber: 1,
    veratown: {
        eventHistory: [
            {
                eventId: "eventdef_escape_attempt",
                locationId: "loc_prison",
                executedAt: 1693478400000,
                outcome: "captured",

                details: {
                    triggeredBy: 5,           // Guard who caught them
                    bondageApplied: [         // What was applied
                        { asset: "restraint_1", lockType: "padlock", duration: 86400000 }
                    ],
                    reason: "Escape attempt"
                }
            }
        ]
    }
}
```

**Collection 3: locationEventAuditLog (LAYER 1 - Optional, for admin/compliance)**

```typescript
{
    _id: "audit_1",
    eventId: "eventdef_escape_attempt",
    locationId: "loc_prison",
    executedAt: 1693478400000,
    affectedMembers: [1, 2, 3],      // OK here - it's an audit log, not a definition

    summary: "3 prisoners attempted escape: 1 captured, 1 released, 1 ignored",
    executedBy: 5,
    outcomes: {
        1: "captured",
        2: "released",
        3: "ignored"
    }
}
```

### Query Patterns with Audit Trail Approach

**"What events affected character 1?"** (Fast - single profile lookup):

```typescript
const character = await unifiedStore.getCharacter(1);
const events = character.veratown.eventHistory;

// Filter by outcome, date range, etc.
const punishments = events.filter((e) => e.outcome === "captured");
```

**"Trigger event_escape_attempt at loc_prison"** (Atomic per character):

```typescript
async function triggerEscapeAttempt(
    membersInLocation: number[],
    locationId: string,
) {
    const eventDef = await db
        .collection("locationEventDefinitions")
        .findOne({ eventId: "eventdef_escape_attempt" });

    // Evaluate each character independently (atomic)
    for (const memberNumber of membersInLocation) {
        const outcome = determineOutcome(memberNumber, eventDef);

        // Single atomic write to character profile
        await unifiedStore.addLocationEvent(memberNumber, {
            eventId: eventDef._id,
            locationId,
            executedAt: Date.now(),
            outcome,
            details: {
                /* outcome-specific data */
            },
        });
    }

    // Optional: also log to audit trail for admin review
    await db.collection("locationEventAuditLog").insertOne({
        eventId: eventDef._id,
        locationId,
        executedAt: Date.now(),
        affectedMembers: membersInLocation,
        outcomes: resultsMap,
    });
}
```

**"What events happened at loc_prison today?"** (Admin query - scan audit log):

```typescript
const events = await db
    .collection("locationEventAuditLog")
    .find({
        locationId: "loc_prison",
        executedAt: { $gte: Date.now() - 86400000 },
    })
    .toArray();

// Shows summary of all events affecting all characters
```

### Pros & Cons

| Aspect              | Embed in Profile | Separate Audit Collection | Both               |
| ------------------- | ---------------- | ------------------------- | ------------------ |
| **Character Query** | ✅ Fast, atomic  | ❌ Slow (scan all)        | ✅ Both fast       |
| **Admin Query**     | ❌ Requires scan | ✅ Fast, indexed          | ✅ Both fast       |
| **Atomicity**       | ✅ Single write  | ❌ Two separate writes    | Partial            |
| **Storage**         | Lean             | Duplicate                 | Slightly redundant |

### RECOMMENDATION for locationEventExecutions

**Use Both Approaches:**

1. **Character profiles contain full history** (Layer 1)
    - Atomic with character state
    - Fast personal history queries
    - Single source of truth for "what happened to this character"

2. **Audit log for admin/compliance** (Layer 1 - secondary)
    - Indexed for "what happened at location X" queries
    - Maintains event counts and summaries
    - Enables faster admin UI queries

**Sync Strategy:**

- Character profile update is primary (guaranteed correct)
- Audit log update is secondary (can be rebuilt from profiles if needed)
- Use transaction if available, or async queue if not

---

## IMPLEMENTATION ROADMAP

### Phase 1: Define Collections (Week 1)

```typescript
// keypadAccessDefinitions (Layer 3)
await db.createCollection("keypadAccessDefinitions", {
    validator: {
        $jsonSchema: {
            required: ["doorKey", "accessGroups"],
            properties: {
                doorKey: { type: "string" },
                accessGroups: { type: "array" },
            },
        },
    },
});

// locationEventDefinitions (Layer 3)
await db.createCollection("locationEventDefinitions", {
    validator: {
        $jsonSchema: {
            required: ["eventType", "possibleOutcomes"],
            properties: {
                eventType: { type: "string" },
                possibleOutcomes: { type: "array" },
            },
        },
    },
});

// Add indexes
await db
    .collection("keypadGroupMemberships")
    .createIndex({ doorKey: 1, memberNumber: 1 });
await db
    .collection("locationEventAuditLog")
    .createIndex({ locationId: 1, executedAt: -1 });
```

### Phase 2: Add to UnifiedCharacterStore (Week 1)

```typescript
export class UnifiedCharacterStore {
    // Keypad access management
    async grantKeypadAccess(
        memberNumber: number,
        doorKey: string,
        groupName: string,
    ) {}
    async revokeKeypadAccess(memberNumber: number, doorKey: string) {}
    async getKeypadAccess(memberNumber: number): Promise<KeypadGrant[]> {}

    // Location event audit trail
    async addLocationEvent(memberNumber: number, event: LocationEvent) {}
    async getLocationEventHistory(
        memberNumber: number,
    ): Promise<LocationEvent[]> {}
}
```

### Phase 3: Create Services (Week 2)

```typescript
// New services matching three-layer pattern
export class KeypadAccessService {} // Layer 3: definitions
export class LocationEventService {} // Layer 3: definitions

// Existing services get updated
// UnifiedCharacterStore methods handle Layer 1
```

### Phase 4: Migrate Data (Week 2)

```bash
# For keypadAccessGroups → new structure
node scripts/migrate-keypad-access.js

# For locationEventExecutions → character profiles
node scripts/migrate-location-events.js
```

### Phase 5: Update Code (Week 3)

- Update all managers to use new services
- Test layer boundaries
- Run full test suite

---

## Key Takeaways

| Problem                       | Root Cause                         | Solution                                                                  |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| Character data in definitions | Storing membership/outcomes inline | Separate into character layer (embedded in profile or indexed collection) |
| Not atomic                    | Two-phase writes                   | Make character updates primary, audit logs secondary                      |
| Query performance             | N/A lookups                        | Index by doorKey/locationId, use aggregation pipelines                    |
| Maintainability               | Mixed responsibilities             | Clear separation: definitions (Layer 3) vs. membership (Layer 1)          |

**Golden Rule:** "If it contains character-specific data (membership, outcomes, audit trails), it belongs in Layer 1, not Layer 3."

---

## Summary Comparison

### keypadAccessGroups (Current → Proposed)

| Aspect                              | Current                          | Proposed                                 |
| ----------------------------------- | -------------------------------- | ---------------------------------------- |
| Structure                           | Single doc with embedded members | Layer 3 definitions + Layer 1 membership |
| Atomicity                           | ❌ Non-atomic                    | ✅ Atomic per character                  |
| Query "who has access?"             | ❌ Requires scanning all doors   | ✅ Indexed membership query              |
| Query "what access does char have?" | ❌ Requires scanning all doors   | ✅ Single profile lookup                 |
| Revocation                          | ❌ Two operations                | ✅ Single atomic write                   |

### locationEventExecutions (Current → Proposed)

| Aspect                             | Current                                      | Proposed                                        |
| ---------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| Structure                          | Event outcome records with affectedMembers[] | Layer 3 definitions + Layer 1 character history |
| Atomicity                          | ❌ Non-atomic                                | ✅ Atomic per character                         |
| Query "what events affected char?" | ❌ Requires scanning all events              | ✅ Single profile lookup                        |
| Query "what happened at location?" | ✅ Direct query                              | ✅ Audit log query (fast)                       |
| Audit trail                        | ❌ Mixed in outcomes                         | ✅ Separate audit collection                    |

**Both follow the three-layer pattern and are independently testable, just like the refactored Dare system.**
