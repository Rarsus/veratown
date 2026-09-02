# Discord Bot Container Integration Guide

Complete guide to integrating the Discord bot administration interface into the Ropeybot container environment.

## Quick Start

### 1. Add Discord Credentials to config.json

```json
{
    "user": "YourBCBotName",
    "password": "YourBCBotPassword",
    "game": "veratown",
    "room": { "Name": "Veratown" },
    "mongo_uri": "mongodb+srv://user:pass@cluster.mongodb.net/",
    "mongo_db": "ropeybot",
    "discord_token": "YOUR_DISCORD_BOT_TOKEN",
    "discord_guild_id": "YOUR_DISCORD_SERVER_ID",
    "discord_admin_roles": ["ADMIN_ROLE_ID_1", "ADMIN_ROLE_ID_2"],
    "discord_audit_channel_id": "YOUR_AUDIT_CHANNEL_ID"
}
```

### 2. Build and Run

**Local Development:**

```bash
docker-compose -f docker-compose.local.yml up -d
```

**Production (Cloud):**

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 3. Verify Discord Bot Connected

```bash
docker logs ropeybot | grep -i discord
```

Expected output:

```
Discord bot logged in successfully
Slash commands registered successfully
```

---

## Detailed Configuration

### Docker Build Process

The `Dockerfile` uses a two-stage build:

```dockerfile
# Stage 1: Build
FROM node:20-slim AS build
- Installs pnpm
- Copies all source code
- Runs: pnpm install
- Runs: pnpm run bundle (compiles TypeScript + esbuild)
- Includes discord.js dependency (already in package.json)

# Stage 2: Runtime
FROM node:20-slim AS runtime
- Only copies bundle.js (~500KB)
- No source code or build tools
- Minimal attack surface
```

**Key Point**: The bundle already includes Discord bot code. No rebuild needed beyond normal build process.

### Environment Variables

Set Discord configuration via environment variables OR config.json. Priority: **env vars > config.json**

#### Option A: Using config.json (Recommended for dev)

```json
{
    "discord_token": "YOUR_TOKEN",
    "discord_guild_id": "YOUR_GUILD_ID",
    "discord_admin_roles": ["ROLE_ID_1", "ROLE_ID_2"],
    "discord_audit_channel_id": "CHANNEL_ID",
    "discord_enabled": true
}
```

Mount as read-only volume:

```yaml
volumes:
    - ./config.json:/bot/cfg/config.json:ro
```

#### Option B: Using Environment Variables (Recommended for prod)

In `docker-compose.yml`:

```yaml
services:
    ropeybot:
        environment:
            DISCORD_ENABLED: "true"
            DISCORD_TOKEN: ${DISCORD_TOKEN}
            DISCORD_GUILD_ID: ${DISCORD_GUILD_ID}
            DISCORD_ADMIN_ROLES: '["123456789", "987654321"]'
            DISCORD_AUDIT_CHANNEL_ID: ${DISCORD_AUDIT_CHANNEL_ID}
```

Create `.env` file (never commit to git):

```bash
DISCORD_TOKEN=your_bot_token_here
DISCORD_GUILD_ID=your_server_id
DISCORD_AUDIT_CHANNEL_ID=your_channel_id
```

Docker Compose will automatically load from `.env`.

### Secrets Management (Production)

**Never hardcode secrets in docker-compose files.**

#### Using Docker Secrets (Docker Swarm)

```yaml
services:
    ropeybot:
        environment:
            DISCORD_TOKEN_FILE: /run/secrets/discord_token
        secrets:
            - discord_token

secrets:
    discord_token:
        external: true # Set via: docker secret create discord_token
```

Access in code:

```typescript
const token = readFileSync(process.env.DISCORD_TOKEN_FILE, "utf-8").trim();
```

#### Using Environment Variables (Kubernetes/Cloud Run)

```yaml
# kubernetes
apiVersion: v1
kind: Pod
metadata:
    name: ropeybot
spec:
    containers:
        - name: ropeybot
          image: ropeybot:latest
          env:
              - name: DISCORD_TOKEN
                valueFrom:
                    secretKeyRef:
                        name: discord-secrets
                        key: token
```

#### Using .env File (Development Only)

```bash
# .env file (add to .gitignore)
DISCORD_ENABLED=true
DISCORD_TOKEN=your_actual_token_here
DISCORD_GUILD_ID=your_guild_id
DISCORD_ADMIN_ROLES='["role1", "role2"]'
```

