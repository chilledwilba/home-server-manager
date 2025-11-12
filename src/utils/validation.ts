/**
 * Input validation and sanitization utilities
 * Prevents injection attacks and ensures data integrity
 */

/**
 * Validate service name
 * - Alphanumeric, dash, underscore, space only
 * - Max 50 characters
 */
export function validateServiceName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Service name is required and must be a string' };
  }

  if (name.length > 50) {
    return { valid: false, error: 'Service name must be 50 characters or less' };
  }

  const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
  if (!validPattern.test(name)) {
    return {
      valid: false,
      error: 'Service name can only contain letters, numbers, spaces, dashes, and underscores',
    };
  }

  return { valid: true };
}

/**
 * Validate stack name
 * - Alphanumeric, dash, underscore only (no spaces for Docker stack names)
 * - Max 50 characters
 * - Must start with a letter
 */
export function validateStackName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Stack name is required and must be a string' };
  }

  if (name.length > 50) {
    return { valid: false, error: 'Stack name must be 50 characters or less' };
  }

  const validPattern = /^[a-zA-Z][a-zA-Z0-9\-_]*$/;
  if (!validPattern.test(name)) {
    return {
      valid: false,
      error:
        'Stack name must start with a letter and contain only letters, numbers, dashes, and underscores',
    };
  }

  return { valid: true };
}

/**
 * Validate environment variable name
 * - Uppercase letters, numbers, underscore only
 * - Max 100 characters
 * - Must start with a letter
 */
export function validateEnvVarName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Environment variable name is required and must be a string' };
  }

  if (name.length > 100) {
    return { valid: false, error: 'Environment variable name must be 100 characters or less' };
  }

  const validPattern = /^[A-Z][A-Z0-9_]*$/;
  if (!validPattern.test(name)) {
    return {
      valid: false,
      error:
        'Environment variable name must start with uppercase letter and contain only uppercase letters, numbers, and underscores',
    };
  }

  return { valid: true };
}

/**
 * Validate environment variable value
 * - No null bytes
 * - Max 10000 characters
 */
export function validateEnvVarValue(value: string): { valid: boolean; error?: string } {
  if (typeof value !== 'string') {
    return { valid: false, error: 'Environment variable value must be a string' };
  }

  if (value.length > 10000) {
    return { valid: false, error: 'Environment variable value must be 10000 characters or less' };
  }

  if (value.includes('\0')) {
    return { valid: false, error: 'Environment variable value cannot contain null bytes' };
  }

  return { valid: true };
}

/**
 * Validate IP address (for Fail2ban ban/unban)
 */
export function validateIPAddress(ip: string): { valid: boolean; error?: string } {
  if (!ip || typeof ip !== 'string') {
    return { valid: false, error: 'IP address is required and must be a string' };
  }

  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = ip.match(ipv4Pattern);

  if (ipv4Match) {
    // Validate each octet is 0-255
    const octets = ipv4Match.slice(1, 5).map((num) => parseInt(num, 10));
    if (octets.every((octet) => octet >= 0 && octet <= 255)) {
      return { valid: true };
    }
  }

  // IPv6 pattern (simplified)
  const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  if (ipv6Pattern.test(ip)) {
    return { valid: true };
  }

  // IPv6 compressed pattern
  const ipv6CompressedPattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  if (ipv6CompressedPattern.test(ip) && ip.includes('::')) {
    return { valid: true };
  }

  return { valid: false, error: 'Invalid IP address format' };
}

/**
 * Sanitize docker-compose content
 * - Checks for suspicious patterns
 * - Validates YAML structure basics
 */
export function sanitizeDockerCompose(content: string): { valid: boolean; error?: string } {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'Docker compose content is required and must be a string' };
  }

  if (content.length > 100000) {
    return { valid: false, error: 'Docker compose file is too large (max 100KB)' };
  }

  // Check for null bytes
  if (content.includes('\0')) {
    return { valid: false, error: 'Docker compose content contains null bytes' };
  }

  // Check for suspicious command patterns that might indicate injection
  const suspiciousPatterns = [
    /\$\(.*\)/g, // Command substitution
    /`.*`/g, // Backtick command execution
    /;\s*(rm|curl|wget|nc|bash|sh)\s/g, // Chained dangerous commands
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(content)) {
      return {
        valid: false,
        error:
          'Docker compose content contains suspicious patterns that may indicate injection attempts',
      };
    }
  }

  // Must start with 'version:' or 'services:' (basic YAML validation)
  const trimmed = content.trim();
  if (!trimmed.startsWith('version:') && !trimmed.startsWith('services:')) {
    return {
      valid: false,
      error: 'Docker compose must start with "version:" or "services:"',
    };
  }

  return { valid: true };
}

/**
 * Validate environment variables object
 */
export function validateEnvVars(envVars: Record<string, string>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (typeof envVars !== 'object' || envVars === null || Array.isArray(envVars)) {
    return { valid: false, errors: ['Environment variables must be an object'] };
  }

  for (const [name, value] of Object.entries(envVars)) {
    const nameValidation = validateEnvVarName(name);
    if (!nameValidation.valid) {
      errors.push(`${name}: ${nameValidation.error}`);
    }

    const valueValidation = validateEnvVarValue(value);
    if (!valueValidation.valid) {
      errors.push(`${name}: ${valueValidation.error}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
