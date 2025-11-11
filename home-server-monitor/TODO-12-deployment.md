# TODO-12: Production Deployment

> Deploy to TrueNAS Scale as a production service

## 📋 Phase Overview

**Objective**: Deploy the complete monitoring system to your TrueNAS server

**Duration**: 2-3 hours

**Prerequisites**:
- ✅ Phase 0-11 complete (all features tested)
- ✅ Docker running on TrueNAS
- ✅ Domain configured (for Cloudflare Tunnel)
- ✅ Backup of current system

## 🎯 Success Criteria

- [ ] Service running on TrueNAS
- [ ] Auto-starts on boot
- [ ] Survives system updates
- [ ] Logs properly configured
- [ ] Monitoring itself (meta!)
- [ ] Backup strategy implemented

## 📚 Learning Context

### Deployment Strategy

Given your TrueNAS setup:

1. **Apps Pool (1TB NVMe)**: Perfect for our application
2. **Docker via Portainer**: Already configured
3. **Cloudflare Tunnel**: No port forwarding needed
4. **Persistent Storage**: SQLite on apps pool
5. **Resource Limits**: Prevent resource exhaustion

## 🏗️ Architecture

```
TrueNAS Scale
    ↓
Apps Pool (NVMe)
    ↓
Docker Container
    ├── Home Server Monitor (3100)
    ├── Cloudflare Tunnel
    ├── Authentik Stack
    └── SQLite Database
```

## 📁 Deployment Files

```bash
deployment/
├── docker/
│   ├── Dockerfile.production    # Multi-stage build
│   ├── docker-compose.prod.yml  # Production compose
│   └── .dockerignore            # Build exclusions
├── k8s/                         # Optional Kubernetes
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml
├── scripts/
│   ├── deploy.sh               # Deployment script
│   ├── backup.sh               # Backup script
│   └── restore.sh              # Restore script
├── systemd/
│   └── homeserver-monitor.service
└── truenas/
    ├── app-config.json         # TrueNAS app config
    └── install-guide.md        # Installation steps
```

## 📝 Implementation Tasks

### 1. Production Dockerfile

Create `deployment/docker/Dockerfile.production`:

```dockerfile
# Build stage - Use Bun for speed
FROM oven/bun:1.0-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./
COPY client/package.json ./client/

# Install dependencies
RUN bun install --frozen-lockfile
RUN cd client && bun install --frozen-lockfile

# Copy source code
COPY . .

# Build frontend
RUN cd client && bun run build

# Build backend
RUN bun run build

# Prune dev dependencies
RUN bun install --production

# Runtime stage - Smaller final image
FROM oven/bun:1.0-alpine AS runtime

# Install required tools
RUN apk add --no-cache \
    curl \
    bash \
    sqlite \
    fail2ban \
    openssh-client \
    git

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

# Copy configs
COPY --chown=nodejs:nodejs config ./config
COPY --chown=nodejs:nodejs scripts ./scripts

# Create required directories
RUN mkdir -p logs data/db data/backups && \
    chown -R nodejs:nodejs logs data

# Environment
ENV NODE_ENV=production
ENV PORT=3100
ENV DATABASE_PATH=/app/data/db/homeserver.db
ENV LOG_DIR=/app/logs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3100/health || exit 1

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3100

# Start command
CMD ["bun", "run", "start"]
```

### 2. Production Docker Compose

