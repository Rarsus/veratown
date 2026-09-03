# Discord Admin Roles Configuration & Troubleshooting

## Overview

The Discord bot restricts certain commands (like `/bot-restart` and `/bot-stop`) to users with admin roles.
If you see "You don't have permission to restart the bot", this guide will help you:

1. Find your Discord role IDs
2. Configure them in Railway
3. Test and verify permissions

## How Admin Permission Checking Works

The `isUserAdmin()` function checks if a user has ANY of the configured admin role IDs:

```typescript
function isUserAdmin(
    interaction: CommandInteraction,
    adminRoles: string[],
): boolean {
    // ... validation checks ...
    if ("cache" in memberRoles) {
        return memberRoles.cache.some((role) => adminRoles.includes(role.id));
    }
}
```

**Admin-Only Commands:**

- `/bot-restart` - Restart the BC bot
- `/bot-stop` - Stop the BC bot

**Public Commands** (no admin role needed):

- `/bot-status` - Check bot status
- `/diagnostics` - System diagnostics
- `/logs` - View recent logs
- `/player-list` - List players
- `/player-info` - Get player details
- `/character-info` - Character information
- `/active-players` - Show active players
- `/player-blacklist` - Blacklist operations
- `/character-search` - Search characters

## Getting Your Discord Role IDs

### Option 1: Enable Developer Mode in Discord

1. Open Discord
2. Go to **User Settings** → **Advanced**
3. Enable **Developer Mode**
4. Go to your server and right-click the role
5. Click **Copy Role ID**
6. This is your role ID (e.g., `123456789012345678`)

### Option 2: Get Role IDs from Server Settings

1. In Discord, go to **Server Settings** → **Roles**
2. Hover over a role and look for the ID in the context menu or hover text
3. Click the role and note the ID shown

### Option 3: Use Discord Bot to List Roles

You can add temporary logging to see all roles in the server:

```typescript
// In handleBotStatusCommand or diagnostics
if (interaction.inGuild()) {
    const roles = interaction.guild?.roles.cache;
    roles?.forEach((role) => {
        logger.info(`Role: ${role.name} -> ID: ${role.id}`);
    });
}
```

## Configuring Admin Roles in Railway

### Step 1: Get Role IDs

Get the Discord role ID(s) you want to make admin (see "Getting Your Discord Role IDs" above).

### Step 2: Set Railway Environment Variable

In Railway dashboard:

1. Go to your project
2. Select the **Variables** tab
3. Add a new variable: `DISCORD_ADMIN_ROLES`
4. Set the value as a JSON array of role IDs:

```json
["123456789012345678", "987654321098765432"]
```

**Format is critical:**

- Must be valid JSON
- Must be an array `[...]`
- Role IDs must be strings in quotes
- Multiple roles separated by commas

### Step 3: Restart the Bot

Deploy the new configuration:

```bash
railway deploy
```

Or trigger a redeploy through the Railway dashboard.

## Verifying Admin Roles are Working

### Test 1: Check Bot Logs

After deployment, look for log messages like:

```
Discord bot config loaded [discord_admin_roles=["123456789012345678"]]
```

This confirms the roles were parsed correctly.

### Test 2: Try Admin Command

Have a user with the admin role try:

- `/bot-restart`

Should see: ✅ "Bot restart initiated..."

Have a user WITHOUT the admin role try:

- `/bot-restart`

Should see: ❌ "You don't have permission to restart the bot"

### Test 3: Check User's Roles

In Discord, check a user's roles by:

1. Right-clicking the user in the server
2. View their roles in the profile
3. Cross-reference with your configured admin role ID

## Troubleshooting

### Scenario 1: Always Getting Permission Denied

**Problem:** Even users with the admin role can't run admin commands

**Solutions:**

1. Verify the role ID is correct:
    - Copy it again and double-check
    - Make sure you copied the role ID, not the role name
2. Check the JSON format:
    - Use a JSON validator: https://jsonlint.com/
    - Ensure quotes are straight quotes `"`, not smart quotes `"`
