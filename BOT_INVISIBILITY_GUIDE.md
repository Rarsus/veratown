# Making the Casino Bot Invisible

## Overview

The BC-Bot API provides a method to make bot characters invisible to all players in the room. When invisible, the bot:

- Does not appear in the room character list
- Cannot be interacted with directly
- Still functions normally (processes commands, manages state)
- Useful for utility/background bots (like the roulette wheel display bot)

## The SetInvisible() Method

### Basic Usage

```typescript
// Make bot invisible
conn.Player.SetInvisible(true);

// Make bot visible again
conn.Player.SetInvisible(false);
```

### How It Works

Internally, this toggles the bot character's visibility by equipping an invisible item (the "blue ear buds of greater invisibility"). The bot occupies the `ItemEars` slot to do this.

**Constraint**: Because it uses the ear slot, if the bot's appearance needs ear items for visual purposes, they will conflict with the invisibility mechanism.

## Implementation Location

For the casino bot, you would add the invisibility call in the **Casino.registerTriggers()** method, which is called during initialization:

### File: `bin/games/casino.ts`

```typescript
public registerTriggers(): void {
    // Make the casino bot invisible
    this.conn.Player.SetInvisible(true);

    if (this.gameConfig?.region) {
        this.conn.chatRoom.map.addEnterRegionTrigger(
            this.gameConfig.region,
            guardHandler("casino:enterRegion", this.onCharacterEnterCasinoRegion),
        );
    }

    // ... rest of registerTriggers code ...
}
```

## Step-by-Step Implementation

### 1. Locate the Casino registerTriggers Method

- File: `bin/games/casino.ts`
- Search for: `public registerTriggers(): void`
- This method is called once during Veratown initialization

### 2. Add SetInvisible Call

- Add `this.conn.Player.SetInvisible(true);` as the **first line** in registerTriggers()
- Place it before any region setup or command registration
- This ensures the bot becomes invisible immediately when Veratown starts

### 3. Test the Change

```bash
# Compile the code
pnpm bundle

# Restart the bot
docker-compose down
docker-compose up -d --build

# Verify in the room that the casino bot no longer appears as a character
```

## Configuration (Optional)

You could make invisibility configurable via `config.json`:

### Updated CasinoConfig Interface

```typescript
export interface CasinoConfig {
    // ... existing properties ...
    invisible?: boolean; // New optional property
}
```

### In Casino Constructor

```typescript
if (config?.invisible ?? true) {
    // Default to invisible if not specified
    this.conn.Player.SetInvisible(true);
}
```

### In config.json

```json
{
    "casino": {
        "game": "roulette",
        "invisible": true // Optional, defaults to true
    }
}
```

## Behavior After Invisibility

When the casino bot is invisible:

### What Still Works

✓ Commands are processed normally (e.g., `/bot roulette`, `/bot blackjack`)  
✓ Messages are sent/received normally  
✓ Signs and visual elements display (just the character isn't visible)  
✓ Admin commands work normally  
✓ Chip tracking and game state persist  
✓ Region triggers still activate when players enter the casino area

### What Changes

✗ Bot doesn't appear in the room character list  
✗ Players cannot see the bot as a character in the room  
✗ Casino bot won't be shown in character counts  
✗ Admin command `/bot feature list` will still list casino (it's still a feature)

## Making the Bot Visible Again

If you need to make the bot visible during a session:

```typescript
// At any point in the code
this.conn.Player.SetInvisible(false);
```

For example, in a new admin command:

```typescript
private onCommandBotVisibility = async (
    sender: API_Character,
    msg: BC_Server_ChatRoomMessage,
    args: string[],
) => {
    if (!this.requireAdmin(sender, msg)) return;

    const visible = args[0] === "show";
    this.conn.Player.SetInvisible(!visible);
    this.conn.reply(msg, `Casino bot is now ${visible ? "visible" : "invisible"}.`);
};
```

## Tradeoffs & Considerations

### Advantages

- Clean solution: bot doesn't clutter the character list
- Aesthetically pleasing: players only see the wheel, not a separate character
- Simple implementation: one line of code
- Doesn't break any functionality

### Disadvantages

- Players can't see who's managing the casino
- Makes debugging harder (harder to identify which bot account is handling casino)
- If the bot appearance is important for immersion, this removes it
- Uses the `ItemEars` slot permanently

### Alternatives (Not Recommended)

1. **Keep bot visible**: More cluttered but more transparent about what's running
2. **Multiple bot accounts**: Have invisibility bot separate from main Veratown bot (more complex)
3. **Hide bot name in chat**: Not possible with BC API (would require custom server patch)

## Related Code Examples

### From MaidsPartyNightSinglePlayerAdventure (bin/hub/logic/maidsPartyNightSinglePlayerAdventure.ts)

This existing code shows how invisibility is used elsewhere in the codebase:

```typescript
async toggleBotVisibility(active: boolean) {
    if (active) {
        this.conn.Player.SetInvisible(true);
        if (this.player !== null) {
            await this.conn.Player.MoveToPos(
                this.conn.Player.ChatRoomPosition < this.player.ChatRoomPosition
                    ? this.player.ChatRoomPosition
                    : this.player.ChatRoomPosition + 1
            );
        }
    } else {
        this.conn.Player.SetInvisible(false);
        if (this.player !== null) {
            await this.conn.Player.MoveToPos(
                this.conn.Player.ChatRoomPosition < this.player.ChatRoomPosition
                    ? this.player.ChatRoomPosition - 1
                    : this.player.ChatRoomPosition
            );
        }
    }
}
```

This shows that:

- `SetInvisible(true)` makes the bot invisible
- `SetInvisible(false)` makes it visible again
- Position swapping is often paired with visibility changes for immersion

## Testing Checklist

After implementing invisibility:

- [ ] Bot compiles without errors (`pnpm bundle`)
- [ ] Docker starts successfully (`docker-compose up -d --build`)
- [ ] Bot connects to room ("Room joined" in logs)
- [ ] Casino bot does not appear in room character list
- [ ] Casino commands still work (`/bot roulette`, etc.)
- [ ] Admin commands still work (`/bot feature list`, etc.)
- [ ] Wheel still displays in chat
- [ ] Logs show normal operation (no errors)
- [ ] `/bot feature disable casino` still works
- [ ] Other Veratown features unaffected

## Summary

**To make the casino bot invisible:**

1. Open `bin/games/casino.ts`
2. Find the `registerTriggers()` method
3. Add `this.conn.Player.SetInvisible(true);` as the first line
4. Compile and restart: `pnpm bundle && docker-compose up -d --build`

That's it! The bot will now be invisible to all players while continuing to function normally.
