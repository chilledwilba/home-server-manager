import type { ServiceContainer } from '../core/service-container.js';
import type Database from 'better-sqlite3';
import type { TrueNASClient } from '../integrations/truenas/client.js';
import type { PortainerClient } from '../integrations/portainer/client.js';
import { createLogger } from '../utils/logger.js';
import { CircuitBreaker, CircuitState } from './circuit-breaker.js';

const logger = createLogger('health-monitor');

export interface ServiceHealth {
  name: string;
  healthy: boolean;
  lastCheck: string;
  lastSuccess: string | null;
  lastFailure: string | null;
  consecutiveFailures: number;
  circuitState?: string;
  errorMessage?: string;
}

/**
 * Monitor health of all services and restart failed ones
 * Implements automatic recovery and circuit breaker patterns
 */
export class HealthMonitor {
  private health: Map<string, ServiceHealth> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private restartAttempts: Map<string, number> = new Map();
  private readonly MAX_RESTART_ATTEMPTS = 3;

  constructor(
    private services: ServiceContainer,
    private db: Database.Database,
  ) {
    // Initialize circuit breakers for external services
    this.circuitBreakers.set(
      'truenas',
      new CircuitBreaker({
        name: 'truenas',
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000,
        volumeThreshold: 10,
      }),
    );

    this.circuitBreakers.set(
      'portainer',
      new CircuitBreaker({
        name: 'portainer',
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000,
        volumeThreshold: 10,
      }),
    );

    logger.info('Health monitor initialized with circuit breakers');
  }

  /**
   * Start health monitoring
   */
  start(): void {
    logger.info('Starting health monitor...');

    // Check health every 30 seconds
    this.checkInterval = setInterval(() => {
      void this.checkAllServices();
    }, 30000);

    // Initial check
    void this.checkAllServices();
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info('Health monitor stopped');
  }

  /**
   * Check health of all services
   */
  private async checkAllServices(): Promise<void> {
    await Promise.allSettled([
      this.checkDatabase(),
      this.checkTrueNAS(),
      this.checkPortainer(),
      this.checkMonitoringServices(),
    ]);
  }

  /**
   * Check database health
   */
  private checkDatabase(): void {
    const serviceName = 'database';

    try {
      // Simple query to verify database is accessible
      this.db.prepare('SELECT 1').get();
      this.recordSuccess(serviceName);
    } catch (error) {
      this.recordFailure(serviceName, error);
      logger.error({ err: error }, 'Database health check failed');
    }
  }

  /**
   * Check TrueNAS client health with circuit breaker
   */
  private async checkTrueNAS(): Promise<void> {
    const serviceName = 'truenas';
    const client = this.services.get<TrueNASClient>('truenasClient');

    if (!client) {
      this.recordFailure(serviceName, new Error('Client not initialized'));
      return;
    }

    const breaker = this.circuitBreakers.get('truenas');

    try {
      await breaker?.execute(async () => {
        await client.getPools();
      });
      this.recordSuccess(serviceName);

      // If we were in a failed state and recovered, restart monitor
      if (this.restartAttempts.get('truenasMonitor')) {
        this.restartAttempts.delete('truenasMonitor');
        logger.info('TrueNAS recovered, monitor should resume normal operation');
      }
    } catch (error) {
      this.recordFailure(serviceName, error);

      // Try to restart monitor if circuit opens
      if (breaker?.getState() === CircuitState.OPEN) {
        await this.restartMonitor('truenasMonitor');
      }
    }
  }

  /**
   * Check Portainer client health with circuit breaker
   */
  private async checkPortainer(): Promise<void> {
    const serviceName = 'portainer';
    const client = this.services.get<PortainerClient>('portainerClient');

    if (!client) {
      this.recordFailure(serviceName, new Error('Client not initialized'));
      return;
    }

    const breaker = this.circuitBreakers.get('portainer');

    try {
      await breaker?.execute(async () => {
        await client.getContainers();
      });
      this.recordSuccess(serviceName);

      // If we were in a failed state and recovered, restart monitor
      if (this.restartAttempts.get('dockerMonitor')) {
        this.restartAttempts.delete('dockerMonitor');
        logger.info('Portainer recovered, monitor should resume normal operation');
      }
    } catch (error) {
      this.recordFailure(serviceName, error);

      if (breaker?.getState() === CircuitState.OPEN) {
        await this.restartMonitor('dockerMonitor');
      }
    }
  }

