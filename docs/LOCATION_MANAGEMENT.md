# Location Management System

This document describes how to use Veratown's location management commands for creating, updating, and managing various location types.

## Quick Start

The location system is built on a structured template system with guided commands:

```
/bot location help           # Show all available commands with examples
/bot location types          # List all location types
/bot location template <type># Show JSON template for a specific type
/bot location search <keyword> # Find types by keyword (e.g., "door", "cage")
```

## Available Location Types

### Confined/Interaction Spaces

- **cage** - A location where characters can be confined
- **kennel** - A kennel location for confinement
- **bed** - A bed location for resting or roleplay
- **trashcan** - A trashcan location

### Access Control

- **keypad_door** - A code-locked door with access groups (admin, whitelist, guest)

### Views & Information

- **window** - A window location for viewing
- **help_monitor** - A help information display

### Pet/Role-Playing

- **bunny** - A location in the bunny park
- **bot_position** - A bot starting/home position
- **shower** - A shower location
- **shower_bot_home** - Home position for shower bot

### Multi-Tile Regions

- **park_region** - Bunny park region
- **dare_region** - Dare game region
- **game_region** - Game location region
- **cage_info_region** - Region for cage information
- **region** - Custom multi-tile region

### Custom

- **other** - Custom location type

## Creating Locations

### 1. Get the Template

```
/bot location template keypad_door
```

Output shows the JSON structure, required fields, and examples.

### 2. Create the Location

Using the simple format (works for point-based locations):

```
/bot location add my_cage My_Cage cage 15 20
```

Using JSON metadata (for complex locations like keypads):

```
/bot location add basement_keypad Basement_Keypad keypad_door 10 8 {"doorX":20,"doorY":10,"lockedTile":"MetalDown","unlockedTile":"SteelDoorOpen","unlockDurationMs":10000,"codes":{"admin":"SECRET123"}}
```

### 3. Verify Creation

```
/bot location get basement_keypad
/bot location list keypad_door
```

## Keypad Door Example

Create a keypad door with admin and guest access:

```
/bot location template keypad_door
# Shows the full structure...

/bot location add vault_keypad Vault_Door keypad_door 25 15 {"doorX":25,"doorY":14,"lockedTile":"WoodLocked","unlockedTile":"WoodOpen","unlockDurationMs":10000,"codes":{"admin":"ADMINCODE","guest":"GUESTCODE"},"whitelistMemberNumbers":[123456]}
```

Then manage it at the keypad tile:

```
!door help                              # Show all door commands
!door list                              # Show configuration
!door change-code admin NEWADMINCODE   # Change admin code
!door add-user 789012                  # Add whitelist member
!door unlock 30                         # Manually unlock for 30 seconds
!door enable                            # Re-enable the keypad
```

## Managing Locations

### List Locations

```
/bot location list              # Show all locations
/bot location list keypad_door  # Show only keypads
/bot location list cage         # Show only cages
```

### Get Details

```
/bot location get basement_keypad
```

### Update Location

```
/bot location update my_cage name My_New_Cage_Name
/bot location update my_cage x 20
/bot location update my_cage data {"custom":"metadata"}
```

### Enable/Disable

```
/bot location enable basement_keypad   # Re-enable a disabled keypad
/bot location disable my_cage          # Temporarily disable without deleting
```

### Delete Location

```
/bot location delete my_cage
```

## Region Locations

For multi-tile locations (parks, game areas, etc.):

```
/bot location region add my_park My_Park park_region 10 10 50 50
```

This creates a region from coordinates (10,10) to (50,50).

### Update Region Boundaries

```
/bot location region update my_park 15 15 60 60
```

### Delete Region

```
/bot location region delete my_park
```

### List Regions

```
/bot location region list
```

## Tips & Best Practices

### Choosing Location Types

Use the search feature to find what you need:

```
/bot location search door       # Find door-related types
/bot location search cage       # Find cage-related types
/bot location search region     # Find region types
```

### Coordinates

- Point-based locations need `x` and `y` coordinates (exact tile)
- Region-based locations need `TopLeftX`, `TopLeftY`, `BottomRightX`, `BottomRightY`
- Use `!map nearby` or other tools to determine map coordinates

### JSON Metadata

Complex locations like keypads require JSON metadata:

```json
{
  "doorX": 20,
  "doorY": 10,
  "lockedTile": "WoodLocked",
  "unlockedTile": "WoodOpen",
  "unlockDurationMs": 10000,
  "codes": {
    "admin": "CODE1",
    "whitelist": "CODE2",
    "guest": "CODE3"
  },
  "whitelistMemberNumbers": [123456, 789012]
}
```

### Database Synchronization

All location changes are automatically:
- Persisted to MongoDB
- Detected via change streams
- Synchronized across all bot features

No manual reload needed!

## Command Reference

| Command | Purpose |
| --- | --- |
| `/bot location help` | Show all commands and usage |
| `/bot location types` | List all location types |
| `/bot location template <type>` | Show template for a type |
| `/bot location search <keyword>` | Find types by keyword |
| `/bot location add <key> <name> <type> <x> <y> [json]` | Create location |
| `/bot location get <key>` | Show location details |
| `/bot location update <key> <field> <value>` | Update a field |
| `/bot location delete <key>` | Delete location |
| `/bot location list [type]` | List locations |
| `/bot location enable <key>` | Enable location |
| `/bot location disable <key>` | Disable location |
| `/bot location region add <key> <x1> <y1> <x2> <y2>` | Create region |
| `/bot location region update <key> <x1> <y1> <x2> <y2>` | Update region |
| `/bot location region delete <key>` | Delete region |
| `/bot location region list` | List regions |

## Troubleshooting

### Location Not Working

1. Check it's enabled: `/bot location get <key>` (look for `enabled: true`)
2. Verify coordinates: `/bot location list` shows the position
3. Check location type is supported: `/bot location types`

### Changes Not Taking Effect

1. Verify the update succeeded: `/bot location get <key>`
2. Check feature status: `/bot status` (should show feature loaded)
3. Look for errors in bot console

### JSON Parsing Errors

- Wrap JSON in single quotes: `'/bot location add ... '{"key":"value"}'`
- Use proper JSON syntax (double quotes, no trailing commas)
- For complex JSON, use file editors to validate syntax first

