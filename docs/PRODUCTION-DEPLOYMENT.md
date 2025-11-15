# Production Deployment Guide

> Comprehensive guide for deploying Home Server Monitor in production environments

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Database Configuration](#database-configuration)
4. [Security Hardening](#security-hardening)
5. [Monitoring & Observability](#monitoring--observability)
6. [Reverse Proxy Setup](#reverse-proxy-setup)
7. [SSL/TLS Certificates](#ssltls-certificates)
8. [Backup & Recovery](#backup--recovery)
9. [Performance Tuning](#performance-tuning)
10. [Health Checks](#health-checks)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **OS**: Linux (Ubuntu 22.04 LTS recommended)
- **Node.js**: v20.0.0 or higher
- **Memory**: Minimum 2GB RAM, 4GB recommended
- **Storage**: 10GB for application + database growth
- **Network**: Static IP or DDNS recommended

### Required Services

- TrueNAS SCALE (for ZFS monitoring)
- Portainer (for Docker container management)
- Optional: Authentik, Cloudflare Tunnel, Fail2ban

---

## Initial Setup

### 1. Clone and Install

```bash
# Clone repository
git clone https://github.com/yourusername/home-server-manager.git
cd home-server-manager

# Install dependencies
pnpm install

# Build application
pnpm run build
```

### 2. Environment Configuration

```bash
# Copy example environment file
cp .env.example .env

# Edit with your production values
nano .env
```

**Critical Environment Variables:**

```bash
# Server
NODE_ENV=production
PORT=3100
HOST=0.0.0.0

# Security - GENERATE STRONG KEYS!
API_KEYS=<generate-strong-key-1>,<generate-strong-key-2>
ADMIN_API_KEY=<generate-admin-key>
ALLOWED_ORIGINS=https://yourdomain.com

# TrueNAS
TRUENAS_HOST=<your-truenas-ip>
TRUENAS_API_KEY=<your-truenas-api-key>

# Portainer
PORTAINER_HOST=<your-portainer-ip>
PORTAINER_PORT=9000
PORTAINER_TOKEN=<your-portainer-token>

# Database
DB_PATH=/var/lib/home-server-monitor/monitor.db
```

**Generate Secure API Keys:**

```bash
# Generate random API keys
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Database Migration

```bash
# Run database migrations
pnpm run db:migrate

# Verify migration
pnpm run db:migrate
```

---

## Security Hardening

### API Key Authentication

All API endpoints should require authentication in production:

```typescript
// Example: Protect sensitive endpoints
import { verifyApiKey, verifyAdmin } from './utils/auth.js';

// Regular operations
fastify.get('/api/monitoring/pools', {
  preHandler: [verifyApiKey],
  handler: async (request, reply) => {
    // Your handler
  },
});

// Admin operations
fastify.delete('/api/docker/containers/:id', {
  preHandler: [verifyApiKey, verifyAdmin],
  handler: async (request, reply) => {
    // Your handler
  },
});
```

### Rate Limiting

Install and configure rate limiting:

```bash
pnpm add @fastify/rate-limit
```

```typescript
import rateLimit from '@fastify/rate-limit';

await fastify.register(rateLimit, {
  max: 100, // Max 100 requests
  timeWindow: '1 minute', // Per minute
  allowList: ['127.0.0.1'], // Whitelist localhost
});
```

### CORS Configuration

Update CORS settings for production:

```typescript
await fastify.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || false,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
});
```

### Environment Variable Validation

Validate critical environment variables on startup:

```typescript
const required = ['TRUENAS_HOST', 'TRUENAS_API_KEY', 'PORTAINER_TOKEN'];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}
```

---

## Monitoring & Observability

### Prometheus Metrics

The application exposes Prometheus metrics at `/metrics`:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'home-server-monitor'
    static_configs:
      - targets: ['localhost:3100']
    scrape_interval: 30s
```

**Available Metrics:**

- `home_server_http_request_duration_seconds` - Request latency
- `home_server_http_requests_total` - Total requests
- `home_server_zfs_pool_health` - Pool health status
- `home_server_docker_container_status` - Container status
- `home_server_disk_failure_prediction_score` - Disk failure risk
- `home_server_active_alerts_total` - Active alerts

### Grafana Dashboards

Import pre-built dashboards:

1. Navigate to Grafana
2. Import dashboard from `infrastructure-templates/grafana/`
3. Select Prometheus data source

### Log Aggregation

Configure structured logging:

```bash
# Environment variable
LOG_LEVEL=info
LOG_FORMAT=json
```

For centralized logging with Loki:

```yaml
# docker-compose.yml
services:
  loki:
    image: grafana/loki:latest
    ports:
      - '3100:3100'

  promtail:
    image: grafana/promtail:latest
    volumes:
      - ./logs:/var/log
      - ./promtail-config.yml:/etc/promtail/config.yml
```

---

## Reverse Proxy Setup

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/home-server-monitor
upstream home_server_monitor {
    server localhost:3100;
    keepalive 64;
}

server {
    listen 80;
    server_name monitor.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name monitor.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/monitor.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monitor.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://home_server_monitor;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API and static files
    location / {
        proxy_pass http://home_server_monitor;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint (no auth required)
    location /health {
        proxy_pass http://home_server_monitor;
        access_log off;
    }

    # Metrics endpoint (restrict access)
    location /metrics {
        proxy_pass http://home_server_monitor;
        allow 10.0.0.0/8;    # Internal network
        deny all;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/home-server-monitor /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Traefik Configuration

```yaml
# docker-compose.yml
labels:
  - 'traefik.enable=true'
  - 'traefik.http.routers.monitor.rule=Host(`monitor.yourdomain.com`)'
  - 'traefik.http.routers.monitor.entrypoints=websecure'
  - 'traefik.http.routers.monitor.tls.certresolver=letsencrypt'
  - 'traefik.http.services.monitor.loadbalancer.server.port=3100'
```

---

## SSL/TLS Certificates

### Let's Encrypt (Certbot)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d monitor.yourdomain.com

# Auto-renewal is configured by default
# Test renewal
sudo certbot renew --dry-run
```

### Certificate Monitoring

Add to your monitoring:

```bash
# Check certificate expiry
echo | openssl s_client -servername monitor.yourdomain.com \
  -connect monitor.yourdomain.com:443 2>/dev/null | \
  openssl x509 -noout -dates
```

---

## Backup & Recovery

### Database Backup

```bash
#!/bin/bash
# backup-db.sh

BACKUP_DIR="/var/backups/home-server-monitor"
DB_PATH="/var/lib/home-server-monitor/monitor.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database
cp "$DB_PATH" "$BACKUP_DIR/monitor_${TIMESTAMP}.db"

# Compress
gzip "$BACKUP_DIR/monitor_${TIMESTAMP}.db"

# Keep last 30 days
find "$BACKUP_DIR" -name "monitor_*.db.gz" -mtime +30 -delete

echo "Backup completed: monitor_${TIMESTAMP}.db.gz"
```

### Automated Backups (Cron)

```bash
# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * /usr/local/bin/backup-db.sh >> /var/log/backup.log 2>&1
```

### Restore from Backup

```bash
# Stop application
sudo systemctl stop home-server-monitor

# Restore database
gunzip -c /var/backups/home-server-monitor/monitor_20250112_020000.db.gz > \
  /var/lib/home-server-monitor/monitor.db

# Start application
sudo systemctl start home-server-monitor
```

---

## Performance Tuning

### Node.js Optimization

```bash
# Set Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096"

# Enable production optimizations
NODE_ENV=production
```

### Database Optimization

```sql
-- Enable Write-Ahead Logging
PRAGMA journal_mode=WAL;

-- Set cache size (in pages, -2000 = 2MB)
PRAGMA cache_size=-10000;

-- Optimize queries
PRAGMA optimize;

-- Analyze tables
ANALYZE;
```

### Caching Strategy

Already configured via @fastify/caching:

- Expensive API endpoints: 30s cache
- Static assets: 1 hour cache
- Health checks: No cache

---

## Health Checks

### Application Health

```bash
# Health check
curl http://localhost:3100/health

# Expected response
{
  "status": "healthy",
  "checks": {
    "server": true,
    "database": true,
    "truenas": true,
    "portainer": true
  }
}
```

### Kubernetes Health Probes

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: home-server-monitor
      image: home-server-monitor:latest
      livenessProbe:
        httpGet:
          path: /live
          port: 3100
        initialDelaySeconds: 30
        periodSeconds: 10
      readinessProbe:
        httpGet:
          path: /ready
          port: 3100
        initialDelaySeconds: 10
        periodSeconds: 5
```

### Systemd Service

```ini
# /etc/systemd/system/home-server-monitor.service
[Unit]
Description=Home Server Monitor
After=network.target

[Service]
Type=simple
User=monitor
WorkingDirectory=/opt/home-server-monitor
Environment="NODE_ENV=production"
EnvironmentFile=/opt/home-server-monitor/.env
ExecStart=/usr/bin/node /opt/home-server-monitor/dist/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/home-server-monitor

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable home-server-monitor
sudo systemctl start home-server-monitor
sudo systemctl status home-server-monitor
```

---

## Troubleshooting

### Common Issues

**Database Locked**

```bash
# Check for other processes
lsof /var/lib/home-server-monitor/monitor.db

# Enable WAL mode
sqlite3 /var/lib/home-server-monitor/monitor.db "PRAGMA journal_mode=WAL;"
```

**High Memory Usage**

```bash
# Check Node.js heap
curl http://localhost:3100/metrics | grep nodejs_heap

# Increase memory limit
NODE_OPTIONS="--max-old-space-size=4096"
```

**WebSocket Connection Issues**

```bash
# Check nginx configuration
sudo nginx -t

# Verify upgrade headers
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  http://localhost:3100/socket.io/
```

**TrueNAS Connection Failures**

```bash
# Test API connectivity
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://truenas.local/api/v2.0/pool

# Check logs
journalctl -u home-server-monitor -f | grep truenas
```

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug pnpm start

# Or via environment
export LOG_LEVEL=debug
systemctl restart home-server-monitor
```

### Performance Profiling

```bash
# Enable Node.js profiler
node --prof dist/server.js

# Generate report
node --prof-process isolate-*.log > profile.txt
```

---

## Security Checklist

- [ ] Strong API keys configured
- [ ] ADMIN_API_KEY set separately
- [ ] CORS origins restricted
- [ ] Rate limiting enabled
- [ ] SSL/TLS certificates installed
- [ ] Security headers configured
- [ ] Database file permissions restricted (chmod 600)
- [ ] Regular backups configured
- [ ] Log rotation enabled
- [ ] Firewall rules configured
- [ ] Reverse proxy configured
- [ ] Health checks monitoring
- [ ] Prometheus metrics restricted to internal network

---

## Maintenance

### Regular Tasks

**Daily**

- Review error logs
- Check disk space
- Verify backups

**Weekly**

- Review Prometheus alerts
- Check SSL certificate expiry
- Update dependencies (if needed)

**Monthly**

- Review and rotate API keys
- Database optimization (VACUUM, ANALYZE)
- Performance review

**Quarterly**

- Security audit
- Dependency updates
- Documentation updates

---

## Support

- **Documentation**: See `docs/` directory
- **Issues**: GitHub Issues
- **Security**: security@yourdomain.com

---

**Last Updated**: 2025-01-12
**Version**: 1.0.0
