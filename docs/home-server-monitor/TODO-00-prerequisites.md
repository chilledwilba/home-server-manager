# TODO-00: Prerequisites & Environment Check

## Purpose
Verify your TrueNAS environment and gather information needed for the monitoring system.

## Required Information

### 1. TrueNAS Details
```bash
# Run these on your TrueNAS shell to gather info:

# TrueNAS version
cat /etc/version

# System resources
free -h
df -h
zpool list
zpool status

# Network configuration
ip addr show
hostname -I

# Docker check
docker version
docker ps

# Check if Portainer is installed
docker ps | grep portainer
```

### 2. Document Your Current Setup

Fill this out (keep it handy):

```yaml
truenas:
  version: # e.g., "TrueNAS-SCALE-23.10.1"
  ip_address: # e.g., "192.168.1.100"
  cpu_cores: # e.g., 6
  ram_gb: # e.g., 32

zfs:
  pools:
    - name: # e.g., "main"
      size: # e.g., "10TB"
      used: # e.g., "6TB"
      raidz_level: # e.g., "raidz2" or "mirror"

docker:
  containers:
    - plex
    - sonarr
    - radarr
    - prowlarr
    - # list others

  using_portainer: # yes/no
  using_compose: # yes/no

network:
  router_ip: # e.g., "192.168.1.1"
  domain: # if you have one
  external_access: # none/vpn/port-forward
```

### 3. API Access Setup

> **NOTE FOR BUILD PHASE**: API keys are **OPTIONAL** during initial build. You can build the entire project with mock/placeholder values and configure real API keys later when deploying locally. Claude Code will use example values in `.env` for now.

#### Enable TrueNAS API (Can be done later)
1. Go to TrueNAS Web UI
2. Navigate to **System Settings → API Keys**
3. Click "Add"
4. Name: "home-server-monitor-readonly"
5. Click "Create"
6. **SAVE THE KEY** (you won't see it again)

```bash
# Test the API key (when you have one)
curl -H "Authorization: Bearer YOUR_API_KEY_HERE" \
     http://YOUR_TRUENAS_IP/api/v2.0/system/info
```

#### Docker API Access (Can be done later)

Option A: **If using Portainer** (Recommended)
1. Open Portainer (usually http://truenas-ip:9000)
2. Go to User Settings → Access Tokens
3. Create new token: "home-server-monitor"
4. Save the token

Option B: **Direct Docker Socket** (Advanced)
- We'll mount `/var/run/docker.sock` in our container
- More powerful but requires careful security

**For Now**: Use placeholder values in `.env` - we'll configure real values when deploying

### 4. Current File Structure

```bash
# Where are your Docker configs?
ls -la /mnt/*/docker/  # Common location
ls -la /mnt/*/appdata/ # Another common location

# Where do you want to install the monitor?
# Suggested: /mnt/YOUR_POOL/apps/home-server-monitor/
```

### 5. Security Check

```bash
# Check current exposure
netstat -tuln | grep LISTEN

# Check for existing reverse proxy
docker ps | grep -E "traefik|nginx|caddy|swag"

# Check firewall status (if any)
iptables -L -n | head -20
```

## Prerequisites Checklist

Before proceeding to TODO-01, ensure you have:

- [ ] TrueNAS Scale (not Core) installed
- [ ] At least 1GB free RAM for monitoring
- [ ] Docker running with containers
- [ ] TrueNAS API key created and tested
- [ ] SSH access to TrueNAS (or Shell in web UI)
- [ ] Basic familiarity with command line
- [ ] Backup of important data (we're starting read-only, but still...)

## Tools You'll Need

On your local machine:
- [ ] Text editor (VS Code recommended)
- [ ] Terminal/Command prompt
- [ ] Web browser
- [ ] Git (optional but helpful)

## Quick Knowledge Check

If you're unsure about any of these, ask Claude to explain:

1. **What is an API?** - How programs talk to each other
2. **What is Docker?** - Containers that run apps in isolation
3. **What is ZFS?** - TrueNAS's filesystem with snapshots
4. **What is a reverse proxy?** - Routes web traffic to correct services
5. **What are the arr apps?** - Sonarr/Radarr/etc for media automation

## Environment Variables Template

Create a `.env.example` file:

```bash
# TrueNAS Connection
TRUENAS_HOST=192.168.1.100
TRUENAS_API_KEY=your-api-key-here

# Portainer (if using)
PORTAINER_HOST=192.168.1.100
PORTAINER_PORT=9000
PORTAINER_TOKEN=your-token-here

# Monitor Settings
MONITOR_PORT=3100
MONITOR_HOST=0.0.0.0

# Security
API_TOKEN=generate-a-long-random-string
ADMIN_EMAIL=your-email@example.com

# Features (start with false, enable gradually)
ENABLE_WRITE_OPERATIONS=false
ENABLE_AUTO_FIX=false
ENABLE_ALERTS=false
```

## Common Issues & Solutions

### "Command not found" errors
- TrueNAS uses `midclt` for some operations
- Some commands need `sudo` (or root shell)

### Can't connect to API
- Check TrueNAS firewall settings
- Verify API key has correct permissions
- Ensure you're using HTTP not HTTPS (unless configured)

### Docker permission denied
- Add your user to docker group
- Or use root shell (be careful!)

## Questions to Ask Claude

As you gather this information, ask Claude:
1. "What do these ZFS pool states mean?"
2. "Is my RAIDZ configuration optimal?"
3. "Should I use Portainer or direct Docker access?"
4. "What security concerns should I prioritize?"

## Ready?

Once you've:
1. ✅ Filled out the setup information above
2. ✅ Created API key and tested it
3. ✅ Understand your current Docker setup
4. ✅ Have a location for the monitor

**Proceed to TODO-01-scaffold.md**

---

*Remember: We're starting read-only. Nothing we build initially can break your system. You're safe to experiment and learn!*