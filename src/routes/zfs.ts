import type { FastifyInstance } from 'fastify';
import type { ZFSManager } from '../services/zfs/manager.js';
import type { ZFSAssistant } from '../services/zfs/assistant.js';
import { z } from 'zod';
import {
  withService,
  formatSuccess,
  extractParams,
  extractBody,
  extractQuery,
} from '../utils/route-helpers.js';
import { ExternalServiceError } from '../utils/error-types.js';

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
  /**
   * GET /api/zfs/snapshots/stats
   * Get snapshot statistics
   */
  fastify.get(
    '/api/zfs/snapshots/stats',
    withService<ZFSManager>('zfsManager', async (zfsManager) => {
      try {
        const stats = zfsManager.getSnapshotStats();
        return formatSuccess(stats);
      } catch (error) {
        throw new ExternalServiceError('ZFS', 'Failed to retrieve snapshot statistics', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * POST /api/zfs/snapshots/create
   * Create a manual snapshot
   */
  fastify.post(
    '/api/zfs/snapshots/create',
    {
      schema: {
        body: CreateSnapshotSchema,
      },
    },
    withService<ZFSManager>('zfsManager', async (zfsManager, request) => {
      try {
        const { poolName, reason } = extractBody<z.infer<typeof CreateSnapshotSchema>>(
          request.body,
        );
        const result = await zfsManager.createManualSnapshot(poolName, reason);
        return result;
      } catch (error) {
        throw new ExternalServiceError('ZFS', 'Failed to create snapshot', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * GET /api/zfs/scrubs/history
   * Get scrub history, optionally filtered by pool name
   */
  fastify.get(
    '/api/zfs/scrubs/history',
    withService<ZFSManager>('zfsManager', async (zfsManager, request) => {
      try {
        const { poolName } = extractQuery<{ poolName?: string }>(request.query);
        const history = zfsManager.getScrubHistory(poolName);
        return formatSuccess(history);
      } catch (error) {
        throw new ExternalServiceError('ZFS', 'Failed to retrieve scrub history', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * GET /api/zfs/backups/history
   * Get backup history
   */
  fastify.get(
    '/api/zfs/backups/history',
    withService<ZFSManager>('zfsManager', async (zfsManager) => {
      try {
        const history = zfsManager.getBackupHistory();
        return formatSuccess(history);
      } catch (error) {
        throw new ExternalServiceError('ZFS', 'Failed to retrieve backup history', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * GET /api/zfs/recommendations
   * Get ZFS recommendations
   */
  fastify.get(
    '/api/zfs/recommendations',
    withService<ZFSManager>('zfsManager', async (zfsManager) => {
      try {
        const recommendations = zfsManager.getRecommendations();
        return formatSuccess(recommendations);
      } catch (error) {
        throw new ExternalServiceError('ZFS', 'Failed to retrieve ZFS recommendations', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * POST /api/zfs/explain
   * Explain a ZFS concept
   */
  fastify.post(
    '/api/zfs/explain',
    {
      schema: {
        body: ExplainConceptSchema,
      },
    },
    withService<ZFSAssistant>('zfsAssistant', async (zfsAssistant, request) => {
      try {
        const { concept } = extractBody<z.infer<typeof ExplainConceptSchema>>(request.body);
        const explanation = zfsAssistant.explainConcept(concept);
        return formatSuccess({ concept, explanation });
      } catch (error) {
        throw new ExternalServiceError('ZFS', 'Failed to explain ZFS concept', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * GET /api/zfs/pool-recommendations/:poolName
   * Get recommendations for a specific pool
   */
  fastify.get(
    '/api/zfs/pool-recommendations/:poolName',
    withService<ZFSAssistant>('zfsAssistant', async (zfsAssistant, request) => {
      try {
        const { poolName } = extractParams<{ poolName: string }>(request.params);
        const recommendations = zfsAssistant.getPoolRecommendations({ name: poolName });
        return formatSuccess({ poolName, recommendations });
      } catch (error) {
        throw new ExternalServiceError('ZFS', 'Failed to get pool recommendations', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  /**
   * POST /api/zfs/diagnose
   * Diagnose a ZFS issue
   */
  fastify.post(
    '/api/zfs/diagnose',
    {
      schema: {
        body: DiagnoseIssueSchema,
      },
    },
    withService<ZFSAssistant>('zfsAssistant', async (zfsAssistant, request) => {
      try {
        const { issue, poolData, systemData } = extractBody<z.infer<typeof DiagnoseIssueSchema>>(
          request.body,
        );
        const diagnosis = zfsAssistant.diagnoseIssue(issue, poolData, systemData);
        return formatSuccess({ issue, diagnosis });
      } catch (error) {
        throw new ExternalServiceError('ZFS', 'Failed to diagnose issue', {
          original: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
}