Then:

```bash
docker run --env-file .env ropeybot:latest
```

---

## Docker Compose Configuration Examples

### Local Development (with local MongoDB)

**docker-compose.local.yml** (already configured, add Discord):

```yaml
version: "3.8"

services:
    mongo:
        image: mongo:7
        container_name: ropeybot-mongo
        restart: unless-stopped
        volumes:
            - mongo-data:/data/db
        environment:
            MONGO_INITDB_DATABASE: ropeybot

    ropeybot:
        build:
            context: .
            dockerfile: Dockerfile
        container_name: ropeybot
        restart: unless-stopped
        depends_on:
            - mongo
        volumes:
            - ./config.json:/bot/cfg/config.json:ro
        environment:
            NODE_ENV: production
            MONGODB_URI: "mongodb://mongo:27017/ropeybot"
            # Discord Configuration
            DISCORD_ENABLED: "true"
            DISCORD_TOKEN: ${DISCORD_TOKEN}
            DISCORD_GUILD_ID: ${DISCORD_GUILD_ID}
            DISCORD_ADMIN_ROLES: '["YOUR_ADMIN_ROLE_ID"]'
            DISCORD_AUDIT_CHANNEL_ID: ${DISCORD_AUDIT_CHANNEL_ID}
        stdin_open: true
        tty: true

volumes:
    mongo-data:
        driver: local
```

**Setup:**

```bash
# 1. Create .env file with Discord credentials
echo "DISCORD_TOKEN=your_token_here" > .env
echo "DISCORD_GUILD_ID=your_guild_id" >> .env
echo "DISCORD_AUDIT_CHANNEL_ID=your_channel_id" >> .env

# 2. Start services
docker-compose -f docker-compose.local.yml up -d

# 3. Check logs
docker-compose -f docker-compose.local.yml logs -f ropeybot
```

### Production Deployment (MongoDB Atlas + Discord)

**docker-compose.prod.yml** (updated):

```yaml
version: "3.8"

services:
    ropeybot:
        image: ${IMAGE_TAG:-us-central1-docker.pkg.dev/PROJECT/repo/ropeybot:latest}
        container_name: ropeybot
        restart: always

        volumes:
            - ./config.json:/bot/cfg/config.json:ro

        environment:
            NODE_ENV: production
            # MongoDB Atlas
            MONGODB_URI: ${MONGODB_URI}
            MONGODB_DB: ${MONGODB_DB:-ropeybot}

            # Discord Bot
            DISCORD_ENABLED: "true"
            DISCORD_TOKEN: ${DISCORD_TOKEN}
            DISCORD_GUILD_ID: ${DISCORD_GUILD_ID}
            DISCORD_ADMIN_ROLES: ${DISCORD_ADMIN_ROLES}
            DISCORD_AUDIT_CHANNEL_ID: ${DISCORD_AUDIT_CHANNEL_ID}

        # Health check
        healthcheck:
            test:
                [
                    "CMD",
                    "node",
                    "-e",
                    "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))",
                ]
            interval: 30s
            timeout: 10s
            retries: 3
            start_period: 40s

        stdin_open: true
        tty: true

        deploy:
            resources:
                limits:
                    cpus: "1"
                    memory: 1G
                reservations:
                    cpus: "0.5"
                    memory: 512M
```

**Production Deployment:**

```bash
# Set environment variables
export MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/"
export MONGODB_DB="ropeybot"
export DISCORD_TOKEN="your_token"
export DISCORD_GUILD_ID="your_guild_id"
export DISCORD_ADMIN_ROLES='["role1", "role2"]'
export DISCORD_AUDIT_CHANNEL_ID="channel_id"

# Deploy
docker-compose -f docker-compose.prod.yml up -d

# Monitor
docker-compose -f docker-compose.prod.yml logs -f
```

---

## Health Checks

Add health check endpoint to monitor Discord bot status:

**In `bin/main.ts` (future enhancement)**:

```typescript
import { createServer } from "http";

// Simple health check endpoint
const healthServer = createServer((req, res) => {
    if (req.url === "/health") {
        const health = {
            status: "ok",
            timestamp: new Date().toISOString(),
            bot: {
                bc_connected: botConnections?.primary?.isConnected() ?? false,
                discord_connected: isDiscordBotReady(),
                database: dbConnected,
            },
            uptime: process.uptime(),
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(health));
    } else {
        res.writeHead(404);
        res.end("Not Found");
    }
});

healthServer.listen(3000);
```

