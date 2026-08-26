# Appearance Inspection Helpers - Proposed Structure

## Overview

Generic helpers for checking character appearance across all veratown modules. These replace ad-hoc pattern implementations like `getEquippedClothing()` and enable consistent detection across parole, release, restraint, and future systems.

## Proposed Helper Functions

### Core Helpers

#### 1. `getItemsInGroups(character, groups)`

**Purpose**: Get all equipped items in specified groups

```typescript
getItemsInGroups(
    character: API_Character,
    groups: Set<string> | string[]
): Map<string, string>
```

**Returns**: Map of `{group -> itemName}` for all equipped items in groups
**Use Cases**:

- Clothing detection: `getItemsInGroups(char, clothingGroups)`
- Restraint detection: `getItemsInGroups(char, restraintGroups)`
- Furniture detection: `getItemsInGroups(char, furnitureGroups)`
- Body inspection: `getItemsInGroups(char, bodyPartGroups)`

---

#### 2. `hasItemInGroups(character, groups)`

**Purpose**: Check if ANY item equipped in specified groups

```typescript
hasItemInGroups(
    character: API_Character,
    groups: Set<string> | string[]
): boolean
```

**Returns**: `true` if any item found, `false` if none
**Use Cases**:

- Quick clothing check: `hasItemInGroups(char, clothingGroups)` → `!result = isNaked()`
- Quick restraint check: `hasItemInGroups(char, restraintGroups)`
- Quick lock check: `hasItemInGroups(char, lockGroups)`

---

#### 3. `compareAppearanceSnapshots(before, after)`

**Purpose**: Detect changes between two appearance maps

```typescript
compareAppearanceSnapshots(
    before: Map<string, string>,
    after: Map<string, string>
): {
    added: Map<string, string>;
    removed: Map<string, string>;
    changed: Map<string, {before: string; after: string}>;
}
```

**Returns**: Objects showing what was added, removed, or changed
**Use Cases**:

- Parole violation detection: Compare starting appearance vs current
- Outfit change detection: Log when character changes items
- Escape monitoring: Detect when restraints are removed
- Fashion tracking: Monitor cosmetic changes over time

---

### Specialized Helpers

#### 4. `hasSpecificItem(character, group, itemName)`

**Purpose**: Check if exact item is equipped

```typescript
hasSpecificItem(
    character: API_Character,
    group: string,
    itemName: string
): boolean
```

**Use Cases**:

- Lock verification: `hasSpecificItem(char, "ItemMisc", "TimerPadlock")`
- Specific restraint checks: `hasSpecificItem(char, "ItemArms", "LeatherArmbinder")`

---

#### 5. `getItemCountInGroups(character, groups)`

**Purpose**: Count equipped items

```typescript
getItemCountInGroups(
    character: API_Character,
    groups: Set<string> | string[]
): number
```

**Use Cases**:

- Severity tracking: How many clothing items?
- Restraint scoring: How restrained is the character?

---

## File Structure

```
bin/utils/
├── appearanceHelpers.ts          (NEW - generic helpers)
└── groupDefinitions.ts           (NEW - predefined group sets)

bin/games/veratown/
└── veratownReleaseSystem.ts       (REFACTOR - use helpers)
```

## Predefined Group Sets

```typescript
// groupDefinitions.ts - Predefined group collections
export const CLOTHING_GROUPS = new Set([
    "Bra",
    "Corset",
    "Shirt",
    "Top",
    "Panties",
    "Bottom",
    "Dress",
    "Swimsuit",
    "Uniform",
    "Jacket",
    "OuterClothes",
    "Shoes",
    "Socks",
    "Stockings",
    "Gloves",
    "Hat",
    "Hair",
    "Mask",
    "Cloth",
    "ClothAccessory",
    "ClothLower",
    "ClothUpper",
]);

export const RESTRAINT_GROUPS = new Set([
    "ItemArms",
    "ItemLegs",
    "ItemTorso",
    "ItemFeet",
    "ItemHead",
    "ItemNeck",
    "ItemMouth",
    "ItemEars",
    "ItemNose",
]);

export const LOCK_GROUPS = new Set([
    "ItemMisc", // Locks live here in BC
]);

export const FURNITURE_GROUPS = new Set([
    "Furniture",
    "ItemFurniture", // Various BC versions
]);
```

---

## Current Usage Locations

### Parole System (Primary target for refactoring)

1. **Nudity checks**: `getEquippedClothing()` → `getItemsInGroups(char, CLOTHING_GROUPS)`
2. **Violation detection**: `compareAppearanceSnapshots()` for bidirectional checks
3. **Compliance verification**: `hasItemInGroups(char, CLOTHING_GROUPS)` for quick checks

### Future Modules

- **Restraint monitoring**: Check escape attempts
- **Outfit tracking**: Monitor fashion changes
- **Punishment system**: Verify cosmetic restrictions
- **Device monitoring**: Track lock/timer states

---

## Migration Plan

### Phase 1: Create helpers (ready to implement)

- Create `bin/utils/appearanceHelpers.ts` with core 5 functions
- Create `bin/utils/groupDefinitions.ts` with predefined group sets
- No changes to existing code

### Phase 2: Refactor ReleaseSystem (after parole logic fixed)

- Replace `getEquippedClothing()` with `getItemsInGroups()`
- Replace `hasAnyClothing()` with `hasItemInGroups()`
- Simplify `isCharacterNaked()` to one-liner
- Use `compareAppearanceSnapshots()` in violation checks

### Phase 3: Adopt in other modules

- Restraint tracking
- Furniture detection
- Future features

---

## Benefits

| Aspect          | Benefit                         |
| --------------- | ------------------------------- |
| **DRY**         | One implementation, many uses   |
| **Consistency** | Same pattern across all modules |
| **Testing**     | Unit test once, use everywhere  |
| **Debugging**   | Centralized logging             |
| **Performance** | Optimizable in one place        |
| **Flexibility** | Easy to add new groups/filters  |
| **Maintenance** | BC API changes = one fix        |
