import { describe, it, expect } from '@jest/globals';
import {
  formatSuccess,
  formatError,
  parseIntParam,
  parseBoolParam,
  extractParams,
  extractQuery,
  extractBody,
} from '../../../src/utils/route-helpers.js';

describe('Route Helpers', () => {
  describe('formatSuccess', () => {
    it('should format successful response with data', () => {
      const data = { pools: ['pool1', 'pool2'] };
      const result = formatSuccess(data);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should include optional message', () => {
      const data = { count: 5 };
      const message = 'Pools retrieved successfully';
      const result = formatSuccess(data, message);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(result.message).toBe(message);
    });

    it('should handle null data', () => {
      const result = formatSuccess(null);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should handle empty object data', () => {
      const result = formatSuccess({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('should have valid ISO timestamp', () => {
      const result = formatSuccess({ test: 'data' });
      const timestamp = new Date(result.timestamp);

      expect(timestamp.toISOString()).toBe(result.timestamp);
    });
  });

  describe('formatError', () => {
    it('should format error response', () => {
      const error = 'Pool not found';
      const result = formatError(error);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should include optional message', () => {
      const error = 'Database connection failed';
      const message = 'Please try again later';
      const result = formatError(error, message);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.message).toBe(message);
    });

    it('should not include data field', () => {
      const result = formatError('Error message');

      expect(result).not.toHaveProperty('data');
    });
  });

  describe('parseIntParam', () => {
    it('should parse valid integer string', () => {
      const source = { limit: '50' };
      const result = parseIntParam(source, 'limit', 10);

      expect(result).toBe(50);
    });

    it('should parse valid integer number', () => {
      const source = { limit: 100 };
      const result = parseIntParam(source, 'limit', 10);

      expect(result).toBe(100);
    });

    it('should return default when value is undefined', () => {
      const source = {};
      const result = parseIntParam(source, 'limit', 25);

      expect(result).toBe(25);
    });

    it('should return default when value is null', () => {
      const source = { limit: null };
      const result = parseIntParam(source, 'limit', 30);

      expect(result).toBe(30);
    });

    it('should throw error for invalid string', () => {
      const source = { limit: 'invalid' };

      expect(() => parseIntParam(source, 'limit', 10)).toThrow('Invalid limit');
      expect(() => parseIntParam(source, 'limit', 10)).toThrow('must be a number');
    });

    it('should throw error for NaN', () => {
      const source = { limit: NaN };

      expect(() => parseIntParam(source, 'limit', 10)).toThrow('Invalid limit');
    });

    it('should validate minimum value', () => {
      const source = { limit: 5 };

      expect(() => parseIntParam(source, 'limit', 10, 10, 100)).toThrow('must be >= 10');
    });

    it('should validate maximum value', () => {
      const source = { limit: 150 };

      expect(() => parseIntParam(source, 'limit', 10, 1, 100)).toThrow('must be <= 100');
    });

    it('should accept value within min and max range', () => {
      const source = { limit: 50 };
      const result = parseIntParam(source, 'limit', 10, 1, 100);

      expect(result).toBe(50);
    });

    it('should accept value equal to min', () => {
      const source = { limit: 10 };
      const result = parseIntParam(source, 'limit', 5, 10, 100);

      expect(result).toBe(10);
    });

    it('should accept value equal to max', () => {
      const source = { limit: 100 };
      const result = parseIntParam(source, 'limit', 5, 10, 100);

      expect(result).toBe(100);
    });

    it('should work with negative numbers', () => {
      const source = { offset: -5 };
      const result = parseIntParam(source, 'offset', 0, -10, 10);

      expect(result).toBe(-5);
    });

    it('should parse zero', () => {
      const source = { count: 0 };
      const result = parseIntParam(source, 'count', 10);

      expect(result).toBe(0);
    });
  });

  describe('parseBoolParam', () => {
    it('should parse boolean true', () => {
      const source = { enabled: true };
      const result = parseBoolParam(source, 'enabled', false);

      expect(result).toBe(true);
    });

    it('should parse boolean false', () => {
      const source = { enabled: false };
      const result = parseBoolParam(source, 'enabled', true);

      expect(result).toBe(false);
    });

    it('should parse string "true"', () => {
      const source = { enabled: 'true' };
      const result = parseBoolParam(source, 'enabled', false);

      expect(result).toBe(true);
    });

    it('should parse string "TRUE" (case insensitive)', () => {
      const source = { enabled: 'TRUE' };
      const result = parseBoolParam(source, 'enabled', false);

      expect(result).toBe(true);
    });

    it('should parse string "false"', () => {
      const source = { enabled: 'false' };
      const result = parseBoolParam(source, 'enabled', true);

      expect(result).toBe(false);
    });

    it('should parse string "FALSE" (case insensitive)', () => {
      const source = { enabled: 'FALSE' };
      const result = parseBoolParam(source, 'enabled', true);

      expect(result).toBe(false);
    });

    it('should parse string "1" as true', () => {
      const source = { enabled: '1' };
      const result = parseBoolParam(source, 'enabled', false);

      expect(result).toBe(true);
    });

    it('should parse string "0" as false', () => {
      const source = { enabled: '0' };
      const result = parseBoolParam(source, 'enabled', true);

      expect(result).toBe(false);
    });

    it('should parse number 1 as true', () => {
      const source = { enabled: 1 };
      const result = parseBoolParam(source, 'enabled', false);

      expect(result).toBe(true);
    });

    it('should parse number 0 as false', () => {
      const source = { enabled: 0 };
      const result = parseBoolParam(source, 'enabled', true);

      expect(result).toBe(false);
    });

    it('should parse positive number as true', () => {
      const source = { enabled: 42 };
      const result = parseBoolParam(source, 'enabled', false);

      expect(result).toBe(true);
    });

    it('should parse negative number as true', () => {
      const source = { enabled: -1 };
      const result = parseBoolParam(source, 'enabled', false);

      expect(result).toBe(true);
    });

    it('should return default when value is undefined', () => {
      const source = {};
      const result = parseBoolParam(source, 'enabled', true);

      expect(result).toBe(true);
    });

    it('should return default when value is null', () => {
      const source = { enabled: null };
      const result = parseBoolParam(source, 'enabled', false);

      expect(result).toBe(false);
    });

    it('should return default for invalid string', () => {
      const source = { enabled: 'invalid' };
      const result = parseBoolParam(source, 'enabled', true);

      expect(result).toBe(true);
    });
  });

  describe('extractParams', () => {
    it('should extract params from object', () => {
      const params = { id: 'pool-123', name: 'main-pool' };
      const result = extractParams<{ id: string; name: string }>(params);

      expect(result).toEqual(params);
      expect(result.id).toBe('pool-123');
      expect(result.name).toBe('main-pool');
    });

    it('should return empty object for undefined', () => {
      const result = extractParams(undefined);

      expect(result).toEqual({});
    });

    it('should return empty object for null', () => {
      const result = extractParams(null);

      expect(result).toEqual({});
    });

    it('should handle empty object', () => {
      const result = extractParams({});

      expect(result).toEqual({});
    });
  });

  describe('extractQuery', () => {
    it('should extract query from object', () => {
      const query = { limit: 50, offset: 0, sort: 'name' };
      const result = extractQuery<{ limit: number; offset: number; sort: string }>(query);

      expect(result).toEqual(query);
      expect(result.limit).toBe(50);
    });

    it('should return empty object for undefined', () => {
      const result = extractQuery(undefined);

      expect(result).toEqual({});
    });

    it('should return empty object for null', () => {
      const result = extractQuery(null);

      expect(result).toEqual({});
    });

    it('should handle complex query parameters', () => {
      const query = {
        filters: { status: 'active', type: 'docker' },
        sort: { field: 'name', order: 'asc' },
      };
      const result = extractQuery(query);

      expect(result).toEqual(query);
    });
  });

  describe('extractBody', () => {
    it('should extract body from object', () => {
      const body = { name: 'test-service', image: 'nginx:latest' };
      const result = extractBody<{ name: string; image: string }>(body);

      expect(result).toEqual(body);
      expect(result.name).toBe('test-service');
    });

    it('should return empty object for undefined', () => {
      const result = extractBody(undefined);

      expect(result).toEqual({});
    });

    it('should return empty object for null', () => {
      const result = extractBody(null);

      expect(result).toEqual({});
    });

    it('should handle nested objects', () => {
      const body = {
        service: {
          name: 'web',
          config: { port: 8080 },
        },
      };
      const result = extractBody(body);

      expect(result).toEqual(body);
    });
  });
});
