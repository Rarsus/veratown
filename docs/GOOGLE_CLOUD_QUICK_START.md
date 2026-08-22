# Google Cloud + GitHub Actions Quick Setup

Fast-track guide for deploying Veratown+ on Google Cloud with automatic container recreation on GitHub releases.

**Time**: 30-45 minutes  
**Cost**: ~$20-30/month

---

## TL;DR (Fastest Path)

```bash
# 1. Create Compute Engine VM
gcloud compute instances create veratown-bot \
  --zone=us-central1-a --machine-type=e2-medium \
  --image-family=debian-11 --image-project=debian-cloud

# 2. SSH and setup
gcloud compute ssh veratown-bot --zone=us-central1-a
# Inside VM:
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo apt-get install -y git
git clone https://github.com/FriendsOfBC/ropeybot.git
cd ropeybot
cp config.sample.json config.json  # Edit with your credentials
docker-compose up -d

# 3. Add GitHub Actions secrets and create .github/workflows/deploy.yml (see below)
# 4. Push a git tag: git tag v1.0.0 && git push origin v1.0.0
# 5. Watch deployment in GitHub Actions
```

---

## Prerequisites

- ☑️ Google Cloud project with billing enabled
- ☑️ `gcloud` CLI installed locally
- ☑️ GitHub repository (fork/clone of FriendsOfBC/ropeybot)
- ☑️ Admin access to both GCP and GitHub

---

## Step 1: Setup Compute Engine VM (5 min)

### Create the Instance

```bash
export PROJECT_ID="your-gcp-project"
export VM_NAME="veratown-bot"
export ZONE="us-central1-a"

gcloud compute instances create $VM_NAME \
  --project=$PROJECT_ID \
  --zone=$ZONE \
  --machine-type=e2-medium \
  --image-family=debian-11 \
  --image-project=debian-cloud \
  --boot-disk-size=20GB
```

### Create Persistent Disk for MongoDB

```bash
gcloud compute disks create ${VM_NAME}-mongo-disk \
  --project=$PROJECT_ID \
  --zone=$ZONE \
  --size=50GB \
  --type=pd-standard

gcloud compute instances attach-disk $VM_NAME \
  --disk=${VM_NAME}-mongo-disk \
  --project=$PROJECT_ID \
  --zone=$ZONE
```

---

## Step 2: Initialize VM (10 min)

### SSH and Setup Storage

```bash
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID
```

Inside the VM:

```bash
# Format and mount persistent disk
lsblk  # Should see /dev/sdb

sudo mkfs.ext4 -F /dev/sdb
sudo mkdir -p /data/mongodb
sudo mount /dev/sdb /data/mongodb
sudo chown -R $USER:$USER /data/mongodb

# Make mount permanent
echo '/dev/sdb /data/mongodb ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
```

### Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify
docker --version
docker-compose --version

# Need to logout and back in for group to take effect
logout
```

---

## Step 3: Deploy Application (5 min)

### Clone Repository

```bash
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID
```

Inside VM:

```bash
git clone https://github.com/Rarsus/veratown.git
cd veratown

# Create config
cat > config.json << 'EOF'
{
    "user": "VeraBotMain",
    "password": "your-password",
    "user2": "VeraBotShower",
    "password2": "shower-password",
    "user3": "VeraBotCasino",
    "password3": "casino-password",
    "game": "veratown",
    "mongo_uri": "mongodb://mongo:27017",
    "mongo_db": "veratown",
    "mongo_tls": false,
    "room": {
        "Name": "Veratown",
        "Description": "A persistent roleplay world",
        "Space": "X"
    }
}
EOF

# Start bot
docker-compose up -d
docker-compose logs -f  # Watch startup
```

### Verify It's Running

```bash
docker-compose ps
docker logs veratown-ropeybot-1  # Check for errors
docker exec veratown-mongo-1 mongosh -u admin -p --eval "db.adminCommand('ping')"
```

---

## Step 4: Setup Google Artifact Registry (5 min)

### Create Docker Repository

```bash
gcloud artifacts repositories create docker-repo \
  --project=$PROJECT_ID \
  --location=us-central1 \
  --repository-format=docker \
  --description="Docker images for Veratown+"
```

### Configure Docker Auth

Local machine (where you'll push images):

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build and push image (optional, for testing)
docker build -t us-central1-docker.pkg.dev/$PROJECT_ID/docker-repo/ropeybot:latest .
docker push us-central1-docker.pkg.dev/$PROJECT_ID/docker-repo/ropeybot:latest
```

---

## Step 5: Setup GitHub Secrets (5 min)

In your GitHub repo: **Settings → Secrets and variables → Actions**

Create these secrets:

