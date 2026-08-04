# Railway Deployment Guide

Deploy Veratown+ to Railway with automatic Docker container support and MongoDB Atlas.

**Time**: 10 minutes  
**Cost**: $5-10/month  
**Setup**: GitHub → Railway (automatic deployments)

---

## Why Railway?

✅ **Easiest setup** - Connect GitHub, done  
✅ **Automatic deploys** - Every push to main deploys automatically  
✅ **No cold starts** - Persistent containers (unlike Cloud Run)  
✅ **Cheap** - $5/month for small containers  
✅ **Free tier available** - $5 credit/month  
✅ **Built-in monitoring** - Logs, metrics, auto-restarts  
✅ **No infrastructure** - Railway manages everything  

---

## Prerequisites

- ☑️ GitHub account (repo cloned/forked)
- ☑️ MongoDB Atlas cluster created ([setup guide](MONGODB_ATLAS_SETUP.md))
- ☑️ MongoDB connection string (from Atlas)
- ☑️ BC bot credentials (username/password × 1-3)

---

## Step 1: Connect GitHub to Railway (2 min)

1. Go to [railway.app](https://railway.app)
2. Click **Start New Project**
3. Select **Deploy from GitHub repo**
4. Click **Connect GitHub**
5. Authorize Railway to access your repos
6. Select **Rarsus/veratown** (or your fork)

---

## Step 2: Configure Environment Variables (5 min)

Railway dashboard → Your project → Variables

### All Configuration Variables

**Complete mapping of config.json to environment variables:**

| Config.json | Environment Variable | Example | Required |
|---|---|---|---|
| **Bot 1** |
| `user` | `BOT_USER` | `VeraBot1` | ✅ Yes |
| `password` | `BOT_PASSWORD` | `VeraBotVeraBot123` | ✅ Yes |
| **Bot 2 (Optional)** |
| `user2` | `BOT_USER2` | `VeraBot2` | ⚠️ If using |
| `password2` | `BOT_PASSWORD2` | `VeraBot2Password` | ⚠️ If using |
| **Bot 3 (Optional)** |
| `user3` | `BOT_USER3` | `VeraBot3` | ⚠️ If using |
| `password3` | `BOT_PASSWORD3` | `mafqeZwadfos5vejby` | ⚠️ If using |
| **Database (MongoDB Atlas)** |
| `mongo_uri` | `MONGODB_URI` | `mongodb+srv://user:pass@cluster.xxx.mongodb.net/ropeybot` | ✅ Yes |
| `mongo_db` | `MONGODB_DB` | `ropeybot` | ✅ Yes |
| `mongo_tls` | `MONGODB_TLS` | `true` | ✅ Yes |
| **Game & Server** |
| `game` | `BOT_GAME` | `veratown` | ✅ Yes |
| `env` | `BOT_ENV` | `live` | ✅ Yes |
| (bcserverurl) | `BC_SERVER_URL` | `https://client.bdsm-chat.com/` | ⚠️ If custom |
| **Room Configuration** |
| `room.Name` | `ROOM_NAME` | `Veratown` | ⚠️ Optional |
| `room.Description` | `ROOM_DESCRIPTION` | `A roleplay room...` | ⚠️ Optional |
| `room.Limit` | `ROOM_LIMIT` | `20` | ⚠️ Optional |
| `room.Space` | `ROOM_SPACE` | `X` | ⚠️ Optional |
| `room.Language` | `ROOM_LANGUAGE` | `EN` | ⚠️ Optional |
| `room.Private` | `ROOM_PRIVATE` | `false` | ⚠️ Optional |
| `room.Locked` | `ROOM_LOCKED` | `false` | ⚠️ Optional |
| `room.Background` | `ROOM_BACKGROUND` | `PartyBasement` | ⚠️ Optional |
| `room.Game` | `ROOM_GAME` | `""` (empty) | ⚠️ Optional |
| **Admin & Members** |
| `superusers` | `SUPERUSERS` | `[250927]` | ⚠️ Optional |
| `members` | `MEMBERS` | `[251024]` | ⚠️ Optional |
| `room.Admin` | `ROOM_ADMIN` | `[250927,254890]` | ⚠️ Optional |

---

### How to Set Variables in Railway

1. **Railway dashboard** → Your project → Variables tab
2. **Add variable** button
3. **Key**: `BOT_USER`
4. **Value**: `VeraBot1`
5. **Click**: Add
6. **Repeat** for each variable

OR: **Copy-paste all at once**

Click **Raw Editor** and paste:

```
BOT_USER=VeraBot1
BOT_PASSWORD=YourBotPassword123!
BOT_USER2=VeraBot2
BOT_PASSWORD2=YourBotPassword456!
BOT_USER3=VeraBot3
BOT_PASSWORD3=YourBotPassword789!
BOT_GAME=veratown
BOT_ENV=live
MONGODB_URI=mongodb+srv://olavceulemans_db_user:s3VtU80UmK8UwLYX@veratown.qk1s2r5.mongodb.net/ropeybot
MONGODB_DB=ropeybot
MONGODB_TLS=true
ROOM_NAME=Veratown
ROOM_LIMIT=20
ROOM_SPACE=X
ROOM_LANGUAGE=EN
ROOM_PRIVATE=false
ROOM_LOCKED=false
ROOM_BACKGROUND=PartyBasement
SUPERUSERS=[250927]
MEMBERS=[251024]
ROOM_ADMIN=[250927,254890]
NODE_ENV=production
```

---

### Minimum Required Variables

If you only want to set essentials (bot works with defaults for room):

```
BOT_USER=VeraBot1
BOT_PASSWORD=your_password_here
BOT_GAME=veratown
BOT_ENV=live
MONGODB_URI=mongodb+srv://user:pass@cluster.xxx.mongodb.net/ropeybot
MONGODB_DB=ropeybot
MONGODB_TLS=true
```

---

### Advanced: JSON Arrays for Admin

For arrays (superusers, members, admin):

**Option A: JSON format** (strict)
```
SUPERUSERS=[250927,250928]
MEMBERS=[251024,251025]
ROOM_ADMIN=[250927,254890]
```

**Option B: Single value**
```
SUPERUSERS=250927
```

The bot parses both formats. JSON arrays are recommended.

---

## Step 3: Deploy (1 min)

Click **Deploy** in Railway dashboard.

Railway will:
1. ✅ Detect Dockerfile
2. ✅ Build Docker image
3. ✅ Start container
4. ✅ Connect to MongoDB Atlas
5. ✅ Bot goes live

---

## Step 4: Verify Deployment (2 min)

### Check Logs

Railway dashboard → Deployments → Logs

Look for:
```
[Config] Configuration sources:
  - Bot: VeraBot1
  - Game: veratown
  - MongoDB: configured
  - Environment: live

Logged in.
Connector started.
Room joined
Starting game: Veratown
```

### Test Bot

In-game: `/bot help`

Should see casino/dare commands (if Veratown running).

### View Public URL

Railway dashboard → Deployments → Public URL

Example: `https://ropeybot-production-1234.railway.app`

(You don't need this for your bot, but it's there for health checks)

---

## Automatic Deployments

Every time you push to GitHub:

```bash
git commit -m "Update bot features"
git push origin main
```

Railway automatically:
1. Rebuilds Docker image
2. Restarts container
3. Bot updates live (no downtime)

---

## Managing the Bot

### View Logs

Railway dashboard → Logs tab → Real-time streaming

### Restart Bot

Railway dashboard → Deployments → Restart

### Update Configuration

1. Railway dashboard → Variables
2. Change value
3. Click "Save"
4. Railway auto-restarts with new config

### Scale Resources

Railway dashboard → Settings → Instance

- **Memory**: 512MB default (fine for bot)
- **CPU**: 0.5 CPU default (sufficient)

Increase if bot is slow:
```
Memory: 1GB
CPU: 1.0
```

---

## Cost Breakdown

| Item | Cost |
|------|------|
| Base container (512MB RAM) | Free (included in credit) |
| Outbound bandwidth | Free (included) |
| Logs storage | Free (included) |
| **Total** | **Free tier covers it** |

Or pay-as-you-go: ~$5/month for small container.

---

## Troubleshooting

### Bot not starting

**Check logs** for errors:

```
[Config] Configuration sources:
  - Bot: <missing>  ← BOT_USER not set!
```

**Solution**: Add missing environment variable in Railway dashboard.

### Connection timeout

Error: `Error: connect ECONNREFUSED` or `connect ETIMEDOUT`

**Possible causes**:
1. MONGODB_URI incorrect
2. MongoDB Atlas IP whitelist
3. Network issue

**Solutions**:
1. Verify MONGODB_URI in Railway variables
2. In MongoDB Atlas: Network Access → Add your IP (or 0.0.0.0/0)
3. Check MongoDB Atlas cluster is running

### Bot connects but no commands

**Check game is set**:
```
BOT_GAME=veratown
```

If missing, no game features load.

### Out of memory

Error: `JavaScript heap out of memory`

**Solution**: Increase memory in Railway dashboard → Settings

```
Memory: 1GB (was 512MB)
```

---

## Updating Bot Code

### Option A: Via GitHub (Recommended)

```bash
git clone https://github.com/Rarsus/veratown.git
cd veratown

# Make changes
git commit -m "Add feature"
git push origin main

# Railway auto-deploys!
```

View progress: Railway dashboard → Deployments

### Option B: Via Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Deploy
railway up

# Watch logs
railway logs
```

---

## Secrets Management

### Option A: GitHub Secrets (Recommended)

Store sensitive values in GitHub:

1. GitHub repo → Settings → Secrets → Actions
2. Add secrets:
   - `BOT_USER`
   - `BOT_PASSWORD`
   - `MONGODB_URI`
   - etc.

3. Reference in code/workflows:
   ```yaml
   BOT_USER=${{ secrets.BOT_USER }}
   ```

### Option B: Railway Secrets

Secrets in Railway dashboard:
- Not shown in logs
- Not visible to team members without permission
- Auto-rotated

---

## Advanced Configuration

### Custom Domain

Railway dashboard → Settings → Domains

Add custom domain (only needed if exposing via HTTPS):
```
ropeybot.example.com
```

### Environment-Specific Configs

Create separate Railway projects:
- `ropeybot-staging`
- `ropeybot-production`

Different env vars per project.

### GitHub Branch Deployments

In Railway settings:

```
Production: Deploy from 'main'
Staging: Deploy from 'staging'
Development: Deploy from 'develop'
```

---

## Monitoring & Alerts

### View Metrics

Railway dashboard → Deployments → Metrics

- CPU usage
- Memory usage
- Requests/sec
- Uptime

### Set Alerts

Railway dashboard → Settings → Alerts

Alerts for:
- Deployment failures
- High memory usage
- Service crashes
- Downtime

### Logs

Stream logs locally:
```bash
railway logs -f
```

---

## Scaling

### Horizontal Scaling

Railway supports multiple instances:

1. Dashboard → Settings → Instances
2. Set count: 2 or more
3. Railway load-balances traffic

For bots, usually 1 instance is enough (no external requests).

### Vertical Scaling

Increase memory/CPU in Settings → Instance.

---

## Backups

MongoDB Atlas handles all backups automatically:
- Hourly snapshots (free tier)
- 7-day retention
- Point-in-time restore

See [MONGODB_ATLAS_SETUP.md](MONGODB_ATLAS_SETUP.md#backup-strategy) for details.

---

## Migrating to Another Platform

Your bot is containerized, so moving is easy:

```
Railway → Cloud Run
Railway → Compute Engine
Railway → Render
Railway → Lightsail
```

Just deploy the same Docker container to another platform.

---

## When to Scale Beyond Railway

Consider upgrading if:
- ✅ Bot is reaching 1GB memory consistently
- ✅ Multiple game instances needed
- ✅ Need 99.99% uptime SLA
- ✅ Want dedicated database

Then migrate to:
- **Cloud Run** (Google Cloud, $2-5/month)
- **Kubernetes** (Scaling, multi-region)
- **Managed Services** (ECS, App Engine)

---

## See Also

- [docs/ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) - All config options
- [docs/MONGODB_ATLAS_SETUP.md](MONGODB_ATLAS_SETUP.md) - MongoDB Atlas guide
- [docs/VERATOWN_COMPLETE_GUIDE.md](VERATOWN_COMPLETE_GUIDE.md) - Game features

