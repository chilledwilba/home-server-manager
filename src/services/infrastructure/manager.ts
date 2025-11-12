import type Database from 'better-sqlite3';
import { logger } from '../../utils/logger.js';
import {
  validateServiceName,
  validateStackName,
  validateEnvVars,
  sanitizeDockerCompose,
} from '../../utils/validation.js';
import type { PortainerClient } from '../../integrations/portainer/client.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface InfrastructureService {
  name: string;
  type: 'security' | 'monitoring' | 'networking' | 'storage' | 'media';
  status: 'deployed' | 'recommended' | 'not_deployed';
  description: string;
  priority?: 'high' | 'medium' | 'low';
  benefits?: string[];
  dockerCompose?: string;
  dependencies?: string[];
  ports?: number[];
  requiredEnvVars?: string[];
}

interface DeploymentOptions {
  autoApprove?: boolean;
  dryRun?: boolean;
  stackName?: string;
  envVars?: Record<string, string>;
  autoStart?: boolean;
  endpoint?: number;
}

/**
 * Infrastructure Manager
 * Orchestrates infrastructure deployment and management
 */
export class InfrastructureManager {
  private services: Map<string, InfrastructureService> = new Map();
  private templatesPath: string;

  constructor(
    private db: Database.Database,
    private portainer?: PortainerClient,
  ) {
    this.templatesPath = path.join(__dirname, '../../../infrastructure-templates');
    this.initializeServices();
  }

  /**
   * Initialize known infrastructure services
   */
  private initializeServices(): void {
    // Security Stack
    this.services.set('cloudflare-tunnel', {
      name: 'Cloudflare Tunnel',
      type: 'security',
      status: 'not_deployed',
      description: 'Zero-trust network access without port forwarding',
      dockerCompose: 'cloudflare-tunnel.yml',
      requiredEnvVars: ['CLOUDFLARE_TUNNEL_TOKEN'],
      ports: [],
    });

    this.services.set('authentik', {
      name: 'Authentik SSO',
      type: 'security',
      status: 'not_deployed',
      description: 'Enterprise Single Sign-On and authentication',
      dockerCompose: 'authentik.yml',
      dependencies: ['postgresql', 'redis'],
      requiredEnvVars: ['AUTHENTIK_SECRET_KEY', 'AUTHENTIK_DB_PASSWORD'],
      ports: [9000, 9443],
    });

    this.services.set('fail2ban', {
      name: 'Fail2ban',
      type: 'security',
      status: 'not_deployed',
      description: 'Intrusion prevention system',
      dockerCompose: 'fail2ban.yml',
      requiredEnvVars: [],
      ports: [],
    });

    // Networking
    this.services.set('traefik', {
      name: 'Traefik',
      type: 'networking',
      status: 'not_deployed',
      description: 'Modern reverse proxy with automatic SSL',
      dockerCompose: 'traefik.yml',
      requiredEnvVars: ['CLOUDFLARE_API_TOKEN'],
      ports: [80, 443, 8080],
    });

    this.services.set('nginx-proxy-manager', {
      name: 'Nginx Proxy Manager',
      type: 'networking',
      status: 'not_deployed',
      description: 'Easy-to-use reverse proxy with SSL',
      dockerCompose: 'nginx-proxy-manager.yml',
      requiredEnvVars: [],
      ports: [80, 443, 81],
    });

    // Monitoring
    this.services.set('prometheus', {
      name: 'Prometheus',
      type: 'monitoring',
      status: 'not_deployed',
      description: 'Time-series database for metrics',
      dockerCompose: 'prometheus.yml',
      requiredEnvVars: [],
      ports: [9090],
    });

    this.services.set('grafana', {
      name: 'Grafana',
      type: 'monitoring',
      status: 'not_deployed',
      description: 'Beautiful dashboards and visualization',
      dockerCompose: 'grafana.yml',
      dependencies: ['prometheus'],
      requiredEnvVars: ['GRAFANA_ADMIN_PASSWORD'],
      ports: [3000],
    });

    this.services.set('uptime-kuma', {
      name: 'Uptime Kuma',
      type: 'monitoring',
      status: 'not_deployed',
      description: 'Self-hosted uptime monitoring',
      dockerCompose: 'uptime-kuma.yml',
      requiredEnvVars: [],
      ports: [3001],
    });
  }

