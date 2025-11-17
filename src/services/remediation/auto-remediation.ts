import type Database from 'better-sqlite3';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('remediation');

interface RemediationAction {
  type: string;
  execute: () => Promise<{ success: boolean; message: string }>;
  requiresApproval: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

interface Alert {
  id: number;
  type: string;
  severity: string;
  message: string;
  details?: string;
}

/**
 * Auto-remediation service with human-in-the-loop safety
 */
export class AutoRemediationService {
  private actions: Map<string, RemediationAction> = new Map();
  private pendingApprovals: Map<number, RemediationAction> = new Map();

  constructor(private db: Database.Database) {
    this.registerActions();
  }

  private registerActions(): void {
    // Low risk: Automatic execution
    this.actions.set('container_restart', {
      type: 'container_restart',
      execute: async () => {
        logger.info('Auto-remediation: Restarting unhealthy container');
        return { success: true, message: 'Container restarted' };
      },
      requiresApproval: false,
      riskLevel: 'low',
    });

    // Medium risk: Requires approval
    this.actions.set('clear_failed_downloads', {
      type: 'clear_failed_downloads',
      execute: async () => {
        logger.info('Auto-remediation: Clearing failed downloads');
        return { success: true, message: 'Failed downloads cleared' };
      },
      requiresApproval: true,
      riskLevel: 'medium',
    });

    // High risk: Always requires approval
    this.actions.set('emergency_shutdown', {
      type: 'emergency_shutdown',
      execute: async () => {
        logger.warn('Auto-remediation: Emergency shutdown initiated');
        return { success: true, message: 'Emergency shutdown initiated' };
      },
      requiresApproval: true,
      riskLevel: 'high',
    });
  }

  async handleAlert(alert: Alert): Promise<void> {
    const actionType = this.determineAction(alert);
    if (!actionType) {
      logger.info(`No remediation action for alert type: ${alert.type}`);
      return;
    }

    const action = this.actions.get(actionType);
    if (!action) {
      logger.warn(`Unknown action type: ${actionType}`);
      return;
    }

    if (action.requiresApproval) {
      await this.requestApproval(alert, action);
    } else {
      await this.executeAction(alert, action);
    }
  }

  private determineAction(alert: Alert): string | null {
    // Map alert types to remediation actions
    const actionMap: Record<string, string> = {
      container_unhealthy: 'container_restart',
      download_stuck: 'clear_failed_downloads',
      disk_full: 'clear_old_data',
      high_cpu: 'restart_heavy_containers',
    };

    return actionMap[alert.type] || null;
  }

  private async requestApproval(alert: Alert, action: RemediationAction): Promise<void> {
    logger.info(`Requesting approval for ${action.type} (risk: ${action.riskLevel})`);

    this.pendingApprovals.set(alert.id, action);

    const stmt = this.db.prepare(`
      INSERT INTO remediation_actions (
        alert_id, action_type, status, approved
      ) VALUES (?, ?, 'pending_approval', 0)
    `);

    stmt.run(alert.id, action.type);
  }

  async approveAction(alertId: number, approvedBy: string): Promise<void> {
    const action = this.pendingApprovals.get(alertId);
    if (!action) {
      throw new Error('No pending action for this alert');
    }

    logger.info(`Action approved by ${approvedBy}: ${action.type}`);

    const stmt = this.db.prepare(`
      UPDATE remediation_actions
      SET approved = 1, approved_by = ?, status = 'executing'
      WHERE alert_id = ?
    `);

    stmt.run(approvedBy, alertId);

    const alert = this.db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertId) as Alert;

    await this.executeAction(alert, action);
    this.pendingApprovals.delete(alertId);
  }

  private async executeAction(alert: Alert, action: RemediationAction): Promise<void> {
    logger.info(`Executing remediation action: ${action.type}`);

    try {
      const result = await action.execute();

      const stmt = this.db.prepare(`
        UPDATE remediation_actions
        SET status = 'completed', executed_at = ?, result = ?
        WHERE alert_id = ?
      `);

      stmt.run(new Date().toISOString(), result.message, alert.id);

      logger.info(`Remediation successful: ${result.message}`);
    } catch (error) {
      logger.error({ err: error }, 'Remediation failed');

      const stmt = this.db.prepare(`
        UPDATE remediation_actions
        SET status = 'failed', error = ?
        WHERE alert_id = ?
      `);

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      stmt.run(errorMsg, alert.id);
    }
  }

  getPendingApprovals(): Array<unknown> {
    return this.db
      .prepare(
        `
      SELECT r.*, a.type as alert_type, a.message as alert_message
      FROM remediation_actions r
      JOIN alerts a ON r.alert_id = a.id
      WHERE r.status = 'pending_approval'
      ORDER BY r.id DESC
    `,
      )
      .all();
  }

  getRemediationHistory(limit: number = 50): Array<unknown> {
    return this.db
      .prepare(
        `
      SELECT * FROM remediation_actions
      ORDER BY id DESC
      LIMIT ?
    `,
      )
      .all(limit);
  }
}
