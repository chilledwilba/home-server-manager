export interface InfrastructureService {
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

/**
 * Service Catalog
 * Maintains registry of available infrastructure services
 */
export class ServiceCatalog {
  private services: Map<string, InfrastructureService> = new Map();

  constructor() {
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
   * Get all services
   */
  getAllServices(): Map<string, InfrastructureService> {
    return this.services;
  }

  /**
   * Update service status
   */
  updateServiceStatus(
    serviceName: string,
    status: 'deployed' | 'recommended' | 'not_deployed',
  ): void {
    const service = this.services.get(serviceName);
    if (service) {
      service.status = status;
    }
  }
}
