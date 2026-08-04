# Veratown+ Deployment on Google Cloud

Complete guide for deploying Veratown+ to Google Cloud with persistent MongoDB and automated updates via GitHub releases.

**Table of Contents**
1. [Quick Start (Recommended)](#quick-start-recommended)
2. [Option 1: Compute Engine + Docker Compose](#option-1-compute-engine--docker-compose)
3. [Option 2: Kubernetes Engine (GKE)](#option-2-kubernetes-engine-gke)
4. [Option 3: Cloud Run + Cloud SQL](#option-3-cloud-run--cloud-sql)
5. [GitHub Actions CI/CD](#github-actions-cicd)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Cost Optimization](#cost-optimization)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start (Recommended)

**Best for**: Single bot instance, minimal DevOps complexity, low cost

**Architecture**:
```
GitHub Release (tag)
        ↓
GitHub Actions CI/CD
        ↓
Build & push Docker image to Artifact Registry
        ↓
Deploy to Compute Engine VM
        ↓
MongoDB persistent disk
```

**Setup time**: ~30 minutes  
**Monthly cost**: $20-40 (depending on VM size)

---

## Option 1: Compute Engine + Docker Compose

**Recommended for production use of Veratown+**

### Step 1: Create Compute Engine VM

```bash
# Set variables
PROJECT_ID="your-gcp-project"
VM_NAME="veratown-bot"
ZONE="us-central1-a"  # Choose your region
DISK_SIZE="50GB"      # For bot + MongoDB data

# Create VM with persistent disk
gcloud compute instances create $VM_NAME \
  --project=$PROJECT_ID \
  --zone=$ZONE \
  --machine-type=e2-medium \
  --image-family=debian-11 \
  --image-project=debian-cloud \
  --boot-disk-size=20GB \
  --metadata=enable-oslogin=TRUE

# Create persistent disk for MongoDB
gcloud compute disks create ${VM_NAME}-mongo-disk \
  --project=$PROJECT_ID \
  --zone=$ZONE \
  --size=$DISK_SIZE \
  --type=pd-standard

# Attach disk to VM
gcloud compute instances attach-disk $VM_NAME \
  --disk=${VM_NAME}-mongo-disk \
  --project=$PROJECT_ID \
  --zone=$ZONE
```

### Step 2: SSH into VM and Initialize MongoDB Disk

```bash
# SSH into VM
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID

# Inside VM:
# Find the disk (should be /dev/sdb)
lsblk

# Format and mount the disk
sudo mkfs.ext4 -F /dev/sdb
sudo mkdir -p /data/mongodb
sudo mount /dev/sdb /data/mongodb
sudo chown -R $(whoami):$(whoami) /data/mongodb

# Make mount permanent (survives reboot)
echo '/dev/sdb /data/mongodb ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
```

### Step 3: Install Docker & Docker Compose

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
```

### Step 4: Clone Repository and Configure

```bash
# Clone repo
git clone https://github.com/FriendsOfBC/ropeybot.git
cd ropeybot

# Create config
cat > config.json << 'EOF'
{
    "user": "VeraBotMain",
    "password": "your-bot-password",
    "user2": "VeraBotShower",
    "password2": "shower-bot-password",
    "user3": "VeraBotCasino",
    "password3": "casino-bot-password",
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
```

### Step 5: Update docker-compose.yml for Persistence

Create/update `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  ropeybot:
    build:
      context: .
      dockerfile: Dockerfile
    image: gcr.io/YOUR_PROJECT/ropeybot:${VERSION}
    restart: always
    depends_on:
      - mongo
    volumes:
      - ./config.json:/bot/cfg/config.json:ro
    environment:
      - NODE_ENV=production
    networks:
      - veratown-network

  mongo:
    image: mongo:7
    restart: always
    volumes:
      - /data/mongodb:/data/db
      - mongo-config:/data/configdb
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_PASSWORD}
    ports:
      - "127.0.0.1:27017:27017"  # Local only
    networks:
      - veratown-network

networks:
  veratown-network:
    driver: bridge

volumes:
  mongo-config:
```

### Step 6: Deploy with Docker Compose

```bash
# Create .env file with variables
cat > .env << 'EOF'
VERSION=latest
MONGO_PASSWORD=your-strong-mongo-password
EOF

# Pull latest image (from Artifact Registry)
docker-compose -f docker-compose.prod.yml pull

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Verify
docker-compose -f docker-compose.prod.yml logs -f ropeybot
```

### Step 7: Setup Auto-Start on Reboot

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
WorkingDirectory=/home/$(whoami)/ropeybot
ExecStart=/usr/local/bin/docker-compose -f docker-compose.prod.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.prod.yml down
User=$(whoami)

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable veratown
sudo systemctl start veratown

# Verify
sudo systemctl status veratown
```

---

## Option 2: Kubernetes Engine (GKE)

**Best for**: Scaling, high availability, complex deployments

### Step 1: Create GKE Cluster

```bash
PROJECT_ID="your-gcp-project"
CLUSTER_NAME="veratown-cluster"
ZONE="us-central1-a"

# Create cluster
gcloud container clusters create $CLUSTER_NAME \
  --project=$PROJECT_ID \
  --zone=$ZONE \
  --num-nodes=1 \
  --machine-type=e2-medium \
  --enable-autorepair \
  --enable-autoupgrade \
  --enable-autoscaling \
  --min-nodes=1 \
  --max-nodes=3 \
  --enable-stackdriver-kubernetes

# Get credentials
gcloud container clusters get-credentials $CLUSTER_NAME \
  --zone=$ZONE \
  --project=$PROJECT_ID
```

### Step 2: Setup Persistent Volume

```bash
# Create storage class
kubectl apply -f - << 'EOF'
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: veratown-storage
provisioner: pd.csi.storage.gke.io
parameters:
  type: pd-standard
  replication-type: none
volumeBindingMode: WaitForFirstConsumer
EOF

# Create PersistentVolumeClaim for MongoDB
kubectl apply -f - << 'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mongodb-pvc
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: veratown-storage
  resources:
    requests:
      storage: 50Gi
EOF
```

### Step 3: Deploy MongoDB

```bash
kubectl apply -f - << 'EOF'
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongodb
spec:
  serviceName: mongodb
  replicas: 1
  selector:
    matchLabels:
      app: mongodb
  template:
    metadata:
      labels:
        app: mongodb
    spec:
      containers:
      - name: mongodb
        image: mongo:7
        ports:
        - containerPort: 27017
        env:
        - name: MONGO_INITDB_ROOT_USERNAME
          value: admin
        - name: MONGO_INITDB_ROOT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mongodb-secret
              key: password
        volumeMounts:
        - name: mongodb-storage
          mountPath: /data/db
      volumeClaims:
      - metadata:
          name: mongodb-storage
        spec:
          accessModes: [ "ReadWriteOnce" ]
          storageClassName: veratown-storage
          resources:
            requests:
              storage: 50Gi
---
apiVersion: v1
kind: Service
metadata:
  name: mongodb
spec:
  clusterIP: None
  ports:
  - port: 27017
    targetPort: 27017
  selector:
    app: mongodb
EOF
```

### Step 4: Create Secret for MongoDB Password

```bash
kubectl create secret generic mongodb-secret \
  --from-literal=password=$(openssl rand -base64 32)
```

### Step 5: Deploy Bot Pods

```bash
# Create ConfigMap for bot config
kubectl create configmap veratown-config --from-file=config.json

# Deploy bot
kubectl apply -f - << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: veratown-bot
spec:
  replicas: 1
  selector:
    matchLabels:
      app: veratown-bot
  strategy:
    type: Recreate  # Ensure clean shutdown before restart
  template:
    metadata:
      labels:
        app: veratown-bot
    spec:
      containers:
      - name: veratown
        image: gcr.io/YOUR_PROJECT/ropeybot:latest
        imagePullPolicy: Always
        env:
        - name: MONGO_URI
          value: mongodb://admin:$(MONGO_PASSWORD)@mongodb:27017/veratown?authSource=admin
        - name: MONGO_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mongodb-secret
              key: password
        volumeMounts:
        - name: config
          mountPath: /bot/cfg/
          readOnly: true
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          exec:
            command:
            - /bin/sh
            - -c
            - "ps aux | grep -i ropeybot || exit 1"
          initialDelaySeconds: 30
          periodSeconds: 10
      volumes:
      - name: config
        configMap:
          name: veratown-config
EOF
```

### Step 6: Setup Ingress (Optional - for webhooks)

```bash
kubectl apply -f - << 'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: veratown-ingress
  annotations:
    kubernetes.io/ingress.class: "gce"
spec:
  rules:
  - host: veratown.example.com
    http:
      paths:
      - path: /*
        pathType: ImplementationSpecific
        backend:
          service:
            name: veratown-bot
            port:
              number: 3000
EOF
```

---

## Option 3: Cloud Run + Cloud SQL

**Best for**: Serverless, auto-scaling, minimal management

### Step 1: Setup Cloud SQL for MongoDB

```bash
PROJECT_ID="your-gcp-project"
INSTANCE_ID="veratown-mongodb"

# Create Cloud SQL instance (MongoDB 7)
gcloud sql instances create $INSTANCE_ID \
  --project=$PROJECT_ID \
  --database-version=MONGODB_7 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --backup-start-time=02:00

# Set root password
gcloud sql users set-password root \
  --instance=$INSTANCE_ID \
  --password=$(openssl rand -base64 32)

# Get connection string
gcloud sql instances describe $INSTANCE_ID \
  --project=$PROJECT_ID \
  --format="value(connectionName)"
```

### Step 2: Build and Push Docker Image

```bash
# Configure Docker to use gcloud
gcloud auth configure-docker

# Build image
docker build -t gcr.io/$PROJECT_ID/ropeybot:latest .

# Push to Google Container Registry
docker push gcr.io/$PROJECT_ID/ropeybot:latest
```

### Step 3: Deploy to Cloud Run

```bash
gcloud run deploy veratown \
  --image gcr.io/$PROJECT_ID/ropeybot:latest \
  --platform managed \
  --region us-central1 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 3600s \
  --set-env-vars MONGO_URI="mongodb://root:PASSWORD@INSTANCE_IP:27017/veratown" \
  --vpc-connector veratown-connector \
  --no-allow-unauthenticated
```

**Note**: Cloud Run is stateless and may not be ideal for persistent bot connections. Compute Engine or GKE is recommended.

---

## GitHub Actions CI/CD

Automatically build and deploy on GitHub release tags.

### Step 1: Create GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Google Cloud

on:
  push:
    tags:
      - 'v*.*.*'  # Trigger on version tags

env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  IMAGE_NAME: ropeybot
  ARTIFACT_REGISTRY: us-central1-docker.pkg.dev
  VM_NAME: veratown-bot
  ZONE: us-central1-a

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    permissions:
      contents: read
      id-token: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v1
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v1

      - name: Configure Docker for Artifact Registry
        run: |
          gcloud auth configure-docker ${{ env.ARTIFACT_REGISTRY }}

      - name: Extract version from tag
        id: version
        run: |
          VERSION=${GITHUB_REF#refs/tags/}
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          echo "image_tag=${{ env.ARTIFACT_REGISTRY }}/${{ env.PROJECT_ID }}/docker-repo/${{ env.IMAGE_NAME }}:$VERSION" >> $GITHUB_OUTPUT

      - name: Build Docker image
        run: |
          docker build -t ${{ steps.version.outputs.image_tag }} .
          docker tag ${{ steps.version.outputs.image_tag }} ${{ env.ARTIFACT_REGISTRY }}/${{ env.PROJECT_ID }}/docker-repo/${{ env.IMAGE_NAME }}:latest

      - name: Push to Artifact Registry
        run: |
          docker push ${{ steps.version.outputs.image_tag }}
          docker push ${{ env.ARTIFACT_REGISTRY }}/${{ env.PROJECT_ID }}/docker-repo/${{ env.IMAGE_NAME }}:latest

      - name: Deploy to Compute Engine (Docker Compose)
        run: |
          gcloud compute ssh ${{ env.VM_NAME }} \
            --zone=${{ env.ZONE }} \
            --project=${{ env.PROJECT_ID }} \
            --command='
              cd ~/ropeybot && \
              git pull origin main && \
              echo "VERSION=${{ steps.version.outputs.version }}" > .env && \
              docker-compose -f docker-compose.prod.yml pull && \
              docker-compose -f docker-compose.prod.yml up -d && \
              docker-compose -f docker-compose.prod.yml logs -f ropeybot
            '

      - name: Notify Slack (optional)
        if: always()
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            {
              "text": "Veratown+ deployment: ${{ job.status }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Veratown+ Deployment*\nVersion: ${{ steps.version.outputs.version }}\nStatus: ${{ job.status }}"
                  }
                }
              ]
            }
```

### Step 2: Setup GitHub Secrets

Store in GitHub repo secrets:

```
GCP_PROJECT_ID          = your-gcp-project
WIF_PROVIDER            = projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider
WIF_SERVICE_ACCOUNT     = github-actions@your-gcp-project.iam.gserviceaccount.com
SLACK_WEBHOOK           = https://hooks.slack.com/services/... (optional)
```

### Step 3: Setup Workload Identity Federation (Recommended)

Instead of service account keys, use Workload Identity Federation for secure, keyless authentication:

```bash
PROJECT_ID="your-gcp-project"
GITHUB_REPO="Rarsus/veratown"

# Create Workload Identity Pool
gcloud iam workload-identity-pools create "github-pool" \
  --project=$PROJECT_ID \
  --location=global \
  --display-name="GitHub"

# Create Workload Identity Provider
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project=$PROJECT_ID \
  --location=global \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,assertion.aud=assertion.aud" \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-condition="assertion.repository == '$GITHUB_REPO'"

# Create Service Account
gcloud iam service-accounts create github-actions \
  --project=$PROJECT_ID \
  --display-name="GitHub Actions"

# Grant permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:github-actions@$PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/compute.instanceAdmin.v1

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:github-actions@$PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/artifactregistry.writer

# Setup IAM binding for GitHub
gcloud iam service-accounts add-iam-policy-binding \
  github-actions@$PROJECT_ID.iam.gserviceaccount.com \
  --project=$PROJECT_ID \
  --role=roles/iam.workloadIdentityUser \
  --condition='resource.name == "projects/-/locations/global/workloadIdentityPools/github-pool/providers/github-provider" && api.getAttribute("google.subject", ["aud"]) == "aud"'
```

### Step 4: Update Dockerfile for Tags

Ensure Dockerfile supports version tagging:

```dockerfile
FROM node:20-slim

WORKDIR /bot

# Copy source
COPY package*.json ./
COPY src ./src
COPY bin ./bin
COPY tsconfig.json ./
COPY .dockerignore ./

# Build
RUN npm ci && npm run build

# Runtime
FROM node:20-slim
WORKDIR /bot

COPY --from=0 /bot/dist ./dist
COPY --from=0 /bot/node_modules ./node_modules
COPY package.json ./

# Create config directory
RUN mkdir -p /bot/cfg

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

CMD ["node", "dist/bin/main.js"]
```

---

## Monitoring & Maintenance

### Step 1: Enable Cloud Logging

```bash
# Send logs to Cloud Logging
gcloud compute instances create $VM_NAME \
  --enable-display-device \
  --logging=cloud-logging=ENABLED

# View logs
gcloud logging read "resource.type=gce_instance AND resource.labels.instance_id=$VM_NAME" \
  --limit=50 \
  --format=json
```

### Step 2: Setup Alerts

```bash
# Create alert policy
gcloud alpha monitoring policies create \
  --notification-channels=$CHANNEL_ID \
  --display-name="Veratown Bot Down" \
  --condition-display-name="Process not running" \
  --condition-threshold-value=0 \
  --condition-threshold-duration=300s
```

### Step 3: Database Backups

```bash
# Automated backups for Cloud SQL
gcloud sql backups create \
  --instance=$INSTANCE_ID \
  --backup-configuration-backup-enabled=true \
  --backup-configuration-binary-log-enabled=true \
  --backup-configuration-backup-start-time=02:00

# Manual backup
gcloud sql backups create \
  --instance=$INSTANCE_ID
```

### Step 4: Monitoring Dashboard

Create Cloud Monitoring dashboard:

```bash
# View metrics
gcloud monitoring dashboards create --config-from-file=- << 'EOF'
{
  "displayName": "Veratown Bot",
  "mosaicLayout": {
    "columns": 12,
    "tiles": [
      {
        "width": 6,
        "height": 4,
        "widget": {
          "title": "CPU Usage",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"compute.googleapis.com/instance/cpu/usage_time\" resource.type=\"gce_instance\""
                }
              }
            }]
          }
        }
      },
      {
        "xPos": 6,
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Memory Usage",
          "xyChart": {
            "dataSets": [{
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "metric.type=\"agent.googleapis.com/memory/percent_used\" resource.type=\"gce_instance\""
                }
              }
            }]
          }
        }
      }
    ]
  }
}
EOF
```

---

## Cost Optimization

### Estimated Costs (Monthly)

| Option | Compute | Storage | Database | Total |
|--------|---------|---------|----------|-------|
| Compute Engine (e2-medium) | $20 | $5 | N/A | ~$25 |
| GKE (1 node) | $25 | $5 | N/A | ~$30 |
| Cloud Run + Cloud SQL | $0-50 | $0 | $15 | ~$15-65 |

### Cost Reduction Tips

1. **Use Committed Use Discounts**:
   ```bash
   gcloud compute reservations create veratown-reservation \
     --vm-count=1 \
     --machine-type=e2-medium \
     --zone=us-central1-a \
     --commitment-plan=one-year
   ```

2. **Auto-shutdown during off-hours**:
   ```bash
   # Create scheduler job to stop VM at 2am
   gcloud scheduler jobs create compute-engine stop-veratown \
     --schedule='0 2 * * *' \
     --location=us-central1 \
     --http-method=POST \
     --uri=https://compute.googleapis.com/compute/v1/projects/$PROJECT_ID/zones/$ZONE/instances/$VM_NAME/stop \
     --oidc-service-account-email=...
   ```

3. **Use shared core machines**:
   ```bash
   --machine-type=e2-small  # $10/month instead of e2-medium at $20/month
   ```

---

## Troubleshooting

### Deployment Issues

**Container won't start**:
```bash
# SSH into VM
gcloud compute ssh $VM_NAME --zone=$ZONE

