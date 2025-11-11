import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const ApproveActionSchema = z.object({
  alertId: z.number(),
  approvedBy: z.string(),
});

/**
 * Auto-remediation routes
 */
export async function remediationRoutes(fastify: FastifyInstance): Promise<void> {
  // Get pending approvals
  fastify.get('/api/remediation/pending', async () => {
    const remediationService = (
      fastify as { remediationService?: { getPendingApprovals: () => unknown } }
    ).remediationService;

    if (!remediationService) {
      return { success: false, error: 'Remediation service not initialized' };
    }

    const pending = remediationService.getPendingApprovals();
    return { success: true, data: pending, timestamp: new Date().toISOString() };
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
      const remediationService = (
        fastify as {
          remediationService?: {
            approveAction: (alertId: number, approvedBy: string) => Promise<void>;
          };
        }
      ).remediationService;

      if (!remediationService) {
        return { success: false, error: 'Remediation service not initialized' };
      }

      const { alertId, approvedBy } = request.body as z.infer<typeof ApproveActionSchema>;

      await remediationService.approveAction(alertId, approvedBy);

      return {
        success: true,
        message: 'Action approved and executed',
        timestamp: new Date().toISOString(),
      };
    },
  );

  // Get remediation history
  fastify.get('/api/remediation/history', async () => {
    const remediationService = (
      fastify as { remediationService?: { getRemediationHistory: (limit?: number) => unknown } }
    ).remediationService;

    if (!remediationService) {
      return { success: false, error: 'Remediation service not initialized' };
    }

    const history = remediationService.getRemediationHistory();
    return { success: true, data: history, timestamp: new Date().toISOString() };
  });
}