Create `deployment/docker/docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  # Main application
  homeserver-monitor:
    image: homeserver-monitor:latest
    container_name: homeserver-monitor
    build:
      context: ../..
      dockerfile: deployment/docker/Dockerfile.production
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3100
      - DATABASE_PATH=/data/db/homeserver.db
      - LOG_LEVEL=info
      # TrueNAS API
      - TRUENAS_HOST=${TRUENAS_HOST}
      - TRUENAS_API_KEY=${TRUENAS_API_KEY}
      # Portainer
      - PORTAINER_URL=${PORTAINER_URL}
      - PORTAINER_API_KEY=${PORTAINER_API_KEY}
      # Cloudflare
      - CLOUDFLARE_TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
      # Authentik
      - AUTHENTIK_URL=${AUTHENTIK_URL}
      - AUTHENTIK_TOKEN=${AUTHENTIK_TOKEN}
      # Alerts
      - DISCORD_WEBHOOK_URL=${DISCORD_WEBHOOK_URL}
      - PUSHOVER_APP_TOKEN=${PUSHOVER_APP_TOKEN}
      - PUSHOVER_USER_KEY=${PUSHOVER_USER_KEY}
    volumes:
      - /mnt/apps/homeserver-monitor/data:/data
      - /mnt/apps/homeserver-monitor/logs:/app/logs
      - /var/run/docker.sock:/var/run/docker.sock:ro
    ports:
      - "3100:3100"
    networks:
      - monitor-network
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
      - "traefik.enable=false"  # Using Cloudflare Tunnel instead

  # Cloudflare Tunnel
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: homeserver-tunnel
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - monitor-network
    depends_on:
      - homeserver-monitor

  # Database backup
  db-backup:
    image: alpine:latest
    container_name: homeserver-backup
    restart: unless-stopped
    volumes:
      - /mnt/apps/homeserver-monitor/data:/data
      - /mnt/personal/backups/homeserver-monitor:/backup
    entrypoint: |
      sh -c 'while true; do
        echo "Backing up database..."
        cp -f /data/db/homeserver.db /backup/homeserver-$$(date +%Y%m%d-%H%M%S).db
        # Keep only last 7 days
        find /backup -name "homeserver-*.db" -mtime +7 -delete
        echo "Backup complete. Sleeping for 6 hours..."
        sleep 21600
      done'

networks:
  monitor-network:
    driver: bridge

volumes:
  monitor-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/apps/homeserver-monitor/data
  monitor-logs:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/apps/homeserver-monitor/logs
```

### 3. Deployment Script

Create `deployment/scripts/deploy.sh`:

```bash
#!/bin/bash

set -euo pipefail

# Configuration
DEPLOY_HOST="truenas.local"
DEPLOY_USER="admin"
DEPLOY_PATH="/mnt/apps/homeserver-monitor"
BACKUP_PATH="/mnt/personal/backups/homeserver-monitor"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    # Check if .env.vault exists
    if [[ ! -f ".env.vault" ]]; then
        error ".env.vault not found. Run 'bun run env:vault:encrypt' first."
        exit 1
    fi

    # Check if Docker is available on target
    if ! ssh "${DEPLOY_USER}@${DEPLOY_HOST}" "docker --version" &>/dev/null; then
        error "Docker not found on ${DEPLOY_HOST}"
        exit 1
    fi

    log "Prerequisites check passed ✓"
}

# Build Docker image
build_image() {
    log "Building Docker image..."

    docker build \
        -f deployment/docker/Dockerfile.production \
        -t homeserver-monitor:latest \
        -t homeserver-monitor:$(git rev-parse --short HEAD) \
        .

    log "Docker image built successfully ✓"
}

# Create deployment directories
setup_directories() {
    log "Setting up deployment directories..."

    ssh "${DEPLOY_USER}@${DEPLOY_HOST}" << EOF
        mkdir -p ${DEPLOY_PATH}/{data/db,logs,config}
        mkdir -p ${BACKUP_PATH}

        # Set permissions
        chmod 755 ${DEPLOY_PATH}
        chmod 755 ${DEPLOY_PATH}/data
        chmod 755 ${DEPLOY_PATH}/logs
EOF

    log "Directories created ✓"
}

# Transfer files
transfer_files() {
    log "Transferring files to ${DEPLOY_HOST}..."

    # Transfer docker-compose
    scp deployment/docker/docker-compose.prod.yml \
        "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/docker-compose.yml"

    # Transfer encrypted vault
    scp .env.vault \
        "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/.env.vault"

    # Transfer configs
    scp -r config/* \
        "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/config/"

    log "Files transferred ✓"
}

# Save and load Docker image
transfer_image() {
    log "Transferring Docker image..."

    # Save image
    docker save homeserver-monitor:latest | gzip > homeserver-monitor.tar.gz

    # Transfer
    scp homeserver-monitor.tar.gz "${DEPLOY_USER}@${DEPLOY_HOST}:/tmp/"

    # Load on remote
    ssh "${DEPLOY_USER}@${DEPLOY_HOST}" << EOF
        cd /tmp
        gunzip -c homeserver-monitor.tar.gz | docker load
        rm homeserver-monitor.tar.gz
EOF

    # Clean up local
    rm homeserver-monitor.tar.gz

    log "Docker image transferred ✓"
}

# Backup existing data
backup_existing() {
    log "Backing up existing data..."

    ssh "${DEPLOY_USER}@${DEPLOY_HOST}" << EOF
        if [[ -f "${DEPLOY_PATH}/data/db/homeserver.db" ]]; then
            cp ${DEPLOY_PATH}/data/db/homeserver.db \
               ${BACKUP_PATH}/homeserver-pre-deploy-$(date +%Y%m%d-%H%M%S).db
            log "Database backed up"
        fi
EOF

    log "Backup complete ✓"
}

# Deploy application
deploy_application() {
    log "Deploying application..."

    ssh "${DEPLOY_USER}@${DEPLOY_HOST}" << EOF
        cd ${DEPLOY_PATH}

        # Decrypt environment
        if [[ ! -f ".env" ]]; then
            echo "Enter vault decryption key:"
            read -s DOTENV_KEY
            export DOTENV_KEY
            npx dotenvx decrypt
        fi

        # Stop existing containers
        docker-compose down || true

        # Start new containers
        docker-compose up -d

        # Wait for health check
        sleep 10

        # Check status
        docker-compose ps
EOF

    log "Application deployed ✓"
}

# Run health checks
health_check() {
    log "Running health checks..."

    # Check container status
    ssh "${DEPLOY_USER}@${DEPLOY_HOST}" << EOF
        docker ps | grep homeserver-monitor

        # Check API health
        curl -f http://localhost:3100/health || exit 1
EOF

    log "Health checks passed ✓"
}

# Setup monitoring
setup_monitoring() {
    log "Setting up monitoring..."

    ssh "${DEPLOY_USER}@${DEPLOY_HOST}" << EOF
        # Add to Portainer
        # This would be done via Portainer UI

        # Setup log rotation
        cat > /etc/logrotate.d/homeserver-monitor << 'LOGROTATE'
${DEPLOY_PATH}/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
LOGROTATE
EOF

    log "Monitoring configured ✓"
}

# Main deployment flow
main() {
    log "Starting deployment to ${DEPLOY_HOST}..."

    check_prerequisites
    build_image
    setup_directories
    backup_existing
    transfer_files
    transfer_image
    deploy_application
    health_check
    setup_monitoring

    log "🎉 Deployment complete!"
    log "Access the application at:"
    log "  - Local: http://${DEPLOY_HOST}:3100"
    log "  - Public: https://monitor.yourdomain.com (via Cloudflare Tunnel)"
}

# Run main function
main "$@"
```

