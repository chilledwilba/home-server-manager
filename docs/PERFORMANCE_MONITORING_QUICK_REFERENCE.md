# Performance Monitoring - Quick Reference

Quick commands and queries for daily performance monitoring tasks.

## Quick Start

```bash
# Start monitoring stack
cd grafana && docker-compose up -d

# View metrics
pnpm run metrics

# Access Grafana
open http://localhost:3000  # admin/admin

# Access Prometheus
open http://localhost:9090
```

## Common PromQL Queries

### HTTP Performance

```promql
# Request rate (requests/sec)
rate(home_server_http_requests_total[5m])

# p95 latency
histogram_quantile(0.95, rate(home_server_http_request_duration_seconds_bucket[5m]))

# Error rate (5xx errors)
rate(home_server_http_requests_total{status_code=~"5.."}[5m])

# Slowest routes
topk(5, histogram_quantile(0.95, rate(home_server_http_request_duration_seconds_bucket[5m])))
```

### Database Performance

```promql
# Query duration p95
histogram_quantile(0.95, rate(home_server_db_query_duration_seconds_bucket[5m]))

# Slowest tables
topk(5, histogram_quantile(0.95, rate(home_server_db_query_duration_seconds_bucket[5m]))) by (table)

# Query rate
rate(home_server_db_query_duration_seconds_count[5m])
```

### System Resources

```promql
# Memory usage percentage
home_server_nodejs_heap_size_used_bytes / home_server_nodejs_heap_size_total_bytes * 100

# GC time
rate(home_server_nodejs_gc_duration_seconds_sum[5m])

# Event loop lag
home_server_nodejs_eventloop_lag_seconds
```

### WebSocket Connections

```promql
# Total connections
home_server_websocket_connections_total{room="total"}

# Connections by room
sum by(room) (home_server_websocket_connections_total)
```

### Business Metrics

```promql
# Pool health (1=healthy, 0=degraded)
home_server_zfs_pool_health

# Running containers
sum(home_server_docker_container_status == 1)

# Active alerts by severity
sum by(severity) (home_server_active_alerts_total)

# Disk temperature
home_server_disk_temperature_celsius > 45
```

## Performance Budget Checks

```bash
# Check for budget violations
curl -s http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.state=="firing")'

# Check specific budget
curl -s "http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,rate(home_server_http_request_duration_seconds_bucket[5m]))" | jq
```

## Useful Commands

```bash
# Reload Prometheus config
curl -X POST http://localhost:9090/-/reload

# Check Prometheus health
curl http://localhost:9090/-/healthy

# Query specific metric
curl "http://localhost:9090/api/v1/query?query=up"

# Query range
curl "http://localhost:9090/api/v1/query_range?query=rate(home_server_http_requests_total[5m])&start=2024-01-01T00:00:00Z&end=2024-01-01T01:00:00Z&step=15s"

# Export dashboard
curl http://localhost:3000/api/dashboards/uid/<uid> > dashboard.json

# View Grafana logs
docker logs -f home-server-grafana

# View Prometheus logs
docker logs -f home-server-prometheus
```

## Metric Collection in Code

```typescript
// Track HTTP request (automatic via middleware)
// Already configured in src/core/middleware-initializer.ts

// Track database query
import { trackedQuery } from './db/db-metrics.js';
const result = trackedQuery(db, 'select', 'users', () => {
  return db.prepare('SELECT * FROM users').all();
});

// Track WebSocket connections (automatic)
// Already configured in src/core/socket-io.ts

// Track custom gauge
import { myGauge } from './utils/metrics.js';
myGauge.set({ label: 'value' }, 42);

// Track custom counter
import { myCounter } from './utils/metrics.js';
myCounter.inc({ label: 'value' });

// Track histogram
import { myHistogram } from './utils/metrics.js';
const start = Date.now();
// ... do work ...
myHistogram.observe((Date.now() - start) / 1000);
```

## Alert Severity Guide

| Severity | Response Time | Examples |
|----------|--------------|----------|
| **critical** | Immediate | Service down, high error rate |
| **warning** | 1-4 hours | Budget exceeded, high resource usage |
| **info** | Best effort | Approaching limits |

## Performance Targets

| Metric | Target | Budget |
|--------|--------|--------|
| HTTP p95 latency | < 500ms | 500ms |
| HTTP p99 latency | < 1s | 1s |
| DB query p95 | < 100ms | 100ms |
| Error rate | < 1% | 1% |
| Heap usage | < 90% | 90% |
| Event loop lag | < 100ms | 100ms |
| Availability | > 99.9% | 99.9% |

## Troubleshooting

| Issue | Check | Fix |
|-------|-------|-----|
| Metrics not showing | `curl http://localhost:3100/metrics` | Restart app server |
| Dashboard blank | Grafana logs | Check datasource config |
| High latency | Slow query log | Optimize queries |
| High memory | Heap snapshot | Investigate memory leaks |
| High CPU | Flame graph | Profile code |

## Quick Links

- [Full Documentation](./PERFORMANCE_MONITORING.md)
- [Prometheus](http://localhost:9090)
- [Grafana](http://localhost:3000)
- [Application Metrics](http://localhost:3100/metrics)
- [Performance Budgets](../.performance-budgets.yml)

---

**Quick Start**: `cd grafana && docker-compose up -d` → Open http://localhost:3000
