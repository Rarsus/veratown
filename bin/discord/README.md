# Discord Bot Administration Interface

A comprehensive Discord bot administration layer for managing Ropeybot instances, monitoring system health, and querying player/character data directly from Discord.

## Overview

The Discord bot provides:

- **Player Management**: Query player state, manage blacklists/whitelists, view player statistics
- **Diagnostics**: Real-time health checks, system metrics, database connectivity monitoring
- **Bot Control**: Start/restart/stop the BC bot from Discord commands
- **Character Information**: Query BC character data, search for players by criteria
- **Audit Trail**: All admin actions logged for security and accountability

## Architecture

```
Discord Bot (discord/)
├── discordBot.ts         - Client initialization & command routing
├── types.ts              - All TypeScript interfaces (strict mode)
├── commands/
│   ├── playerManagement.ts  - Player queries and management
│   ├── diagnostics.ts       - Health checks and metrics
│   ├── characterInfo.ts     - Character queries
│   └── botControl.ts        - Bot lifecycle control
├── utils/
│   └── discordHelpers.ts    - Formatting and validation helpers
└── index.ts              - Public API exports
```

## Setup

### 1. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Go to "Bot" section, click "Add Bot"
4. Copy the bot token
5. Enable these **Privileged Gateway Intents**:
    - Server Members Intent
    - Message Content Intent

### 2. Configure Permissions

Go to OAuth2 → URL Generator and select:

**Scopes**:

- `applications.commands`
- `bot`

**Permissions**:

- Send Messages
- Embed Links
- Attach Files

Copy the generated URL and authorize the bot in your Discord server.

### 3. Set Environment Variables

Add to your `.env` or deployment configuration:

```bash
# Discord Bot Configuration
DISCORD_ENABLED=true
DISCORD_TOKEN=your_bot_token_here
DISCORD_GUILD_ID=your_server_id_here
DISCORD_ADMIN_ROLES=["role_id_1", "role_id_2"]
DISCORD_AUDIT_CHANNEL_ID=channel_id_for_logs
```

### 4. Update Main Bot Configuration

In `bin/main.ts`, add Discord bot initialization:

```typescript
import { initializeDiscordBot, type DiscordBotConfig } from "./discord";

// In your main startup function:
const discordConfig: DiscordBotConfig = {
    discord_token: config.discord_token || "",
    discord_guild_id: config.discord_guild_id || "",
    discord_admin_roles: config.discord_admin_roles || [],
    discord_audit_channel_id: config.discord_audit_channel_id,
    discord_enabled: parseBoolean(process.env.DISCORD_ENABLED, true),
};

const discordBot = await initializeDiscordBot(discordConfig, db);

// On shutdown:
if (discordBot) {
    await shutdownDiscordBot();
}
```

## Commands

### Player Management

#### `/player-list`

List all players with optional limit

```
/player-list limit:10
```

**Requires**: Admin role

#### `/player-info`

Get detailed information about a specific player

```
/player-info player:PlayerName
```

#### `/player-blacklist`

Manage player blacklist

```
/player-blacklist action:add player:PlayerName reason:"Reason for blacklist"
/player-blacklist action:remove player:PlayerName
```

**Requires**: Admin role

### Diagnostics

#### `/bot-status`

Get current bot and system status

- BC bot connection status
- Discord bot status
- Database connectivity
- System uptime
- Player count

#### `/diagnostics`

Get detailed system diagnostics

- Memory usage (heap, external, RSS)
- Database collections
- System uptime
- Active connections
  **Requires**: Admin role

### Character Information

#### `/character-info`

Get information about a character in BC

```
/character-info character:CharacterName
```

#### `/active-players`

List players active in the last hour

#### `/character-search`

Search for characters by partial name

```
/character-search query:name_partial
```

### Bot Control

#### `/bot-restart`

Gracefully restart the BC bot
**Requires**: Admin role

#### `/bot-stop`

Gracefully stop the BC bot
**Requires**: Admin role

## TypeScript Strict Mode Compliance

All Discord bot code follows strict TypeScript mode requirements:

✅ **No implicit `any` types** - All function parameters and return types are explicit
✅ **Proper null/undefined handling** - Optional chaining and null checks throughout
✅ **Full type safety** - All interfaces defined in `types.ts`
✅ **Command context typing** - Strongly typed command handlers
✅ **Error type safety** - Proper error handling with type guards

### Key Type Patterns Used

```typescript
// All function parameters are explicitly typed
export async function handlePlayerListCommand(
    interaction: CommandInteraction,
    context: CommandContext,
): Promise<CommandResult>;

// Optional chaining for undefined values
const name =
    typeof playerRecord.name === "string" ? playerRecord.name : "unknown";

// Type guards on database results
if (Array.isArray(players) && players.length > 0) {
    // safe to use
}

// Never use implicit any
// ❌ function handler(sender, msg) // implicit any
// ✅ function handler(sender: API_Connector, msg: string) // explicit types
```