Docker Compose health check:

```yaml
healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

---

## Logging and Monitoring

### Container Logs

**View Discord bot logs:**

```bash
docker logs ropeybot | grep -i discord
```

**Follow logs in real-time:**

```bash
docker-compose logs -f ropeybot
```

**Filter by log level:**

```bash
docker logs ropeybot | grep "ERROR"
docker logs ropeybot | grep "WARN"
```

### Log Persistence (Optional)

Mount a volume for persistent logs:

```yaml
volumes:
    - ./logs:/bot/logs
    - ./config.json:/bot/cfg/config.json:ro

environment:
    LOG_FILE: /bot/logs/ropeybot.log
    LOG_LEVEL: info
```

### Monitoring Stack (Docker Swarm/Kubernetes)

For production monitoring, integrate with:

1. **Prometheus** - Metrics collection

    ```yaml
    - add port 9090 for metrics endpoint
    - export Discord bot command counters
    - export connection status metrics
    ```

2. **Grafana** - Visualization

    ```yaml
    - dashboard for Discord commands/hour
    - dashboard for bot connectivity
    - dashboard for player count
    ```

3. **Alert Manager** - Notifications
    ```yaml
    - Alert when Discord bot disconnects
    - Alert when database unavailable
    - Alert on high error rates
    ```

---

## Network Configuration

### Port Mapping

**Local Development:**

```yaml
ports:
    - "3000:3000" # Health check endpoint
    - "9090:9090" # Metrics endpoint (optional)
```

**Production:**

- No ports exposed (Discord doesn't need inbound connections)
- Bot initiates outbound connections to Discord
- Database connection via MongoDB Atlas (no local port)

### DNS & Service Discovery

**Docker Compose networking (automatic):**

```
Service name = hostname within network
ropeybot (container) can reach mongo:27017
```

**Custom networks:**

```yaml
networks:
    bot-network:
        driver: bridge

services:
    ropeybot:
        networks:
            - bot-network
    mongo:
        networks:
            - bot-network
```

---

## Troubleshooting

### Discord Bot Not Starting

**Check logs:**

```bash
docker logs ropeybot | grep -i discord
```

**Common issues:**

1. **Missing DISCORD_TOKEN**

    ```
    ERROR: Discord bot token not configured
    ```

    → Set `DISCORD_TOKEN` environment variable

2. **Invalid Guild ID**

    ```
    ERROR: Failed to register slash commands
    ```

    → Verify `DISCORD_GUILD_ID` is correct (18 digits)

3. **Permission issues**
    ```
    ERROR: Bot missing required permissions
    ```
    → In Discord Developer Portal:
    - Enable "Server Members Intent"
    - Grant "Send Messages", "Embed Links" permissions
    - Invite bot to server with `applications.commands` scope

### Container Exits Immediately

**Check exit code:**

```bash
docker logs ropeybot
docker inspect ropeybot | grep -A 5 "State"
```

**Common causes:**

- Invalid configuration file
- Missing MongoDB connection
- TypeScript compilation error
- Insufficient memory

### MongoDB Connection Failed

```bash
# Test connection from container
docker exec ropeybot node -e \
  "const {MongoClient} = require('mongodb'); \
   new MongoClient(process.env.MONGODB_URI).connect() \
   .then(() => console.log('Connected')).catch(e => console.error(e))"
```

### Discord Commands Not Showing

**Verify registration:**

```bash
docker logs ropeybot | grep "Slash commands registered"
```

**Re-register commands:**

- Delete old commands in Discord server settings
- Restart bot: `docker-compose restart ropeybot`
- Check logs for registration

---

## Performance Tuning

### Memory Limits

```yaml
deploy:
    resources:
        limits:
            memory: 512M # max memory usage
        reservations:
            memory: 256M # minimum reserved
```

**Recommended**:

- Development: 256M
- Production: 512M - 1G (depends on player count)

### CPU Limits

```yaml
deploy:
    resources:
        limits:
            cpus: "1" # 1 CPU core
        reservations:
            cpus: "0.5" # 0.5 CPU core
