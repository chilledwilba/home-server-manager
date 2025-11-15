# Phase 8: Security Stack Setup Guide

This guide walks you through setting up the Security Stack components for your home server.

## Overview

Phase 8 implements a comprehensive security layer including:

- **Cloudflare Tunnel**: Zero-trust network access without port forwarding
- **Authentik SSO**: Enterprise single sign-on and identity provider
- **Fail2ban**: Intrusion prevention system
- **Security Orchestrator**: Centralized security management and monitoring

## Prerequisites

- Portainer installed and running
- Docker and Docker Compose
- Cloudflare account (for Cloudflare Tunnel)
- Basic understanding of Docker networking and security

## Part 1: Environment Configuration

### 1.1 Copy Environment Template

```bash
cp .env.example .env
```

### 1.2 Configure Core Settings

Edit `.env` and configure the base settings:

```bash
# Server Configuration
NODE_ENV=production
PORT=3100
HOST=0.0.0.0

# Portainer Configuration
PORTAINER_HOST=192.168.1.100  # Your Portainer host IP
PORTAINER_PORT=9000
PORTAINER_TOKEN=your_portainer_api_token_here

# Security
API_TOKEN=generate_a_secure_random_token
ENABLE_WRITE_OPERATIONS=true  # Enable for deployment operations
REQUIRE_CONFIRMATION=true
```

**Getting your Portainer API Token:**

1. Log into Portainer
2. Navigate to User Settings > Access tokens
3. Click "Add access token"
4. Give it a name (e.g., "home-server-monitor")
5. Copy the generated token

### 1.3 Configure Security Stack Components

## Part 2: Cloudflare Tunnel Setup

Cloudflare Tunnel provides secure remote access without exposing ports.

### 2.1 Create Cloudflare Tunnel

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to Zero Trust > Networks > Tunnels
3. Click "Create a tunnel"
4. Name it (e.g., "homeserver-tunnel")
5. Copy the tunnel token

### 2.2 Configure Tunnel in .env

```bash
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_TUNNEL_ID=your_tunnel_id
```

### 2.3 Deploy Cloudflare Tunnel

The infrastructure manager can deploy Cloudflare Tunnel for you:

```bash
# Using the API
curl -X POST http://localhost:3100/api/infrastructure/deploy \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your_api_token" \
  -d '{
    "service": "cloudflare-tunnel",
    "envVars": {
      "CLOUDFLARE_TUNNEL_TOKEN": "your_tunnel_token"
    }
  }'
```

Or manually via Portainer:

1. Upload `infrastructure-templates/cloudflare-tunnel.yml`
2. Set environment variables
3. Deploy stack

### 2.4 Configure Public Hostnames

Back in Cloudflare Dashboard:

1. Go to your tunnel
2. Click "Public Hostname" tab
3. Add hostnames for your services:
   - `monitor.yourdomain.com` → `http://localhost:3100`
   - `portainer.yourdomain.com` → `http://portainer:9000`
   - `auth.yourdomain.com` → `http://authentik:9000`

## Part 3: Authentik SSO Setup

Authentik provides enterprise-grade authentication and SSO.

### 3.1 Deploy Authentik

```bash
curl -X POST http://localhost:3100/api/infrastructure/deploy \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your_api_token" \
  -d '{
    "service": "authentik",
    "envVars": {
      "AUTHENTIK_SECRET_KEY": "generate_a_long_random_secret",
      "AUTHENTIK_DB_PASSWORD": "secure_database_password"
    }
  }'
```

### 3.2 Initial Authentik Setup

1. Navigate to `https://auth.yourdomain.com` (or `http://localhost:9000`)
2. Complete the initial setup wizard
3. Create an admin account
4. Note the admin credentials

### 3.3 Create API Token

1. Log into Authentik as admin
2. Navigate to Admin interface > Tokens & App passwords
3. Create a new token
4. Copy the token value

### 3.4 Configure in .env

```bash
AUTHENTIK_URL=https://auth.yourdomain.com
AUTHENTIK_TOKEN=your_authentik_api_token
```

