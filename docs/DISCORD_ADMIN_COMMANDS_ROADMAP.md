# Discord Admin Commands Roadmap

**Purpose**: Expose BC Bot administrative functionality via Discord for remote management without requiring in-game access.

**Target Users**: Room admins, bot managers, game designers who need to configure Veratown remotely.

---

## Command Categories & Proposals

### 1. Feature Management (5 commands)

Enable/disable Veratown subsystems from Discord.

```
/feature-list
  Description: List all available features and their current status
  Returns:
    - Feature names (cage, kennel, shower, bed, bunnyPark, window, trashcan, dare, casino)
    - Current enabled/disabled state
    - Brief description of each

/feature-enable <name>
  Description: Enable a specific feature
  Parameters:
    - name: Feature to enable (cage|kennel|shower|bed|bunnyPark|window|trashcan|dare|casino)
  Returns: "✅ Feature '<name>' enabled" or error message

/feature-disable <name>
  Description: Disable a specific feature
  Parameters:
    - name: Feature to disable
  Returns: "✅ Feature '<name>' disabled" or error message

/feature-status <name>
  Description: Check detailed status of one feature
  Parameters:
    - name: Feature name
  Returns:
    - Enabled/disabled status
    - Configuration details if available
    - Related locations/entities
```

---

### 2. Location Management (8+ commands)

Full CRUD for location database (keypads, furniture, NPCs, regions).

```
/location-list [type]
  Description: List all locations or filter by type
  Parameters:
    - type: Optional filter (keypad_door, furniture, npc, cage, kennel, etc.)
  Returns: Table of locations with key, name, type, coordinates, enabled status
  Pagination: 10 per page

/location-create <key> <name> <type> <x> <y> [metadata]
  Description: Create new location
  Parameters:
    - key: Unique identifier (prison_cell_1_door)
    - name: Display name
    - type: Location type (keypad_door, furniture, npc, etc.)
    - x: X coordinate
    - y: Y coordinate
    - metadata: JSON metadata (optional, formatted in help)
  Returns: "✅ Location '<key>' created at (x, y)" with details embed

/location-get <key>
  Description: View detailed information about one location
  Parameters:
    - key: Location key
  Returns:
    - Key, name, type, coordinates
    - Enabled status
    - Metadata (formatted in embed fields)
    - Related entities (doors, keypads, etc.)
    - Creation date, last modified

/location-update <key> <field> <value>
  Description: Update a location field
  Parameters:
    - key: Location key
    - field: Field path (name|type|x|y|enabled|data.<nested>)
    - value: New value (auto-parsed as string/number/JSON)
  Returns: "✅ Updated <field> from '<old>' to '<new>'"
  Examples:
    - `/location-update prison_cell_1_door x 25`
    - `/location-update prison_cell_1_door data.codes.guest "NEWCODE"`

/location-delete <key>
  Description: Delete a location
  Parameters:
    - key: Location key
  Returns: "✅ Location '<key>' deleted" (with confirmation required)

/location-enable <key>
  Description: Enable a location
  Parameters:
    - key: Location key
  Returns: "✅ Location '<key>' is now active"

/location-disable <key>
  Description: Disable a location
  Parameters:
    - key: Location key
  Returns: "✅ Location '<key>' is now inactive"

/location-template <type>
  Description: Show JSON template for creating a location
  Parameters:
    - type: Location type (keypad_door, furniture, cage, etc.)
  Returns:
    - JSON template with all required/optional fields
    - Field descriptions
    - Example values
```

---

### 3. Door/Keypad System (10+ commands)

Manage access control, door codes, whitelist, and door definitions.

