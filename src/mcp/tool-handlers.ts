import { AnalysisHandlers } from './handlers/analysis-handlers.js';
import { ContainerHandlers } from './handlers/container-handlers.js';
import { InfrastructureHandlers } from './handlers/infrastructure-handlers.js';
import { MonitoringHandlers } from './handlers/monitoring-handlers.js';
import { TrueNASHandlers } from './handlers/truenas-handlers.js';
import type { MCPConfig, PendingAction } from './tool-handler-types.js';

/**
 * MCP Tool Handlers
 * Main orchestrator that delegates to specialized handler modules
 */
export class ToolHandlers {
  private truenasHandlers: TrueNASHandlers;
  private containerHandlers: ContainerHandlers;
  private monitoringHandlers: MonitoringHandlers;
  private infrastructureHandlers: InfrastructureHandlers;
  private analysisHandlers: AnalysisHandlers;

  constructor(config: MCPConfig, pendingActions: Map<string, PendingAction>) {
    // Initialize all handler modules
    this.truenasHandlers = new TrueNASHandlers(config);
    this.containerHandlers = new ContainerHandlers(
      config,
      pendingActions,
      this.generateActionId.bind(this),
    );
    this.monitoringHandlers = new MonitoringHandlers(config);
    this.infrastructureHandlers = new InfrastructureHandlers(
      config,
      pendingActions,
      this.generateActionId.bind(this),
    );
    this.analysisHandlers = new AnalysisHandlers(config, pendingActions);
  }

  // TrueNAS Tools
  async getSystemInfo(): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.truenasHandlers.getSystemInfo();
  }

  async getSystemStats(): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.truenasHandlers.getSystemStats();
  }

  async getPoolStatus(args: {
    poolName?: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.truenasHandlers.getPoolStatus(args);
  }

  async getDiskSmart(args: {
    diskName: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.truenasHandlers.getDiskSmart(args);
  }

  // Container Tools
  async listContainers(): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.containerHandlers.listContainers();
  }

  async getContainerLogs(args: {
    containerId: string;
    lines?: number;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.containerHandlers.getContainerLogs(args);
  }

  async getContainerStats(args: {
    containerId: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.containerHandlers.getContainerStats(args);
  }

  async restartContainer(args: {
    containerId: string;
    reason: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.containerHandlers.restartContainer(args);
  }

  // Monitoring Tools
  async getRecentAlerts(args: {
    severity?: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.monitoringHandlers.getRecentAlerts(args);
  }

  async getMetricsHistory(args: {
    metric: string;
    hours?: number;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.monitoringHandlers.getMetricsHistory(args);
  }

  async getSecurityFindings(): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.monitoringHandlers.getSecurityFindings();
  }

  async getSecurityStatus(): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.monitoringHandlers.getSecurityStatus();
  }

  // Infrastructure Tools
  async getServiceInfo(args: {
    serviceName: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.infrastructureHandlers.getServiceInfo(args);
  }

  async getDockerCompose(args: {
    serviceName: string;
    envVars?: Record<string, string>;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.infrastructureHandlers.getDockerCompose(args);
  }

  async deployService(args: {
    serviceName: string;
    stackName?: string;
    envVars?: Record<string, string>;
    autoStart?: boolean;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.infrastructureHandlers.deployService(args);
  }

  async removeService(args: {
    serviceName: string;
    reason: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.infrastructureHandlers.removeService(args);
  }

  // Analysis Tools
  async confirmAction(args: {
    actionId: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.analysisHandlers.confirmAction(args);
  }

  async analyzeProblem(args: {
    problem: string;
  }): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.analysisHandlers.analyzeProblem(args);
  }

  async analyzeInfrastructure(): Promise<{
    content: Array<{ type: string; text: string }>;
  }> {
    return this.analysisHandlers.analyzeInfrastructure();
  }

  // Utility method
  generateActionId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
