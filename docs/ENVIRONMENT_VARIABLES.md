# Environment Variables Configuration

This guide explains how to configure Veratown+ using environment variables instead of `config.json`. This is necessary for cloud deployments (Railway, Cloud Run, Render, Lightsail, etc.).

## Overview

The bot supports **both** configuration methods:

- ✅ **config.json** - For local development
- ✅ **Environment variables** - For cloud deployment
- ✅ **Hybrid** - Mix both (env vars override config.json)

**Priority**: Environment variables take precedence over `config.json` values.

---

## Core Bot Credentials

### Required

| Variable       | Description               | Example                  |
| -------------- | ------------------------- | ------------------------ |
| `BOT_USER`     | Main bot account username | `VeraBot1`               |
| `BOT_PASSWORD` | Main bot account password | `YourSecurePassword123!` |

### Optional (for multi-bot features)

| Variable        | Description                         | Example                  |
| --------------- | ----------------------------------- | ------------------------ |
| `BOT_USER2`     | Shower narrator bot (Veratown only) | `VeraBot2`               |
| `BOT_PASSWORD2` | Shower narrator password            | `YourSecurePassword456!` |
| `BOT_USER3`     | Casino bot (Veratown only)          | `VeraBot3`               |
| `BOT_PASSWORD3` | Casino bot password                 | `YourSecurePassword789!` |

**Note**: For Veratown game, user2/user3 are optional but recommended for best experience.

---

## MongoDB Configuration

| Variable      | Description                                              | Example                                                    |
| ------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| `MONGODB_URI` | MongoDB connection string (Atlas or local)               | `mongodb+srv://user:pass@cluster.xxx.mongodb.net/ropeybot` |
| `MONGODB_DB`  | Database name                                            | `ropeybot`                                                 |
| `MONGODB_TLS` | Use TLS for connection (true for Atlas, false for local) | `true`                                                     |

### Examples

**MongoDB Atlas** (cloud-hosted, recommended):

```bash
MONGODB_URI="mongodb+srv://olavceulemans_db_user:s3VtU80UmK8UwLYX@veratown.qk1s2r5.mongodb.net/ropeybot"
MONGODB_DB="ropeybot"
MONGODB_TLS="true"
```

**Local MongoDB**:

```bash
MONGODB_URI="mongodb://mongo:27017"
MONGODB_DB="ropeybot"
MONGODB_TLS="false"
```

---

## Game & Environment

| Variable        | Description                      | Options                                                     | Default         |
| --------------- | -------------------------------- | ----------------------------------------------------------- | --------------- |
| `BOT_GAME`      | Which game to run                | `veratown`, `dare`, `kidnap`, `roleplay`, `maidspartynight` | (required)      |
| `BOT_ENV`       | BC server environment            | `live`, `test`                                              | `live`          |
| `BC_SERVER_URL` | BC server URL (override default) | URL string                                                  | (auto-detected) |

### Example

```bash
BOT_GAME="veratown"
BOT_ENV="live"
```

---

## Room Configuration

These override the room settings from `config.json`:

| Variable           | Description       | Example                       |
| ------------------ | ----------------- | ----------------------------- |
| `ROOM_NAME`        | Room display name | `Veratown`                    |
| `ROOM_DESCRIPTION` | Room description  | `A persistent roleplay world` |
| `ROOM_SPACE`       | Room space type   | `X`                           |
| `ROOM_LIMIT`       | Max players       | `20`                          |

### Example

```bash
ROOM_NAME="Veratown"
ROOM_DESCRIPTION="[Romantic][Roleplay]\n\nA persistent roleplay world."
ROOM_SPACE="X"
ROOM_LIMIT="20"
```

---

## Advanced Room Configuration

These variables control room appearance and behavior:

| Variable          | Description                 | Example         | Config.json       |
| ----------------- | --------------------------- | --------------- | ----------------- |
| `ROOM_BACKGROUND` | Room background image       | `PartyBasement` | `room.Background` |
| `ROOM_PRIVATE`    | Private room (yes/no)       | `false`         | `room.Private`    |
| `ROOM_LOCKED`     | Locked room (yes/no)        | `false`         | `room.Locked`     |
| `ROOM_LANGUAGE`   | Room language               | `EN`            | `room.Language`   |
| `ROOM_GAME`       | Game type (special feature) | `""`            | `room.Game`       |

### Example

```bash
ROOM_BACKGROUND="PartyBasement"
ROOM_PRIVATE="false"
ROOM_LOCKED="false"
ROOM_LANGUAGE="EN"
ROOM_GAME=""
```

---

## Admin & Member Lists

| Variable     | Description                      | Format                         | Config.json  |
| ------------ | -------------------------------- | ------------------------------ | ------------ |
| `SUPERUSERS` | List of superuser member numbers | JSON array: `[250927, 251000]` | `superusers` |
| `MEMBERS`    | List of allowed member numbers   | JSON array: `[251024, 251025]` | `members`    |
| `ROOM_ADMIN` | Room admins (can manage room)    | JSON array: `[250927, 254890]` | `room.Admin` |

### Example

