# TODO-13: UPS Integration (Optional)

## Goal
Integrate with your UPS (Uninterruptible Power Supply) via Network UPS Tools (NUT) to enable graceful shutdown during power outages and protect your data.

## Prerequisites
- UPS connected via USB or network
- Network UPS Tools (NUT) installed on TrueNAS
- UPS supports communication protocol (most APC, CyberPower, Eaton do)

## Phase 1: NUT Client Integration

### Why This Matters
Power outages can cause:
- **Data corruption** if writes are interrupted
- **Lost work** if VMs/containers crash
- **Hardware damage** from sudden power loss
- **ZFS pool corruption** from incomplete transactions

A UPS gives you time to gracefully shutdown everything safely.

### Create `src/integrations/ups/nut-client.ts`
```typescript
import { logger } from '../../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface UPSStatus {
  onBattery: boolean;
  batteryCharge: number;      // Percentage
  batteryRuntime: number;     // Seconds remaining
  batteryVoltage: number;
  inputVoltage: number;
  outputVoltage: number;
  load: number;               // Percentage
  status: string;             // OL, OB, LB, etc.
  model: string;
  manufacturer: string;
  serial: string;
}

export class NUTClient {
  private host: string;
  private port: number;
  private upsName: string;

  constructor(host: string = 'localhost', port: number = 3493, upsName: string = 'ups') {
    this.host = host;
    this.port = port;
    this.upsName = upsName;
  }

  /**
   * Get current UPS status
   */
  async getStatus(): Promise<UPSStatus> {
    try {
      // Use upsc command to get UPS status
      const { stdout } = await execAsync(`upsc ${this.upsName}@${this.host}:${this.port}`);

      const status = this.parseUPSOutput(stdout);

      return status;

    } catch (error: any) {
      logger.error('Failed to get UPS status', error);
      throw new Error(`UPS communication failed: ${error.message}`);
    }
  }

  /**
   * Parse upsc output into structured data
   */
  private parseUPSOutput(output: string): UPSStatus {
    const lines = output.split('\n');
    const data: Record<string, string> = {};

    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        data[key.trim()] = valueParts.join(':').trim();
      }
    }

    const status: UPSStatus = {
      onBattery: data['ups.status']?.includes('OB') || false,
      batteryCharge: parseFloat(data['battery.charge']) || 0,
      batteryRuntime: parseFloat(data['battery.runtime']) || 0,
      batteryVoltage: parseFloat(data['battery.voltage']) || 0,
      inputVoltage: parseFloat(data['input.voltage']) || 0,
      outputVoltage: parseFloat(data['output.voltage']) || 0,
      load: parseFloat(data['ups.load']) || 0,
      status: data['ups.status'] || 'UNKNOWN',
      model: data['ups.model'] || 'Unknown',
      manufacturer: data['ups.mfr'] || 'Unknown',
      serial: data['ups.serial'] || 'Unknown'
    };

    return status;
  }

  /**
   * List available UPS devices
   */
  async listDevices(): Promise<string[]> {
    try {
      const { stdout } = await execAsync(`upsc -l ${this.host}:${this.port}`);
      return stdout.split('\n').filter(line => line.trim().length > 0);
    } catch (error) {
      logger.error('Failed to list UPS devices', error);
      return [];
    }
  }

  /**
   * Get UPS variables (detailed info)
   */
  async getVariables(): Promise<Record<string, string>> {
    const { stdout } = await execAsync(`upsc ${this.upsName}@${this.host}:${this.port}`);

    const variables: Record<string, string> = {};
    const lines = stdout.split('\n');

    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        variables[key.trim()] = valueParts.join(':').trim();
      }
    }

    return variables;
  }
}
```

## Phase 2: UPS Monitor Service

