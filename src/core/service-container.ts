import type Database from 'better-sqlite3';
import type { Server as SocketIOServer } from 'socket.io';
import { TrueNASClient } from '../integrations/truenas/client.js';
import { PortainerClient } from '../integrations/portainer/client.js';
import { ArrClient, PlexClient } from '../integrations/arr-apps/client.js';
import { TrueNASMonitor } from '../services/monitoring/truenas-monitor.js';
import { DockerMonitor } from '../services/monitoring/docker-monitor.js';
import { DiskFailurePredictor } from '../services/monitoring/disk-predictor.js';
import { ZFSManager } from '../services/zfs/manager.js';
import { ZFSAssistant } from '../services/zfs/assistant.js';
import { NotificationService } from '../services/alerting/notification-service.js';
import { ArrOptimizer } from '../services/arr/arr-optimizer.js';
import { SecurityScanner } from '../services/security/scanner.js';
import { SecurityOrchestrator } from '../services/security/orchestrator.js';
import { InfrastructureManager } from '../services/infrastructure/manager.js';
import { AutoRemediationService } from '../services/remediation/auto-remediation.js';
import { logger } from '../utils/logger.js';

export interface ServiceContainerConfig {
  db: Database.Database;
  io: SocketIOServer;
}

/**
 * Centralized service container with dependency injection
 * Manages lifecycle of all application services
 */
export class ServiceContainer {
  private services: Map<string, unknown> = new Map();
  private initialized = false;
  private db: Database.Database;
  private io: SocketIOServer;

  constructor(config: ServiceContainerConfig) {
    this.db = config.db;
    this.io = config.io;
  }

  /**
   * Initialize all services in correct dependency order
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('ServiceContainer already initialized');
      return;
    }

    logger.info('Initializing service container...');

    try {
      // Phase 1: Initialize integration clients (no dependencies)
      await this.initializeClients();

      // Phase 2: Initialize core services (depend on clients)
      await this.initializeCoreServices();

      // Phase 3: Initialize monitoring services (depend on core services)
      await this.initializeMonitoringServices();

      // Phase 4: Initialize orchestration services (depend on everything)
      await this.initializeOrchestrationServices();

      this.initialized = true;
      logger.info('Service container initialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize service container');
      throw error;
    }
  }

  /**
   * Start all monitoring services
   */
  async start(): Promise<void> {
    if (!this.initialized) {
      throw new Error('ServiceContainer not initialized');
    }

    logger.info('Starting monitoring services...');

    const monitor = this.get<TrueNASMonitor>('truenasMonitor');
    if (monitor) {
      monitor.start();
      logger.info('TrueNAS monitor started');
    }

    const dockerMonitor = this.get<DockerMonitor>('dockerMonitor');
    if (dockerMonitor) {
      dockerMonitor.start();
      logger.info('Docker monitor started');
    }

    const arrOptimizer = this.get<ArrOptimizer>('arrOptimizer');
    if (arrOptimizer) {
      await arrOptimizer.start();
      logger.info('Arr optimizer started');
    }

    const securityOrchestrator = this.get<SecurityOrchestrator>('securityOrchestrator');
    if (securityOrchestrator) {
      securityOrchestrator.start();
      logger.info('Security orchestrator started');
    }

    const zfsManager = this.get<ZFSManager>('zfsManager');
    if (zfsManager) {
      zfsManager.start();
      logger.info('ZFS manager started');
    }

    logger.info('Monitoring services started');
  }

