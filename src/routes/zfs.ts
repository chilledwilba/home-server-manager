import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const CreateSnapshotSchema = z.object({
  poolName: z.string(),
  reason: z.string(),
});

const ExplainConceptSchema = z.object({
  concept: z.string(),
});

const DiagnoseIssueSchema = z.object({
  issue: z.string(),
  poolData: z.object({
    name: z.string(),
    capacity: z.object({
      percent: z.number(),
    }),
  }),
  systemData: z.object({
    memory: z.object({
      arc: z.number(),
    }),
  }),
});

/**
 * ZFS Routes
 * API endpoints for snapshot management, scrub history, and ZFS assistance
 */
export async function zfsRoutes(fastify: FastifyInstance): Promise<void> {
  // Get snapshot statistics
  fastify.get('/api/zfs/snapshots/stats', async () => {
    const zfsManager = (fastify as {zfsManager?: {getSnapshotStats: () => unknown}}).zfsManager;

    if (!zfsManager) {
      return { success: false, error: 'ZFS manager not initialized' };
    }

    const stats = zfsManager.getSnapshotStats();
    return { success: true, data: stats, timestamp: new Date().toISOString() };
  });

  // Create manual snapshot
  fastify.post(
    '/api/zfs/snapshots/create',
    {
      schema: {
        body: CreateSnapshotSchema,
      },
    },
    async (request) => {
      const zfsManager = (fastify as {zfsManager?: {createManualSnapshot: (poolName: string, reason: string) => Promise<unknown>}}).zfsManager;

      if (!zfsManager) {
        return { success: false, error: 'ZFS manager not initialized' };
      }

      const { poolName, reason } = request.body as z.infer<typeof CreateSnapshotSchema>;
      const result = await zfsManager.createManualSnapshot(poolName, reason);
      return result;
    },
  );

  // Get scrub history
  fastify.get('/api/zfs/scrubs/history', async (request) => {
    const zfsManager = (fastify as {zfsManager?: {getScrubHistory: (poolName?: string) => unknown}}).zfsManager;

    if (!zfsManager) {
      return { success: false, error: 'ZFS manager not initialized' };
    }

    const { poolName } = request.query as { poolName?: string };
    const history = zfsManager.getScrubHistory(poolName);
    return { success: true, data: history, timestamp: new Date().toISOString() };
  });

  // Get backup history
  fastify.get('/api/zfs/backups/history', async () => {
    const zfsManager = (fastify as {zfsManager?: {getBackupHistory: (limit?: number) => unknown}}).zfsManager;

    if (!zfsManager) {
      return { success: false, error: 'ZFS manager not initialized' };
    }

    const history = zfsManager.getBackupHistory();
    return { success: true, data: history, timestamp: new Date().toISOString() };
  });

  // Get ZFS recommendations
  fastify.get('/api/zfs/recommendations', async () => {
    const zfsManager = (fastify as {zfsManager?: {getRecommendations: () => unknown}}).zfsManager;

    if (!zfsManager) {
      return { success: false, error: 'ZFS manager not initialized' };
    }

    const recommendations = zfsManager.getRecommendations();
    return { success: true, data: recommendations, timestamp: new Date().toISOString() };
  });

  // Explain ZFS concept
  fastify.post(
    '/api/zfs/explain',
    {
      schema: {
        body: ExplainConceptSchema,
      },
    },
    async (request) => {
      const zfsAssistant = (fastify as {zfsAssistant?: {explainConcept: (concept: string) => string}}).zfsAssistant;

      if (!zfsAssistant) {
        return { success: false, error: 'ZFS assistant not initialized' };
      }

      const { concept } = request.body as z.infer<typeof ExplainConceptSchema>;
      const explanation = zfsAssistant.explainConcept(concept);
      return { success: true, data: { concept, explanation }, timestamp: new Date().toISOString() };
    },
  );

  // Get pool recommendations
  fastify.get('/api/zfs/pool-recommendations/:poolName', async (request) => {
    const zfsAssistant = (fastify as {zfsAssistant?: {getPoolRecommendations: (poolConfig: {name: string}) => string[]}}).zfsAssistant;

    if (!zfsAssistant) {
      return { success: false, error: 'ZFS assistant not initialized' };
    }

    const { poolName } = request.params as { poolName: string };
    const recommendations = zfsAssistant.getPoolRecommendations({ name: poolName });
    return {
      success: true,
      data: { pool: poolName, recommendations },
      timestamp: new Date().toISOString(),
    };
  });

  // Diagnose issue
  fastify.post(
    '/api/zfs/diagnose',
    {
      schema: {
        body: DiagnoseIssueSchema,
      },
    },
    async (request) => {
      const zfsAssistant = (fastify as {zfsAssistant?: {diagnoseIssue: (issue: string, poolData: unknown, systemData: unknown) => Promise<string>}}).zfsAssistant;

      if (!zfsAssistant) {
        return { success: false, error: 'ZFS assistant not initialized' };
      }

      const { issue, poolData, systemData } = request.body as z.infer<
        typeof DiagnoseIssueSchema
      >;
      const diagnosis = await zfsAssistant.diagnoseIssue(issue, poolData, systemData);
      return { success: true, data: { diagnosis }, timestamp: new Date().toISOString() };
    },
  );

  // Get best practices
  fastify.get('/api/zfs/best-practices', async () => {
    const zfsAssistant = (fastify as {zfsAssistant?: {getBestPractices: () => unknown}}).zfsAssistant;

    if (!zfsAssistant) {
      return { success: false, error: 'ZFS assistant not initialized' };
    }

    const practices = zfsAssistant.getBestPractices();
    return { success: true, data: practices, timestamp: new Date().toISOString() };
  });
}
