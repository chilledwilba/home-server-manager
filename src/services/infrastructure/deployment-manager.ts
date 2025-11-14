import { logger } from '../../utils/logger.js';
import {
  validateServiceName,
  validateStackName,
  validateEnvVars,
  sanitizeDockerCompose,
} from '../../utils/validation.js';
import type { PortainerClient } from '../../integrations/portainer/client.js';
import type { ServiceCatalog } from './service-catalog.js';
import type { InfrastructurePersistence } from './infrastructure-persistence.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DeploymentOptions {
  autoApprove?: boolean;
  dryRun?: boolean;
  stackName?: string;
  envVars?: Record<string, string>;
  autoStart?: boolean;
  endpoint?: number;
}

/**
 * Deployment Manager
 * Handles service deployment and removal via Portainer
 */
export class DeploymentManager {
  private templatesPath: string;

  constructor(
    private serviceCatalog: ServiceCatalog,
    private persistence: InfrastructurePersistence,
    private portainer?: PortainerClient,
  ) {
    this.templatesPath = path.join(__dirname, '../../../infrastructure-templates');
  }

  /**
   * Generate docker-compose file for a service
   */
  async generateDockerCompose(
    serviceName: string,
    envVars?: Record<string, string>,
  ): Promise<string> {
    const service = this.serviceCatalog.getService(serviceName);
    if (!service) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    if (!service.dockerCompose) {
      throw new Error(`No docker-compose template for ${serviceName}`);
    }

    // Read template
    const templatePath = path.join(this.templatesPath, service.dockerCompose);
    let template: string;

    try {
      template = await fs.readFile(templatePath, 'utf-8');
    } catch (error) {
      logger.error({ err: error, templatePath }, 'Failed to read docker-compose template');
      throw new Error(`Template not found: ${service.dockerCompose}`);
    }

    // Replace environment variables
    if (envVars) {
      for (const [key, value] of Object.entries(envVars)) {
        template = template.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
      }
    }

    return template;
  }

  /**
   * Validate deployment readiness
   */
  validateDeployment(
    serviceName: string,
    envVars?: Record<string, string>,
  ): {
    ready: boolean;
    missing: string[];
    warnings: string[];
  } {
    const service = this.serviceCatalog.getService(serviceName);
    if (!service) {
      return {
        ready: false,
        missing: ['Service not found'],
        warnings: [],
      };
    }

    const missing: string[] = [];
    const warnings: string[] = [];

    // Check required environment variables
    if (service.requiredEnvVars) {
      for (const envVar of service.requiredEnvVars) {
        if (!envVars || !envVars[envVar]) {
          missing.push(`Environment variable: ${envVar}`);
        }
      }
    }

    // Check dependencies
    if (service.dependencies) {
      for (const dep of service.dependencies) {
        const depService = this.serviceCatalog.getService(dep);
        if (depService?.status !== 'deployed') {
          warnings.push(`Dependency not deployed: ${dep}`);
        }
      }
    }

    // Check port conflicts
    if (service.ports && service.ports.length > 0) {
      warnings.push(`Will use ports: ${service.ports.join(', ')}`);
    }

    return {
      ready: missing.length === 0,
      missing,
      warnings,
    };
  }

