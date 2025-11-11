import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

interface JailStatus {
  name: string;
  currentlyFailed: number;
  totalFailed: number;
  currentlyBanned: number;
  totalBanned: number;
  bannedIPs: string[];
}

interface Fail2banStatus {
  version: string;
  jails: JailStatus[];
  totalBanned: number;
}

/**
 * Fail2ban Manager Client
 * Manages fail2ban jails and banned IPs
 * Note: Requires fail2ban-client to be accessible (docker exec or host)
 */
export class Fail2banClient {
  private containerName: string;
  private useDocker: boolean;

  constructor(options: { containerName?: string; useDocker?: boolean } = {}) {
    this.containerName = options.containerName || 'fail2ban';
    this.useDocker = options.useDocker ?? true;
  }

  /**
   * Execute fail2ban-client command
   */
  private async execCommand(command: string): Promise<string> {
    let fullCommand: string;

    if (this.useDocker) {
      fullCommand = `docker exec ${this.containerName} fail2ban-client ${command}`;
    } else {
      fullCommand = `fail2ban-client ${command}`;
    }

    try {
      const { stdout } = await execAsync(fullCommand);
      return stdout.trim();
    } catch (error) {
      logger.error({ err: error }, `Fail2ban command failed: ${command}`);
      throw error;
    }
  }

  /**
   * Get fail2ban version
   */
  async getVersion(): Promise<string> {
    try {
      const output = await this.execCommand('version');
      return output.trim();
    } catch (error) {
      logger.error({ err: error }, 'Failed to get fail2ban version');
      return 'unknown';
    }
  }

  /**
   * Get status of all jails
   */
  async getStatus(): Promise<Fail2banStatus> {
    try {
      const version = await this.getVersion();
      const output = await this.execCommand('status');

      // Parse jail list
      const jailMatch = output.match(/Jail list:\s+(.+)/);
      const jailNames = jailMatch && jailMatch[1] ? jailMatch[1].split(',').map((j) => j.trim()) : [];

      // Get details for each jail
      const jails: JailStatus[] = [];
      let totalBanned = 0;

      for (const jailName of jailNames) {
        const jailStatus = await this.getJailStatus(jailName);
        if (jailStatus) {
          jails.push(jailStatus);
          totalBanned += jailStatus.currentlyBanned;
        }
      }

      return {
        version,
        jails,
        totalBanned,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get fail2ban status');
      return {
        version: 'unknown',
        jails: [],
        totalBanned: 0,
      };
    }
  }

  /**
   * Get status of specific jail
   */
  async getJailStatus(jailName: string): Promise<JailStatus | null> {
    try {
      const output = await this.execCommand(`status ${jailName}`);

      // Parse output
      const currentlyFailed = parseInt(
        output.match(/Currently failed:\s+(\d+)/)?.[1] || '0',
        10,
      );
      const totalFailed = parseInt(output.match(/Total failed:\s+(\d+)/)?.[1] || '0', 10);
      const currentlyBanned = parseInt(
        output.match(/Currently banned:\s+(\d+)/)?.[1] || '0',
        10,
      );
      const totalBanned = parseInt(output.match(/Total banned:\s+(\d+)/)?.[1] || '0', 10);

      // Parse banned IPs
      const bannedMatch = output.match(/Banned IP list:\s+(.+)/);
      const bannedIPs = bannedMatch && bannedMatch[1]
        ? bannedMatch[1].split(' ').filter((ip) => ip && ip !== 'none')
        : [];

      return {
        name: jailName,
        currentlyFailed,
        totalFailed,
        currentlyBanned,
        totalBanned,
        bannedIPs,
      };
    } catch (error) {
      logger.error({ err: error }, `Failed to get status for jail ${jailName}`);
      return null;
    }
  }

  /**
   * Ban IP address
   */
  async banIP(ip: string, jailName: string = 'sshd'): Promise<boolean> {
    try {
      await this.execCommand(`set ${jailName} banip ${ip}`);
      logger.info(`Banned IP ${ip} in jail ${jailName}`);
      return true;
    } catch (error) {
      logger.error({ err: error }, `Failed to ban IP ${ip}`);
      return false;
    }
  }

  /**
   * Unban IP address
   */
  async unbanIP(ip: string, jailName: string = 'sshd'): Promise<boolean> {
    try {
      await this.execCommand(`set ${jailName} unbanip ${ip}`);
      logger.info(`Unbanned IP ${ip} from jail ${jailName}`);
      return true;
    } catch (error) {
      logger.error({ err: error }, `Failed to unban IP ${ip}`);
      return false;
    }
  }

  /**
   * Get all banned IPs across all jails
   */
  async getAllBannedIPs(): Promise<string[]> {
    try {
      const status = await this.getStatus();
      const allIPs = new Set<string>();

      for (const jail of status.jails) {
        for (const ip of jail.bannedIPs) {
          allIPs.add(ip);
        }
      }

      return Array.from(allIPs);
    } catch (error) {
      logger.error({ err: error }, 'Failed to get all banned IPs');
      return [];
    }
  }

  /**
   * Check if fail2ban is running
   */
    try {
      await this.execCommand('ping');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reload fail2ban configuration
   */
  async reload(): Promise<boolean> {
    try {
      await this.execCommand('reload');
      logger.info('Fail2ban configuration reloaded');
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Failed to reload fail2ban');
      return false;
    }
  }
}