```
/door-list
  Description: List all door definitions
  Returns: Table with doorKey, coordinates, status, active keypads count

/door-create <key> <x> <y> <locked-tile> <unlocked-tile> [duration]
  Description: Create a new door definition
  Parameters:
    - key: Door identifier (prison_cell_1_door)
    - x: X coordinate
    - y: Y coordinate
    - locked-tile: Tile when locked (MetalDown)
    - unlocked-tile: Tile when unlocked (SteelDoorOpen)
    - duration: Unlock duration in ms (default: 10000)
  Returns: "✅ Door '<key>' created with tiles '<locked-tile>' → '<unlocked-tile>'"

/door-update <key> <field> <value>
  Description: Update door definition field
  Parameters:
    - key: Door key
    - field: Field (x|y|lockedTile|unlockedTile|unlockDurationMs)
    - value: New value
  Returns: "✅ Updated door '<key>' field '<field>'"

/door-delete <key>
  Description: Delete a door definition
  Parameters:
    - key: Door key
  Returns: "✅ Door '<key>' deleted" (with confirmation)

/door-info <key>
  Description: Show detailed door information
  Parameters:
    - key: Door key
  Returns:
    - Door coordinates and tile configuration
    - All access groups and their codes
    - Associated keypads
    - Whitelist members
    - Unlock duration

/access-grant <door-key> <member-number> <group>
  Description: Grant a player access to a door
  Parameters:
    - door-key: Which door
    - member-number: Player member number
    - group: Access group (admin|whitelist|custom)
  Returns: "✅ Granted <group> access to member #<member-number> for door '<door-key>'"

/access-revoke <member-number> [door-key] [group]
  Description: Revoke access from a player
  Parameters:
    - member-number: Player member number
    - door-key: Optional - specific door (blank = all doors)
    - group: Optional - specific group
  Returns: "✅ Revoked access for member #<member-number>"

/access-list [door-key]
  Description: List members with access
  Parameters:
    - door-key: Optional - filter by door
  Returns: Table with member number, name, access groups, granted date

/code-set <door-key> <group> <code>
  Description: Update access code for a group
  Parameters:
    - door-key: Which door
    - group: Which group (guest|whitelist|admin)
    - code: New access code
  Returns: "✅ Updated <group> code for door '<door-key>'"

/whitelist-add <door-key> <member-number>
  Description: Add member to door whitelist
  Parameters:
    - door-key: Which door
    - member-number: Player member number
  Returns: "✅ Added member #<member-number> to whitelist for '<door-key>'"

/whitelist-remove <door-key> <member-number>
  Description: Remove member from whitelist
  Parameters:
    - door-key: Which door
    - member-number: Player member number
  Returns: "✅ Removed member #<member-number> from whitelist for '<door-key>'"

/whitelist-list <door-key>
  Description: Show all whitelisted members for a door
  Parameters:
    - door-key: Which door
  Returns: Table with member numbers and names
```

---

### 4. Access Group Management (6+ commands)

Manage custom access groups and their permissions.

```
/group-list [door-key]
  Description: List access groups
  Parameters:
    - door-key: Optional - filter by door
  Returns: Table with group name, access level, member count, description

/group-create <door-key> <name> <code> [type] [description]
  Description: Create custom access group
  Parameters:
    - door-key: Which door
    - name: Group name (must be unique per door)
    - code: Access code for group
    - type: Optional group type (security category)
    - description: Optional group description
  Returns: "✅ Created group '<name>' for door '<door-key>'"

/group-update <door-key> <name> <field> <value>
  Description: Update group configuration
  Parameters:
    - door-key: Which door
    - name: Group name
    - field: Field (code|type|description|unlockDurationMs)
    - value: New value
  Returns: "✅ Updated group '<name>' field '<field>'"

/group-delete <door-key> <name>
  Description: Delete access group
  Parameters:
    - door-key: Which door
    - name: Group name
  Returns: "✅ Deleted group '<name>' from door '<door-key>'" (with confirmation)

/group-info <door-key> <name>
  Description: Show group details
  Parameters:
    - door-key: Which door
    - name: Group name
  Returns:
    - Group name, type, description
    - Member count
    - Code (masked for security)
    - Unlock duration
    - Created date

/group-members <door-key> <name>
  Description: List members of a group
  Parameters:
    - door-key: Which door
    - name: Group name
  Returns: Table with member numbers, names, joined dates
```

---

### 5. Map Configuration (4 commands)

Manage room layout and map data.

```
/map-status
  Description: Show current map information
  Returns:
    - Map dimensions
    - Loaded status
    - Last saved date/admin
    - Active tile count

/map-update
  Description: Save current room layout to database
  Returns: "✅ Current room layout saved as new default" or error

/map-export
  Description: Export current map for backup
  Returns:
    - Compressed base64 encoded map data
    - Instructions for import
    - Suggested filename with timestamp

/map-import <data>
  Description: Import previously exported map layout
  Parameters:
    - data: Compressed base64 map data (can be attached as file)
  Returns: "✅ Map layout imported and active" or error
  Requires confirmation for safety
```

---

### 6. Region Management (5+ commands)

Manage geographic regions for gameplay mechanics.

```
/region-list [location-type]
  Description: List all regions
  Parameters:
    - location-type: Optional filter
  Returns: Table with region name, type, coordinates, feature

/region-create <name> <type> <x1> <y1> <x2> <y2>
  Description: Define a new region
  Parameters:
    - name: Region identifier (prison_yard, cage_area, etc.)
    - type: Region type (prison|cage|kennel|restricted|sandbox)
    - x1, y1: Top-left corner
    - x2, y2: Bottom-right corner
  Returns: "✅ Region '<name>' created covering area (x1,y1) to (x2,y2)"

/region-update <name> <field> <value>
  Description: Update region configuration
  Parameters:
    - name: Region name
    - field: Field (type|x1|y1|x2|y2|feature|description)
    - value: New value
  Returns: "✅ Updated region '<name>' field '<field>'"

/region-delete <name>
  Description: Delete a region
  Parameters:
    - name: Region name
  Returns: "✅ Region '<name>' deleted"

/region-info <name>
  Description: Show region details
  Parameters:
    - name: Region name
  Returns:
    - Region boundaries and dimensions
    - Type and feature configuration
    - Entities within region
    - Overlapping regions
```

