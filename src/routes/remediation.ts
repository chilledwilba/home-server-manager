import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AutoRemediationService } from '../services/remediation/auto-remediation.js';
import { DatabaseError, NotFoundError } from '../utils/error-types.js';
import { extractBody, formatSuccess, withService } from '../utils/route-helpers.js';

const ApproveActionSchema = z.object({
  alertId: z.number(),
  approvedBy: z.string(),
});

/**
 * Auto-remediation routes
 */

export async function remediationRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/remediation/pending
   * Get pending approval requests
   */
  fastify.get(
    '/api/remediation/pending',
    withService<AutoRemediationService>('remediationService', async (remediationService) => {
      try {
        const pending = remediationService.getPendingApprovals();
        return formatSuccess(pending);
      } catch (error) {
        throw new DatabaseError('Failed to fetch pending approvals', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * POST /api/remediation/approve
   * Approve a remediation action
   */
  fastify.post(
    '/api/remediation/approve',
    {
      schema: {
        body: ApproveActionSchema,
      },
    },
    withService<AutoRemediationService>(
      'remediationService',
      async (remediationService, request) => {
        try {
          const { alertId, approvedBy } = extractBody<z.infer<typeof ApproveActionSchema>>(
            request.body,
          );

          await remediationService.approveAction(alertId, approvedBy);

          return formatSuccess(null, 'Action approved and executed');
        } catch (error) {
          if (error instanceof Error && error.message.includes('not found')) {
            const { alertId } = extractBody<{ alertId: number }>(request.body);
            throw new NotFoundError('Remediation action', String(alertId));
          }
          throw new DatabaseError('Failed to approve remediation action', {
            original: error instanceof Error ? error.message : String(error),
          });
        }
      },
    ),
  );

  /**
   * GET /api/remediation/history
   * Get remediation action history
   */
  fastify.get(
    '/api/remediation/history',
    withService<AutoRemediationService>('remediationService', async (remediationService) => {
      try {
        const history = remediationService.getRemediationHistory();
        return formatSuccess(history);
      } catch (error) {
        throw new DatabaseError('Failed to fetch remediation history', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
}