```

**Recommended**:

- Development: 0.5 cores
- Production: 1-2 cores

### Database Connection Pooling

Adjust in MongoDB connection:

```typescript
const mongoClient = new MongoClient(uri, {
    maxPoolSize: 10, // max connections
    minPoolSize: 2, // min connections
    maxIdleTimeMS: 45000, // idle timeout
});
```

---

## Security Best Practices

### 1. Never Commit Secrets

```bash
# Add to .gitignore
echo ".env" >> .gitignore
echo "config.json" >> .gitignore
```

### 2. Use Read-Only Volumes

```yaml
volumes:
    - ./config.json:/bot/cfg/config.json:ro # Read-only
```

### 3. Non-Root User (Future Enhancement)

```dockerfile
RUN useradd -m bot
USER bot
```

### 4. Resource Limits

```yaml
deploy:
    resources:
        limits:
            memory: 512M
            cpus: "1"
```

### 5. Restart Policy

```yaml
restart: unless-stopped # Auto-restart on crash
```

### 6. Secret Rotation

- Store Discord token in secure vault (AWS Secrets Manager, HashiCorp Vault)
- Rotate token periodically
- Use short-lived tokens if possible
- Monitor token usage

### 7. Network Isolation

```yaml
networks:
    bot-network:
        driver: bridge
# Only services on this network can communicate
```

---

## Deployment Scenarios

### Scenario 1: Local Development with Docker Compose

```bash
# Setup
docker-compose -f docker-compose.local.yml up -d

# Develop
# - Edit code locally
# - Restart container: docker-compose restart ropeybot
# - View logs: docker-compose logs -f

# Cleanup
docker-compose -f docker-compose.local.yml down
```

### Scenario 2: Cloud Run (Google Cloud)

```bash
# Build and push
gcloud builds submit --tag gcr.io/PROJECT/ropeybot

# Deploy
gcloud run deploy ropeybot \
    --image gcr.io/PROJECT/ropeybot \
    --set-env-vars DISCORD_TOKEN=$DISCORD_TOKEN \
    --set-env-vars MONGODB_URI=$MONGODB_URI \
    --memory 512M \
    --timeout 3600
```

### Scenario 3: Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
    name: ropeybot
spec:
    replicas: 1
    selector:
        matchLabels:
            app: ropeybot
    template:
        metadata:
            labels:
                app: ropeybot
        spec:
            containers:
                - name: ropeybot
                  image: ropeybot:latest
                  env:
                      - name: DISCORD_TOKEN
                        valueFrom:
                            secretKeyRef:
                                name: discord-secrets
                                key: token
                      - name: MONGODB_URI
                        valueFrom:
                            secretKeyRef:
                                name: mongo-secrets
                                key: uri
                  resources:
                      limits:
                          memory: "512Mi"
                          cpu: "1000m"
                      requests:
                          memory: "256Mi"
                          cpu: "500m"
                  livenessProbe:
                      httpGet:
                          path: /health
                          port: 3000
                      initialDelaySeconds: 30
                      periodSeconds: 10
```

### Scenario 4: Docker Swarm

```bash
# Initialize swarm
docker swarm init

# Create secrets
echo "your_token" | docker secret create discord_token -

# Deploy service
docker service create \
    --name ropeybot \
    --secret discord_token \
    -e DISCORD_TOKEN_FILE=/run/secrets/discord_token \
    -e MONGODB_URI=$MONGODB_URI \
    ropeybot:latest
```

---

## Related Documentation

- [Discord Bot Setup Guide](./README.md)
- [Dockerfile Details](../../Dockerfile)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [Docker Secrets Management](https://docs.docker.com/engine/swarm/secrets/)

---

## Checklist: Deploying Discord Bot in Container

- [ ] Discord bot token obtained from Discord Developer Portal
- [ ] Discord server ID configured
- [ ] Admin role IDs set in config
- [ ] Environment variables or config.json prepared
- [ ] Secrets not committed to git (.gitignore updated)
- [ ] Docker image rebuilt with `docker build`
- [ ] docker-compose.yml/local.yml updated with Discord env vars
- [ ] MongoDB connection tested
- [ ] Bot tested in development container
- [ ] Health check configured
- [ ] Logs monitored during startup
- [ ] Discord commands appear in server
- [ ] Admin commands tested with authorized users
- [ ] Production deployment configured
- [ ] Monitoring/alerting setup (optional but recommended)

---

**Last Updated**: 2026-09-02
**Version**: 1.0
