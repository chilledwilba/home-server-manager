import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '../../utils/logger.js';

const execAsync = promisify(exec);
const logger = createLogger('nut-client');

/**
 * UPS status information
 */
export interface UPSStatus {
  onBattery: boolean;
  batteryCharge: number; // Percentage
  batteryRuntime: number; // Seconds remaining
  batteryVoltage: number;
  inputVoltage: number;
  outputVoltage: number;
  load: number; // Percentage
  status: string; // OL, OB, LB, etc.
  model: string;
  manufacturer: string;
  serial: string;
  timestamp: string;
}

/**
 * Configuration for NUT client
 */
export interface NUTClientConfig {
  host: string;
  port: number;
  upsName: string;
  timeout?: number;
}

/**
 * Network UPS Tools (NUT) client for UPS monitoring
 * Communicates with NUT daemon to retrieve UPS status and metrics
 */
export class NUTClient {
  private host: string;
  private port: number;
  private upsName: string;
  private timeout: number;

  constructor(config: NUTClientConfig) {
    this.host = config.host;
    this.port = config.port;
    this.upsName = config.upsName;
    this.timeout = config.timeout || 5000;

    logger.info(
      {
        host: this.host,
        port: this.port,
        upsName: this.upsName,
      },
      'NUT client initialized',
    );
  }

  /**
   * Get current UPS status with all metrics
   *
   * @returns Promise<UPSStatus> Current UPS status
   * @throws Error if communication fails
   */
  async getStatus(): Promise<UPSStatus> {
    try {
      const { stdout } = await execAsync(`upsc ${this.upsName}@${this.host}:${this.port}`, {
        timeout: this.timeout,
      });

      const status = this.parseUPSOutput(stdout);

      logger.debug({ status }, 'Retrieved UPS status');

      return status;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get UPS status');
      throw new Error(
        `UPS communication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Parse upsc command output into structured data
   *
   * @param output - Raw upsc output
   * @returns Parsed UPS status
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
      batteryCharge: parseFloat(data['battery.charge'] || '0') || 0,
      batteryRuntime: parseFloat(data['battery.runtime'] || '0') || 0,
      batteryVoltage: parseFloat(data['battery.voltage'] || '0') || 0,
      inputVoltage: parseFloat(data['input.voltage'] || '0') || 0,
      outputVoltage: parseFloat(data['output.voltage'] || '0') || 0,
      load: parseFloat(data['ups.load'] || '0') || 0,
      status: data['ups.status'] || 'UNKNOWN',
      model: data['ups.model'] || 'Unknown',
      manufacturer: data['ups.mfr'] || 'Unknown',
      serial: data['ups.serial'] || 'Unknown',
      timestamp: new Date().toISOString(),
    };

    return status;
  }

  /**
   * List available UPS devices on the NUT server
   *
   * @returns Promise<string[]> List of UPS device names
   */
  async listDevices(): Promise<string[]> {
    try {
      const { stdout } = await execAsync(`upsc -l ${this.host}:${this.port}`, {
        timeout: this.timeout,
      });

      const devices = stdout.split('\n').filter((line) => line.trim().length > 0);

      logger.debug({ devices }, 'Listed UPS devices');

      return devices;
    } catch (error) {
      logger.error({ err: error }, 'Failed to list UPS devices');
      return [];
    }
  }

  /**
   * Get all UPS variables (detailed info)
   *
   * @returns Promise<Record<string, string>> All UPS variables
   */
  async getVariables(): Promise<Record<string, string>> {
    try {
      const { stdout } = await execAsync(`upsc ${this.upsName}@${this.host}:${this.port}`, {
        timeout: this.timeout,
      });

      const variables: Record<string, string> = {};
      const lines = stdout.split('\n');

      for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length > 0) {
          variables[key.trim()] = valueParts.join(':').trim();
        }
      }

      logger.debug({ variableCount: Object.keys(variables).length }, 'Retrieved UPS variables');

      return variables;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get UPS variables');
      throw new Error(
        `Failed to retrieve UPS variables: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Check if UPS is available and responding
   *
   * @returns Promise<boolean> True if UPS is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.getStatus();
      return true;
    } catch (error) {
      logger.warn({ err: error }, 'UPS not available');
      return false;
    }
  }

  /**
   * Get battery runtime in human-readable format
   *
   * @param seconds - Runtime in seconds
   * @returns Formatted runtime string
   */
  static formatRuntime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
}