## Integration with Main Bot

### Shared Resources

The Discord bot shares these resources with the main BC bot:

1. **MongoDB Connection** - Read access to all game collections
2. **Logging System** - Same structured logging as main bot
3. **Configuration** - Extended from main `ConfigFile` interface
4. **Global State** - Access to `unifiedCharacterStore`, `crossSystemSubscribers`, etc.

### Data Flow

```
BC Bot (main.ts)
    ↓
    ├─ Writes to MongoDB
    ├─ Logs to structured logger
    └─ Maintains game state
         ↓
Discord Bot
    ├─ Reads from MongoDB (queries only)
    ├─ Logs to same system
    └─ Provides admin interface
```

### No Conflicts

- Discord bot is **read-only** for game state (only admin actions write)
- Separate module doesn't interfere with existing systems
- Can be deployed independently or alongside BC bot
- Graceful shutdown doesn't affect BC bot session

## Error Handling

All Discord bot operations use structured logging:

```typescript
logger.info("Player info fetched", {
    player_id: "123",
    requested_by: "admin_user",
});

logger.error("Failed to fetch player", error, {
    player_id: "123",
    error_type: error.constructor.name,
});
```

Errors are:

- Logged with full context
- Returned as structured `CommandResult`
- Sent to Discord with user-friendly messages
- Tracked for audit trails

## Admin Role Configuration

Configure which Discord roles can run admin commands:

```json
{
    "discord_admin_roles": ["123456789012345678", "987654321098765432"]
}
```

Or via environment variable (JSON array):

```bash
DISCORD_ADMIN_ROLES='["123456789012345678", "987654321098765432"]'
```

## Audit Logging

All admin actions are logged to the audit channel (if configured):

```
📋 AUDIT LOG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Action: player_blacklisted
User: admin_user#1234
Player: PlayerName
Reason: Violation of rules
Time: 2025-09-02 14:30:00 UTC
```

## Development

### Adding New Commands

1. Create command handler in appropriate file:

    ```typescript
    export async function handleMyCommand(
        interaction: CommandInteraction,
        context: CommandContext,
    ): Promise<CommandResult>;
    ```

2. Add command definition in `discordBot.ts`:

    ```typescript
    {
        name: "my-command",
        description: "My command description",
        options: [/* ... */]
    }
    ```

3. Export from `index.ts`:

    ```typescript
    export { handleMyCommand } from "./commands/myFile";
    ```

4. Dispatch in interaction handler

### Testing Commands

Use Discord's slash command interface in your development server:

```
/player-list
/player-info player:TestPlayer
/bot-status
/diagnostics
```

## Configuration Reference

| Variable                   | Required | Default | Description                   |
| -------------------------- | -------- | ------- | ----------------------------- |
| `DISCORD_ENABLED`          | No       | `true`  | Enable/disable Discord bot    |
| `DISCORD_TOKEN`            | Yes\*    | -       | Discord bot token             |
| `DISCORD_GUILD_ID`         | Yes\*    | -       | Server ID where commands work |
| `DISCORD_ADMIN_ROLES`      | Yes\*    | -       | JSON array of admin role IDs  |
| `DISCORD_AUDIT_CHANNEL_ID` | No       | -       | Channel for audit logs        |
| `DISCORD_COMMAND_PREFIX`   | No       | -       | Text command prefix           |

\*Required if Discord bot is enabled

## Troubleshooting

### Bot not responding to commands

- Check bot has permission to send messages in the channel
- Verify bot token is correct
- Ensure guild ID matches the server
- Check bot has slash commands scope

### Database queries failing

- Verify MongoDB connection is active
- Check database name is correct in config
- Ensure collections exist in database

### Type errors on compilation

- All files must be valid TypeScript with `strict: true`
- Use `unknown` with type guards instead of `any`
- Ensure all function parameters are typed
- Use optional chaining for undefined values

## Performance Considerations

- Discord bot queries are read-only (safe for concurrent access)
- Large player lists are paginated (default: 20 per page)
- Log retention is configurable
- Memory footprint is minimal (shared MongoDB connection)

## Security Notes

1. **Admin Role Enforcement** - All sensitive operations check admin status
2. **Input Validation** - All user inputs are sanitized
3. **Rate Limiting** - Implement Discord rate limits automatically
4. **Audit Trail** - All admin actions are logged
5. **No Password Exposure** - Never log credentials or tokens

## Future Enhancements

- [ ] Interactive command confirmation buttons
- [ ] Scheduled health reports to Discord channel
- [ ] Real-time event notifications
- [ ] Player statistics dashboard
- [ ] Game-specific admin tools
- [ ] Custom command builder interface
- [ ] Webhook integrations for BC events
