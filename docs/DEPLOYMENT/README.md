# Deployment Documentation

How to deploy Ropeybot to production and staging environments.

## Deployment Platforms

- **[Railway Deployment](RAILWAY_DEPLOYMENT.md)** - Deploy to Railway.app (primary production platform)
- **[Google Cloud Deployment](GOOGLE_CLOUD_DEPLOYMENT.md)** - Deploy to Google Cloud Platform
- **[Google Cloud Quick Start](GOOGLE_CLOUD_QUICK_START.md)** - Fast GCP setup guide

## Deployment Guides & Checklists

- **[Deployment Execution Plan](DEPLOYMENT_EXECUTION_PLAN.md)** - Step-by-step deployment process
- **[Verification Checklist](VERIFICATION_CHECKLIST.md)** - Pre-deployment verification steps
- **[Keypad Deployment Guide](KEYPAD_DEPLOYMENT_GUIDE.md)** - Keypad-specific deployment
- **[Keypad Deployment Checklist](KEYPAD_DEPLOYMENT_CHECKLIST.md)** - Keypad verification

## Configuration

- **[Environment Variables](../GUIDES/ENVIRONMENT_VARIABLES.md)** - Required env var reference

---

## 🚀 Quick Start - Deploy to Railway

```bash
# Ensure you're logged in
railway login

# Deploy current branch
railway up

# View logs
railway logs

# Manage variables
railway variables
```

See [Railway Deployment](RAILWAY_DEPLOYMENT.md) for detailed instructions.

---

## 🚀 Quick Start - Deploy to Google Cloud

```bash
# Configure authentication
gcloud auth login

# Deploy Docker image
gcloud run deploy ropeybot --image gcr.io/[PROJECT_ID]/ropeybot
```

See [Google Cloud Deployment](GOOGLE_CLOUD_DEPLOYMENT.md) for detailed setup.

---

## 📋 Pre-Deployment Checklist

Before deploying to production:

1. ✅ All tests passing locally (`pnpm test:unit`)
2. ✅ Formatting correct (`npx prettier --check .`)
3. ✅ Environment variables configured
4. ✅ Database migrations complete
5. ✅ Logs reviewed for errors
6. ✅ Run [Verification Checklist](VERIFICATION_CHECKLIST.md)

---

**See Also**: [Main Documentation Index](../README.md)