3. Check role assignment:
    - Verify the user actually has the role in Discord
    - Right-click user → check roles list
4. Check logs in Railway:
    - Look for parsing errors
    - Confirm the admin_roles array is populated

Example error log:

```
DISCORD_ADMIN_ROLES is not a valid JSON array, ignoring
```

### Scenario 2: Permission Suddenly Stopped Working

**Problem:** Admin commands worked before but now return permission denied

**Solutions:**

1. Check if roles were reassigned in Discord
2. Check if Railway environment variable was accidentally deleted
3. Redeploy the bot to ensure latest config is loaded
4. Check bot logs for errors during initialization

### Scenario 3: Multiple Role IDs Not Working

**Problem:** Configured multiple roles but only first one works

**Solutions:**

1. Verify all role IDs are correct
2. Test each role individually:
    ```json
    ["123456789012345678"] // Test with first role only
    ```
3. Check for JSON format issues (missing commas, extra quotes, etc.)

## Example Configurations

### Single Admin Role

```json
["123456789012345678"]
```

### Multiple Admin Roles

```json
["123456789012345678", "987654321098765432", "555666777888999000"]
```

### Admin and Moderator Roles

```json
["123456789012345678", "987654321098765432"]
```

## How to Copy/Paste to Railway

1. In Discord Developer Mode, right-click a role
2. Click "Copy Role ID"
3. In a text editor, create your JSON array:
    ```json
    ["paste-role-id-here"]
    ```
4. In Railway Variables:
    - Name: `DISCORD_ADMIN_ROLES`
    - Value: (paste your JSON array)
5. Deploy

## Testing Checklist

- [ ] Got role ID(s) from Discord
- [ ] Created valid JSON array format
- [ ] Set DISCORD_ADMIN_ROLES in Railway
- [ ] Deployed the bot
- [ ] Bot logs show admin roles loaded correctly
- [ ] Verified user has the role in Discord
- [ ] Tested `/bot-restart` command
- [ ] Admin user can run the command ✅
- [ ] Non-admin user gets permission denied ✅

## Debug Logging

If issues persist, you can add temporary debug logging to `bin/discord/discordBot.ts`:

```typescript
function isUserAdmin(
    interaction: CommandInteraction,
    adminRoles: string[],
): boolean {
    logger.info("Checking admin permissions", {
        user_id: interaction.user.id,
        configured_admin_roles: adminRoles,
        user_roles: interaction.member?.roles?.cache?.map((r) => r.id),
    });

    if (!interaction.inGuild()) {
        logger.info("User not in guild");
        return false;
    }

    const member = interaction.member;
    if (!member || typeof member === "string") {
        logger.info("Member not found or invalid");
        return false;
    }

    const memberRoles = member.roles;
    if (!memberRoles || typeof memberRoles === "string") {
        logger.info("Member roles not accessible");
        return false;
    }

    if ("cache" in memberRoles) {
        const hasAdminRole = memberRoles.cache.some((role) =>
            adminRoles.includes(role.id),
        );
        logger.info("Admin check result", {
            has_admin_role: hasAdminRole,
            user_role_ids: Array.from(memberRoles.cache.keys()),
            configured_admin_ids: adminRoles,
        });
        return hasAdminRole;
    }

    logger.info("No roles cache found");
    return false;
}
```

Deploy this temporarily to see detailed logs in Railway, then remove it.

## Environment Variable Format Summary

| Setting                    | Type       | Required | Example                   |
| -------------------------- | ---------- | -------- | ------------------------- |
| `DISCORD_TOKEN`            | String     | Yes      | `MTk4NjIyNTAzNzgwMjQ1...` |
| `DISCORD_GUILD_ID`         | String     | Yes      | `1234567890`              |
| `DISCORD_ADMIN_ROLES`      | JSON Array | No       | `["123456789012345678"]`  |
| `DISCORD_AUDIT_CHANNEL_ID` | String     | No       | `9876543210`              |
| `DISCORD_ENABLED`          | Boolean    | No       | `true`                    |

If `DISCORD_ADMIN_ROLES` is not set, all users will get permission denied on admin commands.