  /**
   * Deploy service via Portainer
   */
  async deployService(
    serviceName: string,
    options: DeploymentOptions = {},
  ): Promise<{
    success: boolean;
    stackId?: number;
    error?: string;
  }> {
    // Validate service name
    const serviceNameValidation = validateServiceName(serviceName);
    if (!serviceNameValidation.valid) {
      return {
        success: false,
        error: serviceNameValidation.error,
      };
    }

    // Validate stack name if provided
    if (options.stackName) {
      const stackNameValidation = validateStackName(options.stackName);
      if (!stackNameValidation.valid) {
        return {
          success: false,
          error: stackNameValidation.error,
        };
      }
    }

    // Validate environment variables if provided
    if (options.envVars) {
      const envVarsValidation = validateEnvVars(options.envVars);
      if (!envVarsValidation.valid) {
        return {
          success: false,
          error: `Invalid environment variables: ${envVarsValidation.errors.join(', ')}`,
        };
      }
    }

    if (!this.portainer) {
      return {
        success: false,
        error: 'Portainer client not configured',
      };
    }

    const service = this.serviceCatalog.getService(serviceName);
    if (!service) {
      return {
        success: false,
        error: `Unknown service: ${serviceName}`,
      };
    }

    logger.info(`Deploying ${serviceName}...`);

    try {
      // Generate docker-compose
      const dockerCompose = await this.generateDockerCompose(serviceName, options.envVars);

      // Validate docker-compose content
      const composeValidation = sanitizeDockerCompose(dockerCompose);
      if (!composeValidation.valid) {
        return {
          success: false,
          error: `Invalid docker-compose: ${composeValidation.error}`,
        };
      }

      if (options.dryRun) {
        logger.info({ compose: dockerCompose }, 'Dry run - would deploy');
        return {
          success: true,
          stackId: -1,
        };
      }

      // Check if Portainer is available
      if (!this.portainer) {
        return {
          success: false,
          error:
            'Portainer not configured. Set PORTAINER_HOST, PORTAINER_PORT, and PORTAINER_TOKEN to enable automated deployment.',
        };
      }

      // Deploy via Portainer
      const stackName = options.stackName || serviceName.toLowerCase().replace(/\s+/g, '-');
      const endpointId = options.endpoint || 1;

      // Convert envVars object to Portainer env array format
      const env = options.envVars
        ? Object.entries(options.envVars).map(([name, value]) => ({ name, value }))
        : [];

      const stack = await this.portainer.deployStack(stackName, dockerCompose, endpointId, env);

      // Update service status
      this.serviceCatalog.updateServiceStatus(serviceName, 'deployed');

      // Record in database
      this.persistence.recordDeployment(
        serviceName,
        service.type,
        stack.Id,
        dockerCompose,
        options.envVars,
      );

      logger.info({ stackId: stack.Id }, `Successfully deployed ${serviceName}`);

      return {
        success: true,
        stackId: stack.Id,
      };
    } catch (error) {
      logger.error({ err: error }, `Failed to deploy ${serviceName}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Remove service
   */
  async removeService(serviceName: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    // Validate service name
    const serviceNameValidation = validateServiceName(serviceName);
    if (!serviceNameValidation.valid) {
      return {
        success: false,
        error: serviceNameValidation.error,
      };
    }

    if (!this.portainer) {
      return {
        success: false,
        error: 'Portainer client not configured',
      };
    }

    const service = this.serviceCatalog.getService(serviceName);
    if (!service) {
      return {
        success: false,
        error: `Unknown service: ${serviceName}`,
      };
    }

    logger.info(`Removing ${serviceName}...`);

    try {
      // Find and delete stack
      const stacks = await this.portainer.getStacks();
      const stack = stacks.find(
        (s: { Name: string }) =>
          s.Name.toLowerCase() === serviceName.toLowerCase() ||
          s.Name.toLowerCase() === serviceName.toLowerCase().replace(/\s+/g, '-'),
      );

      if (stack) {
        await this.portainer.deleteStack(stack.Id);
        logger.info({ stackId: stack.Id }, `Deleted stack for ${serviceName}`);
      } else {
        logger.warn(`No stack found for ${serviceName}`);
      }

      // Update service status
      this.serviceCatalog.updateServiceStatus(serviceName, 'not_deployed');

      // Update database
      this.persistence.updateDeploymentRemoved(serviceName);

      logger.info(`Successfully removed ${serviceName}`);

      return {
        success: true,
      };
    } catch (error) {
      logger.error({ err: error }, `Failed to remove ${serviceName}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
