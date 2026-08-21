# Veratown Cat/Dog Tile System

This document describes the database-backed `cat` and `dog` tile features in Veratown.
These features are implemented by `bin/games/veratown/catDogSystem.ts` and are
loaded and reloaded by the Veratown orchestrator.

## How It Works

A `cat` or `dog` location places a tile at the location's `x` and `y` coordinates.
When a character stands on that tile, the system performs a configurable sequence of
actions from the location's `data.actions` array. Actions can include:

- **Emote**: Display a custom emote/narration (bot teleports to player for visibility)
- **Bondage**: Automatically add restraint items to the character
- **Vibrator**: Escalate active vibrators with a custom whisper message

### Immersive Emotes (Bot Teleport)

When a bot connector is configured (typically the showerbot), emotes are delivered via:
1. Bot teleports to player's exact location
2. Emote is sent (now in range and fully visible to player)
3. Bot teleports back to home position

This ensures emotes are always visible to players regardless of the bot's normal position.
Without a bot connector, emotes are sent normally but may not be visible if out of range.

## Location Schema

The location must have `type` set to `cat` or `dog`, valid tile coordinates,
`enabled` set to `true`, and a `data.actions` array with at least one action.

### Basic Example (Emote Only)

```json
{
  "key": "cat_tile_main",
  "name": "Playful Cat",
  "type": "cat",
  "x": 30,
  "y": 40,
  "enabled": true,
  "data": {
    "actions": [
      {
        "type": "emote",
        "text": "*A fluffy cat rubs against you purring*"
      }
    ]
  }
}
```

### Advanced Example (Multiple Actions)

```json
{
  "key": "dog_tile_playful",
  "name": "Playful Dog",
  "type": "dog",
  "x": 25,
  "y": 35,
  "enabled": true,
  "data": {
    "actions": [
      {
        "type": "emote",
        "text": "*A playful dog wags its tail excitedly*"
      },
      {
        "type": "bondage",
        "pieces": [
          {
            "group": "ItemMouth",
            "asset": "BallGag",
            "extendedType": "Tight",
            "color": "#FF69B4"
          }
        ],
        "difficulty": 15,
        "color": "#FF69B4",
        "craftDescription": "Playful pet toy"
      },
      {
        "type": "vibrator",
        "message": "to increase in intensity",
        "intensityIncrease": 2
      }
    ]
  }
}
```

## Action Types

### 1. Emote Action

Displays an emote or narration when the character steps on the tile.

**Fields:**
- `type`: `"emote"`
- `text`: The emote text to display

**Example:**
```json
{
  "type": "emote",
  "text": "*A mysterious creature lurks in the shadows*"
}
```

**Important: Bot Connector Requirement for Visibility**

For emotes to be visible to the player, a bot connector must be configured:

- **With bot connector (e.g., showerbot)**: 
  - Bot teleports to the player's exact location using `mapTeleport()`
  - Emote is sent from bot's new position (guaranteed in range)
  - Bot teleports back to home location
  - Emotes are always visible to the player
  - Look for logs: `[CatDogSystem] Bot teleported to (X, Y)` 

- **Without bot connector**:
  - Emote is sent from wherever the tile system executes
  - Visibility depends on range and line-of-sight
  - Emote may not display if player is out of range
  - Look for logs: `[CatDogSystem] No bot connector, sending emote normally`

**Configuration:**
```typescript
// With bot connector (emotes always visible)
const catDog = new CatDogSystem(primaryConn, botConn);

// Without bot connector (may not be visible)
const catDog = new CatDogSystem(primaryConn);
```

### 2. Bondage Action

Automatically adds restraint items to the character when they step on the tile.
Items are configured per-piece with optional extended types and colors.

**Fields:**
- `type`: `"bondage"`
- `pieces`: Array of item configurations
  - `group`: Asset group (e.g., "ItemMouth", "ItemArms", "ItemNeck")
  - `asset`: Asset name (e.g., "BallGag", "HempRope", "LeatherCollar")
  - `extendedType`: Optional. Type variant (e.g., "Tight", "Hogtied", "Frogtie")
  - `color`: Optional. Override piece color (hex code)
- `difficulty`: Lock difficulty (default: 20). Range: 0-50
- `color`: Default color for all pieces (hex code, default: "#8B4513")
- `craftDescription`: Craft description for the items (default: "Pet bondage")

**Example:**
```json
{
  "type": "bondage",
  "pieces": [
    {
      "group": "ItemMouth",
      "asset": "BallGag",
      "extendedType": "Tight",
      "color": "#FF1493"
    },
    {
      "group": "ItemNeck",
      "asset": "LeatherCollar",
      "color": "#000000"
    }
  ],
  "difficulty": 18,
  "color": "#8B4513",
  "craftDescription": "Pet play outfit"
}
```

### 3. Vibrator Action

Escalates active vibrators with a custom whisper message when the character
steps on the tile.

**Fields:**
- `type`: `"vibrator"`
- `message`: Custom message for the vibrator escalation event
- `intensityIncrease`: How many power levels to increase (default: 1, range: 1-7)