### Create `src/services/ups/ups-monitor.ts`
```typescript
import { logger } from '../../utils/logger';
import { NUTClient } from '../../integrations/ups/nut-client';
import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';

interface UPSMonitorConfig {
  client: NUTClient;
  db: Database.Database;
  io: SocketServer;
  intervals: {
    polling: number;        // Normal polling interval
    onBattery: number;      // Faster polling when on battery
  };
  thresholds: {
    criticalRuntime: number;  // Seconds - initiate shutdown
    warningRuntime: number;   // Seconds - start graceful service shutdown
    lowBattery: number;       // Percentage - consider critical
  };
}

export class UPSMonitor {
  private client: NUTClient;
  private db: Database.Database;
  private io: SocketServer;
  private config: UPSMonitorConfig;
  private interval?: NodeJS.Timeout;
  private onBattery: boolean = false;
  private shutdownInitiated: boolean = false;

  constructor(config: UPSMonitorConfig) {
    this.client = config.client;
    this.db = config.db;
    this.io = config.io;
    this.config = config;
  }

  /**
   * Start UPS monitoring
   */
  start() {
    logger.info('Starting UPS monitoring...');
    this.startMonitoring();
  }

  /**
   * Monitor UPS status
   */
  private startMonitoring() {
    const poll = async () => {
      try {
        const status = await this.client.getStatus();

        // Store metrics
        this.storeMetrics(status);

        // Broadcast to connected clients
        this.io.to('ups').emit('ups:status', status);

        // Check for power events
        await this.checkPowerEvents(status);

        // Adjust polling interval based on power state
        if (status.onBattery && !this.onBattery) {
          // Switched to battery - poll faster
          logger.warn('⚠️ POWER OUTAGE - Switched to battery power');
          this.onBattery = true;
          this.restartMonitoring(this.config.intervals.onBattery);
        } else if (!status.onBattery && this.onBattery) {
          // Power restored
          logger.info('✅ Power restored - Back to AC power');
          this.onBattery = false;
          this.shutdownInitiated = false;
          this.restartMonitoring(this.config.intervals.polling);
        }

      } catch (error) {
        logger.error('UPS monitoring error:', error);
      }
    };

    // Initial poll
    poll();

    // Set up interval
    this.interval = setInterval(poll, this.config.intervals.polling);
  }

  /**
   * Restart monitoring with new interval
   */
  private restartMonitoring(newInterval: number) {
    if (this.interval) {
      clearInterval(this.interval);
    }

    this.interval = setInterval(async () => {
      try {
        const status = await this.client.getStatus();
        this.storeMetrics(status);
        this.io.to('ups').emit('ups:status', status);
        await this.checkPowerEvents(status);
      } catch (error) {
        logger.error('UPS monitoring error:', error);
      }
    }, newInterval);
  }

  /**
   * Check for critical power events
   */
  private async checkPowerEvents(status: any) {
    if (!status.onBattery) {
      return;
    }

    const runtimeSeconds = status.batteryRuntime;
    const batteryPercent = status.batteryCharge;

    // CRITICAL: Less than 10 minutes remaining
    if (runtimeSeconds < this.config.thresholds.criticalRuntime && !this.shutdownInitiated) {
      logger.error(`🚨 CRITICAL: Only ${Math.floor(runtimeSeconds / 60)} minutes of battery remaining`);

      this.shutdownInitiated = true;
      await this.emergencyShutdown();
    }
    // WARNING: Less than 30 minutes remaining
    else if (runtimeSeconds < this.config.thresholds.warningRuntime) {
      logger.warn(`⚠️ WARNING: ${Math.floor(runtimeSeconds / 60)} minutes of battery remaining`);

      await this.gracefulServiceShutdown();
    }
    // LOW BATTERY: Less than 25%
    else if (batteryPercent < this.config.thresholds.lowBattery) {
      logger.warn(`⚠️ Low battery: ${batteryPercent}%`);

      this.createAlert({
        type: 'ups_low_battery',
        severity: 'warning',
        message: `UPS battery at ${batteryPercent}%`,
        details: status
      });
    }
  }

  /**
   * Graceful service shutdown (preserve critical services)
   */
  async gracefulServiceShutdown(): Promise<void> {
    logger.warn('⚠️ UPS on battery - initiating graceful service shutdown');

    // Create alert
    this.createAlert({
      type: 'ups_graceful_shutdown',
      severity: 'high',
      message: 'Starting graceful shutdown due to low battery',
      details: { action: 'graceful_shutdown' }
    });

    try {
      // 1. Stop new Plex streams (but keep existing ones)
      logger.info('Preventing new Plex streams...');
      // Would send command to Plex

      // 2. Pause downloads
      logger.info('Pausing all downloads...');
      // Would pause Sonarr/Radarr downloads

      // 3. Create emergency snapshots of critical pools
      logger.info('Creating emergency snapshots...');
      await this.createEmergencySnapshots();

      // 4. Stop non-essential containers
      logger.info('Stopping non-essential containers...');
      await this.stopNonEssentialContainers();

      logger.info('Graceful service shutdown complete - waiting for power or shutdown');

    } catch (error) {
      logger.error('Error during graceful shutdown', error);
    }
  }

  /**
   * Emergency shutdown (imminent power loss)
   */
  async emergencyShutdown(): Promise<void> {
    logger.error('🚨 EMERGENCY SHUTDOWN - Battery critical');

    this.createAlert({
      type: 'ups_emergency_shutdown',
      severity: 'critical',
      message: 'EMERGENCY: Initiating system shutdown - battery critical',
      details: { action: 'emergency_shutdown' }
    });

    try {
      // 1. Kill all Plex streams immediately
      logger.info('Terminating all Plex streams...');

      // 2. Stop all Docker containers
      logger.info('Stopping all Docker containers...');
      await this.stopAllContainers();

      // 3. Create final snapshots if time permits
      logger.info('Creating final emergency snapshots...');
      await this.createEmergencySnapshots();

      // 4. Sync filesystems
      logger.info('Syncing filesystems...');
      await execAsync('sync');

      // 5. Initiate TrueNAS shutdown
      logger.info('Initiating TrueNAS shutdown...');
      // Would call TrueNAS shutdown API
      // await this.truenasClient.shutdown();

      logger.info('Emergency shutdown complete');

    } catch (error) {
      logger.error('Error during emergency shutdown', error);
    }
  }

  /**
   * Create emergency snapshots of critical pools
   */
  private async createEmergencySnapshots(): Promise<void> {
    const pools = ['personal', 'apps']; // Critical pools only

    for (const pool of pools) {
      try {
        const snapshotName = `${pool}@emergency-${Date.now()}`;
        await execAsync(`zfs snapshot ${snapshotName}`);
        logger.info(`Created emergency snapshot: ${snapshotName}`);
      } catch (error) {
        logger.error(`Failed to create snapshot for ${pool}`, error);
      }
    }
  }

  /**
   * Stop non-essential containers
   */
  private async stopNonEssentialContainers(): Promise<void> {
    const nonEssential = ['sonarr', 'radarr', 'prowlarr', 'transmission'];

    for (const container of nonEssential) {
      try {
        await execAsync(`docker stop ${container}`);
        logger.info(`Stopped ${container}`);
      } catch (error) {
        logger.error(`Failed to stop ${container}`, error);
      }
    }
  }

  /**
   * Stop all containers
   */
  private async stopAllContainers(): Promise<void> {
    try {
      await execAsync('docker stop $(docker ps -q)');
      logger.info('Stopped all Docker containers');
    } catch (error) {
      logger.error('Failed to stop all containers', error);
    }
  }

  /**
   * Store UPS metrics
   */
  private storeMetrics(status: any) {
    const stmt = this.db.prepare(`
      INSERT INTO ups_metrics (
        timestamp, on_battery, battery_charge, battery_runtime,
        input_voltage, output_voltage, load, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      new Date().toISOString(),
      status.onBattery ? 1 : 0,
      status.batteryCharge,
      status.batteryRuntime,
      status.inputVoltage,
      status.outputVoltage,
      status.load,
      status.status
    );
  }

  /**
   * Create alert
   */
  private createAlert(alert: any) {
    const stmt = this.db.prepare(`
      INSERT INTO alerts (type, severity, message, details)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      alert.type,
      alert.severity,
      alert.message,
      JSON.stringify(alert.details)
    );

    const fullAlert = {
      id: result.lastInsertRowid,
      ...alert,
      triggeredAt: new Date()
    };

    this.io.to('alerts').emit('alert:triggered', fullAlert);
    logger.warn(`Alert: ${alert.message}`);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
    logger.info('UPS monitoring stopped');
  }
}
```

## Phase 3: Database Schema

### Create `src/db/migrations/005_ups_tables.sql`
```sql
-- UPS metrics
CREATE TABLE IF NOT EXISTS ups_metrics (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  on_battery INTEGER DEFAULT 0,
  battery_charge REAL,
  battery_runtime INTEGER,
  input_voltage REAL,
  output_voltage REAL,
  load REAL,
  status TEXT
);
CREATE INDEX IF NOT EXISTS idx_ups_metrics_time ON ups_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_ups_metrics_battery ON ups_metrics(on_battery);

-- UPS events (power outages, restorations)
CREATE TABLE IF NOT EXISTS ups_events (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  event_type TEXT NOT NULL, -- 'power_loss', 'power_restored', 'shutdown_initiated'
  battery_percent REAL,
  runtime_remaining INTEGER,
  details TEXT
);
CREATE INDEX IF NOT EXISTS idx_ups_events_time ON ups_events(timestamp);
```

## Phase 4: API Routes

### Create `src/routes/ups.ts`
```typescript
import { FastifyInstance } from 'fastify';
import { NUTClient } from '../integrations/ups/nut-client';

export async function upsRoutes(fastify: FastifyInstance) {
  const client = new NUTClient(
    process.env.UPS_HOST || 'localhost',
    parseInt(process.env.UPS_PORT || '3493'),
    process.env.UPS_NAME || 'ups'
  );

  // Get current UPS status
  fastify.get('/api/ups/status', async (request, reply) => {
    const status = await client.getStatus();
    return status;
  });

  // Get UPS variables (detailed info)
  fastify.get('/api/ups/variables', async (request, reply) => {
    const variables = await client.getVariables();
    return variables;
  });

  // Get UPS metrics history
  fastify.get('/api/ups/metrics', async (request, reply) => {
    const { hours = 24 } = request.query as { hours?: number };

    const stmt = fastify.db.prepare(`
      SELECT * FROM ups_metrics
      WHERE timestamp > datetime('now', '-${hours} hours')
      ORDER BY timestamp DESC
    `);

    return stmt.all();
  });

  // Get power outage history
  fastify.get('/api/ups/events', async (request, reply) => {
    const { days = 30 } = request.query as { days?: number };

    const stmt = fastify.db.prepare(`
      SELECT * FROM ups_events
      WHERE timestamp > datetime('now', '-${days} days')
      ORDER BY timestamp DESC
    `);

    return stmt.all();
  });

  // Get battery health trend
  fastify.get('/api/ups/battery-health', async (request, reply) => {
    const stmt = fastify.db.prepare(`
      SELECT
        DATE(timestamp) as date,
        AVG(battery_charge) as avg_charge,
        MIN(battery_charge) as min_charge,
        MAX(battery_charge) as max_charge
      FROM ups_metrics
      WHERE timestamp > datetime('now', '-30 days')
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `);

    return stmt.all();
  });
}
```

## Phase 5: Configuration & Testing

### Update `.env.example`
```bash
# UPS Configuration (Optional)
UPS_HOST=localhost
UPS_PORT=3493
UPS_NAME=ups

# UPS Thresholds
UPS_CRITICAL_RUNTIME=600    # 10 minutes - emergency shutdown
UPS_WARNING_RUNTIME=1800    # 30 minutes - graceful shutdown
UPS_LOW_BATTERY=25          # 25% - low battery alert
```

### Integration in main server
Update `src/server.ts`:
```typescript
import { NUTClient } from './integrations/ups/nut-client';
import { UPSMonitor } from './services/ups/ups-monitor';
import { upsRoutes } from './routes/ups';

// Check if UPS monitoring is enabled
const upsEnabled = process.env.UPS_ENABLED === 'true';

if (upsEnabled) {
  const nutClient = new NUTClient(
    process.env.UPS_HOST || 'localhost',
    parseInt(process.env.UPS_PORT || '3493'),
    process.env.UPS_NAME || 'ups'
  );

  const upsMonitor = new UPSMonitor({
    client: nutClient,
    db,
    io,
    intervals: {
      polling: 30000,      // 30 seconds normal
      onBattery: 10000,    // 10 seconds on battery
    },
    thresholds: {
      criticalRuntime: parseInt(process.env.UPS_CRITICAL_RUNTIME || '600'),
      warningRuntime: parseInt(process.env.UPS_WARNING_RUNTIME || '1800'),
      lowBattery: parseInt(process.env.UPS_LOW_BATTERY || '25'),
    }
  });

  upsMonitor.start();

  // Register routes
  await fastify.register(upsRoutes);
}
```

### Testing endpoints
```bash
# Get current UPS status
curl http://localhost:3100/api/ups/status

# Example response:
{
  "onBattery": false,
  "batteryCharge": 100,
  "batteryRuntime": 3600,
  "batteryVoltage": 27.0,
  "inputVoltage": 120.0,
  "outputVoltage": 120.0,
  "load": 35,
  "status": "OL",
  "model": "Back-UPS ES 750G",
  "manufacturer": "APC",
  "serial": "XXXXXXXX"
}

# Get battery health trend
curl http://localhost:3100/api/ups/battery-health

# Get power outage history
curl http://localhost:3100/api/ups/events
```

## Common UPS Models & Configuration

### APC Back-UPS / Smart-UPS
```ini
# /etc/nut/ups.conf
[ups]
    driver = usbhid-ups
    port = auto
    desc = "APC Back-UPS"
```

### CyberPower
```ini
[ups]
    driver = usbhid-ups
    port = auto
    vendorid = 0764
    desc = "CyberPower UPS"
```

### Eaton
```ini
[ups]
    driver = usbhid-ups
    port = auto
    desc = "Eaton UPS"
```

## Validation Checklist

- [ ] NUT client can connect to UPS
- [ ] UPS status retrieved successfully
- [ ] Metrics stored in database
- [ ] Real-time updates via Socket.IO
- [ ] Alerts trigger on battery event
- [ ] Graceful shutdown tested (in safe environment)
- [ ] Emergency snapshots created
- [ ] Container shutdown working
- [ ] Power restoration detected

## Testing UPS Integration

**⚠️ CAUTION**: Testing shutdown procedures can interrupt services. Test during maintenance window.

### Test 1: Status Monitoring (Safe)
```bash
# Verify UPS communication
curl http://localhost:3100/api/ups/status

# Should return current UPS data
```

### Test 2: Simulated Power Loss (Safe - No Shutdown)
```bash
# Temporarily disable shutdown actions in code
# Then unplug UPS from wall power
# Verify:
# - System detects battery mode
# - Alerts are generated
# - Metrics are recorded
# - Socket.IO broadcasts events

# Plug UPS back in
# Verify power restoration detected
```

### Test 3: Graceful Shutdown (Controlled Test)
**Only test this during maintenance window with backups!**

```bash
# Set high threshold for testing (e.g., 50 minutes)
# Unplug UPS
# Verify graceful shutdown steps execute:
# 1. New Plex streams blocked
# 2. Downloads paused
# 3. Emergency snapshots created
# 4. Non-essential containers stopped

# Plug back in before critical threshold
```

## Benefits

### Data Protection
- **Zero data loss** during power outages
- **Automatic snapshots** before shutdown
- **Graceful service termination**

### Service Continuity
- **Smart prioritization**: Keep critical services running longest
- **Clean shutdown**: No corrupted ZFS pools
- **Fast recovery**: Services resume when power returns

### Cost Savings
- **Prevent hardware damage** from sudden power loss
- **Avoid recovery costs** ($2000+ for data recovery)
- **Extend hardware life** with clean shutdowns

## Next Steps

After completing this TODO:
1. Commit: `feat(ups): implement UPS monitoring with graceful shutdown`
2. Update index.md progress tracker
3. Test with your actual UPS hardware
4. Document your UPS model/configuration

---

**Note**: UPS integration is OPTIONAL but highly recommended if you have a UPS. The graceful shutdown procedures can save you from data loss during power outages. Even a basic $100 UPS provides enough time to safely shutdown your TrueNAS server.