---

### 7. Audit & Monitoring (5+ commands)

View logs, audit trails, and system status.

```
/audit-list <type> [limit]
  Description: List audit trail entries
  Parameters:
    - type: Entry type (appearance|location|door|access|feature)
    - limit: Number of entries (default: 20, max: 100)
  Returns: Table with timestamp, actor, action, target, changes

/audit-trail <member-number> [limit]
  Description: Show all changes made by/to a player
  Parameters:
    - member-number: Player member number
    - limit: Number of entries (default: 20)
  Returns: Table with all audit entries for that player

/audit-export <type> [start-date] [end-date]
  Description: Export audit log range as CSV/JSON
  Parameters:
    - type: Entry type or "all"
    - start-date: Start date (optional, default: 7 days ago)
    - end-date: End date (optional, default: now)
  Returns: CSV/JSON file attachment

/system-status
  Description: Show system health and statistics
  Returns:
    - Connection status (BC bot, Discord, Database)
    - Player count and activity
    - Feature status
    - Performance metrics
    - Last errors or warnings

/maintenance-log [limit]
  Description: Show recent maintenance and error logs
  Parameters:
    - limit: Number of entries (default: 20)
  Returns: Table with timestamp, level (info/warn/error), message
```

---

### 8. Furniture & Object Management (6+ commands)

Manage interactive furniture and other game objects.

```
/furniture-list [type]
  Description: List all furniture objects
  Parameters:
    - type: Optional filter (bondage|security|decoration)
  Returns: Table with key, name, type, location, enabled status

/furniture-create <key> <name> <type> <x> <y> [data]
  Description: Add new furniture to the game
  Parameters:
    - key: Furniture identifier (cage_01_frame, etc.)
    - name: Display name
    - type: Type (bondage|security|decoration|interactive)
    - x, y: Coordinates
    - data: JSON configuration (optional)
  Returns: "✅ Furniture '<key>' created at (x, y)"

/furniture-update <key> <field> <value>
  Description: Update furniture property
  Parameters:
    - key: Furniture key
    - field: Field path (enabled|x|y|data.<nested>)
    - value: New value
  Returns: "✅ Updated furniture '<key>' field '<field>'"

/furniture-delete <key>
  Description: Remove furniture from game
  Parameters:
    - key: Furniture key
  Returns: "✅ Furniture '<key>' deleted"

/furniture-info <key>
  Description: Show furniture details
  Parameters:
    - key: Furniture key
  Returns:
    - Name, type, coordinates
    - Configuration and properties
    - Related locations
    - Last modified info

/furniture-enable|disable <key>
  Description: Toggle furniture active state
  Parameters:
    - key: Furniture key
  Returns: "✅ Furniture '<key>' is now active/inactive"
```

---

### 9. Player Position & State (3+ commands)

Monitor and adjust player positions and conditions.

```
/player-position <member-number>
  Description: Get player's current location
  Parameters:
    - member-number: Player member number
  Returns:
    - Player name
    - Current room coordinates
    - Current region (if in one)
    - Nearby entities

/player-teleport <member-number> <x> <y>
  Description: Move player to coordinates (restricted to admins)
  Parameters:
    - member-number: Player member number
    - x, y: Target coordinates
  Returns: "✅ Teleported '<player>' to (x, y)"
  Requires admin confirmation

/player-state <member-number>
  Description: Show player's condition/state
  Parameters:
    - member-number: Player member number
  Returns:
    - Position and region
    - Active conditions (caged, bound, etc.)
    - Game progression
    - Last activity timestamp
```

---

### 10. Configuration Management (4+ commands)

System-level settings and bulk operations.

```
/config-get [key]
  Description: View configuration settings
  Parameters:
    - key: Optional - specific config key
  Returns:
    - Current settings (filtered for safety)
    - Types and descriptions
    - Last modified info

/config-set <key> <value>
  Description: Update a configuration setting
  Parameters:
    - key: Config key (features.cage.enabled, etc.)
    - value: New value
  Returns: "✅ Updated config '<key>'"
  Requires admin confirmation for sensitive settings

/backup-export
  Description: Export full game state as backup
  Returns:
    - Compressed backup file
    - Contains: locations, doors, groups, settings, player data
    - Instructions for restore

/backup-import <file>
  Description: Restore from backup
  Parameters:
    - file: Backup file attachment
  Returns: "✅ Backup restored" (with confirmation required)
```

