import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type Database from 'better-sqlite3';
import type { UPSStatus } from '../../integrations/ups/nut-client.js';
import { createLogger } from '../../utils/logger.js';

const execAsync = promisify(exec);
const logger = createLogger('ups-shutdown-manager');

/**
 * Handles UPS-triggered shutdown operations
 * Manages graceful and emergency shutdown procedures
 */
export class ShutdownManager {
  constructor(
    private db: Database.Database,
    private enableShutdown: boolean,
  ) {}

  /**
   * Graceful service shutdown (preserve critical services)
   */
  async gracefulServiceShutdown(_status: UPSStatus): Promise<void> {
    logger.warn('⚠️ UPS on battery - initiating graceful service shutdown');

    if (!this.enableShutdown) {
      logger.warn('Shutdown actions disabled (safety mode) - would execute graceful shutdown');
      return;
    }

    try {
      // 1. Create emergency snapshots of critical pools
      logger.info('Creating emergency snapshots...');
      await this.createEmergencySnapshots();

      // 2. Stop non-essential containers
      logger.info('Stopping non-essential containers...');
      await this.stopNonEssentialContainers();

      logger.info('Graceful service shutdown complete - monitoring for power restoration');
    } catch (error) {
      logger.error({ err: error }, 'Error during graceful shutdown');
    }
  }

  /**
   * Emergency shutdown (imminent power loss)
   */
  async emergencyShutdown(_status: UPSStatus): Promise<void> {
    logger.error('🚨 EMERGENCY SHUTDOWN - Battery critical');

    if (!this.enableShutdown) {
      logger.warn('Shutdown actions disabled (safety mode) - would execute emergency shutdown');
      return;
    }

    try {
      // 1. Stop all Docker containers
      logger.info('Stopping all Docker containers...');
      await this.stopAllContainers();

      // 2. Create final snapshots if time permits
      logger.info('Creating final emergency snapshots...');
      await this.createEmergencySnapshots();

      // 3. Sync filesystems
      logger.info('Syncing filesystems...');
      await execAsync('sync');

      logger.error('Emergency shutdown sequence complete - system should shutdown now');
    } catch (error) {
      logger.error({ err: error }, 'Error during emergency shutdown');
    }
  }

  /**
   * Create emergency snapshots of critical pools
   */
  private async createEmergencySnapshots(): Promise<void> {
    // Get all pools from database
    const stmt = this.db.prepare('SELECT name FROM pools WHERE status = ?');
    const pools = stmt.all('ONLINE') as Array<{ name: string }>;

    for (const pool of pools) {
      try {
        const snapshotName = `${pool.name}@emergency-${Date.now()}`;
        await execAsync(`zfs snapshot ${snapshotName}`, { timeout: 30000 });
        logger.info({ pool: pool.name, snapshot: snapshotName }, 'Created emergency snapshot');
      } catch (error) {
        logger.error({ err: error, pool: pool.name }, 'Failed to create emergency snapshot');
      }
    }
  }

  /**
   * Stop non-essential containers
   */
  private async stopNonEssentialContainers(): Promise<void> {
    // Get non-essential containers from database
    // For now, we'll use a predefined list
    const nonEssential = ['sonarr', 'radarr', 'prowlarr', 'transmission', 'qbittorrent'];

    for (const container of nonEssential) {
      try {
        await execAsync(`docker stop ${container}`, { timeout: 30000 });
        logger.info({ container }, 'Stopped non-essential container');
      } catch (error) {
        // Container might not exist, that's okay
        logger.debug({ err: error, container }, 'Failed to stop container (may not exist)');
      }
    }
  }

  /**
   * Stop all containers
   */
  private async stopAllContainers(): Promise<void> {
    try {
      const { stdout } = await execAsync('docker ps -q', { timeout: 5000 });
      const containers = stdout
        .trim()
        .split('\n')
        .filter((id) => id.length > 0);

      if (containers.length === 0) {
        logger.info('No running containers to stop');
        return;
      }

      await execAsync(`docker stop ${containers.join(' ')}`, { timeout: 60000 });
      logger.info({ count: containers.length }, 'Stopped all Docker containers');
    } catch (error) {
      logger.error({ err: error }, 'Failed to stop all containers');
    }
  }
}
