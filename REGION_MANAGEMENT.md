# Veratown Region Management System

## Overview

The Region Management System allows Veratown features to operate on multi-tile areas where commands should only execute once per region entry, not once per tile. This prevents players from triggering the same action multiple times by moving around within a feature region.

## Architecture

### Components

1. **RegionManager** (`bin/games/veratown/regionManager.ts`)
   - In-memory cache of all regions
   - Character tracking per region (who's currently in which region)
   - Entry/exit lifecycle management
   - Database persistence via VeratownLocationStore

2. **VeratownRegion Interface**
   ```typescript
   interface VeratownRegion extends VeratownLocationDoc {
       type: "region";
       region: {
           TopLeft: { X: number; Y: number };
           BottomRight: { X: number; Y: number };
       };
       regionType: "game" | "dare" | "feature" | "custom";
   }
   ```

3. **VeratownLocationStore** (`bin/games/veratown/veratownLocationStore.ts`)
   - MongoDB backend for persistent region storage
   - Supports both point-based locations (x/y) and region-based locations (region boundaries)
   - Methods: `getAllLocations()`, `getLocation(key)`, `addLocation()`, `updateLocation()`, `deleteLocation()`

4. **Static Fallback Definitions** (`bin/games/veratown/veratownConfig.ts`)
   - `FEATURE_REGIONS_STATIC`: Pre-defined regions for game, dare, etc.
   - Used when database is empty or unavailable
   - Also used for conflict detection against dynamic database regions

## Key Features

### 1. Single Execution Per Region Entry

When a player enters a region, `markCharacterEntered()` returns `true` ONLY on first entry:

```typescript
// In a feature command handler
if (regionManager.markCharacterEntered("dare_region", sender.MemberNumber)) {
    // Execute dare command only once per region entry
    // This fires even if player moves around within the region
}

// When player exits region
regionManager.markCharacterLeft("dare_region", sender.MemberNumber);
```

### 2. Database-Backed Persistence

Regions are stored in MongoDB alongside other locations:

```typescript
// In database (veratownLocations collection)
{
    _id: "dare_region",
    key: "dare_region",
    name: "Dare Challenge Area",
    type: "region",
    regionType: "dare",
    region: {
        TopLeft: { X: 4, Y: 6 },
        BottomRight: { X: 16, Y: 14 }
    },
    label: "Dare Challenge Area",
    description: "Dare game zone - commands only trigger once per entry",
    enabled: true,
    createdAt: 1691234567890,
    updatedAt: 1691234567890
}
```

### 3. Conflict Detection

On startup, RegionManager validates that database regions match static definitions:

```
[RegionManager] Region conflict for "game_region": Database region differs 
from static definition. Using database version. Static: {...}, Database: {...}
```

This helps identify:
- Map rebalancing (coordinate changes)
- Admin command mistakes
- Accidental database corruption

### 4. Region Loading Order

1. **Load from database** via `locationStore.getAllLocations()`
2. **Add static fallbacks** via `addStaticRegion()` (only if not in database)
3. **Validate and log conflicts** via `validateRegions()`
4. **Ready for use** in feature command handlers

## Usage Examples

### Example 1: Basic Region Checking

```typescript
// In Dare.onCommandDare handler
public async onCommandDare(msg: BC_Server_ChatRoomMessage): Promise<void> {
    // Check if player is in dare region
    const regionManager = this.veratown.getRegionManager();
    
    if (!regionManager.isPositionInRegion(sender, "dare_region")) {
        msg.Sender.Tell("You must be in the dare area!");
        return;
    }
    
    // Single execution per region entry
    if (!regionManager.markCharacterEntered("dare_region", sender.MemberNumber)) {
        msg.Sender.Tell("You've already triggered a dare this round!");
        return;
    }
    
    // Execute dare logic...
}
```

### Example 2: Adding a Custom Region

```typescript
// Via admin command: !location region add battle_arena 10 5 20 15 custom "PvP Arena"
const newRegion: VeratownRegion = {
    key: "battle_arena",
    name: "Battle Arena",
    type: "region",
    regionType: "custom",
    region: {
        TopLeft: { X: 10, Y: 5 },
        BottomRight: { X: 20, Y: 15 }
    },
    label: "Battle Arena",
    description: "PvP Arena",
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
};

await regionManager.updateRegion(locationStore, newRegion);
// Now persisted to database, available on next bot restart
```

### Example 3: Listing Regions by Type

```typescript
// Get all game regions
const gameRegions = regionManager.getRegionsByType("game");
// Get all dare regions
const dareRegions = regionManager.getRegionsByType("dare");
// Get custom regions
const customRegions = regionManager.getRegionsByType("custom");
```

## Admin Commands

### Current Implementation Status

The `/bot location` command needs extension to support region CRUD:

```
!location region add <key> <TopLeftX> <TopLeftY> <BottomRightX> <BottomRightY> [type] [description]
!location region get <key>
!location region list [type]
!location region update <key> <TopLeftX> <TopLeftY> <BottomRightX> <BottomRightY>
!location region delete <key>
!location region validate
```

### Example Admin Commands (Proposed)

```
# Add new region for PvP area
!location region add pvp_zone 25 20 35 30 custom "PvP Battle Zone"

# List all game regions
!location region list game

# Show specific region details
!location region get dare_region

# Update region coordinates
!location region update dare_region 5 7 15 13

# Delete a region
!location region delete pvp_zone

# Validate all regions against static definitions
!location region validate
```

## Integration Checklist

### Completed ✅
- [x] RegionManager class with full API
- [x] VeratownRegion interface with database discriminator
- [x] VeratownLocationStore updated to support regions (x/y OR region boundaries)
- [x] Static region definitions in veratownConfig.ts
- [x] Region loading in Veratown.init()
- [x] Conflict detection on startup
- [x] Character entry/exit tracking with NEW entry detection
- [x] RegionManager exported from Veratown module

### Pending ⏳
- [ ] Update Dare feature to use regionManager.markCharacterEntered()
- [ ] Update Casino feature to use regionManager.markCharacterEntered()
- [ ] Extend VeratownAdminCommands with region CRUD commands
- [ ] Add `/bot location region` command family
- [ ] Create region visualization/debugging admin command
- [ ] Document admin region command usage in bot help
- [ ] Test end-to-end: add region via admin command → verify persists across restart

## Database Schema

### Region Document Example

```typescript
{
    _id: "game_region",
    key: "game_region",
    name: "Casino Game Area",
    type: "region",                        // Discriminator
    regionType: "game",                    // Classification
    region: {
        TopLeft: { X: 32, Y: 36 },
        BottomRight: { X: 38, Y: 39 }
    },
    label: "Casino Game Area",
    description: "Main casino/gambling area - commands only trigger once per entry",
    enabled: true,
    createdAt: 1691234567890,
    updatedAt: 1691234567890
}
```

### Index Strategy

Existing indexes on `veratownLocations`:
- `key: 1` (unique) - Fast lookup by region key
- `type: 1` - Query all regions via `type: "region"`

No additional indexes needed; existing ones support region queries efficiently.

## Conflict Resolution Strategy

When database region differs from static definition:

1. **Use database version** (takes priority)
2. **Log warning** with both static and database coordinates
3. **Continue operation** (don't crash on mismatch)
4. **Admin remediation**:
   - Option A: Delete database region, restart bot (reverts to static)
   - Option B: Update static definition in code (new default)
   - Option C: Keep database version as override (intentional mismatch)

## Performance Considerations

- **In-memory cache**: All regions loaded to Map at startup (typically <10 regions)
- **Character tracking**: Set of member numbers per region (typically <100 players)
- **Query performance**: O(1) region lookup, O(n) for region type filtering (n = total regions)
- **Database queries**: One bulk load during init(), individual updates for CRUD ops

## Testing Checklist

- [ ] Fresh database: Regions load from static fallbacks
- [ ] Database with regions: Regions load from database first
- [ ] Conflict detection: Modify database region, check logs for warnings
- [ ] Character entry/exit: Move into region, verify markCharacterEntered returns true once
- [ ] Character left tracking: Move out of region, re-enter, verify new entry
- [ ] Admin commands: Add/update/delete regions via commands, verify persistence
- [ ] Feature integration: Dare/Casino use regions for single-execution
- [ ] Restart persistence: Add region, restart bot, verify still present

## Future Enhancements

1. **Region visualization**: Admin command to show all regions on map
2. **Region inheritance**: Allow regions to inherit behavior from parent regions
3. **Overlapping regions**: Handle characters in multiple regions simultaneously
4. **Region events**: Trigger events when character enters/exits
5. **Region permissions**: Region-based access control for commands
6. **Auto-region detection**: Analyze feature locations and auto-create regions

## Troubleshooting

### Issue: Regions not loading
**Symptom**: `[RegionManager] Loaded 0 regions from database` even after adding regions

**Causes**:
- Database connection issue (check MongoDB logs)
- Regions stored with type="region" but without region boundary object
- Region coordinates not in expected format

**Fix**: 
```typescript
// Verify in MongoDB
db.veratownLocations.find({ type: "region" }).pretty()

// Should show region objects with TopLeft/BottomRight structure
```

### Issue: Static regions not overriding defaults
**Symptom**: Changes to FEATURE_REGIONS_STATIC don't take effect

**Causes**:
- Regions already in database (database takes priority)
- Static definitions weren't recompiled

**Fix**:
```bash
# Option 1: Delete database regions
mongo veratown --eval "db.veratownLocations.deleteMany({ type: 'region' })"
docker-compose restart ropeybot

# Option 2: Update database regions directly
db.veratownLocations.updateOne(
    { key: "game_region" },
    { $set: { region: { TopLeft: {X, Y}, BottomRight: {X, Y} } } }
)
```

### Issue: Commands triggering on every tile movement
**Symptom**: !dare command triggers multiple times in same region

**Causes**:
- Feature code not calling `regionManager.markCharacterEntered()`
- Character not marked as entered region

**Fix**:
```typescript
// WRONG - triggers on every message
if (isPositionInRegion(pos, "dare_region")) {
    executeDare();
}

// CORRECT - triggers once per entry
if (regionManager.markCharacterEntered("dare_region", memberId)) {
    executeDare();
}
```

## References

- **RegionManager Implementation**: [bin/games/veratown/regionManager.ts](bin/games/veratown/regionManager.ts)
- **Location Store**: [bin/games/veratown/veratownLocationStore.ts](bin/games/veratown/veratownLocationStore.ts)
- **Veratown Integration**: [bin/games/veratown.ts](bin/games/veratown.ts)
- **Static Regions**: [bin/games/veratown/veratownConfig.ts](bin/games/veratown/veratownConfig.ts)