### 4. TrueNAS App Configuration

Create `deployment/truenas/app-config.json`:

```json
{
  "name": "Home Server Monitor",
  "version": "1.0.0",
  "description": "AI-powered monitoring and management for TrueNAS Scale",
  "categories": ["monitoring", "management"],
  "icon": "https://example.com/icon.png",
  "screenshots": [],
  "sources": [
    "https://github.com/yourusername/home-server-monitor"
  ],
  "requirements": {
    "architectures": ["amd64"],
    "resources": {
      "cpu": 0.5,
      "memory": "512Mi"
    }
  },
  "config": {
    "image": {
      "repository": "homeserver-monitor",
      "tag": "latest",
      "pullPolicy": "IfNotPresent"
    },
    "service": {
      "type": "ClusterIP",
      "port": 3100
    },
    "persistence": {
      "data": {
        "enabled": true,
        "mountPath": "/data",
        "size": "10Gi",
        "storageClass": "apps"
      },
      "logs": {
        "enabled": true,
        "mountPath": "/app/logs",
        "size": "5Gi"
      }
    },
    "env": {
      "NODE_ENV": "production",
      "PORT": "3100",
      "LOG_LEVEL": "info"
    },
    "envFrom": [
      {
        "secretRef": {
          "name": "homeserver-monitor-secrets"
        }
      }
    ],
    "probes": {
      "liveness": {
        "enabled": true,
        "path": "/health",
        "initialDelaySeconds": 30,
        "periodSeconds": 30
      },
      "readiness": {
        "enabled": true,
        "path": "/ready",
        "initialDelaySeconds": 10,
        "periodSeconds": 10
      }
    }
  }
}
```

### 5. Installation Guide

Create `deployment/truenas/install-guide.md`:

