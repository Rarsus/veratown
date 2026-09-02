# MongoDB Atlas Setup Guide

This guide explains how to use MongoDB Atlas (cloud-hosted MongoDB) with Veratown+.

## Why MongoDB Atlas?

✅ **Zero DevOps** - No database management required  
✅ **Automatic Backups** - Hourly snapshots, kept for 7 days (or longer with paid plan)  
✅ **Auto-Scaling** - Handles load automatically  
✅ **Stateless Containers** - Deploy anywhere (Cloud Run, Compute Engine, local)  
✅ **Free Tier** - 512 MB storage, plenty for Veratown+  
✅ **Low Cost** - ~$0-10/month for free/shared tier

## Quick Start (5 minutes)

### 1. Create MongoDB Atlas Account

1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Click **Try Free** and create account
3. Create a project (default name OK)
4. Create a cluster:
    - **Tier**: M0 (free)
    - **Cloud**: AWS, Google Cloud, or Azure (any region)
    - **Name**: "veratown" or similar
    - Click **Create**

Wait ~5-10 minutes for cluster to deploy.

### 2. Get Connection String

1. Go to your cluster → **Connect** button
2. Select **Drivers** tab
3. Choose **Node.js** version 5.0 or later
4. Copy the connection string
5. Replace `<password>` and `<database_name>` with your credentials

Example:

```
mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/ropeybot?retryWrites=true&w=majority
```

### 3. Create Database User

1. In Atlas console → **Database Access**
2. Click **Add New Database User**
3. **Auth Method**: Password
4. Create username and password (save these!)
5. **Database User Privileges**: Read and write to any database
6. Click **Add User**

Use these credentials in the connection string.

### 4. Add to config.json

Edit `config.json` and update:

```json
{
    "user": "your_bot_username",
    "password": "your_bot_password",
    "game": "veratown",
    "mongo_uri": "mongodb+srv://atlas_username:atlas_password@cluster0.xxxxx.mongodb.net/ropeybot",
    "mongo_db": "ropeybot",
    "mongo_tls": true
}
```

### 5. Update docker-compose.yml

Replace the entire file with:

```yaml
version: "3.8"

services:
    ropeybot:
        build:
            context: .
            dockerfile: Dockerfile
        container_name: ropeybot
        restart: unless-stopped

        volumes:
            - ./config.json:/bot/cfg/config.json:ro

        environment:
            NODE_ENV: production

        stdin_open: true
        tty: true
```

**Note**: No MongoDB service! All persistence handled by Atlas.

### 6. Start Bot

```bash
docker-compose up -d
docker-compose logs -f
```

Look for "Connecting to mongo..." in logs. If no errors, you're good!

---

## Troubleshooting

### Connection Timeout

**Problem**: `MongoServerError: connect ECONNREFUSED`

**Solutions**:

1. Check username/password in connection string
2. Verify IP whitelist: Atlas → Network Access → Add your IP
3. For Docker: Atlas automatically allows all IPs from Docker (no extra config needed)

### Authentication Failed

**Problem**: `MongoAuthenticationError: Invalid username or password`

**Solution**:

```bash
# Reset password in Atlas UI:
# Database Access → Click user → Edit → Change password
# Update config.json with new password
docker-compose restart
```

### Too Many Connections

**Problem**: `MongoServerError: too many connections from a single IP`

**Solution**: Increase connection pool in config.json:

```json
{
    "mongo_uri": "mongodb+srv://...?maxPoolSize=100"
}
```

### Database Not Found

**Problem**: `MongoOperationError: authentication failed`

**Solution**:

1. Verify database name in connection string (`/ropeybot`)
2. Ensure database user has correct privileges
3. Try connecting with MongoDB Compass to test

---

## Migration from Local MongoDB

If you have existing data in local MongoDB and want to migrate to Atlas:

### Export Local Database

```bash
# From container
docker-compose exec -T mongo mongodump --out=/tmp/dump

# Copy from container
docker cp ropeybot-mongo:/tmp/dump ./backup
```

