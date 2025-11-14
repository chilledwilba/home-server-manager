import type Database from 'better-sqlite3';
import type { PortainerClient } from '../../integrations/portainer/client.js';
import { ServiceCatalog, type InfrastructureService } from './service-catalog.js';
import { InfrastructurePersistence } from './infrastructure-persistence.js';
import { InfrastructureAnalyzer } from './infrastructure-analyzer.js';
import { DeploymentManager, type DeploymentOptions } from './deployment-manager.js';

/**
 * Infrastructure Manager
 * Orchestrates infrastructure deployment and management
 */
export class InfrastructureManager {
  private serviceCatalog: ServiceCatalog;
  private persistence: InfrastructurePersistence;
  private analyzer: InfrastructureAnalyzer;
  private deploymentManager: DeploymentManager;

  constructor(db: Database.Database, portainer?: PortainerClient) {
    this.serviceCatalog = new ServiceCatalog();
    this.persistence = new InfrastructurePersistence(db);
    this.analyzer = new InfrastructureAnalyzer(this.serviceCatalog, portainer);
    this.deploymentManager = new DeploymentManager(
      this.serviceCatalog,
      this.persistence,
      portainer,
    );
  }

  /**
   * Analyze current infrastructure
   */
  async analyzeInfrastructure(): Promise<{
    deployed: InfrastructureService[];
    recommended: InfrastructureService[];
    missing: InfrastructureService[];
  }> {
    return this.analyzer.analyzeInfrastructure();
  }

  /**
   * Get service information
   */
  getService(serviceName: string): InfrastructureService | undefined {
    return this.serviceCatalog.getService(serviceName);
  }

  /**
   * Get all services by type
   */
  getServicesByType(
    type: 'security' | 'monitoring' | 'networking' | 'storage' | 'media',
  ): InfrastructureService[] {
    return this.serviceCatalog.getServicesByType(type);
  }

  /**
   * Generate docker-compose file for a service
   */
  async generateDockerCompose(
    serviceName: string,
    envVars?: Record<string, string>,
  ): Promise<string> {
    return this.deploymentManager.generateDockerCompose(serviceName, envVars);
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
    return this.deploymentManager.validateDeployment(serviceName, envVars);
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
    return this.deploymentManager.deployService(serviceName, options);
  }

  /**
   * Remove service
   */
  async removeService(serviceName: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    return this.deploymentManager.removeService(serviceName);
  }

  /**
   * Get deployment history
   */
  getDeploymentHistory(serviceName?: string): unknown[] {
    return this.persistence.getDeploymentHistory(serviceName);
  }
}