  /**
   * Gracefully stop all services in reverse initialization order
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down service container...');

    // Stop services with explicit stop methods
    const servicesWithStop = [
      'arrOptimizer',
      'dockerMonitor',
      'truenasMonitor',
      'securityOrchestrator',
      'zfsManager',
    ];

    for (const serviceName of servicesWithStop) {
      const service = this.services.get(serviceName);
      if (service && typeof (service as { stop?: () => void }).stop === 'function') {
        try {
          (service as { stop: () => void }).stop();
          logger.info(`Stopped ${serviceName}`);
        } catch (error) {
          logger.error({ err: error, service: serviceName }, 'Error stopping service');
        }
      }
    }

    this.services.clear();
    this.initialized = false;
    logger.info('Service container shutdown complete');
  }

  /**
   * Get a service by name with type safety
   */
  get<T>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }

  /**
   * Register a service (useful for testing/mocking)
   */
  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Get the Socket.IO server instance
   */
  getIO(): SocketIOServer {
    return this.io;
  }

  /**
   * Get the database instance
   */
  getDB(): Database.Database {
    return this.db;
  }

  /**
   * Initialize integration clients (Phase 1)
   */
  private async initializeClients(): Promise<void> {
    logger.info('Initializing integration clients...');

    // TrueNAS Client
    const trueNASHost = process.env['TRUENAS_HOST'];
    const trueNASKey = process.env['TRUENAS_API_KEY'];

    if (trueNASHost && trueNASKey && trueNASKey !== 'mock-truenas-api-key-replace-on-deploy') {
      this.services.set(
        'truenasClient',
        new TrueNASClient({
          host: trueNASHost,
          apiKey: trueNASKey,
          timeout: 5000,
        }),
      );
      logger.info('TrueNAS client initialized');
    }

    // Portainer Client
    const portainerHost = process.env['PORTAINER_HOST'];
    const portainerPort = parseInt(process.env['PORTAINER_PORT'] || '9000', 10);
    const portainerToken = process.env['PORTAINER_TOKEN'];

    if (
      portainerHost &&
      portainerToken &&
      portainerToken !== 'mock-portainer-token-replace-on-deploy'
    ) {
      this.services.set(
        'portainerClient',
        new PortainerClient({
          host: portainerHost,
          port: portainerPort,
          token: portainerToken,
          endpointId: 1,
        }),
      );
      logger.info('Portainer client initialized');

      // Initialize Arr clients
      const arrClients: ArrClient[] = [];

      if (process.env['SONARR_API_KEY']) {
        arrClients.push(
          new ArrClient('Sonarr', {
            host: process.env['SONARR_HOST'] || portainerHost,
            port: parseInt(process.env['SONARR_PORT'] || '8989', 10),
            apiKey: process.env['SONARR_API_KEY'],
          }),
        );
      }

      if (process.env['RADARR_API_KEY']) {
        arrClients.push(
          new ArrClient('Radarr', {
            host: process.env['RADARR_HOST'] || portainerHost,
            port: parseInt(process.env['RADARR_PORT'] || '7878', 10),
            apiKey: process.env['RADARR_API_KEY'],
          }),
        );
      }

      if (process.env['PROWLARR_API_KEY']) {
        arrClients.push(
          new ArrClient('Prowlarr', {
            host: process.env['PROWLARR_HOST'] || portainerHost,
            port: parseInt(process.env['PROWLARR_PORT'] || '9696', 10),
            apiKey: process.env['PROWLARR_API_KEY'],
          }),
        );
      }

      if (arrClients.length > 0) {
        this.services.set('arrClients', arrClients);
        logger.info(`Initialized ${arrClients.length} Arr clients`);
      }

      // Initialize Plex client if configured
      if (process.env['PLEX_TOKEN']) {
        this.services.set(
          'plexClient',
          new PlexClient({
            host: process.env['PLEX_HOST'] || portainerHost,
            port: parseInt(process.env['PLEX_PORT'] || '32400', 10),
            token: process.env['PLEX_TOKEN'],
          }),
        );
        logger.info('Plex client initialized');
      }
    }

    logger.info('Integration clients initialized');
  }

  /**
   * Initialize core services (Phase 2)
   */
  private async initializeCoreServices(): Promise<void> {
    logger.info('Initializing core services...');

    // Disk Failure Predictor
    this.services.set('diskPredictor', new DiskFailurePredictor(this.db));

    // Notification Service
    this.services.set('notificationService', new NotificationService(this.db));

    // ZFS Assistant
    this.services.set('zfsAssistant', new ZFSAssistant());

    // ZFS Manager (if TrueNAS is configured)
    const truenasClient = this.get<TrueNASClient>('truenasClient');
    if (truenasClient) {
      this.services.set('zfsManager', new ZFSManager(truenasClient, this.db));
      logger.info('ZFS manager initialized');
    }

    // Auto-Remediation Service
    const portainerClient = this.get<PortainerClient>('portainerClient');
    this.services.set('remediationService', new AutoRemediationService(this.db, portainerClient));

    logger.info('Core services initialized');
  }

  /**
   * Initialize monitoring services (Phase 3)
   */
  private async initializeMonitoringServices(): Promise<void> {
    logger.info('Initializing monitoring services...');

    // TrueNAS Monitor
    const truenasClient = this.get<TrueNASClient>('truenasClient');
    if (truenasClient) {
      this.services.set(
        'truenasMonitor',
        new TrueNASMonitor({
          client: truenasClient,
          db: this.db,
          io: this.io,
          intervals: {
            system: parseInt(process.env['POLL_SYSTEM_INTERVAL'] || '30000', 10),
            storage: 60000,
            smart: parseInt(process.env['POLL_SMART_INTERVAL'] || '3600000', 10),
          },
        }),
      );
      logger.info('TrueNAS monitor initialized');
    }

    // Docker Monitor
    const portainerClient = this.get<PortainerClient>('portainerClient');
    if (portainerClient) {
      const arrClients = this.get<ArrClient[]>('arrClients') || [];
      const plexClient = this.get<PlexClient>('plexClient');

      this.services.set(
        'dockerMonitor',
        new DockerMonitor({
          portainer: portainerClient,
          arrClients,
          plexClient,
          db: this.db,
          io: this.io,
          interval: parseInt(process.env['POLL_DOCKER_INTERVAL'] || '5000', 10),
        }),
      );
      logger.info('Docker monitor initialized');

      // Arr Optimizer (if arr clients are configured)
      if (arrClients.length > 0) {
        const optimizer = new ArrOptimizer(this.db, this.io);

        // Register each arr client with optimizer
        for (const arrClient of arrClients) {
          let type: 'sonarr' | 'radarr' | 'prowlarr' | 'lidarr' | 'readarr' | 'bazarr' = 'sonarr';

          if (arrClient.name.toLowerCase().includes('radarr')) {
            type = 'radarr';
          } else if (arrClient.name.toLowerCase().includes('prowlarr')) {
            type = 'prowlarr';
          }

          optimizer.registerApp({
            name: arrClient.name,
            client: arrClient,
            type,
          });
        }

        this.services.set('arrOptimizer', optimizer);
        logger.info(`Arr optimizer initialized with ${arrClients.length} apps`);
      }
    }

    logger.info('Monitoring services initialized');
  }

  /**
   * Initialize orchestration services (Phase 4)
   */
  private async initializeOrchestrationServices(): Promise<void> {
    logger.info('Initializing orchestration services...');

    // Security Scanner
    this.services.set('securityScanner', new SecurityScanner(this.db, this.io));
    logger.info('Security scanner initialized');

    // Infrastructure Manager
    this.services.set('infrastructureManager', new InfrastructureManager(this.db));
    logger.info('Infrastructure manager initialized');

    // Security Orchestrator (if any security components are configured)
    const securityConfig = {
      cloudflare: process.env['CLOUDFLARE_API_TOKEN']
        ? {
            accountId: process.env['CLOUDFLARE_ACCOUNT_ID'] || '',
            apiToken: process.env['CLOUDFLARE_API_TOKEN'],
            tunnelId: process.env['CLOUDFLARE_TUNNEL_ID'],
          }
        : undefined,
      authentik: process.env['AUTHENTIK_TOKEN']
        ? {
            url: process.env['AUTHENTIK_URL'] || '',
            token: process.env['AUTHENTIK_TOKEN'],
          }
        : undefined,
      fail2ban:
        process.env['FAIL2BAN_ENABLED'] === 'true'
          ? {
              containerName: process.env['FAIL2BAN_CONTAINER_NAME'],
              useDocker: process.env['FAIL2BAN_USE_DOCKER'] === 'true',
            }
          : undefined,
    };

    if (securityConfig.cloudflare || securityConfig.authentik || securityConfig.fail2ban) {
      this.services.set(
        'securityOrchestrator',
        new SecurityOrchestrator(this.db, this.io, securityConfig),
      );
      logger.info({
        msg: 'Security orchestrator initialized',
        cloudflare: !!securityConfig.cloudflare,
        authentik: !!securityConfig.authentik,
        fail2ban: !!securityConfig.fail2ban,
      });
    }

    logger.info('Orchestration services initialized');
  }
}