# Check logs
docker-compose logs -f ropeybot

# Verify image exists
docker image ls | grep ropeybot
```

**MongoDB connection fails**:
```bash
# Test MongoDB connection
docker-compose exec mongo mongosh -u admin -p --eval "db.adminCommand('ping')"

# Check disk space
docker-compose exec mongo du -sh /data/db

# Verify persistent disk is mounted
mount | grep /data/mongodb
```

**GitHub Actions deployment hangs**:
```bash
# Check SSH key permissions
gcloud compute instances describe $VM_NAME \
  --zone=$ZONE \
  --format="value(metadata.items[name=ssh-keys].value)"

# Test SSH
gcloud compute ssh $VM_NAME --zone=$ZONE --command="echo 'SSH works'"
```

### Performance Issues

**High CPU/Memory**:
```bash
# Upgrade VM size
gcloud compute instances set-machine-type $VM_NAME \
  --machine-type=e2-standard-2 \
  --zone=$ZONE

# Scale GKE cluster
gcloud container clusters resize $CLUSTER_NAME \
  --num-nodes=2 \
  --zone=$ZONE
```

**Slow MongoDB queries**:
```bash
# Enable profiling
docker-compose exec mongo mongosh --eval "db.setProfilingLevel(1)"

# View slow queries
docker-compose exec mongo mongosh --eval "db.system.profile.find().limit(5).pretty()"
```

---

## Next Steps

1. **Choose deployment option** (Recommended: Option 1 for simplicity)
2. **Set up GCP project** with billing enabled
3. **Create Compute Engine VM** with persistent disk
4. **Configure GitHub Actions** for auto-deployment
5. **Setup monitoring** with Cloud Logging and Monitoring
6. **Test end-to-end** by creating a release tag
7. **Monitor first deployment** for issues
8. **Setup backup strategy** for MongoDB data

---

## References

- [Google Cloud Compute Engine](https://cloud.google.com/compute)
- [Google Kubernetes Engine](https://cloud.google.com/kubernetes-engine)
- [Google Cloud SQL](https://cloud.google.com/sql)
- [Google Cloud Run](https://cloud.google.com/run)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [Cloud Logging](https://cloud.google.com/logging)

---

**Last Updated**: 2026-08-04  
**Tested On**: Google Cloud (2024 SDKs)
