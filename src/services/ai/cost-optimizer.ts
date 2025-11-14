import type Database from 'better-sqlite3';

export interface CostOptimization {
  current_state: {
    total_storage_tb: number;
    active_containers: number;
    estimated_power_watts: number;
    estimated_monthly_cost_usd: number;
  };
  opportunities: Array<{
    category: 'storage' | 'compute' | 'power' | 'network';
    title: string;
    description: string;
    potential_savings_usd: number;
    difficulty: 'easy' | 'medium' | 'hard';
    implementation_steps: string[];
  }>;
  total_potential_savings_usd: number;
}

/**
 * Cost Optimizer
 * Generates cost optimization recommendations
 */
export class CostOptimizer {
  constructor(private db: Database.Database) {}

  /**
   * Generate cost optimizations
   */
  generateOptimizations(): CostOptimization {
    const currentState = this.getCurrentSystemState();
    const opportunities: CostOptimization['opportunities'] = [];

    // Storage optimizations
    const storageOps = this.identifyStorageOptimizations(currentState);
    opportunities.push(...storageOps);

    // Compute optimizations
    const computeOps = this.identifyComputeOptimizations(currentState);
    opportunities.push(...computeOps);

    // Power optimizations
    const powerOps = this.identifyPowerOptimizations(currentState);
    opportunities.push(...powerOps);

    // Calculate total savings
    const totalSavings = opportunities.reduce((sum, op) => sum + op.potential_savings_usd, 0);

    return {
      current_state: currentState,
      opportunities,
      total_potential_savings_usd: totalSavings,
    };
  }

  private getCurrentSystemState(): CostOptimization['current_state'] {
    const poolStats = this.db
      .prepare(
        `SELECT SUM(total_bytes) as total_storage
        FROM pool_metrics
        WHERE timestamp > datetime('now', '-1 hour')`,
      )
      .get() as { total_storage: number } | undefined;

    const containerCount = this.db
      .prepare(
        `SELECT COUNT(DISTINCT container_id) as count
        FROM container_metrics
        WHERE timestamp > datetime('now', '-1 hour') AND state = 'running'`,
      )
      .get() as { count: number } | undefined;

    const totalStorageTB = poolStats?.total_storage ? poolStats.total_storage / 1024 ** 4 : 0;

    // Rough power estimation (i5-12400 ~65W, 64GB RAM ~20W, disks ~5W each, overhead)
    const estimatedPowerWatts = 65 + 20 + totalStorageTB * 3 * 5 + (containerCount?.count || 0) * 2;

    // Rough monthly cost at $0.12/kWh
    const estimatedMonthlyCost = (estimatedPowerWatts * 24 * 30 * 0.12) / 1000;

    return {
      total_storage_tb: totalStorageTB,
      active_containers: containerCount?.count || 0,
      estimated_power_watts: Math.round(estimatedPowerWatts),
      estimated_monthly_cost_usd: Math.round(estimatedMonthlyCost * 100) / 100,
    };
  }

  private identifyStorageOptimizations(
    _state: CostOptimization['current_state'],
  ): CostOptimization['opportunities'] {
    const opportunities: CostOptimization['opportunities'] = [];

    // Check for excessive snapshots
    const snapshotCount = this.db
      .prepare("SELECT COUNT(*) as count FROM alerts WHERE type = 'snapshot'")
      .get() as { count: number } | undefined;

    if (snapshotCount && snapshotCount.count > 50) {
      opportunities.push({
        category: 'storage',
        title: 'Reduce snapshot retention',
        description: `You have ${snapshotCount.count} snapshots. Consider implementing automated snapshot cleanup.`,
        potential_savings_usd: 0, // Storage is already purchased
        difficulty: 'easy',
        implementation_steps: [
          'Review snapshot policy in TrueNAS',
          'Delete snapshots older than 30 days',
          'Set up automated snapshot rotation',
        ],
      });
    }

    return opportunities;
  }

  private identifyComputeOptimizations(
    _state: CostOptimization['current_state'],
  ): CostOptimization['opportunities'] {
    const opportunities: CostOptimization['opportunities'] = [];

    // Check for idle containers
    const idleContainers = this.db
      .prepare(
        `SELECT COUNT(*) as count
        FROM container_metrics
        WHERE timestamp > datetime('now', '-24 hours')
        AND state = 'running'
        AND cpu_percent < 1
        GROUP BY container_id
        HAVING COUNT(*) > 20`,
      )
      .get() as { count: number } | undefined;

    if (idleContainers && idleContainers.count > 3) {
      opportunities.push({
        category: 'compute',
        title: 'Stop idle containers',
        description: `${idleContainers.count} containers have been idle for 24+ hours.`,
        potential_savings_usd: Math.round(idleContainers.count * 0.5 * 100) / 100,
        difficulty: 'easy',
        implementation_steps: [
          'Review idle containers with docker ps',
          'Stop non-essential containers',
          'Consider using container orchestration with auto-scaling',
        ],
      });
    }

    return opportunities;
  }

  private identifyPowerOptimizations(
    state: CostOptimization['current_state'],
  ): CostOptimization['opportunities'] {
    const opportunities: CostOptimization['opportunities'] = [];

    // Check CPU usage patterns
    const avgCPU = this.db
      .prepare(
        `SELECT AVG(cpu_percent) as avg
        FROM metrics
        WHERE timestamp > datetime('now', '-7 days')`,
      )
      .get() as { avg: number | null } | undefined;

    if (avgCPU && avgCPU.avg !== null && avgCPU.avg < 20) {
      opportunities.push({
        category: 'power',
        title: 'Enable CPU power saving features',
        description: `Average CPU usage is only ${avgCPU.avg.toFixed(1)}%. Enable power saving modes.`,
        potential_savings_usd: Math.round(state.estimated_monthly_cost_usd * 0.15 * 100) / 100,
        difficulty: 'medium',
        implementation_steps: [
          'Enable Intel SpeedStep in BIOS',
          'Set CPU governor to "powersave" for non-critical workloads',
          'Consider consolidating workloads to fewer cores',
        ],
      });
    }

    return opportunities;
  }
}
