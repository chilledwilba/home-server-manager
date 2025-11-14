import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ServiceUnavailableError, DatabaseError, NotFoundError } from '../utils/error-types.js';

const ApproveActionSchema = z.object({
  alertId: z.number(),
  approvedBy: z.string(),
});

/**
 * Auto-remediation routes
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function remediationRoutes(fastify: FastifyInstance): Promise<void> {
  // Get pending approvals
  fastify.get('/api/remediation/pending', async () => {
    try {
      const remediationService = (
        fastify as { remediationService?: { getPendingApprovals: () => unknown } }
      ).remediationService;

      if (!remediationService) {
        throw new ServiceUnavailableError('Remediation service not initialized');
      }

      const pending = remediationService.getPendingApprovals();
      return { success: true, data: pending, timestamp: new Date().toISOString() };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new DatabaseError('Failed to fetch pending approvals', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Approve action
  fastify.post(
    '/api/remediation/approve',
    {
      schema: {
        body: ApproveActionSchema,
      },
    },
    async (request) => {
      try {
        const remediationService = (
          fastify as {
            remediationService?: {
              approveAction: (alertId: number, approvedBy: string) => Promise<void>;
            };
          }
        ).remediationService;

        if (!remediationService) {
          throw new ServiceUnavailableError('Remediation service not initialized');
        }

        const { alertId, approvedBy } = request.body as z.infer<typeof ApproveActionSchema>;

        await remediationService.approveAction(alertId, approvedBy);

        return {
          success: true,
          message: 'Action approved and executed',
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        if (error instanceof ServiceUnavailableError) {
          throw error;
        }
        if (error instanceof Error && error.message.includes('not found')) {
          throw new NotFoundError(
            'Remediation action',
            String((request.body as { alertId: number }).alertId),
          );
        }
        throw new DatabaseError('Failed to approve remediation action', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Get remediation history
  fastify.get('/api/remediation/history', async () => {
    try {
      const remediationService = (
        fastify as { remediationService?: { getRemediationHistory: (limit?: number) => unknown } }
      ).remediationService;

      if (!remediationService) {
        throw new ServiceUnavailableError('Remediation service not initialized');
      }

      const history = remediationService.getRemediationHistory();
      return { success: true, data: history, timestamp: new Date().toISOString() };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new DatabaseError('Failed to fetch remediation history', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