**Example:**
```json
{
  "type": "vibrator",
  "message": "to increase in intensity dramatically",
  "intensityIncrease": 3
}
```

The character receives a whisper like:
```
*The cat cuddles you and by mistake triggers your device... to increase in intensity dramatically*
```

**Requirements for vibrator escalation:**
- Character must be wearing a vibrator item in `ItemVulva` or `ItemPelvis` group
- Vibrator must support intensity/mode levels (Extended.Type or TypeRecord property)
- Vibrator should be active (intensity ≥ 0)
- Works with standard vibrators (FuturisticVibrator, LoversVibrator, etc.)
- Also works with custom vibrators that don't have "Vibrator" in the name

## Vibrator Detection

The system detects vibrators using multiple methods:

1. **Name-based detection**: Items with "Vibrator" or "Vibrat" in the asset name
2. **Property-based detection**: Items in ItemVulva/ItemPelvis with Extended.Type property (custom vibrators)
3. **Extended detection**: Items with TypeRecord property for additional custom vibrators

This means custom vibrating equipment with any name will be detected as long as it:
- Is placed in the ItemVulva or ItemPelvis group
- Has Extended.Type or TypeRecord properties to store intensity levels

## Configuration

The cat/dog system can be configured with an optional bot connector for immersive emote delivery:

```typescript
// Without bot teleport (basic emotes)
const catDog = new CatDogSystem(primaryConn);

// With showerbot for immersive emotes (bot teleports to player)
const catDog = new CatDogSystem(primaryConn, showerBotConn);
```

When a bot connector (typically showerbot) is provided, emotes are delivered with maximum immersion:
- Bot appears at player's location
- Emote is sent (fully visible in map view)
- Bot returns to home position
- Process takes ~600ms total (100ms travel + 500ms display time)

Without a bot connector, emotes are sent normally but may not be visible to out-of-range players.

```
/bot location add cat "My Cat Tile"
/bot location template cat
```

Then update the created location with your desired actions:

```
/bot location update <key> data.actions '[{"type":"emote","text":"*Cat purrs*"}]'
```

Or use `/bot location add` to create with full configuration in one step.

## Multiple Actions Per Tile

Actions are executed sequentially in the order they appear in the array. For example,
a tile with all three action types will:

1. Display the emote
2. Add bondage items
3. Send the vibrator escalation whisper and modify vibrators

All actions happen automatically when the character steps on the tile, with no
additional input required.

## Configuration Notes

- **Emote-Only Tiles**: Simplest setup, just displays text
- **Bondage-Only Tiles**: Adds items without narration
- **Vibrator-Only Tiles**: Escalates vibrators but doesn't send emote/bondage
- **Combined Tiles**: Mix and match for complex interactions

Colors use hexadecimal format (e.g., `#FF69B4` for hot pink, `#8B4513` for brown).

Extended types are item-specific variants. Common examples:
- **ItemMouth gags**: "Tight", "Strict", "Relaxed"
- **ItemArms rope**: "Cuffs", "Hogtied", "Reverse", "Frogtie"
- **ItemNeck chains**: "Normal", "Tight", "Locked"

Difficulty affects how hard the item is to remove (higher = more difficult).
Lock difficulty ranges from 0 (trivial) to 50 (very hard).

## Event Triggers

- Tile triggers fire whenever a character steps exactly on the tile coordinates
- Each trigger can have multiple actions that execute in sequence
- The system checks character position every game tick
- Actions only fire once per tile entry (no spam while standing still)

## Limitations

- Each action is independent; you cannot chain conditions between actions
- Vibrator escalation affects all vibrators the character is wearing
- Bondage items are added permanently until manually removed
- The system cannot check if a character already has certain items before adding

## Integration with Veratown

The cat/dog system is automatically loaded as part of Veratown initialization.
To enable/disable the feature:

```
/bot feature enable catDog
/bot feature disable catDog
```

To check if the feature is loaded:

```
/bot feature list
```

## Location Management

Cat/dog locations are managed like other Veratown locations:

```
/bot location add cat "My Cat"           # Create a new cat tile
/bot location list                       # Show all locations
/bot location get <key>                  # View location config
/bot location update <key> ...           # Update location
/bot location delete <key>               # Delete location
/bot location enable <key>               # Enable location
/bot location disable <key>              # Disable location
```

## Troubleshooting

### Debug Logging

The cat/dog system includes comprehensive logging for troubleshooting. Enable debug mode to see:

```
[CatDogSystem] reloadLocations called with X locations
[CatDogSystem] Adding cat/dog at (x, y)
[CatDogSystem] onCharacterStepOnPet triggered for PlayerName
[CatDogSystem] Character position: (x, y)
[CatDogSystem] Found matching tile: cat with N actions
[CatDogSystem] Executing action: emote|bondage|vibrator
[CatDogSystem] performEmoteAction: botConn=true|false, text="..."
[CatDogSystem] Bot connector available, attempting teleport
[CatDogSystem] Teleporting bot to player (X, Y)
[CatDogSystem] ✓ Bot teleported to (X, Y)
[CatDogSystem] Sending emote from bot location
[CatDogSystem] Teleporting bot back to (X, Y)
[CatDogSystem] Found N vibrator(s)
[CatDogSystem] Detected vibrator: AssetName in ItemVulva
```