```markdown
# TrueNAS Scale Installation Guide

## Prerequisites

1. TrueNAS Scale 24.04.2.4 or later
2. Docker/Kubernetes enabled
3. Portainer installed (optional but recommended)
4. Domain name for Cloudflare Tunnel

## Method 1: Via Portainer (Recommended)

1. **Access Portainer**:
   ```
   http://truenas.local:9000
   ```

2. **Create Stack**:
   - Go to Stacks → Add Stack
   - Name: `homeserver-monitor`
   - Paste contents of `docker-compose.prod.yml`

3. **Configure Environment**:
   - Add environment variables
   - Upload `.env.vault`

4. **Deploy**:
   - Click "Deploy the stack"

5. **Verify**:
   ```bash
   docker ps | grep homeserver-monitor
   curl http://localhost:3100/health
   ```

## Method 2: Via TrueNAS Apps

1. **Prepare App**:
   ```bash
   # On TrueNAS
   mkdir -p /mnt/apps/homeserver-monitor
   cd /mnt/apps/homeserver-monitor
   ```

2. **Upload Files**:
   - Transfer `docker-compose.prod.yml`
   - Transfer `.env.vault`
   - Create data directories

3. **Create Custom App**:
   - Apps → Manage Catalogs → Add Catalog
   - Add custom app using `app-config.json`

4. **Configure Storage**:
   - Data: `/mnt/apps/homeserver-monitor/data`
   - Logs: `/mnt/apps/homeserver-monitor/logs`

5. **Deploy**:
   - Click Install
   - Configure environment variables
   - Start application

## Method 3: Manual Docker

```bash
# SSH into TrueNAS
ssh admin@truenas.local

# Navigate to apps directory
cd /mnt/apps/homeserver-monitor

# Decrypt environment
export DOTENV_KEY="your-key-here"
npx dotenvx decrypt

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose ps
```

## Post-Installation

1. **Configure Cloudflare Tunnel**:
   ```bash
   cloudflared tunnel create homeserver-monitor
   cloudflared tunnel route dns homeserver-monitor monitor.yourdomain.com
   ```

2. **Setup Authentik**:
   - Access Authentik at http://truenas.local:9000
   - Create application for Home Server Monitor
   - Configure OAuth2/SAML

3. **Configure Alerts**:
   - Set Discord webhook URL
   - Configure Pushover tokens
   - Test notifications

4. **Initial Configuration**:
   ```bash
   # Run initial setup
   docker exec -it homeserver-monitor bun run setup

   # Create admin user
   docker exec -it homeserver-monitor bun run user:create \
     --username admin \
     --email admin@example.com
   ```

## Verification

1. **Check Services**:
   ```bash
   # Container running
   docker ps | grep homeserver-monitor

   # API responding
   curl http://localhost:3100/health

   # Logs
   docker logs homeserver-monitor

   # Database
   docker exec homeserver-monitor sqlite3 /data/db/homeserver.db ".tables"
   ```

2. **Access Dashboard**:
   - Local: http://truenas.local:3100
   - Public: https://monitor.yourdomain.com

## Troubleshooting

### Container won't start
```bash
# Check logs
docker logs homeserver-monitor

# Check permissions
ls -la /mnt/apps/homeserver-monitor

# Fix permissions
chown -R 1001:1001 /mnt/apps/homeserver-monitor/data
```

### Can't connect to TrueNAS API
```bash
# Test API key
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://truenas.local/api/v2.0/system/info

# Check network
docker exec homeserver-monitor ping truenas.local
```

### Database issues
```bash
# Backup database
cp /mnt/apps/homeserver-monitor/data/db/homeserver.db \
   /mnt/personal/backups/homeserver.db.backup

# Check integrity
docker exec homeserver-monitor \
  sqlite3 /data/db/homeserver.db "PRAGMA integrity_check"

# Reset if needed
docker exec homeserver-monitor bun run db:reset
```

## Maintenance

### Updates
```bash
# Pull latest image
docker pull homeserver-monitor:latest

# Restart container
docker-compose down && docker-compose up -d
```

### Backups
```bash
# Manual backup
docker exec homeserver-monitor bun run backup

# Restore
docker exec homeserver-monitor bun run restore \
  --file /backup/homeserver-20240115.db
```

### Logs
```bash
# View logs
tail -f /mnt/apps/homeserver-monitor/logs/app.log

# Clean old logs
find /mnt/apps/homeserver-monitor/logs \
  -name "*.log" -mtime +30 -delete
```
```

### 6. Backup Script

Create `deployment/scripts/backup.sh`:

```bash
#!/bin/bash

set -euo pipefail

# Configuration
BACKUP_DIR="/mnt/personal/backups/homeserver-monitor"
DATA_DIR="/mnt/apps/homeserver-monitor/data"
RETENTION_DAYS=30

# Create backup
backup() {
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_file="${BACKUP_DIR}/backup-${timestamp}.tar.gz"

    echo "Creating backup: ${backup_file}"

    # Stop writes to database
    docker exec homeserver-monitor \
        sqlite3 /data/db/homeserver.db ".backup /tmp/backup.db"

    # Create tar archive
    tar -czf "${backup_file}" \
        -C "${DATA_DIR}" \
        db \
        || exit 1

    # Verify backup
    if tar -tzf "${backup_file}" > /dev/null 2>&1; then
        echo "Backup verified successfully"
    else
        echo "Backup verification failed!"
        exit 1
    fi

    # Clean old backups
    find "${BACKUP_DIR}" \
        -name "backup-*.tar.gz" \
        -mtime +${RETENTION_DAYS} \
        -delete

    echo "Backup complete: ${backup_file}"
}

# Restore backup
restore() {
    local backup_file="$1"

    if [[ ! -f "${backup_file}" ]]; then
        echo "Backup file not found: ${backup_file}"
        exit 1
    fi

    echo "Restoring from: ${backup_file}"

    # Stop application
    docker-compose down

    # Extract backup
    tar -xzf "${backup_file}" -C "${DATA_DIR}"

    # Start application
    docker-compose up -d

    echo "Restore complete"
}

# Main
case "${1:-}" in
    backup)
        backup
        ;;
    restore)
        restore "${2:-}"
        ;;
    *)
        echo "Usage: $0 {backup|restore <file>}"
        exit 1
        ;;
esac
```

## 🧪 Testing

### Pre-deployment Tests

```bash
# Build test
docker build -f deployment/docker/Dockerfile.production -t test-build .

# Run locally
docker run --rm -p 3100:3100 test-build

# Test endpoints
curl http://localhost:3100/health
curl http://localhost:3100/api/v1/status
```

### Post-deployment Tests

```bash
# SSH to TrueNAS
ssh admin@truenas.local

# Check containers
docker ps

# Check logs
docker logs homeserver-monitor

# Test API
curl http://localhost:3100/health

# Check database
docker exec homeserver-monitor \
  sqlite3 /data/db/homeserver.db "SELECT COUNT(*) FROM alerts;"
```

## 📚 Additional Resources

- [TrueNAS Apps Documentation](https://www.truenas.com/docs/scale/apps/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Kubernetes on TrueNAS](https://www.truenas.com/docs/scale/scaletutorials/apps/docker/)

## 🎓 Learning Notes

### Deployment Best Practices

1. **Always Backup**: Before any deployment
2. **Test First**: Deploy to staging/test environment
3. **Monitor Deployment**: Watch logs during rollout
4. **Have Rollback Plan**: Keep previous version ready
5. **Document Everything**: For future reference

## ✅ Completion Checklist

- [ ] Docker image built
- [ ] Environment variables configured
- [ ] Deployment directories created
- [ ] Application deployed to TrueNAS
- [ ] Cloudflare Tunnel connected
- [ ] Authentik SSO configured
- [ ] Monitoring active
- [ ] Backup strategy implemented
- [ ] Health checks passing
- [ ] Documentation complete

## 🚀 Next Steps

After deployment:

1. **Monitor Initial Run**:
   - Watch logs for first 24 hours
   - Check resource usage
   - Verify all integrations

2. **Fine-tune Configuration**:
   - Adjust alert thresholds
   - Configure quiet hours
   - Set remediation rules

3. **Test Disaster Recovery**:
   - Simulate failure
   - Test backup restore
   - Verify rollback procedure

4. **Optimize Performance**:
   - Analyze metrics
   - Tune database
   - Adjust resource limits

---

## 🎉 Congratulations!

You've successfully deployed a comprehensive, AI-powered monitoring system for your TrueNAS Scale server! The system now provides:

- ✅ Real-time monitoring
- ✅ Automatic problem resolution
- ✅ Security hardening
- ✅ AI assistance via Claude
- ✅ Smart alerting
- ✅ Self-healing capabilities

### What's Next?

1. **Use the MCP Integration**: Let Claude help manage your server
2. **Monitor and Learn**: Watch how the system handles issues
3. **Contribute Back**: Share your improvements with the community
4. **Stay Secure**: Keep the system updated

---

**Remember**: With great power comes great responsibility. Your server is now self-aware (kind of). Treat it well! 🤖