| Secret           | Value                          |
| ---------------- | ------------------------------ |
| `GCP_PROJECT_ID` | Your GCP project ID            |
| `GCP_ZONE`       | `us-central1-a` (or your zone) |
| `GCP_VM_NAME`    | `veratown-bot`                 |

### For Authentication: Option A - Service Account Key (Simpler, Less Secure)

```bash
# Create service account
gcloud iam service-accounts create github-actions \
  --project=$PROJECT_ID

# Grant permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:github-actions@$PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/compute.instanceAdmin.v1

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:github-actions@$PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/artifactregistry.writer

# Create and download key
gcloud iam service-accounts keys create key.json \
  --iam-account=github-actions@$PROJECT_ID.iam.gserviceaccount.com

# Convert to base64 and add as GitHub secret GCP_SA_KEY
cat key.json | base64 > gcp_key_base64.txt
# Copy contents to GitHub secret GCP_SA_KEY
```

Add to GitHub secrets:

- `GCP_SA_KEY` = (base64-encoded service account key)

### For Authentication: Option B - Workload Identity (More Secure)

See [GOOGLE_CLOUD_DEPLOYMENT.md](GOOGLE_CLOUD_DEPLOYMENT.md#step-3-setup-workload-identity-federation-recommended) for detailed setup.

---

## Step 6: Create GitHub Actions Workflow (5 min)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Google Cloud

on:
    push:
        tags:
            - "v*.*.*" # Trigger on version tags like v1.0.0

env:
    PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
    IMAGE_NAME: ropeybot
    ARTIFACT_REGISTRY: us-central1-docker.pkg.dev
    VM_NAME: ${{ secrets.GCP_VM_NAME }}
    ZONE: ${{ secrets.GCP_ZONE }}

jobs:
    build-and-deploy:
        runs-on: ubuntu-latest

        steps:
            - name: Checkout code
              uses: actions/checkout@v3

            - name: Authenticate to Google Cloud
              uses: google-github-actions/auth@v1
              with:
                  credentials_json: ${{ secrets.GCP_SA_KEY }}

            - name: Set up Cloud SDK
              uses: google-github-actions/setup-gcloud@v1

            - name: Configure Docker for Artifact Registry
              run: |
                  gcloud auth configure-docker us-central1-docker.pkg.dev

            - name: Extract version from tag
              id: version
              run: |
                  VERSION=${GITHUB_REF#refs/tags/}
                  IMAGE_TAG="us-central1-docker.pkg.dev/$PROJECT_ID/docker-repo/$IMAGE_NAME:$VERSION"
                  echo "version=$VERSION" >> $GITHUB_OUTPUT
                  echo "image_tag=$IMAGE_TAG" >> $GITHUB_OUTPUT

            - name: Build Docker image
              run: |
                  docker build -t ${{ steps.version.outputs.image_tag }} .
                  docker tag ${{ steps.version.outputs.image_tag }} us-central1-docker.pkg.dev/$PROJECT_ID/docker-repo/$IMAGE_NAME:latest

            - name: Push to Artifact Registry
              run: |
                  docker push ${{ steps.version.outputs.image_tag }}
                  docker push us-central1-docker.pkg.dev/$PROJECT_ID/docker-repo/$IMAGE_NAME:latest

            - name: Deploy to Compute Engine
              run: |
                  gcloud compute ssh $VM_NAME \
                    --zone=$ZONE \
                    --project=$PROJECT_ID \
                    --command='
                      cd ~/veratown && \
                      git pull origin main && \
                      echo "VERSION=${{ steps.version.outputs.version }}" > .env && \
                      sed -i "s|image:.*ropeybot.*|image: us-central1-docker.pkg.dev/$PROJECT_ID/docker-repo/ropeybot:${{ steps.version.outputs.version }}|" docker-compose.yml && \
                      docker-compose pull && \
                      docker-compose up -d && \
                      echo "Deployment complete" && \
                      docker-compose logs -f --tail=20 ropeybot
                    '

            - name: Print deployment status
              run: echo "✅ Veratown+ deployed version ${{ steps.version.outputs.version }}"
```

---

## Step 7: Make SSH Work (5 min)

### Add GitHub's SSH Key to VM

For gcloud to SSH from GitHub Actions, add GitHub runner's SSH key:

```bash
# Local machine
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID \
  --command="echo 'SSH works'"

# This auto-creates SSH keys
# GitHub Actions will use the same mechanism
```

**Alternative**: Use service account impersonation in workflow (more secure):

```yaml
- name: Authenticate to Google Cloud
  uses: google-github-actions/auth@v1
  with:
      credentials_json: ${{ secrets.GCP_SA_KEY }}
      skip_credentials_setup: false
      cleanup_credentials: true
```

---

## Step 8: Test the Workflow (5 min)

### Create a Release

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Watch Deployment

1. Go to GitHub repo → **Actions**
2. Click running workflow
3. Monitor `build-and-deploy` job
4. Check deployment logs (should see Docker build → push → SSH deploy)

### Verify on VM

```bash
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID
cd ~/veratown
docker-compose ps
docker-compose logs -f ropeybot
```

---

## Step 9: Setup Auto-Start on Reboot (5 min)

Make containers start automatically after VM reboot:

```bash
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID
```

Inside VM:

```bash
# Create systemd service
sudo tee /etc/systemd/system/veratown.service > /dev/null << 'EOF'
[Unit]
Description=Veratown Bot
After=network.target docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$HOME/veratown
ExecStart=/usr/local/bin/docker-compose -f docker-compose.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.yml down
User=$USER

[Install]
WantedBy=multi-user.target
EOF

# Enable service
sudo systemctl daemon-reload
sudo systemctl enable veratown
sudo systemctl start veratown

# Verify
sudo systemctl status veratown
```

---

## Step 10: Monitor Deployments (Optional)

### View Logs from GitHub Actions

After creating release, logs auto-stream to:

- **GitHub**: Actions tab in repo
- **Google Cloud**: Cloud Logging (if enabled)
- **VM logs**: `docker logs ropeybot`

### Setup Cloud Monitoring (Optional)

```bash
gcloud compute instances create $VM_NAME \
  --enable-display-device \
  --logging=cloud-logging=ENABLED
```

View logs:

```bash
gcloud logging read "resource.type=gce_instance AND resource.labels.instance_id=$VM_NAME" \
  --limit=50 --format=text
```

---

## Common Commands

### Restart Bot

```bash
# Via SSH
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID \
  --command="cd ~/veratown && docker-compose restart"

# Or manually deploy a new version
git tag v1.0.1
git push origin v1.0.1
```

### Check Status

```bash
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID \
  --command="cd ~/veratown && docker-compose ps && docker-compose logs -f --tail=20"
```

### Update Config (without redeploying)

```bash
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID

# Inside VM:
nano config.json
docker-compose restart ropeybot
```

### View Recent Logs

```bash
gcloud logging read "resource.type=gce_instance" \
  --limit=20 \
  --format="table(timestamp, textPayload)" \
  --project=$PROJECT_ID
```

---

## Troubleshooting

### GitHub Actions Fails

**Check logs**:

- GitHub: **Actions tab → workflow run → build-and-deploy → deployment step**
- Usually: SSH auth failed or image push failed

**Fix SSH auth**:

```bash
# Re-auth gcloud locally
gcloud auth login
gcloud config set project $PROJECT_ID

# Test SSH manually
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID --command="echo 'SSH works'"
```

### Deployment Hangs

**Likely cause**: MongoDB not responding

```bash
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID
cd ~/veratown
docker-compose ps
docker-compose logs mongo
docker exec veratown-mongo-1 mongosh --eval "db.adminCommand('ping')"
```

### Bot Crashes After Update

**Check logs**:

```bash
docker-compose logs -f ropeybot | tail -50
```

**Rollback to previous version**:

```bash
cd ~/veratown
git log --oneline | head -5
git checkout <previous-tag>
docker-compose up -d
```

### Out of Disk Space

```bash
# Check disk usage
df -h
du -sh /data/mongodb

# Clean up Docker images
docker image prune -a
```

---

## Next Steps

1. ✅ VM created
2. ✅ Docker installed
3. ✅ Bot running
4. ✅ GitHub Actions configured
5. ✅ First deployment tested

**Now**:

- Create releases via git tags
- Each tag triggers auto-deployment
- Monitor via GitHub Actions + Cloud Logging
- Adjust MongoDB disk size as needed

**Advanced**:

- [Setup Workload Identity Federation](GOOGLE_CLOUD_DEPLOYMENT.md#step-3-setup-workload-identity-federation-recommended) (more secure)
- [Enable Cloud Monitoring dashboard](GOOGLE_CLOUD_DEPLOYMENT.md#step-4-monitoring-dashboard)
- [Setup Cloud SQL for managed MongoDB](GOOGLE_CLOUD_DEPLOYMENT.md#step-1-setup-cloud-sql-for-mongodb)
- [Deploy to Kubernetes (GKE)](GOOGLE_CLOUD_DEPLOYMENT.md#option-2-kubernetes-engine-gke) for higher availability

---

**For complete deployment guide**, see [docs/GOOGLE_CLOUD_DEPLOYMENT.md](GOOGLE_CLOUD_DEPLOYMENT.md)

**Support**: Check troubleshooting section above or refer to [docs/VERATOWN_COMPLETE_GUIDE.md#troubleshooting](docs/VERATOWN_COMPLETE_GUIDE.md#troubleshooting)