**Key Log Messages to Look For:**
- `botConn=true` = bot connector is configured (good for emote visibility)
- `botConn=false` = no bot connector (emotes may not be visible)
- `✓ Bot teleported` = teleport succeeded, emote will be visible
- `No bot connector` = fallback emote send (may not be visible)

If you don't see these logs when stepping on a tile, the tile trigger isn't firing.
Check bot console output for error messages.

### Common Issues

**No tiles loading:**
- Check `/bot feature list` - cat/dog should show as "enabled"
- Run `/bot feature enable catDog` if disabled
- Check bot console for `[CatDogSystem] Loaded X cat/dog location(s)`
- If 0 tiles loaded, verify locations have `type: "cat"` or `type: "dog"` and `enabled: true`

**Actions not firing:**
- Verify the location is `enabled: true`
- Check that character position exactly matches `x` and `y` coordinates
- Confirm `data.actions` array is not empty and has valid action objects
- Look for `[CatDogSystem] onCharacterStepOnPet triggered` in console

**Emote not displaying in chat:**
- Check bot console for `[CatDogSystem] performEmoteAction:`
- **If `botConn=false`**: No bot connector configured
  - Solution: Pass a bot connector to CatDogSystem constructor (e.g., showerbot)
  - Example: `new CatDogSystem(primaryConn, showerBotConn)`
  - Without this, emotes may not display if player is out of range
- **If `botConn=true` but no teleport logs**: Bot connector exists but isn't being used
  - Check for: `[CatDogSystem] Bot connector available, attempting teleport`
  - If missing, the condition `if (this.botConn)` may not be evaluating correctly
- **If teleport logs show failure**: `mapTeleport` may not be available
  - Check for: `[CatDogSystem] ✓ Bot teleported` (success) or `Failed to teleport bot` (failure)
  - If failure, verify bot is in the same room and has valid MapPos
- **Verify emote is actually sent**: Look for `Tell (Emote) CharacterName:` in logs
  - If this log is missing, the emote action itself isn't executing

**Bondage items not appearing:**
- Verify the asset group and name are correct (check ItemGroup documentation)
- Check that the character appearance has room for the item
- Confirm `difficulty` is between 0 and 50

**Vibrators not escalating:**
- Character must be wearing an active vibrator item (not disabled/at intensity 0)
- Vibrator must be in `ItemVulva` or `ItemPelvis` group
- **Custom vibrators without "Vibrator" in name are now supported** if they have Extended.Type or TypeRecord properties
- Check for `[CatDogSystem] Detected vibrator:` in logs
- If log shows "Found 0 vibrator(s)", the equipment isn't being recognized as a vibrator

**Intensity stays at 0 (disabled):**
- The vibrator might not be properly activated/enabled
- Try activating the vibrator manually first before using the tile
- Some vibrators require explicit enablement before intensity changes will register
- Check logs for `[CatDogSystem] Escalating vibrator:` and `Current intensity via...`
- If current intensity reads as 0, the item needs to be activated first

**Duplicate actions:**
- Actions may fire multiple times if the character's position oscillates
- Keep actions idempotent (safe to run multiple times)

## Example Locations

### Cat Greeting Tile
```json
{
  "key": "cat_hello",
  "name": "Cat Says Hello",
  "type": "cat",
  "x": 40,
  "y": 50,
  "enabled": true,
  "data": {
    "actions": [
      {
        "type": "emote",
        "text": "*A curious cat looks up at you and meows*"
      }
    ]
  }
}
```

### Dog Punishment Tile
```json
{
  "key": "dog_punishment",
  "name": "Playful Dog Punishment",
  "type": "dog",
  "x": 45,
  "y": 55,
  "enabled": true,
  "data": {
    "actions": [
      {
        "type": "emote",
        "text": "*The dog playfully nips at you and wags its tail*"
      },
      {
        "type": "bondage",
        "pieces": [
          {
            "group": "ItemHead",
            "asset": "PonyHood",
            "color": "#FFB6C1"
          }
        ],
        "difficulty": 12,
        "craftDescription": "Dog play punishment"
      }
    ]
  }
}
```

### Pet Escalation Tile
```json
{
  "key": "cat_mischief",
  "name": "Mischievous Cat",
  "type": "cat",
  "x": 35,
  "y": 45,
  "enabled": true,
  "data": {
    "actions": [
      {
        "type": "emote",
        "text": "*A mischievous cat brushes against your leg with a knowing purr*"
      },
      {
        "type": "vibrator",
        "message": "and it buzzes to life",
        "intensityIncrease": 1
      }
    ]
  }
}
```
