import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('circuit-breaker');

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number; // Failures before opening (default: 5)
  successThreshold: number; // Successes to close from half-open (default: 2)
  timeout: number; // Time to wait before half-open (default: 60000ms)
  volumeThreshold: number; // Minimum requests before evaluation (default: 10)
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailure: string | null;
  lastSuccess: string | null;
}

/**
 * Circuit breaker pattern implementation
 * Prevents cascading failures by failing fast when service is down
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private nextAttempt = Date.now();
  private totalRequests = 0;
  private lastFailure: string | null = null;
  private lastSuccess: string | null = null;

  constructor(private config: CircuitBreakerConfig) {
    super();
    logger.info(
      {
        circuit: config.name,
        failureThreshold: config.failureThreshold,
        timeout: config.timeout,
      },
      'Circuit breaker initialized',
    );
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        const error = new Error(`Circuit breaker '${this.config.name}' is OPEN`);
        this.emit('rejected', error);
        throw error;
      }

      // Try transitioning to half-open
      this.setState(CircuitState.HALF_OPEN);
    }

    this.totalRequests++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.lastSuccess = new Date().toISOString();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;

      if (this.successes >= this.config.successThreshold) {
        this.setState(CircuitState.CLOSED);
      }
    }
  }

  private onFailure(error: unknown): void {
    this.failures++;
    this.lastFailure = new Date().toISOString();
    this.emit('failure', error);

    if (this.state === CircuitState.HALF_OPEN) {
      this.setState(CircuitState.OPEN);
      return;
    }

    if (
      this.totalRequests >= this.config.volumeThreshold &&
      this.failures >= this.config.failureThreshold
    ) {
      this.setState(CircuitState.OPEN);
    }
  }

  private setState(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitState.OPEN) {
      this.nextAttempt = Date.now() + this.config.timeout;
      logger.warn(
        {
          circuit: this.config.name,
          failures: this.failures,
          nextAttempt: new Date(this.nextAttempt).toISOString(),
        },
        'Circuit breaker opened',
      );
    } else if (newState === CircuitState.CLOSED) {
      this.successes = 0;
      logger.info({ circuit: this.config.name }, 'Circuit breaker closed');
    } else if (newState === CircuitState.HALF_OPEN) {
      logger.info({ circuit: this.config.name }, 'Circuit breaker half-open (testing recovery)');
    }

    this.emit('stateChange', { from: oldState, to: newState });
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
    };
  }

  /**
   * Reset the circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.totalRequests = 0;
    this.lastFailure = null;
    this.lastSuccess = null;
    logger.info({ circuit: this.config.name }, 'Circuit breaker reset');
  }

  /**
   * Get human-readable status
   */
  getStatus(): {
    name: string;
    state: CircuitState;
    healthy: boolean;
    metrics: CircuitBreakerMetrics;
  } {
    return {
      name: this.config.name,
      state: this.state,
      healthy: this.state === CircuitState.CLOSED,
      metrics: this.getMetrics(),
    };
  }
}
