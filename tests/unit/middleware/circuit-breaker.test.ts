import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { CircuitBreaker, CircuitState } from '../../../src/middleware/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-service',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 5000,
      volumeThreshold: 5,
    });
  });

  describe('State Transitions', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition to OPEN after threshold failures', async () => {
      const failingFn = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Service down'));

      // Execute enough times to meet volume threshold
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Expected to fail
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reject requests immediately when OPEN', async () => {
      const failingFn = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Service down'));

      // Trip the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Should reject immediately without calling function
      const fn = jest.fn<() => Promise<string>>();
      await expect(breaker.execute(fn)).rejects.toThrow("Circuit breaker 'test-service' is OPEN");
      expect(fn).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const breaker = new CircuitBreaker({
        name: 'test-service',
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 100, // Short timeout for test
        volumeThreshold: 5,
      });

      const failingFn = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Service down'));

      // Trip the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for timeout
      // eslint-disable-next-line no-undef
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Next execution should transition to HALF_OPEN
      const successFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      await breaker.execute(successFn);

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should transition from HALF_OPEN to CLOSED after success threshold', async () => {
      const breaker = new CircuitBreaker({
        name: 'test-service',
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 100,
        volumeThreshold: 5,
      });

      const failingFn = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Service down'));

      // Trip the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Expected
        }
      }

      // Wait for timeout
      // eslint-disable-next-line no-undef
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Execute successful requests to close circuit
      const successFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      await breaker.execute(successFn); // HALF_OPEN
      await breaker.execute(successFn); // Should transition to CLOSED

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition from HALF_OPEN back to OPEN on failure', async () => {
      const breaker = new CircuitBreaker({
        name: 'test-service',
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 100,
        volumeThreshold: 5,
      });

      const failingFn = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Service down'));

      // Trip the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Expected
        }
      }

      // Wait for timeout
      // eslint-disable-next-line no-undef
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Try to execute but fail - should go back to OPEN
      try {
        await breaker.execute(failingFn);
      } catch {
        // Expected
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Metrics', () => {
    it('should track success and failure counts', async () => {
      const successFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      const failFn = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('fail'));

      await breaker.execute(successFn);
      await breaker.execute(successFn);

      try {
        await breaker.execute(failFn);
      } catch {
        // Expected
      }

      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.failures).toBe(1);
    });

    it('should track last success and failure timestamps', async () => {
      const successFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      await breaker.execute(successFn);

      const metrics = breaker.getMetrics();
      expect(metrics.lastSuccess).toBeTruthy();
      expect(metrics.lastFailure).toBeNull();
    });
  });

  describe('Reset', () => {
    it('should reset circuit breaker to initial state', async () => {
      const failingFn = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Service down'));

      // Trip the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Expected
        }
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      const metrics = breaker.getMetrics();
      expect(metrics.failures).toBe(0);
      expect(metrics.totalRequests).toBe(0);
    });
  });

  describe('Status', () => {
    it('should provide human-readable status', () => {
      const status = breaker.getStatus();

      expect(status).toHaveProperty('name', 'test-service');
      expect(status).toHaveProperty('state', CircuitState.CLOSED);
      expect(status).toHaveProperty('healthy', true);
      expect(status).toHaveProperty('metrics');
    });

    it('should mark as unhealthy when OPEN', async () => {
      const failingFn = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Service down'));

      // Trip the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(failingFn);
        } catch {
          // Expected
        }
      }

      const status = breaker.getStatus();
      expect(status.healthy).toBe(false);
      expect(status.state).toBe(CircuitState.OPEN);
    });
  });
});
