# Ropeybot Build Environment Setup

This document guides you through setting up and preparing the ropeybot build environment.

## Prerequisites

- **Node.js 20+** (for local development)
- **pnpm** (https://pnpm.io/installation)
- **Docker** (for containerized deployment)
- **BC Account** with a dedicated bot account

## Step 1: Configure Bot Credentials

The workspace includes two configuration files:

- **`config.sample.json`** — Template with all available options (do not edit)
- **`config.json`** — Your active configuration (created, needs credentials)

### Update config.json

Edit `config.json` and replace:

```json
{
    "user": "YOUR_BOT_USERNAME_HERE",           // ← Replace with bot account username
    "password": "YOUR_BOT_PASSWORD_HERE",       // ← Replace with bot account password
    "env": "live",                              // "live" or "test"
    "game": "dare",                             // Game mode to run
    "room": {
        "Name": "Ropeybot Test Room",
        "Description": "A test room for ropeybot development",
        "Background": "PartyBasement",          // See BC backgrounds
        // ... other room settings
    }
}
```

**Available games:**
- `dare` — Simple dare drawing game
- `veratown` — Interactive Veratown map room (map-based example)
- `kidnappers` — Capture/escape game
- `roleplay` — Roleplay challenge
- `casino` — Casino games
- `maidspartynight` — Single-player adventure (requires 2 bot accounts)

**Note:** `config.json` is in `.gitignore` and will never be committed.

---

## Step 2: Install Dependencies

```bash
cd /home/olav/repo/ropeybot
pnpm install
```

This will:
1. Install root dependencies
2. Auto-run `pnpm install` in `src/` (via preinstall hook)
3. Set up bc-bot framework as a linked local package

**Expected output:**
```
✓ All dependencies resolved
✓ 120+ packages installed
```

---

## Step 3: Verify TypeScript Compilation

```bash
npm run types
```

Checks for type errors without building. Should output no errors (or only warnings if strict mode is relaxed).

---

## Step 4: Local Development (Optional)

To test locally before Docker:

```bash
npm start
```

This will:
1. Compile the bc-bot framework (`src/dist/`)
2. Run the bot with tsx (live TypeScript execution)
3. Connect to BC using credentials from `config.json`

**Expected output:**
```
[timestamp] Connected to server
[timestamp] Bot logged in as: YOUR_BOT_USERNAME_HERE
[timestamp] Entering game: dare
```

Press `Ctrl+C` to stop.

---

## Step 5: Build Production Bundle

```bash
npm run bundle
```

This will:
1. Compile bc-bot framework
2. Bundle everything into `dist/bundle.js`
3. Generate source maps for debugging
4. Output ready for Docker

**Expected output:**
```
✓ Compiled in 8.2s
✓ Bundled dist/bundle.js (1.2 MB)
```

---

## Step 6: Docker Deployment

### Option A: docker-compose (Recommended)

The workspace includes `docker-compose.yml` configured to:
- Build the image from the Dockerfile
- Mount `config.json` as read-only
- Enable interactive mode (logs visible)

**Build and run:**
```bash
docker-compose up --build
```

**Detached mode (background):**
```bash
docker-compose up -d
```

**View logs:**
```bash
docker-compose logs -f
```

**Stop:**
```bash
docker-compose down
```

### Option B: Manual Docker Commands

**Build image:**
```bash
docker build -t ropeybot .
```

**Run container:**
```bash
docker run --rm -it \
  -v ${PWD}/config.json:/bot/cfg/config.json \
  ropeybot
```

**With persistent logging:**
```bash
mkdir -p logs
docker run --rm -it \
  -v ${PWD}/config.json:/bot/cfg/config.json \
  -v ${PWD}/logs:/bot/logs \
  ropeybot
```

### Option C: Pre-built Image from GitHub

```bash
docker run --rm -it \
  -v ${PWD}/config.json:/bot/cfg/config.json \
  ghcr.io/FriendsOfBC/ropeybot:main
```

---

## File Structure After Setup

```
ropeybot/
├── config.json                 ✓ Created (with credentials)
├── config.sample.json          (reference template)
├── docker-compose.yml          ✓ Created (for Docker management)
├── .dockerignore               ✓ Created (build optimization)
├── Dockerfile                  (existing)
├── docs/
│   └── BUILD_SETUP.md          ✓ This file (plus the rest of the reference docs)
├── package.json
├── pnpm-lock.yaml
├── node_modules/               (after pnpm install)
├── dist/                       (after npm run bundle)
│   ├── bundle.js               (production bundle)
│   └── bundle.js.map           (source maps)
├── src/dist/                   (after npm run compile:bc-bot)
└── bin/
    ├── games/
    ├── hub/
    └── main.ts
```

---

## Environment Variables

### Local Development

No environment variables required. Uses values from `config.json`.

### Docker

Optional environment variables:

```bash
NODE_ENV=production   # Always set to production in Docker
```

Add to `docker-compose.yml` if needed:
```yaml
environment:
  NODE_ENV: production
  DEBUG: ropeybot:*  # Enable debug logging
```

---

## Troubleshooting

### `config.json` not found
```bash
cp config.sample.json config.json
# Then edit config.json with your credentials
```

### Compilation errors
```bash
npm run types
# Check output for type errors, fix as needed
```

### Docker build fails
```bash
docker build --no-cache -t ropeybot .
# Force rebuild without cache
```

### Bot disconnects after login
- Verify username/password in `config.json`
- Check `env` setting (live vs. test)
- Ensure account is not already logged in elsewhere
- Check BC server status

### Connection refused
- Verify internet connection
- Try switching `env` from "live" to "test"
- Check BC server URLs in logs

---

## Build Scripts Reference

| Command | Purpose | Output |
|---------|---------|--------|
| `pnpm install` | Install dependencies | `node_modules/` |
| `npm run types` | Type check (no build) | Type errors only |
| `npm run prettier` | Check code style | Report only |
| `npm run compile:bc-bot` | Compile framework | `src/dist/` |
| `npm start` | Run locally | Live execution |
| `npm run bundle` | Build for production | `dist/bundle.js` |
| `npm run docker` | Build Docker image | Docker image `ropeybot` |

---

## Next Steps

1. ✅ Install dependencies: `pnpm install`
2. ✅ Update `config.json` with bot credentials
3. ✅ Test locally: `npm start` (optional)
4. ✅ Build bundle: `npm run bundle`
5. ✅ Deploy: `docker-compose up`

For more details on the codebase, see [REPOSITORY_ANALYSIS.md](REPOSITORY_ANALYSIS.md).

For Bondage Club API information, refer to bc-stubs documentation and inline comments in `src/`.
