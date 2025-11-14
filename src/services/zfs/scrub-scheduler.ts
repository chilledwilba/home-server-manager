import { createLogger } from '../../utils/logger.js';
import type { ZFSPersistence } from './zfs-persistence.js';

const logger = createLogger('scrub-scheduler');

export interface ScrubSchedule {
  poolName: string;
  frequency: 'weekly' | 'monthly';
  dayOfWeek: number; // 0-6, Sunday = 0
  hour: number; // 0-23
  type: 'scrub' | 'trim';
}

/**
 * Scrub Scheduler
 * Manages scrub and TRIM operations based on schedules
 */
export class ScrubScheduler {
  constructor(private persistence: ZFSPersistence) {}

  /**
   * Check if scrubs should run and execute them
   */
  async checkAndRunScrubs(scrubSchedules: Map<string, ScrubSchedule>): Promise<void> {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const dayOfMonth = now.getDate();

    for (const [poolName, schedule] of scrubSchedules) {
      // Check if time matches
      if (hour !== schedule.hour) continue;

      let shouldRun = false;

      if (schedule.frequency === 'weekly') {
        shouldRun = dayOfWeek === schedule.dayOfWeek;
      } else if (schedule.frequency === 'monthly') {
        // Run on first occurrence of dayOfWeek in the month
        shouldRun = dayOfWeek === schedule.dayOfWeek && dayOfMonth <= 7;
      }

      if (shouldRun) {
        if (schedule.type === 'scrub') {
          await this.startScrub(poolName);
        } else if (schedule.type === 'trim') {
          await this.startTrim(poolName);
        }
      }
    }
  }

  /**
   * Start a scrub operation
   */
  private async startScrub(poolName: string): Promise<void> {
    try {
      logger.info(`Starting scrub for pool: ${poolName}`);
      this.persistence.storeScrubStart(poolName);
      logger.info(`Scrub started for ${poolName}`);
    } catch (error) {
      logger.error({ err: error }, `Failed to start scrub for ${poolName}`);
    }
  }

  /**
   * Start TRIM operation for SSDs
   */
  private async startTrim(poolName: string): Promise<void> {
    try {
      logger.info(`Starting TRIM for SSD pool: ${poolName}`);
      this.persistence.storeTrimStart(poolName);
    } catch (error) {
      logger.error({ err: error }, `Failed to start TRIM for ${poolName}`);
    }
  }
}
