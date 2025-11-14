import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ServiceUnavailableError, ExternalServiceError } from '../utils/error-types.js';

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
// eslint-disable-next-line @typescript-eslint/require-await
export async function zfsRoutes(fastify: FastifyInstance): Promise<void> {
  // Get snapshot statistics
  fastify.get('/api/zfs/snapshots/stats', async () => {
    try {
      const zfsManager = (fastify as { zfsManager?: { getSnapshotStats: () => unknown } })
        .zfsManager;

      if (!zfsManager) {
        throw new ServiceUnavailableError('ZFS manager not initialized');
      }

      const stats = zfsManager.getSnapshotStats();
      return { success: true, data: stats, timestamp: new Date().toISOString() };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ExternalServiceError('Failed to retrieve snapshot statistics', 'ZFS', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
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
      try {
        const zfsManager = (
          fastify as {
            zfsManager?: {
              createManualSnapshot: (poolName: string, reason: string) => Promise<unknown>;
            };
          }
        ).zfsManager;

        if (!zfsManager) {
          throw new ServiceUnavailableError('ZFS manager not initialized');
        }

        const { poolName, reason } = request.body as z.infer<typeof CreateSnapshotSchema>;
        const result = await zfsManager.createManualSnapshot(poolName, reason);
        return result;
      } catch (error) {
        if (error instanceof ServiceUnavailableError) {
          throw error;
        }
        throw new ExternalServiceError('Failed to create snapshot', 'ZFS', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Get scrub history
  fastify.get('/api/zfs/scrubs/history', async (request) => {
    try {
      const zfsManager = (
        fastify as { zfsManager?: { getScrubHistory: (poolName?: string) => unknown } }
      ).zfsManager;

      if (!zfsManager) {
        throw new ServiceUnavailableError('ZFS manager not initialized');
      }

      const { poolName } = request.query as { poolName?: string };
      const history = zfsManager.getScrubHistory(poolName);
      return { success: true, data: history, timestamp: new Date().toISOString() };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ExternalServiceError('Failed to retrieve scrub history', 'ZFS', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get backup history
  fastify.get('/api/zfs/backups/history', async () => {
    try {
      const zfsManager = (
        fastify as { zfsManager?: { getBackupHistory: (limit?: number) => unknown } }
      ).zfsManager;

      if (!zfsManager) {
        throw new ServiceUnavailableError('ZFS manager not initialized');
      }

      const history = zfsManager.getBackupHistory();
      return { success: true, data: history, timestamp: new Date().toISOString() };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ExternalServiceError('Failed to retrieve backup history', 'ZFS', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get ZFS recommendations
  fastify.get('/api/zfs/recommendations', async () => {
    try {
      const zfsManager = (fastify as { zfsManager?: { getRecommendations: () => unknown } })
        .zfsManager;

      if (!zfsManager) {
        throw new ServiceUnavailableError('ZFS manager not initialized');
      }

      const recommendations = zfsManager.getRecommendations();
      return { success: true, data: recommendations, timestamp: new Date().toISOString() };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ExternalServiceError('Failed to retrieve ZFS recommendations', 'ZFS', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
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
      try {
        const zfsAssistant = (
          fastify as { zfsAssistant?: { explainConcept: (concept: string) => string } }
        ).zfsAssistant;

        if (!zfsAssistant) {
          throw new ServiceUnavailableError('ZFS assistant not initialized');
        }

        const { concept } = request.body as z.infer<typeof ExplainConceptSchema>;
        const explanation = zfsAssistant.explainConcept(concept);
        return {
          success: true,
          data: { concept, explanation },
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        if (error instanceof ServiceUnavailableError) {
          throw error;
        }
        throw new ExternalServiceError('Failed to explain ZFS concept', 'ZFS', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Get pool recommendations
  fastify.get('/api/zfs/pool-recommendations/:poolName', async (request) => {
    try {
      const zfsAssistant = (
        fastify as {
          zfsAssistant?: { getPoolRecommendations: (poolConfig: { name: string }) => string[] };
        }
      ).zfsAssistant;

      if (!zfsAssistant) {
        throw new ServiceUnavailableError('ZFS assistant not initialized');
      }

      const { poolName } = request.params as { poolName: string };
      const recommendations = zfsAssistant.getPoolRecommendations({ name: poolName });
      return {
        success: true,
        data: { pool: poolName, recommendations },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ExternalServiceError('Failed to retrieve pool recommendations', 'ZFS', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
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
      try {
        const zfsAssistant = (
          fastify as {
            zfsAssistant?: {
              diagnoseIssue: (
                issue: string,
                poolData: unknown,
                systemData: unknown,
              ) => Promise<string>;
            };
          }
        ).zfsAssistant;

        if (!zfsAssistant) {
          throw new ServiceUnavailableError('ZFS assistant not initialized');
        }

        const { issue, poolData, systemData } = request.body as z.infer<typeof DiagnoseIssueSchema>;
        const diagnosis = await zfsAssistant.diagnoseIssue(issue, poolData, systemData);
        return { success: true, data: { diagnosis }, timestamp: new Date().toISOString() };
      } catch (error) {
        if (error instanceof ServiceUnavailableError) {
          throw error;
        }
        throw new ExternalServiceError('Failed to diagnose ZFS issue', 'ZFS', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Get best practices
  fastify.get('/api/zfs/best-practices', async () => {
    try {
      const zfsAssistant = (fastify as { zfsAssistant?: { getBestPractices: () => unknown } })
        .zfsAssistant;

      if (!zfsAssistant) {
        throw new ServiceUnavailableError('ZFS assistant not initialized');
      }

      const practices = zfsAssistant.getBestPractices();
      return { success: true, data: practices, timestamp: new Date().toISOString() };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ExternalServiceError('Failed to retrieve ZFS best practices', 'ZFS', {
        original: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
