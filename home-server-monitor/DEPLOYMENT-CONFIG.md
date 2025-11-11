# Deployment Configuration Guide

> **Use this guide AFTER Claude Code Web has built the project**

## 🎯 Overview

Claude Code Web built the entire project with mock/placeholder API keys. Now you need to replace those with your real credentials before deploying to your TrueNAS server.

## 📝 Step-by-Step Configuration

### Step 1: Download the Built Project

Download the complete project from Claude Code Web to your local machine.

### Step 2: Update Environment Variables

Navigate to the project directory and edit the `.env` file:

```bash
cd home-server-monitor
nano .env  # or use your preferred editor
```

### Step 3: Replace Mock Values with Real API Keys

#### Required for Basic Monitoring

**TrueNAS API Key**:
```bash
# Replace this mock value:
TRUENAS_API_KEY=mock-truenas-api-key-replace-on-deploy

# With your real API key:
TRUENAS_API_KEY=1-abc123xyz789...

# How to get it:
# 1. TrueNAS Web UI → System Settings → API Keys
# 2. Click "Add"
# 3. Name: "home-server-monitor-readonly"
# 4. Copy the generated key
```

**Portainer API Token**:
```bash
# Replace this mock value:
PORTAINER_TOKEN=mock-portainer-token-replace-on-deploy

# With your real token:
PORTAINER_TOKEN=ptr_abc123xyz...

# How to get it:
# 1. Portainer UI → User Settings → Access Tokens
# 2. Click "Add access token"
# 3. Name: "home-server-monitor"
# 4. Copy the token
```

**TrueNAS Host IP**:
```bash
# Update with your actual TrueNAS IP:
TRUENAS_HOST=192.168.1.100  # Change to your actual IP
PORTAINER_HOST=192.168.1.100  # Usually same as TrueNAS
```

#### Optional: Arr Apps Integration

Only configure these if you want Arr suite monitoring:

```bash
# Sonarr
SONARR_HOST=192.168.1.100
SONARR_PORT=8989
SONARR_API_KEY=your-sonarr-api-key

# Radarr
RADARR_HOST=192.168.1.100
RADARR_PORT=7878
RADARR_API_KEY=your-radarr-api-key

# Prowlarr
PROWLARR_HOST=192.168.1.100
PROWLARR_PORT=9696
PROWLARR_API_KEY=your-prowlarr-api-key

# How to get API keys:
# Each Arr app → Settings → General → API Key
```

#### Optional: Plex Monitoring

```bash
PLEX_HOST=192.168.1.100
PLEX_PORT=32400
PLEX_TOKEN=your-plex-token

# How to get Plex token:
# https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/
```

#### Optional: Alert Services

**Discord**:
```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# How to get:
# Server Settings → Integrations → Webhooks → New Webhook
```

**Pushover** (for mobile notifications):
```bash
PUSHOVER_APP_TOKEN=your-app-token
PUSHOVER_USER_KEY=your-user-key

# How to get:
# https://pushover.net/ → Create an application
```

**Telegram**:
```bash
TELEGRAM_BOT_TOKEN=123456789:ABC...
TELEGRAM_CHAT_ID=123456789

# How to get:
# 1. Message @BotFather on Telegram: /newbot
# 2. Get chat ID: Message @userinfobot: /start
```

**Email (SMTP)**:
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-email@gmail.com

# For Gmail: Use App Password (not regular password)
# https://support.google.com/accounts/answer/185833
```

### Step 4: Encrypt Secrets (Recommended)

```bash
# Install dotenvx
curl -sfS https://dotenvx.sh/install.sh | sh

# Encrypt the .env file
dotenvx encrypt

# This creates:
# - .env.vault (encrypted, safe to commit)
# - .env.keys (decryption key, NEVER commit)

# Store .env.keys in 1Password or similar
```

### Step 5: Test Configuration

```bash
# Install dependencies
bun install

# Run type checking
bun run type-check

# Start the server
bun run dev

# Test API endpoints
curl http://localhost:3100/health
curl http://localhost:3100/api/v1/system/info
```

### Step 6: Deploy to TrueNAS

Follow the deployment guide in `TODO-12-deployment.md` for full production deployment.

## 🔒 Security Checklist

Before deploying to production:

- [ ] All mock API keys replaced with real values
- [ ] `.env` file encrypted with dotenvx
- [ ] `.env.keys` stored securely (1Password, etc.)
- [ ] TrueNAS API key has minimal required permissions
- [ ] Portainer token is read-only initially
- [ ] Strong `API_TOKEN` generated for the monitoring API
- [ ] `ENABLE_WRITE_OPERATIONS=false` for Phase 1 (read-only monitoring)
- [ ] All alert webhook URLs tested
- [ ] Backups taken of TrueNAS pools

## 🚨 Common Issues

### API Connection Failures

**TrueNAS API not responding**:
```bash
# Test connectivity
ping 192.168.1.100

# Test API directly
curl -H "Authorization: Bearer YOUR_API_KEY" \
     http://192.168.1.100/api/v2.0/system/info

# Check TrueNAS Web UI is accessible
curl http://192.168.1.100
```

**Portainer token invalid**:
```bash
# Test Portainer API
curl -H "X-API-Key: YOUR_TOKEN" \
     http://192.168.1.100:9000/api/endpoints

# Regenerate token if expired:
# Portainer UI → User Settings → Access Tokens → Revoke → Create new
```

### Environment Loading Issues

```bash
# Verify .env is being loaded
bun run dev  # Check logs for "Environment loaded"

# Test environment variables
node -e "require('dotenv').config(); console.log(process.env.TRUENAS_API_KEY)"
```

### Alert Services Not Working

**Discord webhook fails**:
```bash
# Test webhook directly
curl -X POST -H "Content-Type: application/json" \
     -d '{"content":"Test message"}' \
     YOUR_DISCORD_WEBHOOK_URL
```

**Pushover not receiving**:
```bash
# Test Pushover API
curl -F "token=YOUR_APP_TOKEN" \
     -F "user=YOUR_USER_KEY" \
     -F "message=Test" \
     https://api.pushover.net/1/messages.json
```

## 📊 Verification

After configuration, verify everything works:

```bash
# 1. Health check
curl http://localhost:3100/health
# Should return: {"status":"ok"}

# 2. TrueNAS pools
curl http://localhost:3100/api/v1/pools
# Should return your pool data

# 3. Docker containers
curl http://localhost:3100/api/v1/containers
# Should return container list

# 4. WebSocket connection
# Open http://localhost:3100 in browser
# Check browser console for Socket.IO connection
```

## 🎉 Success!

When all checks pass:
1. ✅ All mock values replaced
2. ✅ API connections working
3. ✅ Data flowing from TrueNAS and Docker
4. ✅ Alerts configured (optional)
5. ✅ Ready for production deployment (TODO-12)

---

**Next**: See [TODO-12-deployment.md](./TODO-12-deployment.md) for containerizing and deploying to TrueNAS as a Docker service.