```bash
SUPERUSERS='[250927]'
MEMBERS='[251024, 251025, 251026]'
ROOM_ADMIN='[250927, 254890]'
```

### Important: JSON Array Format

For these variables, use strict JSON array format:

```bash
# ✅ Correct
SUPERUSERS=[250927]
MEMBERS=[251024,251025]

# ✅ Also correct (with spaces)
SUPERUSERS=[250927, 251000]
MEMBERS=[251024, 251025, 251026]

# ❌ Wrong (will be ignored)
SUPERUSERS=250927
```

---

## Complete Variable Reference Table

### Mapping: config.json → Environment Variables

| Category          | config.json Key    | Environment Variable | Type       | Required | Default           |
| ----------------- | ------------------ | -------------------- | ---------- | -------- | ----------------- |
| **Bot 1**         | `user`             | `BOT_USER`           | string     | ✅       | (none)            |
|                   | `password`         | `BOT_PASSWORD`       | string     | ✅       | (none)            |
| **Bot 2**         | `user2`            | `BOT_USER2`          | string     | ⚠️       | (none)            |
|                   | `password2`        | `BOT_PASSWORD2`      | string     | ⚠️       | (none)            |
| **Bot 3**         | `user3`            | `BOT_USER3`          | string     | ⚠️       | (none)            |
|                   | `password3`        | `BOT_PASSWORD3`      | string     | ⚠️       | (none)            |
| **Database**      | `mongo_uri`        | `MONGODB_URI`        | string     | ✅       | (none)            |
|                   | `mongo_db`         | `MONGODB_DB`         | string     | ✅       | `ropeybot`        |
|                   | `mongo_tls`        | `MONGODB_TLS`        | boolean    | ✅       | `true`            |
| **Game**          | `game`             | `BOT_GAME`           | string     | ✅       | `veratown`        |
|                   | `env`              | `BOT_ENV`            | string     | ✅       | `live`            |
|                   | (none)             | `BC_SERVER_URL`      | string     | ⚠️       | auto-detect       |
| **Room Basic**    | `room.Name`        | `ROOM_NAME`          | string     | ⚠️       | `Veratown`        |
|                   | `room.Description` | `ROOM_DESCRIPTION`   | string     | ⚠️       | (none)            |
|                   | `room.Limit`       | `ROOM_LIMIT`         | number     | ⚠️       | `20`              |
|                   | `room.Space`       | `ROOM_SPACE`         | string     | ⚠️       | `X`               |
| **Room Advanced** | `room.Background`  | `ROOM_BACKGROUND`    | string     | ⚠️       | `PartyBasement`   |
|                   | `room.Private`     | `ROOM_PRIVATE`       | boolean    | ⚠️       | `false`           |
|                   | `room.Locked`      | `ROOM_LOCKED`        | boolean    | ⚠️       | `false`           |
|                   | `room.Language`    | `ROOM_LANGUAGE`      | string     | ⚠️       | `EN`              |
|                   | `room.Game`        | `ROOM_GAME`          | string     | ⚠️       | `""`              |
| **Admin**         | `superusers`       | `SUPERUSERS`         | JSON array | ⚠️       | `[250927]`        |
|                   | `members`          | `MEMBERS`            | JSON array | ⚠️       | `[251024]`        |
|                   | `room.Admin`       | `ROOM_ADMIN`         | JSON array | ⚠️       | `[250927,254890]` |

**Legend**: ✅ Required | ⚠️ Optional (safe to omit)

---

## Complete Examples

### Railway Deployment

Create `.railway/railway.json` or set in Railway dashboard:

```json
{
    "BOT_USER": "VeraBot1",
    "BOT_PASSWORD": "YourPassword",
    "BOT_USER2": "VeraBot2",
    "BOT_PASSWORD2": "YourPassword2",
    "BOT_USER3": "VeraBot3",
    "BOT_PASSWORD3": "YourPassword3",
    "BOT_GAME": "veratown",
    "BOT_ENV": "live",
    "MONGODB_URI": "mongodb+srv://user:pass@cluster.xxx.mongodb.net/ropeybot",
    "MONGODB_DB": "ropeybot",
    "MONGODB_TLS": "true",
    "ROOM_NAME": "Veratown",
    "ROOM_LIMIT": "20",
    "SUPERUSERS": "[250927]"
}
```

### Docker (local development with env vars)

```bash
docker run -e BOT_USER="VeraBot1" \
  -e BOT_PASSWORD="password" \
  -e MONGODB_URI="mongodb+srv://..." \
  -e MONGODB_DB="ropeybot" \
  -e BOT_GAME="veratown" \
  ropeybot
```

### docker-compose.yml

```yaml
services:
    ropeybot:
        build: .
        environment:
            BOT_USER: "VeraBot1"
            BOT_PASSWORD: "password"
            BOT_USER2: "VeraBot2"
            BOT_PASSWORD2: "password2"
            BOT_USER3: "VeraBot3"
            BOT_PASSWORD3: "password3"
            BOT_GAME: "veratown"
            BOT_ENV: "live"
            MONGODB_URI: "mongodb+srv://user:pass@cluster.xxx.mongodb.net/ropeybot"
            MONGODB_DB: "ropeybot"
            MONGODB_TLS: "true"
            ROOM_NAME: "Veratown"
            ROOM_LIMIT: "20"
```

