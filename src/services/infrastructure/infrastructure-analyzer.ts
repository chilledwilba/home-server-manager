import { logger } from '../../utils/logger.js';
import type { PortainerClient } from '../../integrations/portainer/client.js';
import type { ServiceCatalog, InfrastructureService } from './service-catalog.js';

/**
 * Infrastructure Analyzer
 * Analyzes current infrastructure and generates recommendations
 */
export class InfrastructureAnalyzer {
  constructor(
    private serviceCatalog: ServiceCatalog,
    private portainer?: PortainerClient,
  ) {}

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

        for (const [key, service] of this.serviceCatalog.getAllServices()) {
          if (stackNames.includes(key) || stackNames.includes(service.name.toLowerCase())) {
            this.serviceCatalog.updateServiceStatus(key, 'deployed');
            deployed.push(service);
          }
        }
      } catch (error) {
        logger.warn(
          { err: error },
          'Could not fetch Portainer stacks - Portainer may not be available',
        );
      }
    }

    // Determine recommendations based on current setup
    const recommendations = this.generateRecommendations();

    for (const [key, service] of this.serviceCatalog.getAllServices()) {
      if (service.status === 'not_deployed') {
        if (recommendations.includes(key)) {
          this.serviceCatalog.updateServiceStatus(key, 'recommended');
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
    const services = this.serviceCatalog.getAllServices();

    // Check if security stack is missing
    const hasCloudflare = services.get('cloudflare-tunnel')?.status === 'deployed';
    const hasAuthentik = services.get('authentik')?.status === 'deployed';
    const hasFail2ban = services.get('fail2ban')?.status === 'deployed';

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
    const hasTraefik = services.get('traefik')?.status === 'deployed';
    const hasNginx = services.get('nginx-proxy-manager')?.status === 'deployed';

    if (!hasTraefik && !hasNginx && hasCloudflare) {
      // If using Cloudflare Tunnel, don't necessarily need local reverse proxy
      // But if exposing services locally, recommend one
      recommendations.push('nginx-proxy-manager');
    }

    // Check if monitoring is missing
    const hasGrafana = services.get('grafana')?.status === 'deployed';
    const hasPrometheus = services.get('prometheus')?.status === 'deployed';

    if (!hasPrometheus && !hasGrafana) {
      recommendations.push('prometheus');
      recommendations.push('grafana');
    }

    return recommendations;
  }
}
