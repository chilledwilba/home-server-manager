# TODO-10: Auto-Remediation System

> Self-healing capabilities for common issues with human confirmation for critical actions

## 📋 Phase Overview

**Objective**: Implement automatic problem resolution with safety checks and audit trails

**Duration**: 3-4 hours

**Prerequisites**:
- ✅ Phase 0-9 complete (alerting active)
- ✅ MCP integration working
- ✅ Security stack configured

## 🎯 Success Criteria

- [ ] Common issues auto-resolve
- [ ] Human confirmation for critical actions
- [ ] Audit trail for all actions
- [ ] Rollback capability
- [ ] Success/failure tracking
- [ ] Learning from resolutions

## 📚 Learning Context

### Self-Healing Philosophy

After your port exposure incident, we need:

1. **Automatic Response**: Fix known issues immediately
2. **Human-in-the-loop**: Confirm dangerous actions
3. **Audit Everything**: Track what was changed
4. **Learn & Improve**: Get better over time
5. **Safe Rollback**: Undo if things go wrong

## 🏗️ Architecture

```
Alert → Diagnosis → Resolution Plan → Safety Check → Execute → Verify
           ↓              ↓               ↓            ↓         ↓
       Identify      Generate       Confirm?      Apply     Success?
```

## 📁 File Structure

```bash
src/
├── remediation/
│   ├── remediation-engine.ts     # Core engine
│   ├── resolvers/
│   │   ├── container-resolver.ts # Container issues
│   │   ├── disk-resolver.ts      # Disk space
│   │   ├── network-resolver.ts   # Network issues
│   │   ├── service-resolver.ts   # Service failures
│   │   └── performance-resolver.ts # Performance issues
│   ├── safety-checker.ts         # Safety validation
│   ├── execution-manager.ts      # Execute remediation
│   ├── rollback-manager.ts       # Rollback changes
│   └── learning-engine.ts        # ML for improvement
├── routes/
│   └── remediation.ts            # Remediation API
└── types/
    └── remediation.ts            # Remediation types
```

## 📝 Implementation Tasks

### 1. Core Remediation Engine

Create `src/remediation/remediation-engine.ts`:

```typescript
import { EventEmitter } from 'events';
import { z } from 'zod';
import { logger } from '@/utils/logger';
import { Alert } from '@/alerting/alert-manager';
import { SafetyChecker } from './safety-checker';
import { ExecutionManager } from './execution-manager';
import { RollbackManager } from './rollback-manager';
import { LearningEngine } from './learning-engine';
import { db } from '@/db';

// Remediation plan schema
const RemediationPlanSchema = z.object({
  id: z.string(),
  alertId: z.string(),
  problem: z.string(),
  diagnosis: z.string(),
  actions: z.array(z.object({
    id: z.string(),
    type: z.string(),
    description: z.string(),
    command: z.string().optional(),
    params: z.record(z.any()).optional(),
    risk: z.enum(['low', 'medium', 'high', 'critical']),
    requiresConfirmation: z.boolean(),
    estimatedDuration: z.number() // seconds
  })),
  risk: z.enum(['low', 'medium', 'high', 'critical']),
  confidence: z.number().min(0).max(100),
  requiresConfirmation: z.boolean(),
  createdAt: z.date(),
  executedAt: z.date().optional(),
  status: z.enum(['pending', 'approved', 'executing', 'completed', 'failed', 'rolled_back']),
  result: z.string().optional()
});

export type RemediationPlan = z.infer<typeof RemediationPlanSchema>;

interface RemediationRule {
  name: string;
  pattern: RegExp | ((alert: Alert) => boolean);
  diagnose: (alert: Alert) => Promise<string>;
  generatePlan: (alert: Alert, diagnosis: string) => Promise<RemediationPlan>;
  verify: (plan: RemediationPlan) => Promise<boolean>;
}

export class RemediationEngine extends EventEmitter {
  private safetyChecker: SafetyChecker;
  private executionManager: ExecutionManager;
  private rollbackManager: RollbackManager;
  private learningEngine: LearningEngine;
  private rules: Map<string, RemediationRule> = new Map();
  private activePlans: Map<string, RemediationPlan> = new Map();

  constructor() {
    super();
    this.safetyChecker = new SafetyChecker();
    this.executionManager = new ExecutionManager();
    this.rollbackManager = new RollbackManager();
    this.learningEngine = new LearningEngine();
  }

  /**
   * Initialize remediation engine
   */
  async initialize(): Promise<void> {
    logger.info('🔧 Initializing Remediation Engine...');

    // Load remediation rules
    await this.loadRules();

    // Initialize learning engine
    await this.learningEngine.initialize();

    // Start monitoring
    this.startMonitoring();

    logger.info('✅ Remediation Engine active');
  }

  /**
   * Load remediation rules
   */
  private async loadRules(): Promise<void> {
    const rules: RemediationRule[] = [
      // Container crashed
      {
        name: 'container.restart',
        pattern: /Container.*crashed/i,
        diagnose: async (alert) => {
          // Analyze container logs
          const logs = await this.getContainerLogs(alert.details.containerName);
          const diagnosis = this.analyzeContainerLogs(logs);
          return diagnosis;
        },
        generatePlan: async (alert, diagnosis) => {
          const plan: RemediationPlan = {
            id: this.generateId(),
            alertId: alert.id,
            problem: 'Container crashed',
            diagnosis,
            actions: [
              {
                id: '1',
                type: 'container.restart',
                description: `Restart container ${alert.details.containerName}`,
                command: `docker restart ${alert.details.containerName}`,
                risk: 'low',
                requiresConfirmation: false,
                estimatedDuration: 10
              }
            ],
            risk: 'low',
            confidence: 95,
            requiresConfirmation: false,
            createdAt: new Date(),
            status: 'pending'
          };

          // Add cleanup if OOM
          if (diagnosis.includes('memory')) {
            plan.actions.unshift({
              id: '0',
              type: 'system.cleanup',
              description: 'Clear system cache to free memory',
              command: 'sync && echo 3 > /proc/sys/vm/drop_caches',
              risk: 'low',
              requiresConfirmation: false,
              estimatedDuration: 5
            });
          }

          return plan;
        },
        verify: async (plan) => {
          // Check if container is running
          const status = await this.getContainerStatus(
            plan.alertId // Get container name from alert
          );
          return status === 'running';
        }
      },

      // Disk space issue
      {
        name: 'disk.cleanup',
        pattern: /Pool.*capacity|Disk.*full/i,
        diagnose: async (alert) => {
          const poolName = alert.details.poolName;
          const usage = alert.details.poolUsage;

          // Find what's using space
          const analysis = await this.analyzeDiskUsage(poolName);

          return `Pool ${poolName} at ${usage}% capacity. Largest consumers: ${analysis}`;
        },
        generatePlan: async (alert, diagnosis) => {
          const actions = [];
          const poolName = alert.details.poolName;

          // Low risk: Clean temp files
          if (alert.details.poolUsage < 95) {
            actions.push({
              id: '1',
              type: 'disk.cleanup.temp',
              description: 'Clean temporary files and caches',
              command: 'find /tmp -type f -atime +7 -delete',
              risk: 'low',
              requiresConfirmation: false,
              estimatedDuration: 30
            });

            actions.push({
              id: '2',
              type: 'docker.prune',
              description: 'Prune unused Docker resources',
              command: 'docker system prune -af --volumes',
              risk: 'medium',
              requiresConfirmation: true,
              estimatedDuration: 60
            });
          }

          // High risk: Delete old snapshots
          if (alert.details.poolUsage > 90) {
            actions.push({
              id: '3',
              type: 'zfs.snapshot.cleanup',
              description: 'Delete snapshots older than 30 days',
              command: `zfs list -t snapshot -o name,creation -r ${poolName} | awk '$2 < "'$(date -d '30 days ago' '+%Y-%m-%d')'" {print $1}' | xargs -n1 zfs destroy`,
              risk: 'high',
              requiresConfirmation: true,
              estimatedDuration: 120
            });
          }

          const plan: RemediationPlan = {
            id: this.generateId(),
            alertId: alert.id,
            problem: 'Disk space critical',
            diagnosis,
            actions,
            risk: alert.details.poolUsage > 90 ? 'high' : 'medium',
            confidence: 85,
            requiresConfirmation: alert.details.poolUsage > 90,
            createdAt: new Date(),
            status: 'pending'
          };

          return plan;
        },
        verify: async (plan) => {
          // Check if space was freed
          const usage = await this.getPoolUsage(plan.alertId);
          return usage < 80; // Target 80% or less
        }
      },

      // Failed download in arr apps
      {
        name: 'arr.retry.download',
        pattern: /Download.*failed|Queue.*stalled/i,
        diagnose: async (alert) => {
          const app = alert.details.appName;
          const errors = await this.getArrErrors(app);

          if (errors.includes('indexer')) {
            return 'Indexer connection issues detected';
          } else if (errors.includes('disk')) {
            return 'Insufficient disk space for download';
          } else {
            return 'Download client connection issues';
          }
        },
        generatePlan: async (alert, diagnosis) => {
          const actions = [];

          if (diagnosis.includes('indexer')) {
            actions.push({
              id: '1',
              type: 'arr.test.indexers',
              description: 'Test and reconnect indexers',
              params: { app: alert.details.appName },
              risk: 'low',
              requiresConfirmation: false,
              estimatedDuration: 15
            });
          }

          if (diagnosis.includes('download client')) {
            actions.push({
              id: '2',
              type: 'service.restart',
              description: 'Restart download client',
              command: 'docker restart qbittorrent',
              risk: 'low',
              requiresConfirmation: false,
              estimatedDuration: 30
            });
          }

          actions.push({
            id: '3',
            type: 'arr.retry.failed',
            description: 'Retry failed downloads',
            params: {
              app: alert.details.appName,
              limit: 10
            },
            risk: 'low',
            requiresConfirmation: false,
            estimatedDuration: 10
          });

          const plan: RemediationPlan = {
            id: this.generateId(),
            alertId: alert.id,
            problem: 'Download failures in arr suite',
            diagnosis,
            actions,
            risk: 'low',
            confidence: 90,
            requiresConfirmation: false,
            createdAt: new Date(),
            status: 'pending'
          };

          return plan;
        },
        verify: async (plan) => {
          // Check if queue is moving
          const queueStatus = await this.getArrQueueStatus(plan.alertId);
          return queueStatus.stalled === 0;
        }
      },

      // High CPU usage
      {
        name: 'performance.cpu.optimize',
        pattern: /CPU.*high|CPU.*usage/i,
        diagnose: async (alert) => {
          const topProcesses = await this.getTopCPUProcesses();
          return `High CPU usage caused by: ${topProcesses.join(', ')}`;
        },
        generatePlan: async (alert, diagnosis) => {
          const actions = [];

          // Identify problem process
          if (diagnosis.includes('plex')) {
            actions.push({
              id: '1',
              type: 'plex.optimize',
              description: 'Pause Plex transcoding',
              params: { action: 'pause_transcoding' },
              risk: 'medium',
              requiresConfirmation: true,
              estimatedDuration: 5
            });
          }

          if (diagnosis.includes('bitcoin') || diagnosis.includes('miner')) {
            // CRITICAL: Possible crypto miner!
            actions.push({
              id: '1',
              type: 'security.kill.suspicious',
              description: '⚠️ KILL SUSPICIOUS CRYPTO MINER PROCESS',
              command: 'pkill -9 -f "bitcoin|miner|xmrig"',
              risk: 'critical',
              requiresConfirmation: true,
              estimatedDuration: 1
            });

            actions.push({
              id: '2',
              type: 'security.scan.full',
              description: 'Run full security scan',
              risk: 'low',
              requiresConfirmation: false,
              estimatedDuration: 300
            });
          }

          // Generic CPU optimization
          actions.push({
            id: '99',
            type: 'system.nice.adjust',
            description: 'Adjust process priorities',
            command: 'renice -n 10 $(pgrep -f "low_priority_app")',
            risk: 'low',
            requiresConfirmation: false,
            estimatedDuration: 1
          });

          const risk = diagnosis.includes('miner') ? 'critical' : 'medium';

          const plan: RemediationPlan = {
            id: this.generateId(),
            alertId: alert.id,
            problem: 'High CPU usage',
            diagnosis,
            actions,
            risk,
            confidence: 75,
            requiresConfirmation: risk === 'critical',
            createdAt: new Date(),
            status: 'pending'
          };

          return plan;
        },
        verify: async (plan) => {
          const cpuUsage = await this.getCPUUsage();
          return cpuUsage < 70;
        }
      },

      // Network connectivity issue
      {
        name: 'network.reconnect',
        pattern: /Network.*unreachable|Connection.*timeout/i,
        diagnose: async (alert) => {
          const tests = await this.runNetworkDiagnostics();
          return tests.summary;
        },
        generatePlan: async (alert, diagnosis) => {
          const actions = [];

          if (diagnosis.includes('DNS')) {
            actions.push({
              id: '1',
              type: 'network.dns.flush',
              description: 'Flush DNS cache',
              command: 'systemctl restart systemd-resolved',
              risk: 'low',
              requiresConfirmation: false,
              estimatedDuration: 5
            });
          }

          if (diagnosis.includes('firewall')) {
            actions.push({
              id: '2',
              type: 'firewall.check',
              description: 'Review firewall rules',
              params: { action: 'audit' },
              risk: 'low',
              requiresConfirmation: false,
              estimatedDuration: 10
            });
          }

          // Restart network stack
          actions.push({
            id: '3',
            type: 'network.restart',
            description: 'Restart network services',
            command: 'systemctl restart networking',
            risk: 'medium',
            requiresConfirmation: true,
            estimatedDuration: 30
          });

          const plan: RemediationPlan = {
            id: this.generateId(),
            alertId: alert.id,
            problem: 'Network connectivity issue',
            diagnosis,
            actions,
            risk: 'medium',
            confidence: 70,
            requiresConfirmation: true,
            createdAt: new Date(),
            status: 'pending'
          };

          return plan;
        },
        verify: async (plan) => {
          const connectivity = await this.testConnectivity();
          return connectivity.success;
        }
      }
    ];

    for (const rule of rules) {
      this.rules.set(rule.name, rule);
    }

    logger.info(`Loaded ${rules.length} remediation rules`);
  }

  /**
   * Handle alert for remediation
   */
  async handleAlert(alert: Alert): Promise<void> {
    try {
      // Find matching rule
      const rule = this.findMatchingRule(alert);
      if (!rule) {
        logger.debug(`No remediation rule for alert: ${alert.title}`);
        return;
      }

      logger.info(`🔧 Attempting remediation for: ${alert.title}`);

      // Diagnose the problem
      const diagnosis = await rule.diagnose(alert);

      // Generate remediation plan
      const plan = await rule.generatePlan(alert, diagnosis);

      // Check safety
      const isSafe = await this.safetyChecker.checkPlan(plan);
      if (!isSafe) {
        logger.warn(`Remediation plan deemed unsafe: ${plan.id}`);
        plan.status = 'failed';
        plan.result = 'Failed safety check';
        await this.storePlan(plan);
        return;
      }

      // Store plan
      await this.storePlan(plan);
      this.activePlans.set(plan.id, plan);

      // Check if confirmation needed
      if (plan.requiresConfirmation) {
        logger.info(`📋 Remediation plan requires confirmation: ${plan.id}`);
        this.emit('confirmation-required', plan);
        return;
      }

      // Execute immediately if safe
      await this.executePlan(plan);

    } catch (error) {
      logger.error(`Remediation failed for alert ${alert.id}:`, error);
    }
  }

  /**
   * Find matching remediation rule
   */
  private findMatchingRule(alert: Alert): RemediationRule | null {
    for (const [name, rule] of this.rules) {
      if (typeof rule.pattern === 'function') {
        if (rule.pattern(alert)) return rule;
      } else {
        const text = `${alert.title} ${alert.message}`;
        if (rule.pattern.test(text)) return rule;
      }
    }
    return null;
  }

  /**
   * Execute remediation plan
   */
  async executePlan(plan: RemediationPlan): Promise<void> {
    logger.info(`🚀 Executing remediation plan: ${plan.id}`);

    plan.status = 'executing';
    plan.executedAt = new Date();
    await this.updatePlan(plan);

    // Create rollback snapshot
    const rollbackId = await this.rollbackManager.createSnapshot(plan);

    try {
      // Execute each action
      for (const action of plan.actions) {
        logger.info(`Executing action: ${action.description}`);

        // Record action start
        await this.recordAction(plan.id, action, 'started');

        // Execute
        const result = await this.executionManager.execute(action);

        // Record result
        await this.recordAction(plan.id, action, 'completed', result);

        // Check if should continue
        if (!result.success && action.risk === 'critical') {
          throw new Error(`Critical action failed: ${action.description}`);
        }
      }

      // Verify success
      const rule = this.rules.get(plan.problem);
      if (rule) {
        const verified = await rule.verify(plan);

        if (verified) {
          plan.status = 'completed';
          plan.result = 'Successfully remediated';
          logger.info(`✅ Remediation successful: ${plan.id}`);

          // Learn from success
          await this.learningEngine.recordSuccess(plan);
        } else {
          plan.status = 'failed';
          plan.result = 'Verification failed';
          logger.warn(`❌ Remediation verification failed: ${plan.id}`);

          // Rollback
          await this.rollbackManager.rollback(rollbackId);
        }
      }

    } catch (error: any) {
      logger.error(`Remediation execution failed:`, error);

      plan.status = 'failed';
      plan.result = error.message;

      // Rollback changes
      try {
        await this.rollbackManager.rollback(rollbackId);
        plan.status = 'rolled_back';
        logger.info(`↩️ Changes rolled back for plan: ${plan.id}`);
      } catch (rollbackError) {
        logger.error('Rollback failed:', rollbackError);
      }
    }

    // Update final status
    await this.updatePlan(plan);
    this.activePlans.delete(plan.id);

    // Emit completion
    this.emit('plan-completed', plan);
  }

  /**
   * Approve plan for execution
   */
  async approvePlan(planId: string, userId: string): Promise<void> {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error('Plan not found');
    }

    plan.status = 'approved';
    await this.updatePlan(plan);

    logger.info(`Plan ${planId} approved by ${userId}`);

    // Execute the plan
    await this.executePlan(plan);
  }

  /**
   * Reject plan
   */
  async rejectPlan(planId: string, userId: string, reason: string): Promise<void> {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error('Plan not found');
    }

    plan.status = 'failed';
    plan.result = `Rejected by ${userId}: ${reason}`;

    await this.updatePlan(plan);
    this.activePlans.delete(planId);

    logger.info(`Plan ${planId} rejected by ${userId}`);
  }

  /**
   * Store plan in database
   */
  private async storePlan(plan: RemediationPlan): Promise<void> {
    db.prepare(`
      INSERT INTO remediation_plans (
        id, alertId, problem, diagnosis, actions,
        risk, confidence, requiresConfirmation,
        status, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      plan.id,
      plan.alertId,
      plan.problem,
      plan.diagnosis,
      JSON.stringify(plan.actions),
      plan.risk,
      plan.confidence,
      plan.requiresConfirmation ? 1 : 0,
      plan.status,
      plan.createdAt.toISOString()
    );
  }

  /**
   * Update plan in database
   */
  private async updatePlan(plan: RemediationPlan): Promise<void> {
    db.prepare(`
      UPDATE remediation_plans
      SET status = ?, executedAt = ?, result = ?
      WHERE id = ?
    `).run(
      plan.status,
      plan.executedAt?.toISOString() || null,
      plan.result || null,
      plan.id
    );
  }

  /**
   * Record action execution
   */
  private async recordAction(
    planId: string,
    action: any,
    status: string,
    result?: any
  ): Promise<void> {
    db.prepare(`
      INSERT INTO remediation_actions (
        planId, actionId, type, description,
        status, result, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      planId,
      action.id,
      action.type,
      action.description,
      status,
      result ? JSON.stringify(result) : null,
      new Date().toISOString()
    );
  }

  /**
   * Helper methods for diagnostics
   */
  private async getContainerLogs(containerName: string): Promise<string> {
    // Implementation to fetch container logs
    return '';
  }

  private analyzeContainerLogs(logs: string): string {
    if (logs.includes('OOM')) return 'Out of memory error';
    if (logs.includes('permission denied')) return 'Permission issue';
    if (logs.includes('connection refused')) return 'Connection issue';
    return 'Unknown error';
  }

  private async analyzeDiskUsage(poolName: string): Promise<string> {
    // Implementation to analyze disk usage
    return 'Analysis pending';
  }

  private async getContainerStatus(containerName: string): Promise<string> {
    // Implementation to get container status
    return 'running';
  }

  private async getPoolUsage(alertId: string): Promise<number> {
    // Implementation to get pool usage
    return 75;
  }

  private async getArrErrors(appName: string): Promise<string> {
    // Implementation to get arr app errors
    return '';
  }

  private async getArrQueueStatus(alertId: string): Promise<any> {
    // Implementation to get queue status
    return { stalled: 0 };
  }

  private async getTopCPUProcesses(): Promise<string[]> {
    // Implementation to get top CPU processes
    return [];
  }

  private async getCPUUsage(): Promise<number> {
    // Implementation to get CPU usage
    return 50;
  }

  private async runNetworkDiagnostics(): Promise<any> {
    // Implementation for network diagnostics
    return { summary: 'Network operational' };
  }

  private async testConnectivity(): Promise<any> {
    // Implementation to test connectivity
    return { success: true };
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start monitoring for alerts
   */
  private startMonitoring(): void {
    // Listen for alerts from alert manager
    if (this.listenerCount('alert') === 0) {
      this.on('alert', (alert: Alert) => {
        // Only handle non-resolved alerts
        if (!alert.resolved) {
          this.handleAlert(alert);
        }
      });
    }
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<any> {
    const stats = db.prepare(`
      SELECT
        status,
        risk,
        COUNT(*) as count,
        AVG(confidence) as avgConfidence
      FROM remediation_plans
      WHERE createdAt > datetime('now', '-7 days')
      GROUP BY status, risk
    `).all();

    return stats;
  }
}
```

### 2. Safety Checker

Create `src/remediation/safety-checker.ts`:

```typescript
import { RemediationPlan } from './remediation-engine';
import { logger } from '@/utils/logger';

export class SafetyChecker {
  private dangerousCommands = [
    'rm -rf /',
    'dd if=/dev/zero',
    'mkfs',
    'format',
    ':(){:|:&};:',  // Fork bomb
    'chmod -R 777',
    'chown -R',
    'iptables -F',   // Flush all firewall rules
    'systemctl stop'
  ];

  /**
   * Check if remediation plan is safe to execute
   */
  async checkPlan(plan: RemediationPlan): Promise<boolean> {
    logger.info(`🔍 Safety check for plan: ${plan.id}`);

    // Check each action
    for (const action of plan.actions) {
      if (!await this.checkAction(action)) {
        logger.warn(`❌ Action failed safety check: ${action.description}`);
        return false;
      }
    }

    // Check overall risk
    if (plan.risk === 'critical' && !plan.requiresConfirmation) {
      logger.warn('Critical risk plan must require confirmation');
      return false;
    }

    // Check confidence threshold
    if (plan.confidence < 50) {
      logger.warn(`Low confidence plan: ${plan.confidence}%`);
      return false;
    }

    logger.info(`✅ Plan passed safety check: ${plan.id}`);
    return true;
  }

  /**
   * Check individual action
   */
  private async checkAction(action: any): Promise<boolean> {
    // Check for dangerous commands
    if (action.command) {
      for (const dangerous of this.dangerousCommands) {
        if (action.command.includes(dangerous)) {
          logger.error(`🚫 DANGEROUS COMMAND DETECTED: ${action.command}`);
          return false;
        }
      }
    }

    // Check risk alignment
    if (action.risk === 'critical' && !action.requiresConfirmation) {
      logger.warn('Critical action must require confirmation');
      return false;
    }

    // Check reasonable duration
    if (action.estimatedDuration > 3600) { // 1 hour
      logger.warn('Action duration exceeds 1 hour');
      return false;
    }

    return true;
  }

  /**
   * Validate command syntax
   */
  validateCommand(command: string): boolean {
    // Basic validation
    if (command.includes('&&') && command.includes('||')) {
      logger.warn('Complex command chaining detected');
      return false;
    }

    // No infinite loops
    if (command.includes('while true')) {
      logger.warn('Infinite loop detected');
      return false;
    }

    return true;
  }
}
```

### 3. Remediation API Routes

Create `src/routes/remediation.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { RemediationEngine } from '@/remediation/remediation-engine';
import { z } from 'zod';

export async function remediationRoutes(fastify: FastifyInstance) {
  const engine = new RemediationEngine();
  await engine.initialize();

  // Store reference
  fastify.decorate('remediationEngine', engine);

  /**
   * Get pending remediation plans
   */
  fastify.get('/api/v1/remediation/plans/pending', async (request, reply) => {
    const plans = fastify.db.prepare(`
      SELECT * FROM remediation_plans
      WHERE status = 'pending'
      ORDER BY createdAt DESC
    `).all();

    return {
      plans: plans.map(p => ({
        ...p,
        actions: JSON.parse(p.actions)
      }))
    };
  });

  /**
   * Approve remediation plan
   */
  fastify.post('/api/v1/remediation/plans/:id/approve', async (request, reply) => {
    const params = z.object({
      id: z.string()
    }).parse(request.params);

    const body = z.object({
      userId: z.string()
    }).parse(request.body);

    await engine.approvePlan(params.id, body.userId);

    return { success: true };
  });

  /**
   * Reject remediation plan
   */
  fastify.post('/api/v1/remediation/plans/:id/reject', async (request, reply) => {
    const params = z.object({
      id: z.string()
    }).parse(request.params);

    const body = z.object({
      userId: z.string(),
      reason: z.string()
    }).parse(request.body);

    await engine.rejectPlan(params.id, body.userId, body.reason);

    return { success: true };
  });

  /**
   * Get remediation history
   */
  fastify.get('/api/v1/remediation/history', async (request, reply) => {
    const query = z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0)
    }).parse(request.query);

    const history = fastify.db.prepare(`
      SELECT * FROM remediation_plans
      ORDER BY createdAt DESC
      LIMIT ? OFFSET ?
    `).all(query.limit, query.offset);

    return {
      history: history.map(h => ({
        ...h,
        actions: JSON.parse(h.actions)
      }))
    };
  });

  /**
   * Get remediation statistics
   */
  fastify.get('/api/v1/remediation/stats', async (request, reply) => {
    const stats = await engine.getStatistics();
    return stats;
  });

  // WebSocket: Real-time updates
  fastify.io.on('connection', (socket) => {
    // Notify about plans requiring confirmation
    engine.on('confirmation-required', (plan) => {
      socket.emit('remediation:confirmation-required', plan);
    });

    // Notify about completed plans
    engine.on('plan-completed', (plan) => {
      socket.emit('remediation:completed', plan);
    });
  });

  // Connect to alert manager
  const alertManager = fastify.alertManager;
  if (alertManager) {
    alertManager.on('alert', (alert) => {
      engine.emit('alert', alert);
    });
  }
}
```

### 4. Database Schema

Add to `src/db/migrations/003_remediation.sql`:

```sql
CREATE TABLE IF NOT EXISTS remediation_plans (
  id TEXT PRIMARY KEY,
  alertId TEXT NOT NULL,
  problem TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  actions TEXT NOT NULL, -- JSON
  risk TEXT NOT NULL,
  confidence REAL NOT NULL,
  requiresConfirmation BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  result TEXT,
  createdAt DATETIME NOT NULL,
  executedAt DATETIME,
  FOREIGN KEY (alertId) REFERENCES alerts(id)
);

CREATE TABLE IF NOT EXISTS remediation_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  planId TEXT NOT NULL,
  actionId TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  result TEXT,
  timestamp DATETIME NOT NULL,
  FOREIGN KEY (planId) REFERENCES remediation_plans(id)
);

CREATE TABLE IF NOT EXISTS remediation_rollback (
  id TEXT PRIMARY KEY,
  planId TEXT NOT NULL,
  snapshot TEXT NOT NULL, -- JSON state before execution
  createdAt DATETIME NOT NULL,
  FOREIGN KEY (planId) REFERENCES remediation_plans(id)
);

CREATE INDEX idx_remediation_status ON remediation_plans(status);
CREATE INDEX idx_remediation_alert ON remediation_plans(alertId);
```

## 🧪 Testing

### Test Auto-Remediation

```bash
# Trigger test alert
curl -X POST http://localhost:3100/api/v1/test/trigger-alert \
  -H "Content-Type: application/json" \
  -d '{"type": "container_crashed", "containerName": "test-container"}'

# Check pending plans
curl http://localhost:3100/api/v1/remediation/plans/pending

# Approve plan
curl -X POST http://localhost:3100/api/v1/remediation/plans/{planId}/approve \
  -H "Content-Type: application/json" \
  -d '{"userId": "admin"}'
```

## 📚 Additional Resources

- [Chaos Engineering](https://principlesofchaos.org/)
- [Site Reliability Engineering](https://sre.google/books/)
- [Kubernetes Self-Healing](https://kubernetes.io/docs/concepts/workloads/controllers/)

## 🎓 Learning Notes

### Self-Healing Best Practices

1. **Start Simple**: Basic restarts before complex fixes
2. **Measure Success**: Track what works
3. **Fail Safe**: Always have rollback
4. **Human Oversight**: Critical actions need approval
5. **Learn & Adapt**: Improve rules based on outcomes

## ✅ Completion Checklist

- [ ] Remediation engine initialized
- [ ] Common problem rules defined
- [ ] Safety checker implemented
- [ ] Execution manager working
- [ ] Rollback capability tested
- [ ] Human confirmation flow working
- [ ] Audit trail complete
- [ ] Learning engine recording outcomes
- [ ] API endpoints tested
- [ ] WebSocket notifications working

## 🚀 Next Steps

After completing this phase:

1. **Test Scenarios**: Simulate common failures
2. **Fine-tune Rules**: Adjust confidence levels
3. **Monitor Success**: Track remediation effectiveness
4. **Add More Rules**: Expand coverage
5. **Proceed to Phase 11**: Dashboard UI

---

**Remember**: Automation should augment human intelligence, not replace it. Always maintain human oversight for critical decisions.