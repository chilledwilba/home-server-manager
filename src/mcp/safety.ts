/**
 * Safety validation for MCP actions
 * Ensures dangerous operations require confirmation
 */

export interface ValidationResult {
  safe: boolean;
  warnings: string[];
  recommendation: string;
}

export interface ActionContext {
  container?: string;
  dataset?: string;
  action?: string;
}

export class SafetyCheck {
  // Actions that should ALWAYS require confirmation
  static readonly DANGEROUS_ACTIONS = [
    'delete',
    'remove',
    'destroy',
    'format',
    'wipe',
    'reset',
    'rollback',
    'kill',
    'force',
  ] as const;

  // Actions that are generally safe
  static readonly SAFE_ACTIONS = [
    'list',
    'get',
    'show',
    'status',
    'info',
    'describe',
    'read',
    'view',
  ] as const;

  // Critical services that should not be disrupted
  static readonly CRITICAL_SERVICES = ['plex', 'portainer', 'traefik', 'nginx'] as const;

  /**
   * Check if an action requires confirmation
   */
  static requiresConfirmation(action: string): boolean {
    const actionLower = action.toLowerCase();
    return SafetyCheck.DANGEROUS_ACTIONS.some((dangerous) => actionLower.includes(dangerous));
  }

  /**
   * Check if an action is safe to execute
   */
  static isSafeAction(action: string): boolean {
    const actionLower = action.toLowerCase();
    return SafetyCheck.SAFE_ACTIONS.some((safe) => actionLower.includes(safe));
  }

  /**
   * Validate an action with context
   */
  static validateAction(action: string, context: ActionContext): ValidationResult {
    const warnings: string[] = [];
    let safe = true;

    // Check for dangerous keywords
    if (SafetyCheck.requiresConfirmation(action)) {
      safe = false;
      warnings.push('This action is potentially destructive');
    }

    // Check for critical service impact
    if (context.container) {
      const containerLower = context.container.toLowerCase();
      const isCritical = SafetyCheck.CRITICAL_SERVICES.some((service) =>
        containerLower.includes(service),
      );

      if (isCritical) {
        if (action.includes('stop') || action.includes('restart') || action.includes('remove')) {
          warnings.push(`This will affect critical service: ${context.container}`);
          safe = false;
        }

        if (context.container.includes('plex') && action.includes('stop')) {
          warnings.push('This will interrupt active Plex streams');
        }
      }
    }

    // Check time of day for maintenance windows
    const hour = new Date().getHours();
    const isPeakHours = hour >= 19 || hour <= 7; // 7PM to 7AM

    if (isPeakHours) {
      if (action.includes('restart') || action.includes('update') || action.includes('stop')) {
        warnings.push(
          'Running during peak usage hours (7PM-7AM) - consider scheduling for off-hours',
        );
      }
    }

    // Check for ZFS operations
    if (context.dataset) {
      if (action.includes('destroy') || action.includes('rollback')) {
        warnings.push('ZFS rollback/destroy operations cannot be undone');
        safe = false;
      }
    }

    return {
      safe,
      warnings,
      recommendation: safe
        ? 'Action appears safe to execute'
        : 'Requires careful review and user confirmation',
    };
  }

  /**
   * Generate confirmation message
   */
  static generateConfirmationMessage(
    action: string,
    context: ActionContext,
    actionId: string,
  ): string {
    const validation = SafetyCheck.validateAction(action, context);

    let message = '⚠️ ACTION REQUIRES CONFIRMATION ⚠️\n\n';
    message += `Action: ${action}\n`;

    if (context.container) {
      message += `Container: ${context.container}\n`;
    }

    if (context.dataset) {
      message += `Dataset: ${context.dataset}\n`;
    }

    message += `\nConfirmation ID: ${actionId}\n`;

    if (validation.warnings.length > 0) {
      message += '\n⚠️ Warnings:\n';
      validation.warnings.forEach((warning) => {
        message += `  - ${warning}\n`;
      });
    }

    message += '\nTo proceed, use the confirm_action tool with this ID.\n';
    message += 'This confirmation will expire in 5 minutes.\n';

    return message;
  }

  /**
   * Check if action has expired
   */
  static isActionExpired(timestamp: Date, maxAgeMinutes: number = 5): boolean {
    const age = Date.now() - timestamp.getTime();
    return age > maxAgeMinutes * 60 * 1000;
  }
}
