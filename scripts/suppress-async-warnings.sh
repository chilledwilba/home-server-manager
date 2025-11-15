#!/bin/bash
# Add eslint-disable comments for async handlers that don't use await
# These are intentionally async for interface consistency

FILES=(
  "src/routes/zfs.ts"
  "src/routes/ups.ts"
  "src/routes/security/scanner.ts"
  "src/routes/security/fail2ban.ts"
  "src/routes/notifications.ts"
  "src/routes/remediation.ts"
  "src/routes/infrastructure/management.ts"
  "src/routes/monitoring.ts"
  "src/mcp/server.ts"
  "src/services/ai/insights-service.ts"
  "src/services/arr/arr-optimizer.ts"
  "src/services/arr/metrics-calculator.ts"
  "src/services/monitoring/disk-predictor.ts"
  "src/services/remediation/auto-remediation.ts"
  "src/services/security/scanner.ts"
  "src/services/ups/ups-monitor.ts"
  "src/services/zfs/assistant.ts"
  "src/services/zfs/manager.ts"
  "src/services/zfs/scrub-scheduler.ts"
  "src/services/zfs/snapshot-manager.ts"
)

echo "Note: This approach adds disable comments, but manually removing async is preferred."
echo "Skipping for now - will handle remaining warnings through Quick Wins instead."
