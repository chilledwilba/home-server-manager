import { describe, it, expect } from '@jest/globals';
import {
  INTERVALS,
  FILE_LIMITS,
  CIRCUIT_BREAKER,
  HEALTH_MONITOR,
  QUERY_LIMITS,
  ALERT_SEVERITY,
  DISK_THRESHOLDS,
  DOCKER_THRESHOLDS,
  ZFS_THRESHOLDS,
  HTTP_STATUS,
  CACHE_TTL,
  PATTERNS,
} from '../../../src/utils/constants.js';

describe('Constants', () => {
  describe('INTERVALS', () => {
    it('should define time intervals in milliseconds', () => {
      expect(INTERVALS.THIRTY_SECONDS).toBe(30_000);
      expect(INTERVALS.ONE_MINUTE).toBe(60_000);
      expect(INTERVALS.FIVE_MINUTES).toBe(5 * 60_000);
      expect(INTERVALS.FIFTEEN_MINUTES).toBe(15 * 60_000);
      expect(INTERVALS.ONE_HOUR).toBe(60 * 60_000);
      expect(INTERVALS.ONE_DAY).toBe(24 * 60 * 60_000);
    });

    it('should have correct time relationships', () => {
      expect(INTERVALS.ONE_MINUTE).toBeGreaterThan(INTERVALS.THIRTY_SECONDS);
      expect(INTERVALS.FIVE_MINUTES).toBeGreaterThan(INTERVALS.ONE_MINUTE);
      expect(INTERVALS.FIFTEEN_MINUTES).toBeGreaterThan(INTERVALS.FIVE_MINUTES);
      expect(INTERVALS.ONE_HOUR).toBeGreaterThan(INTERVALS.FIFTEEN_MINUTES);
      expect(INTERVALS.ONE_DAY).toBeGreaterThan(INTERVALS.ONE_HOUR);
    });

    it('should be defined as const objects', () => {
      // TypeScript 'as const' provides compile-time immutability
      // At runtime, the objects are not frozen, but TypeScript prevents reassignment
      expect(INTERVALS).toBeDefined();
      expect(typeof INTERVALS).toBe('object');
    });
  });

  describe('FILE_LIMITS', () => {
    it('should define file size limits', () => {
      expect(FILE_LIMITS.ROUTE_FILE_MAX).toBe(250);
      expect(FILE_LIMITS.SERVICE_FILE_MAX).toBe(400);
      expect(FILE_LIMITS.GENERAL_FILE_MAX).toBe(500);
    });

    it('should have sensible limit ordering', () => {
      expect(FILE_LIMITS.ROUTE_FILE_MAX).toBeLessThan(FILE_LIMITS.SERVICE_FILE_MAX);
      expect(FILE_LIMITS.SERVICE_FILE_MAX).toBeLessThan(FILE_LIMITS.GENERAL_FILE_MAX);
    });
  });

  describe('CIRCUIT_BREAKER', () => {
    it('should define circuit breaker configuration', () => {
      expect(CIRCUIT_BREAKER.FAILURE_THRESHOLD).toBe(5);
      expect(CIRCUIT_BREAKER.SUCCESS_THRESHOLD).toBe(2);
      expect(CIRCUIT_BREAKER.TIMEOUT).toBe(60_000);
      expect(CIRCUIT_BREAKER.VOLUME_THRESHOLD).toBe(10);
    });

    it('should have positive threshold values', () => {
      expect(CIRCUIT_BREAKER.FAILURE_THRESHOLD).toBeGreaterThan(0);
      expect(CIRCUIT_BREAKER.SUCCESS_THRESHOLD).toBeGreaterThan(0);
      expect(CIRCUIT_BREAKER.TIMEOUT).toBeGreaterThan(0);
      expect(CIRCUIT_BREAKER.VOLUME_THRESHOLD).toBeGreaterThan(0);
    });

    it('should require more failures than successes for recovery', () => {
      expect(CIRCUIT_BREAKER.FAILURE_THRESHOLD).toBeGreaterThan(CIRCUIT_BREAKER.SUCCESS_THRESHOLD);
    });
  });

  describe('HEALTH_MONITOR', () => {
    it('should define health monitoring configuration', () => {
      expect(HEALTH_MONITOR.CHECK_INTERVAL).toBe(30_000);
      expect(HEALTH_MONITOR.MAX_RESTART_ATTEMPTS).toBe(3);
      expect(HEALTH_MONITOR.BASE_BACKOFF_DELAY).toBe(5_000);
    });

    it('should have positive values', () => {
      expect(HEALTH_MONITOR.CHECK_INTERVAL).toBeGreaterThan(0);
      expect(HEALTH_MONITOR.MAX_RESTART_ATTEMPTS).toBeGreaterThan(0);
      expect(HEALTH_MONITOR.BASE_BACKOFF_DELAY).toBeGreaterThan(0);
    });
  });

  describe('QUERY_LIMITS', () => {
    it('should define database query limits', () => {
      expect(QUERY_LIMITS.DEFAULT_LIMIT).toBe(20);
      expect(QUERY_LIMITS.MAX_LIMIT).toBe(100);
      expect(QUERY_LIMITS.ALERTS_LIMIT).toBe(100);
      expect(QUERY_LIMITS.METRICS_LIMIT).toBe(50);
    });

    it('should have max limit greater than default', () => {
      expect(QUERY_LIMITS.MAX_LIMIT).toBeGreaterThan(QUERY_LIMITS.DEFAULT_LIMIT);
    });

    it('should have positive limits', () => {
      expect(QUERY_LIMITS.DEFAULT_LIMIT).toBeGreaterThan(0);
      expect(QUERY_LIMITS.MAX_LIMIT).toBeGreaterThan(0);
      expect(QUERY_LIMITS.ALERTS_LIMIT).toBeGreaterThan(0);
      expect(QUERY_LIMITS.METRICS_LIMIT).toBeGreaterThan(0);
    });
  });

  describe('ALERT_SEVERITY', () => {
    it('should define alert severity levels', () => {
      expect(ALERT_SEVERITY.INFO).toBe('info');
      expect(ALERT_SEVERITY.WARNING).toBe('warning');
      expect(ALERT_SEVERITY.ERROR).toBe('error');
      expect(ALERT_SEVERITY.CRITICAL).toBe('critical');
    });

    it('should have all severity levels as strings', () => {
      expect(typeof ALERT_SEVERITY.INFO).toBe('string');
      expect(typeof ALERT_SEVERITY.WARNING).toBe('string');
      expect(typeof ALERT_SEVERITY.ERROR).toBe('string');
      expect(typeof ALERT_SEVERITY.CRITICAL).toBe('string');
    });
  });

  describe('DISK_THRESHOLDS', () => {
    it('should define disk failure prediction thresholds', () => {
      expect(DISK_THRESHOLDS.TEMPERATURE_THRESHOLD).toBe(50);
      expect(DISK_THRESHOLDS.REALLOCATED_SECTORS_THRESHOLD).toBe(10);
      expect(DISK_THRESHOLDS.PENDING_SECTORS_THRESHOLD).toBe(5);
      expect(DISK_THRESHOLDS.HIGH_RISK_THRESHOLD).toBe(40);
      expect(DISK_THRESHOLDS.MEDIUM_RISK_THRESHOLD).toBe(20);
    });

    it('should have high risk greater than medium risk', () => {
      expect(DISK_THRESHOLDS.HIGH_RISK_THRESHOLD).toBeGreaterThan(
        DISK_THRESHOLDS.MEDIUM_RISK_THRESHOLD,
      );
    });

    it('should have positive threshold values', () => {
      expect(DISK_THRESHOLDS.TEMPERATURE_THRESHOLD).toBeGreaterThan(0);
      expect(DISK_THRESHOLDS.REALLOCATED_SECTORS_THRESHOLD).toBeGreaterThan(0);
      expect(DISK_THRESHOLDS.PENDING_SECTORS_THRESHOLD).toBeGreaterThan(0);
      expect(DISK_THRESHOLDS.HIGH_RISK_THRESHOLD).toBeGreaterThan(0);
      expect(DISK_THRESHOLDS.MEDIUM_RISK_THRESHOLD).toBeGreaterThan(0);
    });

    it('should have reasonable temperature threshold (Celsius)', () => {
      expect(DISK_THRESHOLDS.TEMPERATURE_THRESHOLD).toBeGreaterThan(30);
      expect(DISK_THRESHOLDS.TEMPERATURE_THRESHOLD).toBeLessThan(100);
    });
  });

  describe('DOCKER_THRESHOLDS', () => {
    it('should define Docker monitoring thresholds', () => {
      expect(DOCKER_THRESHOLDS.CPU_THRESHOLD).toBe(80);
      expect(DOCKER_THRESHOLDS.MEMORY_THRESHOLD).toBe(85);
      expect(DOCKER_THRESHOLDS.RESTART_THRESHOLD).toBe(5);
    });

    it('should have thresholds as percentages (0-100)', () => {
      expect(DOCKER_THRESHOLDS.CPU_THRESHOLD).toBeGreaterThan(0);
      expect(DOCKER_THRESHOLDS.CPU_THRESHOLD).toBeLessThan(100);
      expect(DOCKER_THRESHOLDS.MEMORY_THRESHOLD).toBeGreaterThan(0);
      expect(DOCKER_THRESHOLDS.MEMORY_THRESHOLD).toBeLessThan(100);
    });

    it('should have memory threshold slightly higher than CPU', () => {
      expect(DOCKER_THRESHOLDS.MEMORY_THRESHOLD).toBeGreaterThan(DOCKER_THRESHOLDS.CPU_THRESHOLD);
    });
  });

  describe('ZFS_THRESHOLDS', () => {
    it('should define ZFS thresholds', () => {
      expect(ZFS_THRESHOLDS.CAPACITY_WARNING).toBe(75);
      expect(ZFS_THRESHOLDS.CAPACITY_CRITICAL).toBe(85);
      expect(ZFS_THRESHOLDS.SCRUB_AGE_WARNING).toBe(35);
    });

    it('should have capacity thresholds as percentages', () => {
      expect(ZFS_THRESHOLDS.CAPACITY_WARNING).toBeGreaterThan(0);
      expect(ZFS_THRESHOLDS.CAPACITY_WARNING).toBeLessThan(100);
      expect(ZFS_THRESHOLDS.CAPACITY_CRITICAL).toBeGreaterThan(0);
      expect(ZFS_THRESHOLDS.CAPACITY_CRITICAL).toBeLessThan(100);
    });

    it('should have critical higher than warning', () => {
      expect(ZFS_THRESHOLDS.CAPACITY_CRITICAL).toBeGreaterThan(ZFS_THRESHOLDS.CAPACITY_WARNING);
    });

    it('should have scrub age in reasonable days', () => {
      expect(ZFS_THRESHOLDS.SCRUB_AGE_WARNING).toBeGreaterThan(7);
      expect(ZFS_THRESHOLDS.SCRUB_AGE_WARNING).toBeLessThan(90);
    });
  });

  describe('HTTP_STATUS', () => {
    it('should define standard HTTP status codes', () => {
      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.CREATED).toBe(201);
      expect(HTTP_STATUS.NO_CONTENT).toBe(204);
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
      expect(HTTP_STATUS.FORBIDDEN).toBe(403);
      expect(HTTP_STATUS.NOT_FOUND).toBe(404);
      expect(HTTP_STATUS.CONFLICT).toBe(409);
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
      expect(HTTP_STATUS.SERVICE_UNAVAILABLE).toBe(503);
    });

    it('should have status codes in valid ranges', () => {
      // 2xx success
      expect(HTTP_STATUS.OK).toBeGreaterThanOrEqual(200);
      expect(HTTP_STATUS.OK).toBeLessThan(300);

      // 4xx client errors
      expect(HTTP_STATUS.BAD_REQUEST).toBeGreaterThanOrEqual(400);
      expect(HTTP_STATUS.BAD_REQUEST).toBeLessThan(500);

      // 5xx server errors
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBeGreaterThanOrEqual(500);
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBeLessThan(600);
    });
  });

  describe('CACHE_TTL', () => {
    it('should define cache TTL values in seconds', () => {
      expect(CACHE_TTL.SHORT).toBe(60);
      expect(CACHE_TTL.MEDIUM).toBe(300);
      expect(CACHE_TTL.LONG).toBe(900);
      expect(CACHE_TTL.VERY_LONG).toBe(3600);
    });

    it('should have increasing TTL values', () => {
      expect(CACHE_TTL.MEDIUM).toBeGreaterThan(CACHE_TTL.SHORT);
      expect(CACHE_TTL.LONG).toBeGreaterThan(CACHE_TTL.MEDIUM);
      expect(CACHE_TTL.VERY_LONG).toBeGreaterThan(CACHE_TTL.LONG);
    });

    it('should have SHORT equal to 1 minute', () => {
      expect(CACHE_TTL.SHORT).toBe(60);
    });

    it('should have MEDIUM equal to 5 minutes', () => {
      expect(CACHE_TTL.MEDIUM).toBe(300);
    });

    it('should have VERY_LONG equal to 1 hour', () => {
      expect(CACHE_TTL.VERY_LONG).toBe(3600);
    });
  });

  describe('PATTERNS', () => {
    describe('IPV4 pattern', () => {
      it('should match valid IPv4 addresses', () => {
        expect(PATTERNS.IPV4.test('192.168.1.1')).toBe(true);
        expect(PATTERNS.IPV4.test('10.0.0.1')).toBe(true);
        expect(PATTERNS.IPV4.test('172.16.0.1')).toBe(true);
        expect(PATTERNS.IPV4.test('8.8.8.8')).toBe(true);
        expect(PATTERNS.IPV4.test('0.0.0.0')).toBe(true);
        expect(PATTERNS.IPV4.test('255.255.255.255')).toBe(true);
      });

      it('should not match invalid IPv4 format', () => {
        // Note: This pattern checks format only, not value ranges (0-255)
        // So "256.1.1.1" would match the pattern even though it's invalid
        expect(PATTERNS.IPV4.test('192.168.1')).toBe(false);
        expect(PATTERNS.IPV4.test('192.168.1.1.1')).toBe(false);
        expect(PATTERNS.IPV4.test('abc.def.ghi.jkl')).toBe(false);
        expect(PATTERNS.IPV4.test('not-an-ip')).toBe(false);
      });

      it('should match format with any 1-3 digit octets (does not validate ranges)', () => {
        // Limitation: Regex doesn't validate octet ranges (0-255)
        expect(PATTERNS.IPV4.test('256.256.256.256')).toBe(true); // Invalid but matches format
        expect(PATTERNS.IPV4.test('999.999.999.999')).toBe(true); // Invalid but matches format
      });
    });

    describe('IPV6 pattern', () => {
      it('should match full IPv6 addresses', () => {
        expect(PATTERNS.IPV6.test('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe(true);
        expect(PATTERNS.IPV6.test('fe80:0000:0000:0000:0000:0000:0000:0001')).toBe(true);
      });

      it('should not match invalid patterns', () => {
        expect(PATTERNS.IPV6.test('192.168.1.1')).toBe(false);
        expect(PATTERNS.IPV6.test('not-an-ip')).toBe(false);
      });
    });

    describe('POOL_NAME pattern', () => {
      it('should match valid pool names', () => {
        expect(PATTERNS.POOL_NAME.test('tank')).toBe(true);
        expect(PATTERNS.POOL_NAME.test('storage-pool')).toBe(true);
        expect(PATTERNS.POOL_NAME.test('pool_1')).toBe(true);
        expect(PATTERNS.POOL_NAME.test('my-storage_pool-2')).toBe(true);
      });

      it('should not match invalid pool names', () => {
        expect(PATTERNS.POOL_NAME.test('pool with spaces')).toBe(false);
        expect(PATTERNS.POOL_NAME.test('pool@special')).toBe(false);
        expect(PATTERNS.POOL_NAME.test('')).toBe(false);
      });
    });

    describe('CONTAINER_NAME pattern', () => {
      it('should match valid container names', () => {
        expect(PATTERNS.CONTAINER_NAME.test('nginx')).toBe(true);
        expect(PATTERNS.CONTAINER_NAME.test('my-app')).toBe(true);
        expect(PATTERNS.CONTAINER_NAME.test('app_1')).toBe(true);
        expect(PATTERNS.CONTAINER_NAME.test('container.test')).toBe(true);
      });

      it('should require container names to start with alphanumeric', () => {
        expect(PATTERNS.CONTAINER_NAME.test('-invalid')).toBe(false);
        expect(PATTERNS.CONTAINER_NAME.test('_invalid')).toBe(false);
        expect(PATTERNS.CONTAINER_NAME.test('.invalid')).toBe(false);
      });

      it('should not match container names with spaces', () => {
        expect(PATTERNS.CONTAINER_NAME.test('my container')).toBe(false);
      });

      it('should not match special characters except dash, underscore, dot', () => {
        expect(PATTERNS.CONTAINER_NAME.test('container@test')).toBe(false);
        expect(PATTERNS.CONTAINER_NAME.test('container#test')).toBe(false);
      });
    });

    it('should define all expected pattern types', () => {
      expect(PATTERNS.IPV4).toBeInstanceOf(RegExp);
      expect(PATTERNS.IPV6).toBeInstanceOf(RegExp);
      expect(PATTERNS.POOL_NAME).toBeInstanceOf(RegExp);
      expect(PATTERNS.CONTAINER_NAME).toBeInstanceOf(RegExp);
    });
  });

  describe('Constants immutability', () => {
    it('should export const objects', () => {
      // Verify objects exist and are objects
      expect(typeof INTERVALS).toBe('object');
      expect(typeof FILE_LIMITS).toBe('object');
      expect(typeof CIRCUIT_BREAKER).toBe('object');
      expect(typeof HEALTH_MONITOR).toBe('object');
      expect(typeof QUERY_LIMITS).toBe('object');
      expect(typeof ALERT_SEVERITY).toBe('object');
      expect(typeof DISK_THRESHOLDS).toBe('object');
      expect(typeof DOCKER_THRESHOLDS).toBe('object');
      expect(typeof ZFS_THRESHOLDS).toBe('object');
      expect(typeof HTTP_STATUS).toBe('object');
      expect(typeof CACHE_TTL).toBe('object');
      expect(typeof PATTERNS).toBe('object');
    });
  });
});
