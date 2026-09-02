# Discord Bot Container Quick Start Guide

Get Discord bot running in Docker in 5 minutes.

## Prerequisites

- Docker installed
- Discord bot created in [Developer Portal](https://discord.com/developers/applications)
- Discord server ID
- Admin role IDs (optional)

## Quick Setup (Local Development)

### Step 1: Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" → Name it "Ropeybot"
3. Go to "Bot" section → Click "Add Bot"
4. Under "TOKEN" → Click "Copy"
5. Enable these **Privileged Gateway Intents**:
    - Server Members Intent ✓
    - Message Content Intent ✓

### Step 2: Get Discord IDs

**Server ID:**

- Right-click your Discord server name
- "Copy Server ID"

**Admin Role IDs (optional):**

- Right-click admin role in server settings
- "Copy Role ID"
- Repeat for each admin role

### Step 3: Configure Environment

```bash
# Create .env file
cp .env.example .env

# Edit .env with your Discord credentials
nano .env
```

Fill in:

```
DISCORD_TOKEN=your_token_from_step_1
DISCORD_GUILD_ID=your_server_id
DISCORD_ADMIN_ROLES='["your_role_id_1", "your_role_id_2"]'
```

### Step 4: Start Services

```bash
# Build and start with local MongoDB
docker-compose -f docker-compose.local.discord.yml up -d

# Check logs
docker-compose -f docker-compose.local.discord.yml logs -f ropeybot
```

### Step 5: Verify Discord Connection

```bash
# Wait for bot to connect (~10 seconds)
docker logs ropeybot | grep -i discord
```

Expected output:

```
Discord bot logged in successfully
Slash commands registered successfully
```

### Step 6: Test Commands

In Discord:

1. Go to your server
2. Type `/` to see slash commands
3. Try `/player-list` or `/bot-status`

**If commands don't show:**

- Restart bot: `docker-compose restart ropeybot`
- Check logs: `docker logs ropeybot`
- Verify bot has permissions: Developer Portal > OAuth2 > Scopes > `applications.commands`

## Production Deployment (Cloud Run)

### Step 1: Set Secrets

Using Google Secret Manager:

```bash
echo -n "your_discord_token" | gcloud secrets create discord-token --data-file=-
echo -n "your_guild_id" | gcloud secrets create discord-guild-id --data-file=-
echo -n "your_mongodb_uri" | gcloud secrets create mongodb-uri --data-file=-
```

### Step 2: Deploy

```bash
docker-compose -f docker-compose.prod.discord.yml up -d
```

Or with Cloud Run:

```bash
gcloud run deploy ropeybot \
    --image gcr.io/PROJECT/ropeybot:latest \
    --set-env-vars DISCORD_TOKEN=$(gcloud secrets versions access latest --secret discord-token) \
    --set-env-vars DISCORD_GUILD_ID=$(gcloud secrets versions access latest --secret discord-guild-id) \
    --set-env-vars MONGODB_URI=$(gcloud secrets versions access latest --secret mongodb-uri) \
    --memory 512M \
    --timeout 3600
```

## Troubleshooting

### Discord bot doesn't connect

```bash
# Check logs
docker logs ropeybot | grep -i discord

# Verify environment variable
docker exec ropeybot env | grep DISCORD
```

**Issues:**

- `ERROR: Discord bot token not configured` → Set `DISCORD_TOKEN`
- `ERROR: Failed to register slash commands` → Verify `DISCORD_GUILD_ID` is correct

### Commands don't appear

1. Check bot has permissions:
    - Discord Developer Portal > Your App > OAuth2
    - Ensure `applications.commands` scope is selected
    - Re-invite bot with new scope

2. Restart bot:

    ```bash
    docker-compose restart ropeybot
    ```

3. Wait 30 seconds and refresh Discord

### Database connection error

```bash
# Test MongoDB connection
docker exec ropeybot node -e \
  "const {MongoClient} = require('mongodb'); \
   new MongoClient('$MONGODB_URI').connect() \
   .then(() => console.log('Connected')).catch(e => console.error(e))"
```

### Container exits immediately

```bash
# Check exit reason
docker inspect ropeybot | grep -A 5 "State"
docker logs ropeybot | tail -20
```

## Next Steps

- [Full Container Integration Guide](./DISCORD_BOT_CONTAINER_INTEGRATION.md)
- [Discord Bot Setup Guide](./bin/discord/README.md)
- [Implementation Details](./docs/DISCORD_BOT_IMPLEMENTATION_GUIDE.md)

---

**Still having issues?** Check the full guides above or review the logs:

```bash
docker logs ropeybot -f
```