### GitHub Actions / Cloud Run

```yaml
- name: Deploy to Cloud Run
  run: |
      gcloud run deploy ropeybot \
        --image=$IMAGE \
        --set-env-vars=BOT_USER="${{ secrets.BOT_USER }}" \
        --set-env-vars=BOT_PASSWORD="${{ secrets.BOT_PASSWORD }}" \
        --set-env-vars=BOT_USER2="${{ secrets.BOT_USER2 }}" \
        --set-env-vars=BOT_PASSWORD2="${{ secrets.BOT_PASSWORD2 }}" \
        --set-env-vars=BOT_USER3="${{ secrets.BOT_USER3 }}" \
        --set-env-vars=BOT_PASSWORD3="${{ secrets.BOT_PASSWORD3 }}" \
        --set-env-vars=MONGODB_URI="${{ secrets.MONGODB_URI }}" \
        --set-env-vars=MONGODB_DB="ropeybot" \
        --set-env-vars=MONGODB_TLS="true" \
        --set-env-vars=BOT_GAME="veratown" \
        --set-env-vars=BOT_ENV="live"
```

---

## Configuration Priority (Highest to Lowest)

1. **Environment Variables** (highest priority)
2. **config.json** (if file exists)
3. **Defaults** (hardcoded in code)

Example: If `BOT_USER` env var is set, it will override `user` in config.json.

---

## Debugging Configuration

The bot logs which configuration was loaded:

```
[Config] Configuration sources:
  - Bot: VeraBot1
  - Game: veratown
  - MongoDB: configured
  - Environment: live
```

To troubleshoot:

1. Check console logs for `[Config]` messages
2. Verify env vars are set: `echo $BOT_USER`
3. Verify config.json exists and is valid JSON
4. Remember: env vars override config.json values

---

## Security Best Practices

### Do NOT

❌ Hardcode credentials in code  
❌ Commit passwords to git  
❌ Log sensitive values  
❌ Share `.env` files

### Do

✅ Use environment variables  
✅ Use secret management systems:

- Railway Secrets
- GitHub Secrets
- Google Secret Manager
- AWS Secrets Manager
- HashiCorp Vault

✅ Rotate passwords regularly  
✅ Use strong passwords (20+ characters)  
✅ Use separate credentials per environment (dev/staging/prod)

### Example: GitHub Actions Secrets

```yaml
# Store secrets in GitHub repo → Settings → Secrets → Actions
secrets:
    BOT_USER: ${{ secrets.BOT_USER }}
    BOT_PASSWORD: ${{ secrets.BOT_PASSWORD }}
    MONGODB_URI: ${{ secrets.MONGODB_URI }}
```

---

## Deployment Platforms

### Railway

```bash
# Set variables in Railway dashboard or via CLI:
railway variables set BOT_USER "VeraBot1"
railway variables set BOT_PASSWORD "password"
railway variables set MONGODB_URI "mongodb+srv://..."
railway variables set BOT_GAME "veratown"
railway up
```

### Cloud Run

```bash
gcloud run deploy ropeybot \
  --image=$IMAGE \
  --set-env-vars BOT_USER="VeraBot1",BOT_PASSWORD="password",...
```

### Render

Set in dashboard: **Environment** → Add Environment Variable

### Lightsail

Docker environment variables in container service configuration.

### Heroku

```bash
heroku config:set BOT_USER="VeraBot1"
heroku config:set BOT_PASSWORD="password"
heroku config:set MONGODB_URI="mongodb+srv://..."
heroku logs --tail
```

---

## Troubleshooting

### Bot won't connect

**Check**:

```bash
echo $BOT_USER
echo $BOT_PASSWORD
echo $MONGODB_URI
```

**Logs should show**:

```
[Config] Configuration sources:
  - Bot: VeraBot1
  - Game: veratown
  - MongoDB: configured
```

### Missing configuration

Error: `user must be configured`

**Solution**: Ensure `BOT_USER` env var is set or `config.json` exists.

### MongoDB connection fails

Error: `connect ECONNREFUSED` or `authentication failed`

**Solutions**:

1. Verify `MONGODB_URI` is correct
2. Check `MONGODB_TLS` is `true` for Atlas
3. Verify IP whitelist if using Atlas
4. Check credentials (username/password in URI)

### Config file conflicts with env vars

**Always trust env vars** (they override config.json).

To use only env vars, delete config.json or don't pass it.

---

## See Also

- [docs/MONGODB_ATLAS_SETUP.md](MONGODB_ATLAS_SETUP.md) - MongoDB Atlas setup
- [docs/GOOGLE_CLOUD_QUICK_START.md](GOOGLE_CLOUD_QUICK_START.md) - Cloud Run deployment
- [docs/VERATOWN_COMPLETE_GUIDE.md](VERATOWN_COMPLETE_GUIDE.md) - Veratown features
