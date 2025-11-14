import type Database from 'better-sqlite3';

/**
 * Infrastructure Persistence
 * Handles database operations for infrastructure deployments
 */
export class InfrastructurePersistence {
  constructor(private db: Database.Database) {}

  /**
   * Record deployment in database
   */
  recordDeployment(
    serviceName: string,
    serviceType: string,
    stackId: number,
    dockerCompose?: string,
    envVars?: Record<string, string>,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO infrastructure_deployments
        (service_name, service_type, stack_id, deployed_at, status, docker_compose, env_vars, deployed_by)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'active', ?, ?, 'infrastructure-manager')
    `);

    const envVarsJson = envVars ? JSON.stringify(envVars) : null;
    stmt.run(serviceName, serviceType, stackId, dockerCompose || null, envVarsJson);
  }

  /**
   * Update deployment status to removed
   */
  updateDeploymentRemoved(serviceName: string): void {
    const stmt = this.db.prepare(`
      UPDATE infrastructure_deployments
      SET status = 'removed', removed_at = CURRENT_TIMESTAMP
      WHERE service_name = ? AND status = 'active'
    `);

    stmt.run(serviceName);
  }

  /**
   * Get deployment history
   */
  getDeploymentHistory(serviceName?: string): unknown[] {
    if (serviceName) {
      const stmt = this.db.prepare(`
        SELECT * FROM infrastructure_deployments
        WHERE service_name = ?
        ORDER BY deployed_at DESC
      `);
      return stmt.all(serviceName);
    }

    const stmt = this.db.prepare(`
      SELECT * FROM infrastructure_deployments
      ORDER BY deployed_at DESC
      LIMIT 50
    `);

    return stmt.all();
  }
}
