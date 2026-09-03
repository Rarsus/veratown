# Phase 2.2 Command Handler Implementation - Testing Guide

## Overview

Phase 2.2 implements the complete command handler routing system that wires up all 9 slash commands with admin permission checking and error handling. This guide explains how to test and validate the implementation.

## Test Results

All command routing tests pass successfully:

```
✔ Command handlers return CommandResult with success flag
✔ Admin-only commands return permission denied for non-admin users
✔ Admin-only commands succeed for admin users
✔ Public commands work without admin privileges
✔ Commands handle missing interaction options gracefully
✔ Command context includes correct user and guild info
✔ formatResultAsEmbed handles success and error results
```

## Running Tests

### Unit Tests (Automated)

```bash
# Run Discord command routing tests
pnpm run test:unit

# Or run just Discord tests
node --import tsx --test bin/discord/__tests__/commandRouting.test.ts
```

## Command Implementation Status

### Admin-Only Commands (require Discord admin role)

1. **`/player-list [limit]`** - List all players with optional limit (1-100)
    - Status: ✅ Implemented
    - Returns: Player list with name, ID, blacklist status, last seen

2. **`/player-blacklist <action> <player> [reason]`** - Manage player blacklist
    - Status: ✅ Implemented
    - Actions: `add`, `remove`
    - Returns: Confirmation of blacklist change

3. **`/diagnostics`** - Get system diagnostics
    - Status: ✅ Implemented
    - Returns: Database stats, collection info, command history

4. **`/logs [limit]`** - Get bot logs
    - Status: ✅ Implemented
    - Returns: Recent log entries with timestamps

5. **`/bot-restart`** - Restart the BC bot
    - Status: ✅ Implemented
    - Returns: Confirmation message

6. **`/bot-stop`** - Stop the BC bot
    - Status: ✅ Implemented
    - Returns: Confirmation message

### Public Commands (no admin role required)

1. **`/player-info <player>`** - Get information about a specific player
    - Status: ✅ Implemented
    - Returns: Player details including state, character, last activity

2. **`/bot-status`** - Get current bot and system status
    - Status: ✅ Implemented
    - Returns: Bot connection status, database status, player count, uptime

3. **`/character-info <character>`** - Get information about a character in BC
    - Status: ✅ Implemented
    - Returns: Character details, appearance, equipment, location

4. **`/active-players`** - Get list of active players
    - Status: ✅ Implemented
    - Returns: List of currently connected players

5. **`/character-search <name>`** - Search for characters by name
    - Status: ✅ Implemented
    - Returns: Matching characters with basic info

## Permission Checking

The `isUserAdmin()` function checks if a Discord user has an admin role:

```typescript
function isUserAdmin(
    interaction: CommandInteraction,
    adminRoles: string[],
): boolean {
    // Checks if user's member.roles includes any admin role IDs
    // Returns false if not in a guild or user doesn't have roles
}
```

Admin roles are configured via `DISCORD_ADMIN_ROLES` environment variable (JSON array of role IDs).

## Error Handling

All commands implement consistent error handling:

1. **Invalid inputs** - Return error embed with red color (0xff0000)
2. **Permission denied** - Return specific permission error message
3. **Command execution errors** - Wrapped in try/catch with logged stack traces
4. **Type mismatches** - Handled gracefully with fallback values

## Discord Integration

### Environment Variables Required

```
DISCORD_ENABLED=true
DISCORD_TOKEN=<bot-token>
DISCORD_GUILD_ID=<guild-id>
DISCORD_ADMIN_ROLES=["<role-id-1>","<role-id-2>"]
DISCORD_AUDIT_CHANNEL_ID=<channel-id> (optional)
```

### Embed Formatting

Success responses:

- Green embed (0x00ff00)
- Command result and data displayed

Error responses:

- Red embed (0xff0000)
- Error message with details

### Deferred Replies

Long-running commands use deferred replies to avoid 3-second Discord timeout:

```typescript
await interaction.deferReply({ ephemeral: true });
// ... long operation ...
await interaction.editReply({ embeds: [embed] });
```

## Manual Testing

### Prerequisites

1. Discord server with the bot invited
2. Admin role configured (DISCORD_ADMIN_ROLES)
3. MongoDB with test data
4. Railway variables set or .env file with DISCORD\_\* variables

### Testing Steps

1. **Admin-only command as non-admin user**
    - Type `/player-list`
    - Expected: Permission denied error

2. **Admin-only command as admin user**
    - Assign yourself the admin role
    - Type `/player-list`
    - Expected: Player list returned

3. **Public command**
    - Type `/bot-status`
    - Expected: Bot status embed with connection info

4. **Invalid parameters**
    - Type `/player-info` with empty player
    - Expected: Error message about required parameter

5. **Long-running command**
    - Type `/diagnostics`
    - Expected: Deferred reply, then result after 1-2 seconds

## TypeScript Compilation

All Discord modules compile with strict mode enabled:

```bash
# Check types
pnpm run types

# Build bundle
pnpm run bundle

# Result: bin/dist/bundle.js (11.2MB with sourcemap)
```

## Architecture

### Module Structure

```
bin/discord/
├── discordBot.ts          # Bot initialization & interaction routing
├── index.ts               # Public API exports
├── types.ts               # Type definitions
├── commands/
│   ├── playerManagement.ts   # Player commands (list, info, blacklist)
│   ├── diagnostics.ts        # System commands (status, diagnostics, logs)
│   ├── characterInfo.ts      # Character commands
│   └── botControl.ts         # Bot control commands (restart, stop)
├── utils/
│   └── discordHelpers.ts  # Utilities (formatResultAsEmbed, validation)
└── __tests__/
    └── commandRouting.test.ts # Integration tests
```

### Command Flow

1. Discord sends interaction
2. `discordBot.ts` receives interaction
3. `isCommand()` type guard checks
4. `handleCommandInteraction()` routes to handler
5. `isUserAdmin()` checks permissions
6. Command handler executes
7. Result formatted with `formatResultAsEmbed()`
8. Response sent to Discord

## Next Steps

1. Deploy to Railway with Discord token and admin roles configured
2. Test all commands in Discord server
3. Monitor logs for any issues
4. Consider adding command cooldowns or rate limiting
5. Add audit logging for sensitive commands (blacklist, restart)

## Troubleshooting

### Commands not appearing in Discord

- Verify `registerSlashCommands()` completes without errors
- Check `DISCORD_GUILD_ID` is correct
- Verify bot has "applications.commands" permission in Discord

### Permission checking not working

- Verify user has the admin role configured in `DISCORD_ADMIN_ROLES`
- Check role ID is correct (get with right-click on role)
- Ensure bot can read member roles (permission: "MANAGE_ROLES")

### Long operations timing out

- Verify `interaction.deferReply()` is called before operation
- Check deferred reply is updated within 15 minutes
- Consider moving very long operations to background jobs

## References

- [Discord.js Documentation](https://discord.js.org/)
- [Slash Commands Guide](https://discord.com/developers/docs/interactions/application-commands)
- [Type Guards in TypeScript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates)