  /**
   * Analyze current infrastructure
   */
  async analyzeInfrastructure(): Promise<{
    deployed: InfrastructureService[];
    recommended: InfrastructureService[];
    missing: InfrastructureService[];
  }> {
    logger.info('Analyzing infrastructure...');

    const deployed: InfrastructureService[] = [];
    const recommended: InfrastructureService[] = [];
    const missing: InfrastructureService[] = [];

    // Check which services are deployed
    if (this.portainer) {
      try {
        const stacks = await this.portainer.getStacks();
        const stackNames = stacks.map((s: { Name: string }) => s.Name.toLowerCase());

        for (const [key, service] of this.services) {
          if (stackNames.includes(key) || stackNames.includes(service.name.toLowerCase())) {
            service.status = 'deployed';
            deployed.push(service);
          }
        }
      } catch {
        logger.warn('Could not fetch Portainer stacks - Portainer may not be available');
      }
    }

    // Determine recommendations based on current setup
    const recommendations = this.generateRecommendations();

    for (const [key, service] of this.services) {
      if (service.status === 'not_deployed') {
        if (recommendations.includes(key)) {
          service.status = 'recommended';
          recommended.push(service);
        } else {
          missing.push(service);
        }
      }
    }

    logger.info({
      deployed: deployed.length,
      recommended: recommended.length,
      missing: missing.length,
    });

    return { deployed, recommended, missing };
  }

  /**
   * Generate smart recommendations based on current setup
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    // Check if security stack is missing
    const hasCloudflare = this.services.get('cloudflare-tunnel')?.status === 'deployed';
    const hasAuthentik = this.services.get('authentik')?.status === 'deployed';
    const hasFail2ban = this.services.get('fail2ban')?.status === 'deployed';

    if (!hasCloudflare) {
      recommendations.push('cloudflare-tunnel');
    }

    if (!hasAuthentik) {
      recommendations.push('authentik');
    }

    if (!hasFail2ban) {
      recommendations.push('fail2ban');
    }

    // Check if reverse proxy is missing
    const hasTraefik = this.services.get('traefik')?.status === 'deployed';
    const hasNginx = this.services.get('nginx-proxy-manager')?.status === 'deployed';

    if (!hasTraefik && !hasNginx && hasCloudflare) {
      // If using Cloudflare Tunnel, don't necessarily need local reverse proxy
      // But if exposing services locally, recommend one
      recommendations.push('nginx-proxy-manager');
    }

    // Check if monitoring is missing
    const hasGrafana = this.services.get('grafana')?.status === 'deployed';
    const hasPrometheus = this.services.get('prometheus')?.status === 'deployed';

    if (!hasPrometheus && !hasGrafana) {
      recommendations.push('prometheus');
      recommendations.push('grafana');
    }

    return recommendations;
  }

  /**
   * Get service information
   */
  getService(serviceName: string): InfrastructureService | undefined {
    return this.services.get(serviceName);
  }

  /**
   * Get all services by type
   */
  getServicesByType(
    type: 'security' | 'monitoring' | 'networking' | 'storage' | 'media',
  ): InfrastructureService[] {
    return Array.from(this.services.values()).filter((s) => s.type === type);
  }

  /**
   * Generate docker-compose file for a service
   */
  async generateDockerCompose(
    serviceName: string,
    envVars?: Record<string, string>,
  ): Promise<string> {
    const service = this.services.get(serviceName);
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
    } catch {
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
    const service = this.services.get(serviceName);
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
        const depService = this.services.get(dep);
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

    const service = this.services.get(serviceName);
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
      service.status = 'deployed';

      // Record in database
      this.recordDeployment(serviceName, stack.Id, stackName, dockerCompose, options.envVars);

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
   * Record deployment in database
   */
  private recordDeployment(
    serviceName: string,
    stackId: number,
    _stackName?: string,
    dockerCompose?: string,
    envVars?: Record<string, string>,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO infrastructure_deployments
        (service_name, service_type, stack_id, deployed_at, status, docker_compose, env_vars, deployed_by)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'active', ?, ?, 'infrastructure-manager')
    `);

    const service = this.services.get(serviceName);
    const serviceType = service?.type || 'unknown';
    const envVarsJson = envVars ? JSON.stringify(envVars) : null;

    stmt.run(serviceName, serviceType, stackId, dockerCompose || null, envVarsJson);
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

    const service = this.services.get(serviceName);
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
      service.status = 'not_deployed';

      // Update database
      const stmt = this.db.prepare(`
        UPDATE infrastructure_deployments
        SET status = 'removed', removed_at = CURRENT_TIMESTAMP
        WHERE service_name = ? AND status = 'active'
      `);

      stmt.run(serviceName);

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

  /**
   * Get deployment history
   */
  getDeploymentHistory(serviceName?: string): unknown[] {
    let stmt;

    if (serviceName) {
      stmt = this.db.prepare(`
        SELECT * FROM infrastructure_deployments
        WHERE service_name = ?
        ORDER BY deployed_at DESC
      `);
      return stmt.all(serviceName);
    }

    stmt = this.db.prepare(`
      SELECT * FROM infrastructure_deployments
      ORDER BY deployed_at DESC
      LIMIT 50
    `);

    return stmt.all();
  }
}