### Import to Atlas

```bash
# Direct restore from local dump
docker run --rm \
  -v ./backup:/dump \
  mongo:7 \
  mongorestore \
    --uri="mongodb+srv://user:pass@cluster.xxx.mongodb.net" \
    --dir=/dump \
    --drop

# Or from existing container
docker-compose exec -T mongo mongorestore \
  --uri="mongodb+srv://user:pass@cluster.xxx.mongodb.net" \
  --dir=/tmp/dump \
  --drop
```

---

## Backup Strategy

### Automatic Backups (Free Tier)

MongoDB Atlas automatically:

- ✅ Backs up hourly
- ✅ Keeps 7 days of snapshots (free tier)
- ✅ Stores on AWS S3 (encrypted)
- ✅ Can be restored to any point-in-time

### Manual Backups (Snapshots)

1. Atlas console → **Backup** tab
2. Click **Take a Snapshot**
3. Name it and click **Create**
4. Later: Click **Restore** to restore to new cluster

### Automated Backups (Paid Tier)

For production, upgrade to M2+ tier:

- ✅ Continuous backups
- ✅ Longer retention (up to 90 days)
- ✅ Multiple restore points

---

## Cost Analysis

### Free Tier (M0)

- **Limit**: 512 MB storage, 100 concurrent connections
- **Cost**: $0
- **Suitable for**: Development, testing, small deployments

### Shared Tier (M2, M5)

- **Limit**: 2 GB - 5 GB storage
- **Cost**: $9-57/month
- **Suitable for**: Small production deployments

### Dedicated Tier (M10+)

- **Limit**: 10+ GB storage, auto-scaling
- **Cost**: $57+/month
- **Suitable for**: High-traffic production deployments

**For Veratown+**: Free tier M0 is plenty for:

- 700+ player records
- 80+ dares
- 30+ locations
- Game state

Only upgrade if you hit storage limit or need higher availability.

---

## Security Best Practices

### IP Whitelist

1. Atlas console → **Network Access**
2. Add your IP or `0.0.0.0/0` (allows all - not recommended for production)
3. For Docker: No config needed (Docker IPs are handled)
4. For Cloud Run: Whitelist Google Cloud range or use Service Account authentication

### Connection String

✅ **Safe**: Store in `config.json` (not in git)
✅ **Better**: Use environment variables
✅ **Best**: Use AWS Secrets Manager or Google Secret Manager

### Database User

✅ Create separate user per environment (dev/staging/prod)
✅ Use strong passwords (20+ characters, mixed case/numbers/symbols)
✅ Rotate passwords every 90 days
✅ Don't share passwords - use individual accounts per developer

---

## Monitoring

### Cloud Console Metrics

Atlas provides real-time monitoring:

- **Connections** - Current and historical
- **Operations** - Queries, inserts, updates
- **Disk usage** - Storage trend
- **CPU/Memory** - Resource utilization
- **Network** - In/out traffic

### Alerts

1. Click **Alerts** in Atlas console
2. Create rules for:
    - Disk usage > 80%
    - Connection count > 90
    - CPU usage > 70%
    - Member down or replication lag

---

## Advanced Configuration

### Connection Pooling

```json
{
    "mongo_uri": "mongodb+srv://...?maxPoolSize=50&minPoolSize=10"
}
```

### Replica Sets (Paid)

For redundancy, upgrade to paid tier:

- Automatic 3-node replication
- Automatic failover
- 99.99% SLA

### Sharding (Enterprise)

For massive scale (not needed for Veratown+):

- Horizontal data partitioning
- Automatic load distribution

---

## See Also

- [MongoDB Atlas Documentation](https://docs.mongodb.com/atlas/)
- [Connection String Reference](https://docs.mongodb.com/manual/reference/connection-string/)
- [MongoDB Compass](https://www.mongodb.com/products/compass) - GUI for exploring data
- [Google Cloud Deployment with Atlas](docs/GOOGLE_CLOUD_QUICK_START.md)