---

### 11. Batch Operations (4 commands)

Perform bulk actions efficiently.

```
/batch-enable-feature <feature> <location-filter>
  Description: Enable feature for multiple locations
  Parameters:
    - feature: Feature name
    - location-filter: Location type to filter (e.g., "cage", or "all")
  Returns:
    - Count of affected locations
    - Results summary

/batch-disable-location <type> [reason]
  Description: Disable all locations of a type
  Parameters:
    - type: Location type
    - reason: Optional reason for audit log
  Returns: "✅ Disabled <count> locations of type '<type>'"

/batch-update-code <old-code> <new-code> [group]
  Description: Replace access code across multiple doors
  Parameters:
    - old-code: Code to find
    - new-code: Code to replace
    - group: Optional - only in specific group
  Returns:
    - Count of doors updated
    - List of affected doors

/batch-migrate-locations <source-type> <target-type>
  Description: Convert all locations from one type to another
  Parameters:
    - source-type: Original type
    - target-type: New type
  Returns: "✅ Migrated <count> locations"
  Requires confirmation and backup
```

---

## Implementation Phases

### Phase 1: Core (6 commands)

- `/feature-list`, `/feature-enable`, `/feature-disable`
- `/location-list`, `/location-get`, `/location-create`

### Phase 2: Doors & Access (8 commands)

- `/door-list`, `/door-create`, `/door-info`
- `/access-grant`, `/access-revoke`, `/access-list`
- `/code-set`, `/whitelist-add`

### Phase 3: Advanced Management (8 commands)

- Location CRUD completeness
- Region management
- Map management
- Audit logging

### Phase 4: Bulk Operations & Monitoring (6+ commands)

- Batch operations
- Advanced auditing
- System monitoring
- Backup/restore

---

## Database Schema Mapping

### UnifiedCharacterProfile Collection

```
Accessible via:
  - /player-* commands (read-only)
  - /audit-trail (read-only)
```

### VeratownLocationStore Collection

```
Accessible via:
  - /location-* commands (full CRUD)
  - /door-* commands (CRUD for door-type locations)
  - /furniture-* commands (CRUD for furniture-type locations)
```

### KeypadGroupDefinition Collection

```
Accessible via:
  - /group-* commands (full CRUD)
  - /access-* commands (create/read)
```

### VeratownMapStore Collection

```
Accessible via:
  - /map-* commands (read/update/export/import)
```

### AuditTrail Collection

```
Accessible via:
  - /audit-* commands (read-only)
```

---

## Security Considerations

1. **Permission Levels**
    - All commands require `isAdmin` flag
    - Sensitive operations (delete, code change) require explicit confirmation
    - Audit log all modifications with admin who made change

2. **Data Validation**
    - Validate coordinates within map bounds
    - Validate member numbers against unified store
    - Validate door keys, location keys are unique
    - Validate codes meet minimum complexity

3. **Rate Limiting**
    - Batch operations limited to 100 items/operation
    - Location queries limited to 50 results/page
    - Export operations rate-limited (1 per admin per minute)

4. **Audit Trail**
    - All CRUD operations logged with admin ID, timestamp, old/new values
    - Bulk operations tracked as single audit entry with count
    - Sensitive data (codes) masked in logs

5. **Backup/Restore**
    - Backup exports only available to head admins
    - Restore operations require confirmation + audit logging
    - Automatic backup before major imports

---

## Usage Examples

### Create Prison Cell with Access Control

```
/location-create prison_cell_1 "Prison Cell 1" keypad_door 25 15 {"doorX":25,"doorY":14,"lockedTile":"MetalDown","unlockedTile":"SteelDoorOpen"}

/access-grant prison_cell_1 123456 admin
/access-grant prison_cell_1 789012 whitelist
/code-set prison_cell_1 admin "SECUREPASS"
/code-set prison_cell_1 whitelist "GUESTPASS"
```

### Manage Cage System

```
/feature-enable cage
/location-list cage
/location-update cage_01 data.allowedMembers "[123456, 789012]"
```

### Bulk Enable Feature

```
/batch-enable-feature bondage cage
# Enables bondage feature for all cage locations
```

---

## Future Extensions

- **Webhook Integration**: Get notified of specific events
- **Scheduled Tasks**: Automated maintenance at specific times
- **Conditional Logic**: Actions triggered by game events
- **Custom Aliases**: Administrators create shorthand commands
- **Role-Based Access**: Fine-grained permissions within admins
- **Dashboard UI**: Web-based admin panel for complex operations