### 3.5 Create User Groups

Create the following groups for permission management:

1. **homeserver-admins**: Full administrative access
2. **homeserver-operators**: Write access (deploy, manage services)
3. **homeserver-viewers**: Read-only access

Navigate to: Directory > Groups > Create

### 3.6 Assign Users to Groups

1. Navigate to Directory > Users
2. Select a user
3. Go to Groups tab
4. Add user to appropriate groups

## Part 4: Fail2ban Setup

Fail2ban prevents brute-force attacks by banning IPs with suspicious activity.

### 4.1 Deploy Fail2ban

```bash
curl -X POST http://localhost:3100/api/infrastructure/deploy \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your_api_token" \
  -d '{
    "service": "fail2ban"
  }'
```

### 4.2 Configure in .env

```bash
FAIL2BAN_ENABLED=true
FAIL2BAN_CONTAINER_NAME=fail2ban
FAIL2BAN_USE_DOCKER=true
```

### 4.3 Verify Fail2ban Status

```bash
curl http://localhost:3100/api/security/fail2ban/status \
  -H "X-API-Token: your_api_token"
```

## Part 5: Reverse Proxy Setup (Optional)

Choose one of the following reverse proxies:

### Option A: Traefik

Best for: Automatic SSL, dynamic configuration

```bash
curl -X POST http://localhost:3100/api/infrastructure/deploy \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your_api_token" \
  -d '{
    "service": "traefik",
    "envVars": {
      "CLOUDFLARE_API_TOKEN": "your_cloudflare_api_token"
    }
  }'
```

### Option B: Nginx Proxy Manager

Best for: GUI-based configuration, ease of use

```bash
curl -X POST http://localhost:3100/api/infrastructure/deploy \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your_api_token" \
  -d '{
    "service": "nginx-proxy-manager"
  }'
```

Access Nginx Proxy Manager at `http://localhost:81`

## Part 6: Monitoring Stack (Optional but Recommended)

### 6.1 Deploy Prometheus

```bash
curl -X POST http://localhost:3100/api/infrastructure/deploy \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your_api_token" \
  -d '{
    "service": "prometheus"
  }'
```

### 6.2 Deploy Grafana

```bash
curl -X POST http://localhost:3100/api/infrastructure/deploy \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your_api_token" \
  -d '{
    "service": "grafana",
    "envVars": {
      "GRAFANA_ADMIN_PASSWORD": "secure_admin_password"
    }
  }'
```

### 6.3 Deploy Uptime Kuma

```bash
curl -X POST http://localhost:3100/api/infrastructure/deploy \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your_api_token" \
  -d '{
    "service": "uptime-kuma"
  }'
```

## Part 7: Verify Security Stack

### 7.1 Check Overall Security Status

```bash
curl http://localhost:3100/api/security/status \
  -H "X-API-Token: your_api_token"
```

Expected response:

```json
{
  "success": true,
  "data": {
    "cloudflare_tunnel": {
      "status": "healthy",
      "connections": 4
    },
    "authentik": {
      "status": "healthy",
      "users_count": 3,
      "active_sessions": 1
    },
    "fail2ban": {
      "status": "running",
      "jails": ["sshd", "nginx"]
    }
  }
}
```

### 7.2 Check Individual Components

**Cloudflare Tunnel:**

```bash
curl http://localhost:3100/api/security/tunnel/status \
  -H "X-API-Token: your_api_token"
```

**Authentik:**

```bash
curl http://localhost:3100/api/security/auth/status \
  -H "X-API-Token: your_api_token"
```

**Fail2ban:**

```bash
curl http://localhost:3100/api/security/fail2ban/status \
  -H "X-API-Token: your_api_token"
```

### 7.3 View Deployed Infrastructure

```bash
curl http://localhost:3100/api/infrastructure/analyze \
  -H "X-API-Token: your_api_token"
```

## Part 8: Testing Security Features

### 8.1 Test Fail2ban Ban/Unban

Ban an IP:

```bash
curl -X POST http://localhost:3100/api/security/fail2ban/ban \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your_api_token" \
  -d '{
    "ip": "192.168.1.100",
    "jail": "sshd"
  }'
```

Check banned IPs:

```bash
curl http://localhost:3100/api/security/fail2ban/banned \
  -H "X-API-Token: your_api_token"
```

Unban an IP:

```bash
curl -X POST http://localhost:3100/api/security/fail2ban/unban \
  -H "Content-Type: application/json" \
  -H "X-API-Token: your_api_token" \
  -d '{
    "ip": "192.168.1.100",
    "jail": "sshd"
  }'
```

### 8.2 Test Authentik Authentication

Verify a JWT token:

```javascript
const response = await fetch('http://localhost:3100/api/auth/verify', {
  headers: {
    Authorization: 'Bearer your_jwt_token',
  },
});
```

## Part 9: Security Best Practices

### 9.1 Secure Environment Variables

Use dotenvx for encrypted secrets:

```bash
# Encrypt .env file
pnpm run env:encrypt

# Commit .env.vault (encrypted) instead of .env
git add .env.vault
git commit -m "Add encrypted environment variables"
```

### 9.2 Regular Security Audits

Schedule regular security checks:

```bash
# Weekly security scan
curl -X POST http://localhost:3100/api/security/scan \
  -H "X-API-Token: your_api_token"

# Generate security report
curl http://localhost:3100/api/security/report \
  -H "X-API-Token: your_api_token"
```

### 9.3 Enable Monitoring Alerts

Configure alerts for security events:

1. Set up Discord/Telegram webhooks in `.env`
2. Configure alert rules in Grafana
3. Set up Uptime Kuma notifications

### 9.4 Backup Security Configurations

Regular backups of:

- Authentik database (PostgreSQL)
- Cloudflare Tunnel configurations
- Fail2ban jail configurations
- SSL certificates

```bash
# Backup Authentik database
docker exec authentik-postgres pg_dump -U authentik > authentik-backup.sql

# Backup Portainer data
docker exec portainer tar czf - /data > portainer-backup.tar.gz
```

## Part 10: Troubleshooting

### Common Issues

#### Cloudflare Tunnel Not Connecting

1. Check tunnel token is correct
2. Verify internet connectivity
3. Check Cloudflare service status
4. Review tunnel logs:
   ```bash
   docker logs cloudflare-tunnel
   ```

#### Authentik Not Accessible

1. Check if container is running:
   ```bash
   docker ps | grep authentik
   ```
2. Verify database connection
3. Check network configuration
4. Review logs:
   ```bash
   docker logs authentik-server
   docker logs authentik-worker
   ```

#### Fail2ban Not Banning

1. Verify Fail2ban is running
2. Check jail configurations
3. Review fail2ban logs:
   ```bash
   docker exec fail2ban fail2ban-client status
   ```

#### Permission Errors

1. Verify user is in correct Authentik group
2. Check API token permissions
3. Verify `ENABLE_WRITE_OPERATIONS=true` in `.env`

## Part 11: Next Steps

After completing Phase 8 setup:

1. **Configure SSO for all services**: Integrate Authentik with Portainer, Grafana, etc.
2. **Set up monitoring dashboards**: Create Grafana dashboards for security metrics
3. **Implement backup automation**: Automate regular backups of critical data
4. **Deploy additional services**: Use the infrastructure manager to deploy media services (Arr suite, Plex)

## Support and Documentation

- **API Documentation**: See `/docs/api` for full API reference
- **Architecture**: See `/docs/architecture.md` for system design
- **Security Scanner**: See Phase 3 documentation
- **MCP Integration**: See Phase 13 documentation

## Security Considerations

- **Never commit `.env` file** to version control
- **Use strong passwords** for all services
- **Enable 2FA** in Authentik for admin accounts
- **Regularly update** all Docker images
- **Monitor logs** for suspicious activity
- **Implement rate limiting** on public-facing endpoints
- **Use HTTPS** for all external access via Cloudflare Tunnel