  /**
   * Check if monitoring services are still running
   */
  private async checkMonitoringServices(): Promise<void> {
    const monitorServices = ['truenasMonitor', 'dockerMonitor', 'arrOptimizer'];

    for (const name of monitorServices) {
      const service = this.services.get<{ isRunning?: () => boolean }>(name);
      if (service && service.isRunning && !service.isRunning()) {
        logger.warn({ service: name }, 'Monitoring service not running');
        await this.restartMonitor(name);
      }
    }
  }

  /**
   * Attempt to restart a failed service with exponential backoff
   */
  private async restartMonitor(serviceName: string): Promise<void> {
    const attempts = this.restartAttempts.get(serviceName) || 0;

    if (attempts >= this.MAX_RESTART_ATTEMPTS) {
      logger.error({ service: serviceName, attempts }, 'Max restart attempts reached, giving up');
      return;
    }

    this.restartAttempts.set(serviceName, attempts + 1);

    // Exponential backoff: 5s, 10s, 20s
    const backoffDelay = 5000 * Math.pow(2, attempts);

    logger.info(
      { service: serviceName, attempt: attempts + 1, delay: backoffDelay },
      'Attempting to restart service',
    );

    const service = this.services.get<{ stop?: () => void | Promise<void>; start?: () => void }>(
      serviceName,
    );
    if (!service) {
      logger.error({ service: serviceName }, 'Service not found');
      return;
    }

    try {
      // Stop existing instance
      if (typeof service.stop === 'function') {
        await service.stop();
      }

      // Wait with exponential backoff before restarting
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));

      // Start again
      if (typeof service.start === 'function') {
        service.start();
      }

      logger.info(
        { service: serviceName, attempt: attempts + 1 },
        'Service restarted successfully',
      );
    } catch (error) {
      logger.error({ err: error, service: serviceName }, 'Failed to restart service');
    }
  }

  /**
   * Record successful health check
   */
  private recordSuccess(serviceName: string): void {
    const current = this.health.get(serviceName) ?? {
      name: serviceName,
      healthy: false,
      lastCheck: '',
      lastSuccess: null,
      lastFailure: null,
      consecutiveFailures: 0,
    };

    this.health.set(serviceName, {
      ...current,
      healthy: true,
      lastCheck: new Date().toISOString(),
      lastSuccess: new Date().toISOString(),
      consecutiveFailures: 0,
      errorMessage: undefined,
    });
  }

  /**
   * Record failed health check
   */
  private recordFailure(serviceName: string, error: unknown): void {
    const current = this.health.get(serviceName) ?? {
      name: serviceName,
      healthy: true,
      lastCheck: '',
      lastSuccess: null,
      lastFailure: null,
      consecutiveFailures: 0,
    };

    const updated: ServiceHealth = {
      ...current,
      healthy: false,
      lastCheck: new Date().toISOString(),
      lastFailure: new Date().toISOString(),
      consecutiveFailures: current.consecutiveFailures + 1,
      errorMessage: error instanceof Error ? error.message : String(error),
    };

    this.health.set(serviceName, updated);

    logger.error(
      { err: error, service: serviceName, failures: updated.consecutiveFailures },
      'Service health check failed',
    );
  }

  /**
   * Get health status for all services
   */
  getHealthStatus(): ServiceHealth[] {
    const status = Array.from(this.health.values());

    // Add circuit breaker states
    for (const [name, breaker] of this.circuitBreakers) {
      const service = status.find((s) => s.name === name);
      if (service) {
        service.circuitState = breaker.getState();
      }
    }

    return status;
  }

  /**
   * Get overall system health
   */
  isHealthy(): boolean {
    return Array.from(this.health.values()).every((s) => s.healthy);
  }

  /**
   * Get detailed health report
   */
  getHealthReport(): {
    healthy: boolean;
    services: ServiceHealth[];
    circuits: Array<{
      name: string;
      state: string;
      metrics: unknown;
    }>;
    timestamp: string;
  } {
    const circuits = Array.from(this.circuitBreakers.entries()).map(([name, breaker]) => ({
      name,
      state: breaker.getState(),
      metrics: breaker.getMetrics(),
    }));

    return {
      healthy: this.isHealthy(),
      services: this.getHealthStatus(),
      circuits,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Manually reset a circuit breaker
   */
  resetCircuit(name: string): void {
    const breaker = this.circuitBreakers.get(name);
    if (breaker) {
      breaker.reset();
      logger.info({ circuit: name }, 'Circuit breaker manually reset');
    }
  }

  /**
   * Get circuit breaker by name
   */
  getCircuitBreaker(name: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(name);
  }
}
