# Performance Monitoring

Comprehensive guide to performance monitoring, metrics collection, and observability in the Home Server Monitor.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Metrics Collection](#metrics-collection)
- [Grafana Dashboards](#grafana-dashboards)
- [Performance Budgets](#performance-budgets)
- [Alerting](#alerting)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

This project uses **Prometheus** for metrics collection and **Grafana** for visualization. The monitoring stack provides:

- **HTTP request metrics** - Duration, rate, errors by route
- **Database performance** - Query duration, operation rates
- **System resources** - Memory, CPU, GC stats, event loop lag
- **WebSocket connections** - Active connections by room
- **Business metrics** - ZFS pools, Docker containers, alerts, disk health
- **Error tracking** - Error rates by severity and domain

### Why Prometheus + Grafana?

- **Industry standard** - Battle-tested monitoring solution
- **Pull-based model** - Prometheus scrapes metrics from /metrics endpoint
- **Powerful querying** - PromQL for flexible metric queries
- **Beautiful dashboards** - Grafana provides rich visualizations
- **Alerting** - Built-in alert manager integration

## Quick Start

### 1. Start Monitoring Stack

```bash
# Navigate to grafana directory
cd grafana

# Start Prometheus and Grafana
docker-compose up -d

# Check services are running
docker-compose ps
```

### 2. Access Dashboards

- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090

### 3. View Application Metrics

```bash
# Check metrics endpoint
pnpm run metrics

# Or curl directly
curl http://localhost:3100/metrics
```

### 4. Import Dashboards

Dashboards are automatically provisioned from `grafana/dashboards/`:
- Application Performance
- System Health
- Database Performance
- Business Metrics

## Metrics Collection

### Available Metrics

#### HTTP Request Metrics

```
# Request duration histogram (by method, route, status_code)
home_server_http_request_duration_seconds_bucket
home_server_http_request_duration_seconds_sum
home_server_http_request_duration_seconds_count

# Request counter
home_server_http_requests_total{method, route, status_code}
```

**Example PromQL**:
```promql
# p95 latency by route
histogram_quantile(0.95, rate(home_server_http_request_duration_seconds_bucket[5m]))

# Request rate
rate(home_server_http_requests_total[5m])

# Error rate (5xx responses)
rate(home_server_http_requests_total{status_code=~"5.."}[5m])
```

#### Database Query Metrics

```
# Query duration histogram (by operation, table)
home_server_db_query_duration_seconds_bucket
home_server_db_query_duration_seconds_sum
home_server_db_query_duration_seconds_count
```

**Usage in code**:
```typescript
import { trackedQuery, trackedPrepare } from './db/db-metrics.js';

// Simple query with tracking
const users = trackedQuery(db, 'select', 'users', () => {
  return db.prepare('SELECT * FROM users WHERE active = 1').all();
});

// Prepared statement with automatic tracking
const stmt = trackedPrepare(db, 'users', 'INSERT INTO users (name) VALUES (?)');
stmt.run('John Doe');
```

#### System Resource Metrics

```
# Memory metrics (provided by prom-client default metrics)
home_server_nodejs_heap_size_total_bytes
home_server_nodejs_heap_size_used_bytes
home_server_nodejs_external_memory_bytes

# GC metrics
home_server_nodejs_gc_duration_seconds_sum
home_server_nodejs_gc_duration_seconds_count

# Event loop metrics
home_server_nodejs_eventloop_lag_seconds
home_server_nodejs_eventloop_lag_p99_seconds

# Active handles/requests
home_server_nodejs_active_handles_total
home_server_nodejs_active_requests_total
```

#### WebSocket Connection Metrics

```
# Active WebSocket connections (by room)
home_server_websocket_connections_total{room}
```

**Tracked automatically** in `src/core/socket-io.ts`

#### Business Metrics

```
# ZFS pool health
home_server_zfs_pool_health{pool_name, status}
home_server_zfs_pool_capacity_bytes{pool_name, type}

# Docker containers
home_server_docker_container_status{container_name, container_id, image, status}
home_server_docker_container_cpu_percent{container_name, container_id}
home_server_docker_container_memory_bytes{container_name, container_id, type}

# Disk metrics
home_server_disk_temperature_celsius{disk_name, pool_name}
home_server_disk_reallocated_sectors_total{disk_name, pool_name}
home_server_disk_power_on_hours_total{disk_name, pool_name}
home_server_disk_failure_prediction_score{disk_name, pool_name, risk_level}

# Alerts
home_server_active_alerts_total{severity, source}

# Service availability
home_server_service_available{service_name}
```

#### Error Metrics

```
# Error tracking (from src/utils/error-metrics.ts)
app_errors_total{code, severity, recoverable, path}
app_errors_by_severity_total{severity}
app_errors_by_domain_total{domain}
app_errors_by_recoverability_total{recoverable}
app_error_handling_duration_seconds{code, severity}
```

### Adding Custom Metrics

#### 1. Define the Metric

Add to `src/utils/metrics.ts`:

```typescript
import promClient from 'prom-client';
import { register } from './metrics.js';

export const myCustomGauge = new promClient.Gauge({
  name: 'home_server_my_custom_metric',
  help: 'Description of my custom metric',
  labelNames: ['label1', 'label2'],
  registers: [register],
});
```

#### 2. Update the Metric

```typescript
// Set a value
myCustomGauge.set({ label1: 'value1', label2: 'value2' }, 42);

// Increment/decrement
myCustomGauge.inc(); // +1
myCustomGauge.inc(5); // +5
myCustomGauge.dec(); // -1
```

#### 3. Query in Prometheus

```promql
home_server_my_custom_metric{label1="value1"}
```

### Metric Types

**Counter** - Monotonically increasing (requests, errors, etc.)
```typescript
const counter = new promClient.Counter({
  name: 'my_counter_total',
  help: 'Total number of events'
});
counter.inc();
```

**Gauge** - Can go up or down (temperature, connections, etc.)
```typescript
const gauge = new promClient.Gauge({
  name: 'my_gauge',
  help: 'Current value'
});
gauge.set(42);
gauge.inc();
gauge.dec();
```

**Histogram** - Distribution of values (latencies, sizes, etc.)
```typescript
const histogram = new promClient.Histogram({
  name: 'my_histogram_seconds',
  help: 'Distribution of durations',
  buckets: [0.001, 0.01, 0.1, 1, 10]
});
histogram.observe(0.05);
```

**Summary** - Similar to histogram, calculates percentiles
```typescript
const summary = new promClient.Summary({
  name: 'my_summary_seconds',
  help: 'Summary of durations',
  percentiles: [0.5, 0.9, 0.99]
});
summary.observe(0.05);
```

## Grafana Dashboards

### Included Dashboards

#### 1. Application Performance
**Location**: `grafana/dashboards/application-performance.json`

**Panels**:
- HTTP Request Rate
- HTTP Request Duration (p95)
- HTTP Requests by Status Code
- HTTP Request Duration Percentiles (p50, p90, p95, p99)
- Error Rate
- Active WebSocket Connections

#### 2. System Health
**Location**: `grafana/dashboards/system-health.json`

**Panels**:
- Process Memory Usage
- GC Duration
- Event Loop Lag
- Active Handles and Requests
- Service Availability
- Active Alerts

#### 3. Database Performance
**Location**: `grafana/dashboards/database-performance.json`

**Panels**:
- Database Query Duration (p95)
- Query Rate by Operation
- Query Duration by Table
- Query Duration Percentiles
- Slowest Operations

#### 4. Business Metrics
**Location**: `grafana/dashboards/business-metrics.json`

**Panels**:
- ZFS Pool Health
- Docker Container Status
- Active Alerts by Severity
- ZFS Pool Capacity
- Container Resource Usage
- Disk Temperature
- Disk Health Indicators

### Creating Custom Dashboards

1. **Open Grafana**: http://localhost:3000
2. **Create New Dashboard**: Click "+" → "Dashboard"
3. **Add Panel**: Click "Add panel"
4. **Write PromQL Query**:
   ```promql
   rate(home_server_http_requests_total[5m])
   ```
5. **Configure Visualization**: Choose graph type, axes, legend
6. **Save Dashboard**: Give it a name and save

### Exporting Dashboards

```bash
# Export dashboard JSON
curl http://localhost:3000/api/dashboards/uid/<dashboard-uid> > my-dashboard.json

# Import into repository
cp my-dashboard.json grafana/dashboards/
```

## Performance Budgets

Performance budgets define acceptable performance thresholds. They are configured in `.performance-budgets.yml`.

### Budget Categories

#### HTTP Request Budgets
- **p95 duration**: 500ms
- **p99 duration**: 1s
- **Max error rate**: 1%

#### Database Query Budgets
- **p95 duration**: 100ms
- **p99 duration**: 500ms
- **Transaction p95**: 200ms

#### Resource Budgets
- **Max heap usage**: 90%
- **Max event loop lag**: 100ms
- **Max active handles**: 1000
- **Max GC pause**: 50ms

#### WebSocket Budgets
- **Max total connections**: 1000
- **Max per room**: 200

#### Business Budgets
- **Service availability**: 99.9%
- **Alert acknowledgment time**: 5m
- **Data staleness**: 1m

### Budget Alerts

Alerts are configured in `grafana/alerts.yml`:

```yaml
- alert: HTTPRequestDurationBudgetExceeded
  expr: |
    histogram_quantile(0.95,
      rate(home_server_http_request_duration_seconds_bucket[5m])
    ) > 0.5
  for: 5m
  labels:
    severity: warning
```

View alerts in Prometheus: http://localhost:9090/alerts

### Validating Budgets

```bash
# Check if any budgets are being exceeded
curl http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.state=="firing")'
```

## Alerting

### Alert Rules

Alerts are defined in `grafana/alerts.yml` and loaded by Prometheus.

**Example alert**:
```yaml
groups:
  - name: performance_budgets
    interval: 30s
    rules:
      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(home_server_http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High request latency detected"
          description: "p95 latency is {{ $value }}s"
```

### Alert Severity Levels

- **critical** - Immediate action required (service down, high error rate)
- **warning** - Needs attention (budget exceeded, high resource usage)
- **info** - Informational (approaching limits)

### Configuring Alert Notifications

1. **Configure Alertmanager** (optional):
   ```yaml
   # alertmanager.yml
   route:
     receiver: 'slack'

   receivers:
     - name: 'slack'
       slack_configs:
         - api_url: 'https://hooks.slack.com/...'
           channel: '#alerts'
   ```

2. **Add to docker-compose.yml**:
   ```yaml
   alertmanager:
     image: prom/alertmanager:latest
     ports:
       - "9093:9093"
     volumes:
       - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml
   ```

## Best Practices

### 1. Label Cardinality

**DO**:
```typescript
// Low cardinality labels (finite values)
httpRequestCounter.labels('GET', '/api/users', '200').inc();
```

**DON'T**:
```typescript
// High cardinality labels (infinite values)
httpRequestCounter.labels('GET', '/api/users/12345', '200').inc(); // ❌ User ID changes
```

### 2. Metric Naming

Follow Prometheus naming conventions:
- Use `_total` suffix for counters
- Use `_seconds` or `_bytes` for units
- Use `snake_case`
- Be descriptive

```typescript
// Good
home_server_http_requests_total
home_server_http_request_duration_seconds

// Bad
httpReqs
request_time
```

### 3. Histogram Buckets

Choose buckets that match your SLA:

```typescript
// HTTP requests (milliseconds to seconds)
buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]

// Database queries (sub-millisecond to seconds)
buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
```

### 4. Monitoring Overhead

- Keep metric count reasonable (< 10,000 time series)
- Use appropriate scrape intervals (15s default)
- Avoid high-cardinality labels
- Clean up unused metrics

### 5. Dashboard Organization

- Group related metrics together
- Use consistent color schemes
- Add units to axes
- Include descriptions
- Set appropriate time ranges

### 6. Alert Fatigue

- Set appropriate thresholds
- Use `for` duration to avoid flapping
- Group related alerts
- Prioritize by severity
- Include actionable information in annotations

## Troubleshooting

### Metrics Not Appearing

**Check /metrics endpoint**:
```bash
curl http://localhost:3100/metrics | grep home_server
```

**Verify Prometheus can scrape**:
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets | jq
```

**Check Prometheus logs**:
```bash
docker logs home-server-prometheus
```

### High Memory Usage

**Check metric cardinality**:
```promql
# Count time series
count({__name__=~".+"})

# Find high-cardinality metrics
topk(10, count by(__name__)({__name__=~".+"}))
```

**Reduce retention**:
```bash
# In docker-compose.yml, add to Prometheus command
--storage.tsdb.retention.time=30d
```

### Slow Queries

**Enable query logging in Prometheus**:
```bash
# Add to prometheus command
--query.log-file=/prometheus/query.log
```

**Optimize queries**:
```promql
# Slow - calculates over full range
rate(home_server_http_requests_total[1h])

# Faster - smaller range
rate(home_server_http_requests_total[5m])
```

### Dashboard Not Loading

**Check Grafana logs**:
```bash
docker logs home-server-grafana
```

**Verify datasource**:
- Go to Configuration → Data Sources
- Test connection to Prometheus

**Check dashboard JSON**:
```bash
# Validate JSON syntax
cat grafana/dashboards/application-performance.json | jq
```

### Missing Metrics After Restart

**Persistent storage**:
Ensure volumes are configured in docker-compose.yml:
```yaml
volumes:
  - prometheus-data:/prometheus
  - grafana-data:/var/lib/grafana
```

**Backup retention**:
```bash
# Back up Prometheus data
docker cp home-server-prometheus:/prometheus ./prometheus-backup

# Restore
docker cp ./prometheus-backup home-server-prometheus:/prometheus
```

## Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Cheat Sheet](https://promlabs.com/promql-cheat-sheet/)
- [prom-client Documentation](https://github.com/siimon/prom-client)
- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)

## Support

For issues or questions:
1. Check Prometheus/Grafana logs
2. Review [Troubleshooting](#troubleshooting) section
3. Search [Prometheus Discussions](https://github.com/prometheus/prometheus/discussions)
4. File issue in project repository

---

**Last Updated**: 2025-11-16
**Maintained by**: Home Server Monitor Team
