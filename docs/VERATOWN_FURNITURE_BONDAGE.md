# Veratown Furniture Bondage System

This document describes the configurable bondage furniture system in Veratown.
The feature is implemented by `bin/games/veratown/furnitureBondageSystem.ts` and is
loaded and reloaded by the Veratown orchestrator.

## Overview

The furniture bondage system allows admins to create highly configurable bondage
furniture tiles that automatically apply restraints to characters who step on them.
Unlike the hardcoded kennel and cage systems, this system supports any furniture
object and any combination of restraints, with optional automatic duration-based
removal.

## How It Works

A `furniture` location places a bondage furniture tile at the location's `x` and `y`
coordinates. When a character stands on that tile, the system:

1. Adds the configured furniture item to the character
2. Optionally applies one or more restraint items after a configurable delay
3. Optionally removes both furniture and restraints after a set duration

Everything is controlled by the location's `data` configuration block.

## Location Schema

The location must have:
- `type: "furniture"`
- Valid `x` and `y` coordinates
- `enabled: true`
- `data.furnitureAsset` (the furniture object to add)
- Optionally: `data.restraints`, `data.durationMs`, and other configuration

### Minimal Example

```json
{
  "key": "furniture_bed_simple",
  "name": "Simple Bed",
  "type": "furniture",
  "x": 20,
  "y": 30,
  "enabled": true,
  "data": {
    "furnitureAsset": "Bed"
  }
}
```

### Full Featured Example

```json
{
  "key": "furniture_bondage_complete",
  "name": "Complete Bondage Setup",
  "type": "furniture",
  "x": 25,
  "y": 35,
  "enabled": true,
  "data": {
    "furnitureAsset": "Bed",
    "furnitureGroup": "ItemDevices",
    "furnitureExtendedType": "Soft",
    "furnitureColor": "#000000",
    "furnitureProperties": {},
    "craftDescription": "Bondage furniture setup",
    "restraints": [
      {
        "group": "ItemArms",
        "asset": "LeatherCuffs",
        "extendedType": "Cuffs",
        "difficulty": 20,
        "color": "#000000"
      },
      {
        "group": "ItemLegs",
        "asset": "NylonRope",
        "difficulty": 18,
        "color": "#FF69B4"
      }
    ],
    "applyDelayMs": 2000,
    "durationMs": 120000
  }
}
```

## Configuration Fields

### Furniture Configuration

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `furnitureAsset` | string | ✅ | The asset name (e.g., "Bed", "Kennel", "Pole", "WoodenBox") |
| `furnitureGroup` | string | ❌ | Asset group (default: "ItemDevices") |
| `furnitureExtendedType` | string | ❌ | Extended type variant for furniture |
| `furnitureColor` | string | ❌ | Hex color code for furniture (e.g., "#000000") |
| `furnitureProperties` | object | ❌ | Furniture-specific TypeRecord properties (e.g., { d: 0, p: 1 }) |
| `craftDescription` | string | ❌ | Craft description (default: "Bondage furniture from [location]") |

### Restraint Configuration

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `restraints` | array | ❌ | Array of restraint configurations |

Each restraint object in the array:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `group` | string | ✅ | Asset group (e.g., "ItemMouth", "ItemArms", "ItemLegs") |
| `asset` | string | ✅ | Asset name (e.g., "BallGag", "LeatherCuffs", "NylonRope") |
| `extendedType` | string | ❌ | Type variant (e.g., "Tight", "Cuffs", "Hogtied") |
| `difficulty` | number | ❌ | Lock difficulty 0-50 (default: 20) |
| `color` | string | ❌ | Hex color code (uses asset default if not specified) |

### Timing Configuration

| Field | Type | Description |
| --- | --- | --- |
| `applyDelayMs` | number | Delay (ms) before restraints are applied (default: 0) |
| `durationMs` | number | Duration (ms) until furniture and restraints are automatically removed. Omit for permanent attachment. |

## Available Furniture Assets

Common furniture items from ItemDevices group:

- **Bed** - Standard bed (supports extended types like "Soft")
- **Kennel** - Pet kennel (supports door open/close via TypeRecord)
- **FuturisticCrate** - High-tech containment crate
- **Pole** - Stripper pole
- **WoodenBox** - Wooden restraint box
- **PilloryStock** - Pillory device
- **Throne** - Decorative restraint throne

For a complete list, refer to [ItemDevices.md](docs/items/ItemDevices.md).

## Common Restraint Combinations

### Basic Arm Restraints

```json
{
  "group": "ItemArms",
  "asset": "HempRope",
  "extendedType": "Cuffs",
  "difficulty": 15,
  "color": "#8B4513"
}
```

### Gagged

```json
{
  "group": "ItemMouth",
  "asset": "BallGag",
  "extendedType": "Tight",
  "difficulty": 20,
  "color": "#FF1493"
}
```

### Hogtied (Arms + Legs)

```json
{
  "group": "ItemArms",
  "asset": "HempRope",
  "extendedType": "Hogtied",
  "difficulty": 25,
  "color": "#8B4513"
},
{
  "group": "ItemLegs",
  "asset": "HempRope",
  "extendedType": "Hogtied",
  "difficulty": 25,
  "color": "#8B4513"
}
```

### Collared and Cuffed

```json
{
  "group": "ItemNeck",
  "asset": "LeatherCollar",
  "difficulty": 15,
  "color": "#000000"
},
{
  "group": "ItemArms",
  "asset": "LeatherCuffs",
  "extendedType": "Cuffs",
  "difficulty": 18,
  "color": "#000000"
},
{
  "group": "ItemLegs",
  "asset": "LeatherCuffs",
  "extendedType": "Cuffs",
  "difficulty": 18,
  "color": "#000000"
}
```

## Examples

### Example 1: Simple Punishment Bed

Auto-adds restraints for 1 minute:

```json
{
  "key": "furniture_punishment_bed",
  "name": "Punishment Bed",
  "type": "furniture",
  "x": 40,
  "y": 50,
  "enabled": true,
  "data": {
    "furnitureAsset": "Bed",
    "craftDescription": "Punishment bedding",
    "restraints": [
      {
        "group": "ItemArms",
        "asset": "LeatherCuffs",
        "extendedType": "Cuffs",
        "difficulty": 20
      },
      {
        "group": "ItemLegs",
        "asset": "LeatherCuffs",
        "extendedType": "Cuffs",
        "difficulty": 20
      }
    ],
    "durationMs": 60000
  }
}
```

### Example 2: Kennel with Delayed Restraints

Adds kennel immediately, waits 3 seconds, then adds leash:

```json
{
  "key": "furniture_kennel_custom",
  "name": "Custom Kennel",
  "type": "furniture",
  "x": 45,
  "y": 55,
  "enabled": true,
  "data": {
    "furnitureAsset": "Kennel",
    "furnitureProperties": { "d": 0, "p": 1 },
    "restraints": [
      {
        "group": "ItemNeck",
        "asset": "LeatherCollar",
        "color": "#FF69B4"
      }
    ],
    "applyDelayMs": 3000
  }
}
```

### Example 3: Permanent Bondage Furniture

No duration - restraints stay until manually removed:

```json
{
  "key": "furniture_throne_permanent",
  "name": "Restraint Throne",
  "type": "furniture",
  "x": 30,
  "y": 40,
  "enabled": true,
  "data": {
    "furnitureAsset": "Throne",
    "furnitureColor": "#8B4513",
    "craftDescription": "Royal bondage throne",
    "restraints": [
      {
        "group": "ItemArms",
        "asset": "IronCuffs",
        "difficulty": 30,
        "color": "#696969"
      },
      {
        "group": "ItemLegs",
        "asset": "IronCuffs",
        "difficulty": 30,
        "color": "#696969"
      },
      {
        "group": "ItemMouth",
        "asset": "PanelGag",
        "difficulty": 25
      }
    ]
  }
}
```

## Managing Furniture Locations

Use standard location admin commands:

```
/bot location add <key> "<name>" furniture <x> <y> [data_json]
  Example: !location add my_bed "Bondage Bed" furniture 50 20
  Optional: Add JSON for configuration in one step

/bot location list                            # Show all locations
/bot location get <key>                       # View location config
/bot location update <key> data.restraints '[...]'  # Update restraints
/bot location update <key> data.durationMs 120000   # Set 2-minute duration
/bot location enable <key>                    # Enable location
/bot location disable <key>                   # Disable location
/bot location delete <key>                    # Remove location
```

### Step-by-Step Example

```
1. Create the location:
   !location add my_bondage_bed "Bondage Bed" furniture 50 20

2. Update with restraint configuration:
   !location update my_bondage_bed data.furnitureAsset "Bed"
   !location update my_bondage_bed data.durationMs 120000
   !location update my_bondage_bed data.restraints '[{"group":"ItemArms","asset":"LeatherCuffs","difficulty":20}]'

3. Enable the location:
   !location enable my_bondage_bed
```

## Behavior Details

### Action Sequence

When a character steps on a furniture tile:

1. **T+0ms**: Furniture item is added to appearance
2. **T+0ms**: Furniture properties applied (if configured)
3. **T+applyDelayMs**: Restraint items added (if configured)
4. **T+durationMs**: Furniture and restraints removed (if duration configured)

### Duration Behavior

- If `durationMs` is omitted or 0: Furniture and restraints are permanent
- If `durationMs` is set: Both furniture and restraints are removed after the duration expires
- A whisper notification is sent when restraints are removed due to duration

### Multiple Triggers

If a character steps on the same furniture tile multiple times:
- Each trigger adds new furniture/restraints
- Previous items are NOT automatically removed
- The character could accumulate multiple instances

To prevent this, use duration timers or place furniture on tiles that are only visited once.

## Extended Types Reference

Common extended types for different asset groups:

### ItemArms (Rope/Cuffs)
- "Cuffs" - Arm cuffs
- "Hogtied" - Hogtied (affects arms + legs)
- "Reverse" - Reverse (behind back)
- "Frogtie" - Frogtie (bent leg position)

### ItemMouth (Gags)
- "Tight" - Tight gag
- "Strict" - Strict gag
- "Loose" - Loose fitting

### ItemNeck (Collars/Chains)
- "Normal" - Standard collar
- "Tight" - Tight collar
- "Locked" - Locked collar

### ItemDevices (Furniture)
Varies by furniture type:
- **Kennel**: `d` (door: 0=open, 1=closed), `p` (padding: 0/1)
- **Bed**: Various comfort settings
- Other furniture may have specific property types

## Limitations

- Furniture is added immediately; delay only affects restraints
- Multiple instances of the same furniture can stack (use durations to prevent)
- ExtendedType must be valid for the specific asset
- Difficulty range: 0-50 (values outside this range may be clamped)
- Color codes must be valid hex format

## Troubleshooting

**Furniture not appearing:**
- Verify furniture asset name is correct
- Check that furnitureGroup is correct (usually "ItemDevices")
- Confirm character's appearance has slot availability

**Restraints not applying:**
- Verify restraint asset group and name are correct
- Check that character appearance has room for the items
- Confirm difficulty is between 0-50

**Duration not working:**
- Ensure durationMs is set in milliseconds (e.g., 60000 for 1 minute)
- Verify the character is still in the room when duration expires
- Check console logs for timeout errors

**Color not displaying:**
- Use valid hex format: "#RRGGBB"
- Some items may override custom colors with asset defaults
- Try using default by omitting the color field

## Integration

The furniture bondage system is automatically loaded and can be enabled/disabled:

```
/bot feature enable furnitureBondage
/bot feature disable furnitureBondage
/bot feature list
```

## Comparison with Other Systems

| Feature | Kennel | Cage | Furniture |
| --- | --- | --- | --- |
| Configurable | ❌ No | Limited | ✅ Full |
| Furniture Type | Kennel only | Crate only | Any ItemDevices |
| Restraints | None | Built-in | ✅ Configurable |
| Duration | None | ✅ Yes | ✅ Yes |
| Admin Commands | ❌ No | Limited | ✅ Full management |
| Predefined Positions | ✅ Yes | ✅ Yes | ✅ Via location system |

The furniture system offers maximum flexibility while maintaining simplicity for common use cases.
