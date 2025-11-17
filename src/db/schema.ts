import type Database from 'better-sqlite3';
import { dbLogger as logger } from '../utils/logger.js';

export function initializeDatabase(db: Database.Database): void {
  logger.info('Initializing database schema...');

  // System metrics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      cpu_percent REAL,
      cpu_temp REAL,
      ram_used_gb REAL,
      ram_total_gb REAL,
      ram_percent REAL,
      network_rx_mbps REAL,
      network_tx_mbps REAL,
      arc_size_gb REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Pool metrics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pool_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      pool_name TEXT NOT NULL,
      pool_type TEXT,
      status TEXT,
      health TEXT,
      used_bytes INTEGER,
      total_bytes INTEGER,
      percent_used REAL,
      scrub_errors INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // SMART metrics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS smart_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      disk_name TEXT NOT NULL,
      model TEXT,
      temperature REAL,
      power_on_hours INTEGER,
      reallocated_sectors INTEGER,
      pending_sectors INTEGER,
      health_status TEXT,
      load_cycle_count INTEGER,
      spin_retry_count INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Container metrics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS container_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      container_id TEXT NOT NULL,
      container_name TEXT NOT NULL,
      state TEXT,
      cpu_percent REAL,
      memory_used_mb REAL,
      memory_limit_mb REAL,
      network_rx_mb REAL,
      network_tx_mb REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Alerts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      acknowledged INTEGER DEFAULT 0,
      resolved INTEGER DEFAULT 0,
      actionable INTEGER DEFAULT 0,
      suggested_action TEXT
    )
  `);

  // Disk failure predictions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS disk_predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      disk_name TEXT NOT NULL,
      prediction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      failure_probability REAL,
      days_until_failure INTEGER,
      confidence REAL,
      contributing_factors TEXT,
      recommended_action TEXT
    )
  `);

  // Security findings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      container TEXT NOT NULL,
      severity TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      cve TEXT,
      fixed INTEGER DEFAULT 0,
      found_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      fixed_at DATETIME
    )
  `);

  // ZFS Snapshots table
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_name TEXT NOT NULL,
      snapshot_name TEXT NOT NULL,
      type TEXT NOT NULL,
      reason TEXT,
      size INTEGER DEFAULT 0,
      verified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      UNIQUE(pool_name, snapshot_name)
    )
  `);

  // ZFS Scrub history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS scrub_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_name TEXT NOT NULL,
      started_at DATETIME NOT NULL,
      completed_at DATETIME,
      status TEXT,
      errors_found INTEGER DEFAULT 0,
      bytes_processed INTEGER DEFAULT 0,
      duration_seconds INTEGER
    )
  `);

  // Backup history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS backup_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      started_at DATETIME,
      completed_at DATETIME,
      size_bytes INTEGER,
      files_transferred INTEGER
    )
  `);

  // Maintenance history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS maintenance_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_name TEXT NOT NULL,
      type TEXT NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      notes TEXT
    )
  `);

  // Arr health tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS arr_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      app_type TEXT NOT NULL,
      version TEXT,
      health_status TEXT,
      issues_count INTEGER DEFAULT 0,
      checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Arr queue statistics
  db.exec(`
    CREATE TABLE IF NOT EXISTS arr_queue_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      total_items INTEGER DEFAULT 0,
      downloading INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      total_size_gb REAL DEFAULT 0,
      checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Arr failed downloads tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS arr_failed_downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      title TEXT,
      error_message TEXT,
      failure_type TEXT,
      suggested_action TEXT,
      retried INTEGER DEFAULT 0,
      resolved INTEGER DEFAULT 0,
      failed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME
    )
  `);

  // Arr disk usage tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS arr_disk_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      path TEXT NOT NULL,
      label TEXT,
      total_gb REAL,
      free_gb REAL,
      percent_used REAL,
      checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Arr performance metrics
  db.exec(`
    CREATE TABLE IF NOT EXISTS arr_performance_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      success_rate REAL,
      avg_queue_size REAL,
      max_queue_size INTEGER,
      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Arr optimization history
  db.exec(`
    CREATE TABLE IF NOT EXISTS arr_optimizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      optimizations TEXT,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Notification history
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      alert_id INTEGER,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      error TEXT,
      FOREIGN KEY (alert_id) REFERENCES alerts(id)
    )
  `);

  // Remediation actions
  db.exec(`
    CREATE TABLE IF NOT EXISTS remediation_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      status TEXT NOT NULL,
      approved INTEGER DEFAULT 0,
      approved_by TEXT,
      executed_at DATETIME,
      result TEXT,
      error TEXT,
      FOREIGN KEY (alert_id) REFERENCES alerts(id)
    )
  `);

  // Infrastructure deployments tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS infrastructure_deployments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT NOT NULL,
      service_type TEXT,
      stack_id INTEGER,
      deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      removed_at DATETIME,
      status TEXT NOT NULL,
      docker_compose TEXT,
      env_vars TEXT,
      deployed_by TEXT
    )
  `);

  // Security status logging
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_status_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      overall_health TEXT NOT NULL,
      tunnel_healthy INTEGER DEFAULT 0,
      auth_healthy INTEGER DEFAULT 0,
      fail2ban_healthy INTEGER DEFAULT 0,
      banned_ips_count INTEGER DEFAULT 0,
      active_sessions INTEGER DEFAULT 0
    )
  `);

  // UPS metrics
  db.exec(`
    CREATE TABLE IF NOT EXISTS ups_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      on_battery INTEGER DEFAULT 0,
      battery_charge REAL,
      battery_runtime INTEGER,
      input_voltage REAL,
      output_voltage REAL,
      load REAL,
      status TEXT
    )
  `);

  // UPS events (power outages, restorations, shutdowns)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ups_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      battery_percent REAL,
      runtime_remaining INTEGER,
      details TEXT
    )
  `);

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_pool_metrics_timestamp ON pool_metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_pool_metrics_pool ON pool_metrics(pool_name);
    CREATE INDEX IF NOT EXISTS idx_smart_metrics_timestamp ON smart_metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_smart_metrics_disk ON smart_metrics(disk_name);
    CREATE INDEX IF NOT EXISTS idx_smart_metrics_disk_timestamp ON smart_metrics(disk_name, timestamp);
    CREATE INDEX IF NOT EXISTS idx_container_metrics_timestamp ON container_metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_container_metrics_name ON container_metrics(container_name);
    CREATE INDEX IF NOT EXISTS idx_container_metrics_state ON container_metrics(state);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity_triggered ON alerts(severity, triggered_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
    CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved);
    CREATE INDEX IF NOT EXISTS idx_disk_predictions_disk ON disk_predictions(disk_name);
    CREATE INDEX IF NOT EXISTS idx_disk_predictions_date ON disk_predictions(prediction_date);
    CREATE INDEX IF NOT EXISTS idx_security_findings_severity ON security_findings(severity);
    CREATE INDEX IF NOT EXISTS idx_security_findings_container ON security_findings(container);
    CREATE INDEX IF NOT EXISTS idx_security_findings_fixed ON security_findings(fixed);
    CREATE INDEX IF NOT EXISTS idx_snapshots_pool ON snapshots(pool_name);
    CREATE INDEX IF NOT EXISTS idx_snapshots_created ON snapshots(created_at);
    CREATE INDEX IF NOT EXISTS idx_snapshots_pool_created ON snapshots(pool_name, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_snapshots_deleted ON snapshots(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_scrub_pool ON scrub_history(pool_name);
    CREATE INDEX IF NOT EXISTS idx_scrub_started ON scrub_history(started_at);
    CREATE INDEX IF NOT EXISTS idx_scrub_pool_started ON scrub_history(pool_name, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_backup_job ON backup_history(job_id);
    CREATE INDEX IF NOT EXISTS idx_backup_started ON backup_history(started_at);
    CREATE INDEX IF NOT EXISTS idx_backup_status ON backup_history(status);
    CREATE INDEX IF NOT EXISTS idx_arr_health_app ON arr_health(app_name);
    CREATE INDEX IF NOT EXISTS idx_arr_health_checked ON arr_health(checked_at);
    CREATE INDEX IF NOT EXISTS idx_arr_queue_app ON arr_queue_stats(app_name);
    CREATE INDEX IF NOT EXISTS idx_arr_failed_app ON arr_failed_downloads(app_name);
    CREATE INDEX IF NOT EXISTS idx_arr_failed_resolved ON arr_failed_downloads(resolved);
    CREATE INDEX IF NOT EXISTS idx_notifications_channel ON notifications(channel);
    CREATE INDEX IF NOT EXISTS idx_notifications_sent ON notifications(sent_at);
    CREATE INDEX IF NOT EXISTS idx_remediation_alert ON remediation_actions(alert_id);
    CREATE INDEX IF NOT EXISTS idx_remediation_status ON remediation_actions(status);
    CREATE INDEX IF NOT EXISTS idx_infrastructure_service ON infrastructure_deployments(service_name);
    CREATE INDEX IF NOT EXISTS idx_infrastructure_status ON infrastructure_deployments(status);
    CREATE INDEX IF NOT EXISTS idx_security_log_timestamp ON security_status_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_ups_metrics_timestamp ON ups_metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_ups_metrics_battery ON ups_metrics(on_battery);
    CREATE INDEX IF NOT EXISTS idx_ups_events_timestamp ON ups_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_ups_events_type ON ups_events(event_type);
  `);

  logger.info('Database schema initialized successfully');
}

export function cleanOldData(db: Database.Database, daysToKeep: number = 30): void {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoff = cutoffDate.toISOString();

  logger.info(`Cleaning data older than ${daysToKeep} days (${cutoff})`);

  const tables = ['metrics', 'pool_metrics', 'smart_metrics', 'container_metrics', 'ups_metrics'];

  for (const table of tables) {
    const stmt = db.prepare(`DELETE FROM ${table} WHERE timestamp < ?`);
    const result = stmt.run(cutoff);
    logger.info(`Deleted ${result.changes} old records from ${table}`);
  }
}
