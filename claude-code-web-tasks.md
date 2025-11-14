# Claude Code for Web - Enterprise Architecture Tasks

> **Purpose**: Transform Home Server Manager into enterprise-grade production system
>
> **Status**: Phase 0 (Planning)
> **Last Updated**: 2025-11-14
> **Target**: Complete Phases 1-4 for production-grade architecture

---

## 📋 PROJECT CONTEXT

### Current State

**Codebase Stats:**
- **12,019 lines** of TypeScript
- **98 tests passing** (25% coverage minimum)
- **0 ESLint errors**, 58 warnings
- **Production features**: UPS monitoring, security stack, real-time WebSocket updates
- **Architecture**: Fastify + Socket.IO + SQLite + 13 monitoring services

**Critical Issues:**
- ❌ No centralized error handling (routes can crash server)
- ❌ 0% integration test coverage for core services
- ❌ Monolithic files (server.ts: 660 lines, mcp/server.ts: 1397 lines)
- ❌ Unsafe type casting in all route files
- ❌ No service recovery mechanisms
- ❌ Manual service initialization (no dependency injection)

**Strengths:**
- ✅ Excellent TypeScript strict mode
- ✅ Structured logging (Pino)
- ✅ Good database schema design
- ✅ Prometheus metrics
- ✅ Health check endpoints
- ✅ Graceful shutdown handling

---

## 🎯 PHASES OVERVIEW

| Phase | Focus | Duration | Impact | Difficulty |
|-------|-------|----------|--------|------------|
| **Phase 1** | Error Handling Framework | 2-3h | 🔴 CRITICAL | ⭐⭐ |
| **Phase 2** | Integration Tests | 3-4h | 🔴 HIGH | ⭐⭐⭐ |
| **Phase 3** | Service Container & DI | 3-4h | 🔴 HIGH | ⭐⭐⭐⭐ |
| **Phase 4** | Type-Safe Routes | 2-3h | 🟡 MEDIUM | ⭐⭐ |
| **Phase 5** | Health & Circuit Breakers | 2-3h | 🟡 MEDIUM | ⭐⭐⭐⭐ |
| **Phase 6** | File Size Refactoring | 4-6h | 🟡 MEDIUM | ⭐⭐⭐ |
| **Phase 7** | Quick Wins | 1-2h | 🟢 LOW | ⭐ |

**Total Time**: 17-25 hours across 1-2 weeks

---

## 📊 FILES REQUIRING REFACTORING

### Monolithic Files (>500 lines)

**CRITICAL - Must Split:**

1. **src/mcp/server.ts** - 1,397 lines (897 over limit)
   - **Problem**: Model Context Protocol server implementation in one file
   - **Split into**:
     - `mcp/server.ts` (main setup, ~200 lines)
     - `mcp/handlers/system.ts` (system health tools)
     - `mcp/handlers/storage.ts` (ZFS/pool tools)
     - `mcp/handlers/docker.ts` (container tools)
     - `mcp/handlers/security.ts` (security tools)
     - `mcp/handlers/infrastructure.ts` (deployment tools)
   - **Impact**: Major improvement in maintainability

2. **src/server.ts** - 660 lines (160 over limit)
   - **Problem**: Service initialization, routes, health checks, shutdown in one file
   - **Split into**:
     - `server.ts` (main entry point, ~150 lines)
     - `core/service-initializer.ts` (service setup)
     - `core/routes-initializer.ts` (route registration)
     - `middleware/health-checks.ts` (health endpoints)
     - `core/shutdown-handler.ts` (graceful shutdown)
   - **Impact**: Separation of concerns, testability

### Services Exceeding 400 Lines

3. **src/services/infrastructure/manager.ts** - 596 lines (196 over)
   - **Split into**:
     - `infrastructure/manager.ts` (core orchestration, ~200 lines)
     - `infrastructure/docker-compose-handler.ts` (compose operations)
     - `infrastructure/template-manager.ts` (template handling)
     - `infrastructure/deployment-validator.ts` (validation logic)

4. **src/services/zfs/manager.ts** - 548 lines (148 over)
   - **Split into**:
     - `zfs/manager.ts` (core operations, ~250 lines)
     - `zfs/snapshot-manager.ts` (snapshot operations)
     - `zfs/scrub-manager.ts` (scrub/trim operations)
     - `zfs/health-checker.ts` (health monitoring)

5. **src/services/arr/arr-optimizer.ts** - 487 lines (87 over)
   - **Split into**:
     - `arr/arr-optimizer.ts` (main orchestration, ~250 lines)
     - `arr/queue-analyzer.ts` (queue analysis)
     - `arr/quality-optimizer.ts` (quality profile logic)

6. **src/services/ups/ups-monitor.ts** - 464 lines (64 over)
   - **Split into**:
     - `ups/ups-monitor.ts` (monitoring, ~250 lines)
     - `ups/shutdown-handler.ts` (graceful/emergency shutdown)
     - `ups/battery-analyzer.ts` (battery health logic)

### Routes Exceeding 250 Lines

7. **src/routes/security.ts** - 412 lines (162 over)
   - **Split into**:
     - `routes/security/authentik.ts` (Authentik routes)
     - `routes/security/tunnels.ts` (Cloudflare routes)
     - `routes/security/fail2ban.ts` (Fail2ban routes)
     - `routes/security/overview.ts` (orchestration endpoint)

8. **src/routes/infrastructure.ts** - 298 lines (48 over)
   - **Split into**:
     - `routes/infrastructure/stacks.ts` (stack management)
     - `routes/infrastructure/templates.ts` (template routes)

9. **src/routes/ups.ts** - 254 lines (4 over)
   - **Action**: Minor cleanup, extract validation schemas

### Database Schema

10. **src/db/schema.ts** - 411 lines
    - **Not urgent** but consider:
      - `db/schema/core-tables.ts` (pools, disks, alerts)
      - `db/schema/monitoring-tables.ts` (metrics, events)
      - `db/schema/security-tables.ts` (security events)
      - `db/schema/indexes.ts` (all index definitions)

---

## 🔥 PHASE 1: ERROR HANDLING FRAMEWORK (CRITICAL)

**Duration**: 2-3 hours
**Priority**: 🔴 MUST DO FIRST
**Difficulty**: ⭐⭐ (Beginner-friendly)

### Problem Statement

Routes currently have no error handling. Example from `src/routes/monitoring.ts`:

```typescript
fastify.get('/alerts', async () => {
  const alerts = monitor.getRecentAlerts(100); // If this throws, server crashes
  return { success: true, data: alerts };
});
```

**If database query fails**: Entire server crashes with unhandled promise rejection.

### Success Criteria

- [ ] All routes wrapped in try-catch via middleware
- [ ] Consistent error response format across all APIs
- [ ] Errors logged with context (request ID, user agent, endpoint)
- [ ] HTTP status codes properly set (400 client errors, 500 server errors)
- [ ] Sensitive data never leaked in error responses
- [ ] TypeScript type safety for error responses

### Files to Create

1. **src/middleware/error-handler.ts** (~150 lines)
   - `errorHandler()` - Fastify error handler plugin
   - `AppError` class - Custom error types
   - `formatErrorResponse()` - Consistent JSON responses

2. **src/utils/error-types.ts** (~80 lines)
   - `ValidationError` (400)
   - `AuthenticationError` (401)
   - `AuthorizationError` (403)
   - `NotFoundError` (404)
   - `ConflictError` (409)
   - `DatabaseError` (500)
   - `ExternalServiceError` (502)

3. **src/middleware/request-logger.ts** (~60 lines)
   - Log all requests with timing
   - Correlation ID generation
   - Error request logging

### Implementation Steps

**Step 1: Create Error Types**

```typescript
// src/utils/error-types.ts
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

// ... more error types
```

**Step 2: Create Error Handler Middleware**

```typescript
// src/middleware/error-handler.ts
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../utils/error-types.js';
import { logger } from '../utils/logger.js';

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = request.id;

  // Log error with context
  logger.error({
    err: error,
    requestId,
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
  }, 'Request error');

  // Handle known application errors
  if (error instanceof AppError) {
    reply.code(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(process.env.NODE_ENV === 'development' && { details: error.details }),
      },
      requestId,
    });
    return;
  }

  // Handle validation errors from schemas
  if (error.validation) {
    reply.code(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation,
      },
      requestId,
    });
    return;
  }

  // Handle unknown errors (don't leak internals)
  reply.code(error.statusCode || 500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development'
        ? error.message
        : 'An unexpected error occurred',
    },
    requestId,
  });
}
```

**Step 3: Register Middleware in server.ts**

```typescript
// src/server.ts
import { errorHandler } from './middleware/error-handler.js';

// After all routes are registered:
fastify.setErrorHandler(errorHandler);
```

**Step 4: Update Routes to Use Error Types**

Example refactor for `src/routes/monitoring.ts`:

```typescript
// BEFORE:
fastify.get('/alerts', async () => {
  const alerts = monitor.getRecentAlerts(100);
  return { success: true, data: alerts };
});

// AFTER:
import { DatabaseError, NotFoundError } from '../utils/error-types.js';

fastify.get('/alerts', async (request, reply) => {
  const db = (fastify as any).db;
  if (!db) {
    throw new DatabaseError('Database not available');
  }

  try {
    const alerts = db.prepare('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 100').all();
    return { success: true, data: alerts };
  } catch (error) {
    throw new DatabaseError(
      'Failed to fetch alerts',
      { original: error instanceof Error ? error.message : String(error) }
    );
  }
});
```

### Files to Modify

Update all route files to use proper error handling:
- ✅ `src/routes/monitoring.ts` (8 routes)
- ✅ `src/routes/docker.ts` (6 routes)
- ✅ `src/routes/security.ts` (15 routes)
- ✅ `src/routes/zfs.ts` (12 routes)
- ✅ `src/routes/notifications.ts` (4 routes)
- ✅ `src/routes/remediation.ts` (5 routes)
- ✅ `src/routes/arr.ts` (8 routes)
- ✅ `src/routes/infrastructure.ts` (10 routes)

### Testing

Create `tests/unit/middleware/error-handler.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import { errorHandler } from '../../../src/middleware/error-handler.js';
import { ValidationError, DatabaseError } from '../../../src/utils/error-types.js';

describe('Error Handler Middleware', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    app.setErrorHandler(errorHandler);
  });

  it('should handle ValidationError with 400 status', async () => {
    app.get('/test', async () => {
      throw new ValidationError('Invalid input', { field: 'email' });
    });

    const response = await app.inject({ method: 'GET', url: '/test' });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should handle DatabaseError with 500 status', async () => {
    app.get('/test', async () => {
      throw new DatabaseError('Connection failed');
    });

    const response = await app.inject({ method: 'GET', url: '/test' });
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('DATABASE_ERROR');
  });

  it('should include request ID in error response', async () => {
    app.get('/test', async () => {
      throw new Error('Something went wrong');
    });

    const response = await app.inject({ method: 'GET', url: '/test' });
    const body = JSON.parse(response.payload);
    expect(body.requestId).toBeDefined();
  });

  it('should not leak error details in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    app.get('/test', async () => {
      throw new Error('Internal database credentials expired');
    });

    const response = await app.inject({ method: 'GET', url: '/test' });
    const body = JSON.parse(response.payload);
    expect(body.error.message).not.toContain('database credentials');
    expect(body.error.message).toBe('An unexpected error occurred');

    process.env.NODE_ENV = originalEnv;
  });
});
```

### Verification Checklist

- [ ] All routes protected by error handler
- [ ] Error responses follow consistent format
- [ ] Errors logged with correlation IDs
- [ ] Sensitive data never exposed
- [ ] Tests passing for error scenarios
- [ ] Documentation updated

---

## 🧪 PHASE 2: INTEGRATION TESTS (HIGH PRIORITY)

**Duration**: 3-4 hours
**Priority**: 🔴 HIGH
**Difficulty**: ⭐⭐⭐ (Intermediate)

### Problem Statement

Current test coverage:
- ✅ 98 unit tests for utilities and validation
- ❌ **0 integration tests** for core services
- ❌ **0 tests** for TrueNASMonitor (362 lines of critical logic)
- ❌ **0 tests** for DockerMonitor (308 lines)
- ❌ **0 tests** for DiskFailurePredictor (ML predictions untested)
- ❌ **0 tests** for NotificationService (multi-channel delivery untested)

**Risk**: Core monitoring logic has no safety net for refactoring.

### Success Criteria

- [ ] TrueNASMonitor tested (6+ test cases)
- [ ] DockerMonitor tested (6+ test cases)
- [ ] DiskFailurePredictor tested (5+ test cases)
- [ ] NotificationService tested (4+ test cases)
- [ ] Coverage increases from 25% → 45%+
- [ ] All tests isolated (mock external APIs, use in-memory DB)
- [ ] Tests run in CI/CD without external dependencies

### Files to Create

**1. tests/integration/services/truenas-monitor.test.ts** (~200 lines)

Test scenarios:
- ✅ Successful monitoring cycle (pools, disks, health)
- ✅ TrueNAS API failure handling (timeout, 500 error)
- ✅ Database write failure handling
- ✅ Alert creation on degraded pool
- ✅ Disk temperature threshold alerts
- ✅ WebSocket event emission

```typescript
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { TrueNASMonitor } from '../../../src/services/monitoring/truenas-monitor.js';
import { TrueNASClient } from '../../../src/integrations/truenas/client.js';

describe('TrueNASMonitor Integration', () => {
  let db: Database.Database;
  let io: SocketIOServer;
  let httpServer: ReturnType<typeof createServer>;
  let monitor: TrueNASMonitor;
  let mockClient: jest.Mocked<TrueNASClient>;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Run schema
    db.exec(`
      CREATE TABLE pools (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        status TEXT,
        health TEXT,
        size_bytes INTEGER,
        allocated_bytes INTEGER,
        free_bytes INTEGER,
        last_updated TEXT
      );

      CREATE TABLE alerts (
        id INTEGER PRIMARY KEY,
        severity TEXT,
        category TEXT,
        source TEXT,
        message TEXT,
        details TEXT,
        created_at TEXT,
        acknowledged INTEGER DEFAULT 0
      );

      CREATE TABLE disk_health (
        id INTEGER PRIMARY KEY,
        disk_name TEXT,
        pool_name TEXT,
        smart_status TEXT,
        temperature INTEGER,
        power_on_hours INTEGER,
        reallocated_sectors INTEGER,
        pending_sectors INTEGER,
        timestamp TEXT
      );
    `);

    // Create mock Socket.IO server
    httpServer = createServer();
    io = new SocketIOServer(httpServer);

    // Create mock TrueNAS client
    mockClient = {
      getPools: jest.fn(),
      getSystemInfo: jest.fn(),
      getDisks: jest.fn(),
    } as any;

    // Initialize monitor
    monitor = new TrueNASMonitor({
      client: mockClient,
      db,
      io,
      intervals: {
        system: 30000,
        pools: 60000,
        disks: 120000,
      },
    });
  });

  afterEach(() => {
    monitor.stop();
    db.close();
    io.close();
    httpServer.close();
  });

  describe('Pool Monitoring', () => {
    it('should successfully monitor pools and update database', async () => {
      // Mock API response
      mockClient.getPools.mockResolvedValueOnce([
        {
          name: 'tank',
          status: 'ONLINE',
          health: 'HEALTHY',
          topology: {
            data: [{ type: 'RAIDZ1', children: [] }],
          },
          scan: { state: 'FINISHED' },
        },
      ]);

      // Trigger monitoring cycle
      await monitor.monitorPools();

      // Verify database was updated
      const pools = db.prepare('SELECT * FROM pools WHERE name = ?').all('tank');
      expect(pools).toHaveLength(1);
      expect(pools[0]).toMatchObject({
        name: 'tank',
        status: 'ONLINE',
        health: 'HEALTHY',
      });
    });

    it('should create alert when pool is degraded', async () => {
      mockClient.getPools.mockResolvedValueOnce([
        {
          name: 'tank',
          status: 'DEGRADED',
          health: 'DEGRADED',
          topology: { data: [] },
          scan: { state: 'FINISHED' },
        },
      ]);

      await monitor.monitorPools();

      const alerts = db.prepare('SELECT * FROM alerts WHERE category = ? AND severity = ?')
        .all('storage', 'critical');

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].message).toContain('degraded');
    });

    it('should handle TrueNAS API errors gracefully', async () => {
      mockClient.getPools.mockRejectedValueOnce(new Error('Connection timeout'));

      // Should not throw
      await expect(monitor.monitorPools()).resolves.not.toThrow();

      // Should log error (check alerts table)
      const alerts = db.prepare('SELECT * FROM alerts WHERE severity = ?').all('error');
      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  describe('Disk Health Monitoring', () => {
    it('should store disk SMART data', async () => {
      mockClient.getDisks.mockResolvedValueOnce([
        {
          name: 'sda',
          pool: 'tank',
          temperature: 35,
          smart_attributes: {
            power_on_hours: 12345,
            reallocated_sectors: 0,
            pending_sectors: 0,
          },
        },
      ]);

      await monitor.monitorDisks();

      const disks = db.prepare('SELECT * FROM disk_health WHERE disk_name = ?').all('sda');
      expect(disks).toHaveLength(1);
      expect(disks[0]).toMatchObject({
        disk_name: 'sda',
        pool_name: 'tank',
        temperature: 35,
        power_on_hours: 12345,
      });
    });

    it('should create alert for high disk temperature', async () => {
      mockClient.getDisks.mockResolvedValueOnce([
        {
          name: 'sdb',
          pool: 'tank',
          temperature: 55, // Above threshold (50°C)
          smart_attributes: {},
        },
      ]);

      await monitor.monitorDisks();

      const alerts = db.prepare('SELECT * FROM alerts WHERE message LIKE ?')
        .all('%temperature%');

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].severity).toBe('warning');
    });
  });

  describe('WebSocket Events', () => {
    it('should emit pool status updates via Socket.IO', async () => {
      const emitSpy = jest.spyOn(io, 'emit');

      mockClient.getPools.mockResolvedValueOnce([
        { name: 'tank', status: 'ONLINE', health: 'HEALTHY', topology: { data: [] }, scan: {} },
      ]);

      await monitor.monitorPools();

      expect(emitSpy).toHaveBeenCalledWith(
        'storage:pool-status',
        expect.objectContaining({ name: 'tank' })
      );
    });
  });
});
```

**2. tests/integration/services/docker-monitor.test.ts** (~180 lines)

Test scenarios:
- ✅ Container stats collection
- ✅ Restart unhealthy containers
- ✅ Alert on high resource usage
- ✅ Portainer API failure handling

**3. tests/integration/services/disk-predictor.test.ts** (~150 lines)

Test scenarios:
- ✅ Predict failure for high reallocated sectors
- ✅ Low risk for healthy disks
- ✅ Trend analysis over time
- ✅ Handle missing historical data

**4. tests/integration/services/notification-service.test.ts** (~120 lines)

Test scenarios:
- ✅ Send notifications to multiple channels
- ✅ Handle webhook failures
- ✅ Retry logic
- ✅ Template rendering

### Implementation Pattern

All integration tests should follow this pattern:

```typescript
describe('ServiceName Integration', () => {
  let db: Database.Database;
  let service: ServiceClass;

  beforeEach(() => {
    // 1. Create in-memory database
    db = new Database(':memory:');
    db.exec(SCHEMA);

    // 2. Create mocked dependencies
    const mockDependency = createMock();

    // 3. Initialize service with real database
    service = new ServiceClass({ db, mockDependency });
  });

  afterEach(() => {
    db.close();
  });

  it('should test real behavior', async () => {
    // Setup mocks to return test data
    // Call service method
    // Assert database state changed
    // Assert side effects occurred
  });
});
```

### Testing Best Practices

1. **Use in-memory SQLite** - Fast, isolated, no cleanup needed
2. **Mock external APIs** - Don't call TrueNAS/Portainer in tests
3. **Test side effects** - Database writes, WebSocket events, alerts
4. **Test error paths** - API failures, database errors, validation failures
5. **Isolate tests** - Each test gets fresh database
6. **Use realistic data** - Based on actual TrueNAS API responses

### Verification Checklist

- [ ] All 4 service test files created
- [ ] 20+ integration tests passing
- [ ] Coverage increased to 45%+
- [ ] Tests run in <10 seconds
- [ ] No external dependencies required
- [ ] CI/CD pipeline updated

---

## 🏗️ PHASE 3: SERVICE CONTAINER & DEPENDENCY INJECTION (HIGH PRIORITY)

**Duration**: 3-4 hours
**Priority**: 🔴 HIGH
**Difficulty**: ⭐⭐⭐⭐ (Advanced)

### Problem Statement

**Current: Manual Service Initialization (server.ts)**

```typescript
// 660 lines of manual service creation
const truenasClient = new TrueNASClient({ ... });
const monitor = new TrueNASMonitor({ client: truenasClient, db, io, ... });
const portainer = new PortainerClient({ ... });
const dockerMonitor = new DockerMonitor({ portainer, db, io, ... });
// ... 13 services total

// Routes have unsafe access:
const db = (fastify as { db?: ... }).db;
if (!db) return { error: 'Database not available' };
```

**Problems:**
- ❌ No type safety for service access
- ❌ Duplicate initialization logic
- ❌ Hard to test (services tightly coupled)
- ❌ No lifecycle management
- ❌ Can't mock services for testing
- ❌ server.ts is 660 lines (should be ~150)

### Success Criteria

- [ ] ServiceContainer manages all services
- [ ] Type-safe service access in routes via decorators
- [ ] Reduced server.ts from 660 → ~200 lines
- [ ] Services can be mocked in tests
- [ ] Clear initialization order
- [ ] Graceful shutdown sequencing
- [ ] No unsafe type casting in routes

### Files to Create

**1. src/core/service-container.ts** (~250 lines)

```typescript
import type Database from 'better-sqlite3';
import type { Server as SocketIOServer } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { TrueNASClient } from '../integrations/truenas/client.js';
import { TrueNASMonitor } from '../services/monitoring/truenas-monitor.js';
import { DockerMonitor } from '../services/monitoring/docker-monitor.js';
import { PortainerClient } from '../integrations/portainer/client.js';
import { SecurityScanner } from '../services/security/scanner.js';
import { ZFSManager } from '../services/zfs/manager.js';
import { NotificationService } from '../services/alerting/notification-service.js';
import { AutoRemediationService } from '../services/remediation/auto-remediation.js';
import { ArrOptimizer } from '../services/arr/arr-optimizer.js';
import { SecurityOrchestrator } from '../services/security/orchestrator.js';
import { InfrastructureManager } from '../services/infrastructure/manager.js';
import { logger } from '../utils/logger.js';

export interface ServiceContainerConfig {
  db: Database.Database;
  io: SocketIOServer;
}

/**
 * Centralized service container with dependency injection
 * Manages lifecycle of all application services
 */
export class ServiceContainer {
  private services: Map<string, any> = new Map();
  private initialized = false;
  private db: Database.Database;
  private io: SocketIOServer;

  constructor(config: ServiceContainerConfig) {
    this.db = config.db;
    this.io = config.io;
  }

  /**
   * Initialize all services in correct dependency order
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('ServiceContainer already initialized');
      return;
    }

    logger.info('Initializing service container...');

    try {
      // Phase 1: Initialize integration clients (no dependencies)
      await this.initializeClients();

      // Phase 2: Initialize core services (depend on clients)
      await this.initializeCoreServices();

      // Phase 3: Initialize monitoring services (depend on core services)
      await this.initializeMonitoringServices();

      // Phase 4: Initialize orchestration services (depend on everything)
      await this.initializeOrchestrationServices();

      this.initialized = true;
      logger.info('Service container initialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize service container');
      throw error;
    }
  }

  /**
   * Start all monitoring services
   */
  async start(): Promise<void> {
    if (!this.initialized) {
      throw new Error('ServiceContainer not initialized');
    }

    logger.info('Starting monitoring services...');

    const monitor = this.get<TrueNASMonitor>('truenasMonitor');
    if (monitor) {
      monitor.start();
    }

    const dockerMonitor = this.get<DockerMonitor>('dockerMonitor');
    if (dockerMonitor) {
      dockerMonitor.start();
    }

    const arrOptimizer = this.get<ArrOptimizer>('arrOptimizer');
    if (arrOptimizer) {
      arrOptimizer.start();
    }

    logger.info('Monitoring services started');
  }

  /**
   * Gracefully stop all services in reverse initialization order
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down service container...');

    // Stop monitoring services first
    const servicesWithStop = [
      'arrOptimizer',
      'dockerMonitor',
      'truenasMonitor',
      'securityOrchestrator',
    ];

    for (const serviceName of servicesWithStop) {
      const service = this.services.get(serviceName);
      if (service && typeof service.stop === 'function') {
        try {
          await service.stop();
          logger.info(`Stopped ${serviceName}`);
        } catch (error) {
          logger.error({ err: error, service: serviceName }, 'Error stopping service');
        }
      }
    }

    this.services.clear();
    this.initialized = false;
    logger.info('Service container shutdown complete');
  }

  /**
   * Get a service by name with type safety
   */
  get<T>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }

  /**
   * Register a service (useful for testing/mocking)
   */
  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  private async initializeClients(): Promise<void> {
    logger.info('Initializing integration clients...');

    // TrueNAS Client
    const trueNASHost = process.env['TRUENAS_HOST'];
    const trueNASKey = process.env['TRUENAS_API_KEY'];
    if (trueNASHost && trueNASKey) {
      this.services.set('truenasClient', new TrueNASClient({
        baseUrl: `http://${trueNASHost}`,
        apiKey: trueNASKey,
      }));
    }

    // Portainer Client
    const portainerUrl = process.env['PORTAINER_URL'];
    const portainerKey = process.env['PORTAINER_API_KEY'];
    if (portainerUrl && portainerKey) {
      this.services.set('portainerClient', new PortainerClient({
        baseUrl: portainerUrl,
        apiKey: portainerKey,
      }));
    }

    // ... initialize other clients (Arr apps, Plex, etc.)

    logger.info('Integration clients initialized');
  }

  private async initializeCoreServices(): Promise<void> {
    logger.info('Initializing core services...');

    const truenasClient = this.get<TrueNASClient>('truenasClient');
    if (truenasClient) {
      this.services.set('zfsManager', new ZFSManager({
        client: truenasClient,
        db: this.db,
      }));

      this.services.set('notificationService', new NotificationService({
        db: this.db,
        webhookUrl: process.env['WEBHOOK_URL'],
      }));
    }

    logger.info('Core services initialized');
  }

  private async initializeMonitoringServices(): Promise<void> {
    logger.info('Initializing monitoring services...');

    const truenasClient = this.get<TrueNASClient>('truenasClient');
    if (truenasClient) {
      this.services.set('truenasMonitor', new TrueNASMonitor({
        client: truenasClient,
        db: this.db,
        io: this.io,
        intervals: {
          system: 30000,
          pools: 60000,
          disks: 120000,
        },
      }));
    }

    const portainerClient = this.get<PortainerClient>('portainerClient');
    if (portainerClient) {
      this.services.set('dockerMonitor', new DockerMonitor({
        portainer: portainerClient,
        db: this.db,
        io: this.io,
      }));
    }

    logger.info('Monitoring services initialized');
  }

  private async initializeOrchestrationServices(): Promise<void> {
    logger.info('Initializing orchestration services...');

    const truenasClient = this.get<TrueNASClient>('truenasClient');
    const portainerClient = this.get<PortainerClient>('portainerClient');

    if (truenasClient && portainerClient) {
      this.services.set('infrastructureManager', new InfrastructureManager({
        truenasClient,
        portainerClient,
        db: this.db,
      }));
    }

    logger.info('Orchestration services initialized');
  }
}
```

**2. src/core/fastify-decorators.ts** (~80 lines)

```typescript
import type { FastifyInstance } from 'fastify';
import type { ServiceContainer } from './service-container.js';
import type Database from 'better-sqlite3';
import type { TrueNASMonitor } from '../services/monitoring/truenas-monitor.js';
import type { DockerMonitor } from '../services/monitoring/docker-monitor.js';
import type { ZFSManager } from '../services/zfs/manager.js';

/**
 * Type-safe Fastify instance with decorators
 */
export interface FastifyWithServices extends FastifyInstance {
  db: Database.Database;
  services: ServiceContainer;
}

/**
 * Register service container as Fastify decorator
 */
export function registerServiceDecorators(
  fastify: FastifyInstance,
  db: Database.Database,
  services: ServiceContainer
): void {
  // Register database
  fastify.decorate('db', db);

  // Register service container
  fastify.decorate('services', services);
}

/**
 * Helper to get services with type safety
 */
export function getService<T>(fastify: FastifyInstance, serviceName: string): T {
  const services = (fastify as FastifyWithServices).services;
  const service = services.get<T>(serviceName);

  if (!service) {
    throw new Error(`Service '${serviceName}' not found`);
  }

  return service;
}
```

**3. Refactor server.ts** (660 → ~200 lines)

```typescript
// src/server.ts (REFACTORED)
import Fastify from 'fastify';
import { ServiceContainer } from './core/service-container.js';
import { registerServiceDecorators } from './core/fastify-decorators.js';
import { getDatabase, closeDatabase } from './db/connection.js';
import { createSocketIOServer } from './core/socket-io.js';
import { registerRoutes } from './core/routes-initializer.js';
import { registerMiddleware } from './core/middleware-initializer.js';
import { logger } from './utils/logger.js';

async function buildServer() {
  const fastify = Fastify({ logger });

  // Initialize core dependencies
  const db = getDatabase();
  const io = createSocketIOServer();

  // Initialize service container
  const services = new ServiceContainer({ db, io });
  await services.initialize();

  // Register decorators for type-safe access
  registerServiceDecorators(fastify, db, services);

  // Register middleware (CORS, caching, error handling)
  await registerMiddleware(fastify);

  // Register all routes
  await registerRoutes(fastify);

  // Start monitoring services
  await services.start();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    await services.shutdown();
    await fastify.close();
    closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return fastify;
}

const server = await buildServer();
await server.listen({ port: 3100, host: '0.0.0.0' });
```

**4. src/core/routes-initializer.ts** (~100 lines)

Extract route registration logic from server.ts.

**5. src/core/middleware-initializer.ts** (~80 lines)

Extract middleware registration logic from server.ts.

### Update Routes to Use Type-Safe Service Access

**Before:**
```typescript
// src/routes/zfs.ts
const zfsManager = (fastify as { zfsManager?: ZFSManager }).zfsManager;
if (!zfsManager) {
  return { success: false, error: 'ZFS manager not available' };
}
```

**After:**
```typescript
// src/routes/zfs.ts
import type { FastifyWithServices } from '../core/fastify-decorators.js';
import { getService } from '../core/fastify-decorators.js';

export async function zfsRoutes(fastify: FastifyWithServices) {
  fastify.get('/api/zfs/pools', async (request, reply) => {
    const zfsManager = getService<ZFSManager>(fastify, 'zfsManager');
    const pools = await zfsManager.getAllPools();
    return { success: true, data: pools };
  });
}
```

### Testing with ServiceContainer

```typescript
// tests/integration/routes/zfs.test.ts
import { ServiceContainer } from '../../../src/core/service-container.js';

describe('ZFS Routes', () => {
  let container: ServiceContainer;

  beforeEach(async () => {
    const db = new Database(':memory:');
    const io = createMockIO();

    container = new ServiceContainer({ db, io });
    await container.initialize();

    // Mock specific services
    container.register('zfsManager', createMockZFSManager());
  });

  it('should use mocked zfsManager', async () => {
    // Test route with mocked service
  });
});
```

### Verification Checklist

- [ ] ServiceContainer created and tested
- [ ] All 13 services managed by container
- [ ] server.ts reduced from 660 → ~200 lines
- [ ] Routes use type-safe service access
- [ ] No unsafe type casting in routes
- [ ] Services can be mocked in tests
- [ ] Graceful shutdown works correctly
- [ ] Documentation updated

---

## 🛡️ PHASE 4: TYPE-SAFE ROUTE HELPERS (MEDIUM PRIORITY)

**Duration**: 2-3 hours
**Priority**: 🟡 MEDIUM
**Difficulty**: ⭐⭐ (Intermediate)

### Problem Statement

Routes repeat boilerplate for:
- Database access validation
- Service access validation
- Error handling
- Response formatting

**Example from src/routes/arr.ts:**
```typescript
fastify.get('/api/arr/queue/:app', async (request, reply) => {
  const db = (fastify as { db?: { prepare: (...) => ... } }).db;
  if (!db) {
    return { success: false, error: 'Database not available' };
  }

  const { app } = request.params as { app: string };
  const { limit = 50 } = request.query as { limit?: number };

  // Actual logic...
});
```

Repeated in **8 route files, 68+ routes total**.

### Success Criteria

- [ ] Eliminate unsafe casting in all routes
- [ ] Consistent error handling across routes
- [ ] Type-safe parameter/query extraction
- [ ] Reduce route boilerplate by 30%+
- [ ] Better IDE autocomplete for routes

### Files to Create

**1. src/utils/route-helpers.ts** (~200 lines)

```typescript
import type { FastifyRequest, FastifyReply, RouteHandlerMethod } from 'fastify';
import type { FastifyWithServices } from '../core/fastify-decorators.js';
import { DatabaseError, ValidationError } from './error-types.js';
import { z, type ZodSchema } from 'zod';

/**
 * Route handler with database access
 */
export function withDatabase<T>(
  handler: (
    db: Database.Database,
    request: FastifyRequest,
    reply: FastifyReply
  ) => Promise<T>
): RouteHandlerMethod {
  return async function (request, reply) {
    const db = (this as FastifyWithServices).db;

    if (!db) {
      throw new DatabaseError('Database not available');
    }

    return handler(db, request, reply);
  };
}

/**
 * Route handler with service access
 */
export function withService<TService, TResult>(
  serviceName: string,
  handler: (
    service: TService,
    request: FastifyRequest,
    reply: FastifyReply
  ) => Promise<TResult>
): RouteHandlerMethod {
  return async function (request, reply) {
    const services = (this as FastifyWithServices).services;
    const service = services.get<TService>(serviceName);

    if (!service) {
      throw new Error(`Service '${serviceName}' not available`);
    }

    return handler(service, request, reply);
  };
}

/**
 * Validate request parameters with Zod schema
 */
export function withValidation<TParams, TQuery, TBody, TResult>(
  schemas: {
    params?: ZodSchema<TParams>;
    query?: ZodSchema<TQuery>;
    body?: ZodSchema<TBody>;
  },
  handler: (
    validated: {
      params: TParams;
      query: TQuery;
      body: TBody;
    },
    request: FastifyRequest,
    reply: FastifyReply
  ) => Promise<TResult>
): RouteHandlerMethod {
  return async function (request, reply) {
    try {
      const validated = {
        params: schemas.params?.parse(request.params) ?? ({} as TParams),
        query: schemas.query?.parse(request.query) ?? ({} as TQuery),
        body: schemas.body?.parse(request.body) ?? ({} as TBody),
      };

      return handler(validated, request, reply);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('Invalid request', error.errors);
      }
      throw error;
    }
  };
}

/**
 * Combine multiple helpers
 */
export function createRoute<TService, TParams, TQuery, TBody, TResult>(config: {
  serviceName: string;
  schemas?: {
    params?: ZodSchema<TParams>;
    query?: ZodSchema<TQuery>;
    body?: ZodSchema<TBody>;
  };
  handler: (
    service: TService,
    validated: { params: TParams; query: TQuery; body: TBody },
    request: FastifyRequest,
    reply: FastifyReply
  ) => Promise<TResult>;
}): RouteHandlerMethod {
  return withService<TService, TResult>(
    config.serviceName,
    async (service, request, reply) => {
      if (config.schemas) {
        return withValidation(
          config.schemas,
          (validated) => config.handler(service, validated, request, reply)
        )(request, reply);
      }

      return config.handler(
        service,
        { params: {} as TParams, query: {} as TQuery, body: {} as TBody },
        request,
        reply
      );
    }
  );
}
```

**2. Update routes to use helpers**

**Before:**
```typescript
// src/routes/zfs.ts
fastify.get('/api/zfs/pools/:name/snapshots', async (request, reply) => {
  const zfsManager = (fastify as any).zfsManager;
  if (!zfsManager) {
    return { success: false, error: 'ZFS manager not available' };
  }

  const { name } = request.params as { name: string };
  const { limit = 100 } = request.query as { limit?: number };

  try {
    const snapshots = await zfsManager.getSnapshots(name, limit);
    return { success: true, data: snapshots };
  } catch (error) {
    return { success: false, error: 'Failed to get snapshots' };
  }
});
```

**After:**
```typescript
// src/routes/zfs.ts
import { createRoute } from '../utils/route-helpers.js';
import { z } from 'zod';

fastify.get(
  '/api/zfs/pools/:name/snapshots',
  createRoute({
    serviceName: 'zfsManager',
    schemas: {
      params: z.object({ name: z.string().min(1) }),
      query: z.object({ limit: z.number().int().positive().default(100) }),
    },
    handler: async (zfsManager, { params, query }) => {
      const snapshots = await zfsManager.getSnapshots(params.name, query.limit);
      return { success: true, data: snapshots };
    },
  })
);
```

### Benefits

- ✅ **Type safety**: Full TypeScript inference for params/query/body
- ✅ **Validation**: Zod schemas ensure data correctness
- ✅ **Less code**: 15-20 lines → 8-10 lines per route
- ✅ **Consistent errors**: All use AppError classes
- ✅ **Better DX**: IDE autocomplete works perfectly

### Verification Checklist

- [ ] Route helpers created and tested
- [ ] All 68+ routes refactored
- [ ] No unsafe type casting remaining
- [ ] Validation schemas added to critical routes
- [ ] Tests updated
- [ ] Documentation updated

---

## 🏥 PHASE 5: HEALTH CHECKS & CIRCUIT BREAKER (MEDIUM PRIORITY)

**Duration**: 2-3 hours
**Priority**: 🟡 MEDIUM
**Difficulty**: ⭐⭐⭐⭐ (Advanced)

### Problem Statement

**Current behavior when TrueNAS goes offline:**
1. Monitor tries to connect
2. Request times out (30+ seconds)
3. Monitor crashes with unhandled error
4. **Monitoring never restarts** - data stops flowing permanently

No automatic recovery. No degraded mode. No circuit breaker.

### Success Criteria

- [ ] Circuit breaker for TrueNAS/Portainer APIs
- [ ] Automatic service restart on failure
- [ ] Degraded mode when dependencies unavailable
- [ ] Health status tracking per service
- [ ] Exponential backoff for retries
- [ ] Alerts when services fail

### Files to Create

**1. src/middleware/circuit-breaker.ts** (~250 lines)

```typescript
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;    // Failures before opening (default: 5)
  successThreshold: number;    // Successes to close from half-open (default: 2)
  timeout: number;             // Time to wait before half-open (default: 60000ms)
  volumeThreshold: number;     // Minimum requests before evaluation (default: 10)
}

/**
 * Circuit breaker pattern implementation
 * Prevents cascading failures by failing fast when service is down
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private nextAttempt = Date.now();
  private totalRequests = 0;

  constructor(private config: CircuitBreakerConfig) {
    super();
    logger.info({ circuit: config.name }, 'Circuit breaker initialized');
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        const error = new Error(`Circuit breaker '${this.config.name}' is OPEN`);
        this.emit('rejected', error);
        throw error;
      }

      // Try transitioning to half-open
      this.setState(CircuitState.HALF_OPEN);
    }

    this.totalRequests++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;

      if (this.successes >= this.config.successThreshold) {
        this.setState(CircuitState.CLOSED);
      }
    }
  }

  private onFailure(error: unknown): void {
    this.failures++;
    this.emit('failure', error);

    if (this.state === CircuitState.HALF_OPEN) {
      this.setState(CircuitState.OPEN);
      return;
    }

    if (
      this.totalRequests >= this.config.volumeThreshold &&
      this.failures >= this.config.failureThreshold
    ) {
      this.setState(CircuitState.OPEN);
    }
  }

  private setState(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitState.OPEN) {
      this.nextAttempt = Date.now() + this.config.timeout;
      logger.warn(
        { circuit: this.config.name, failures: this.failures },
        'Circuit breaker opened'
      );
    } else if (newState === CircuitState.CLOSED) {
      this.successes = 0;
      logger.info({ circuit: this.config.name }, 'Circuit breaker closed');
    }

    this.emit('stateChange', { from: oldState, to: newState });
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
    };
  }
}
```

**2. src/middleware/health-monitor.ts** (~200 lines)

```typescript
import type { ServiceContainer } from '../core/service-container.js';
import type Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import { CircuitBreaker } from './circuit-breaker.js';

export interface ServiceHealth {
  name: string;
  healthy: boolean;
  lastCheck: string;
  lastSuccess: string | null;
  lastFailure: string | null;
  consecutiveFailures: number;
  circuitState?: string;
}

/**
 * Monitor health of all services and restart failed ones
 */
export class HealthMonitor {
  private health: Map<string, ServiceHealth> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor(
    private services: ServiceContainer,
    private db: Database.Database
  ) {
    // Initialize circuit breakers for external services
    this.circuitBreakers.set('truenas', new CircuitBreaker({
      name: 'truenas',
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
      volumeThreshold: 10,
    }));

    this.circuitBreakers.set('portainer', new CircuitBreaker({
      name: 'portainer',
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000,
      volumeThreshold: 10,
    }));
  }

  /**
   * Start health monitoring
   */
  start(): void {
    logger.info('Starting health monitor...');

    this.checkInterval = setInterval(() => {
      void this.checkAllServices();
    }, 30000); // Check every 30 seconds

    // Initial check
    void this.checkAllServices();
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Check health of all services
   */
  private async checkAllServices(): Promise<void> {
    await Promise.allSettled([
      this.checkDatabase(),
      this.checkTrueNAS(),
      this.checkPortainer(),
      this.checkMonitoringServices(),
    ]);
  }

  private async checkDatabase(): Promise<void> {
    const serviceName = 'database';

    try {
      this.db.prepare('SELECT 1').get();
      this.recordSuccess(serviceName);
    } catch (error) {
      this.recordFailure(serviceName, error);
    }
  }

  private async checkTrueNAS(): Promise<void> {
    const serviceName = 'truenas';
    const client = this.services.get('truenasClient');

    if (!client) {
      this.recordFailure(serviceName, new Error('Client not initialized'));
      return;
    }

    const breaker = this.circuitBreakers.get('truenas');

    try {
      await breaker?.execute(async () => {
        await client.getPools();
      });
      this.recordSuccess(serviceName);
    } catch (error) {
      this.recordFailure(serviceName, error);

      // Try to restart monitor if circuit opens
      if (breaker?.getState() === 'OPEN') {
        await this.restartMonitor('truenasMonitor');
      }
    }
  }

  private async checkPortainer(): Promise<void> {
    const serviceName = 'portainer';
    const client = this.services.get('portainerClient');

    if (!client) {
      this.recordFailure(serviceName, new Error('Client not initialized'));
      return;
    }

    const breaker = this.circuitBreakers.get('portainer');

    try {
      await breaker?.execute(async () => {
        await client.getContainers();
      });
      this.recordSuccess(serviceName);
    } catch (error) {
      this.recordFailure(serviceName, error);

      if (breaker?.getState() === 'OPEN') {
        await this.restartMonitor('dockerMonitor');
      }
    }
  }

  private async checkMonitoringServices(): Promise<void> {
    // Check if monitoring services are still running
    const monitor = this.services.get('truenasMonitor');
    if (monitor && !monitor.isRunning?.()) {
      logger.warn('TrueNAS monitor not running, restarting...');
      await this.restartMonitor('truenasMonitor');
    }
  }

  private async restartMonitor(serviceName: string): Promise<void> {
    logger.info({ service: serviceName }, 'Attempting to restart service');

    const service = this.services.get(serviceName);
    if (!service) {
      logger.error({ service: serviceName }, 'Service not found');
      return;
    }

    try {
      // Stop existing instance
      if (typeof service.stop === 'function') {
        await service.stop();
      }

      // Wait a bit before restarting
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Start again
      if (typeof service.start === 'function') {
        await service.start();
      }

      logger.info({ service: serviceName }, 'Service restarted successfully');
    } catch (error) {
      logger.error({ err: error, service: serviceName }, 'Failed to restart service');
    }
  }

  private recordSuccess(serviceName: string): void {
    const current = this.health.get(serviceName) ?? {
      name: serviceName,
      healthy: false,
      lastCheck: '',
      lastSuccess: null,
      lastFailure: null,
      consecutiveFailures: 0,
    };

    this.health.set(serviceName, {
      ...current,
      healthy: true,
      lastCheck: new Date().toISOString(),
      lastSuccess: new Date().toISOString(),
      consecutiveFailures: 0,
    });
  }

  private recordFailure(serviceName: string, error: unknown): void {
    const current = this.health.get(serviceName) ?? {
      name: serviceName,
      healthy: true,
      lastCheck: '',
      lastSuccess: null,
      lastFailure: null,
      consecutiveFailures: 0,
    };

    const updated = {
      ...current,
      healthy: false,
      lastCheck: new Date().toISOString(),
      lastFailure: new Date().toISOString(),
      consecutiveFailures: current.consecutiveFailures + 1,
    };

    this.health.set(serviceName, updated);

    logger.error(
      { err: error, service: serviceName, failures: updated.consecutiveFailures },
      'Service health check failed'
    );
  }

  /**
   * Get health status for all services
   */
  getHealthStatus(): ServiceHealth[] {
    const status = Array.from(this.health.values());

    // Add circuit breaker states
    for (const [name, breaker] of this.circuitBreakers) {
      const service = status.find(s => s.name === name);
      if (service) {
        service.circuitState = breaker.getState();
      }
    }

    return status;
  }

  /**
   * Get overall system health
   */
  isHealthy(): boolean {
    return Array.from(this.health.values()).every(s => s.healthy);
  }
}
```

**3. Update server.ts to use HealthMonitor**

```typescript
// src/server.ts
import { HealthMonitor } from './middleware/health-monitor.js';

// After service container initialization
const healthMonitor = new HealthMonitor(services, db);
healthMonitor.start();

// Update /health endpoint
fastify.get('/health', async () => {
  const serviceHealth = healthMonitor.getHealthStatus();
  const isHealthy = healthMonitor.isHealthy();

  return {
    status: isHealthy ? 'healthy' : 'degraded',
    services: serviceHealth,
    timestamp: new Date().toISOString(),
  };
});

// Shutdown
process.on('SIGTERM', async () => {
  healthMonitor.stop();
  await services.shutdown();
});
```

### Benefits

- ✅ **Automatic recovery** - Services restart on failure
- ✅ **Circuit breaker** - Fail fast, don't wait for timeouts
- ✅ **Observability** - Know which services are down
- ✅ **Graceful degradation** - System stays up even if TrueNAS is down
- ✅ **Production ready** - Handle real-world failures

### Verification Checklist

- [ ] Circuit breaker implemented and tested
- [ ] Health monitor tracks all services
- [ ] Automatic restart works
- [ ] /health endpoint shows service status
- [ ] Tests for failure scenarios
- [ ] Documentation updated

---

## 📏 PHASE 6: FILE SIZE REFACTORING (RECOMMENDED)

**Duration**: 4-6 hours
**Priority**: 🟡 MEDIUM
**Difficulty**: ⭐⭐⭐

### Problem Statement

Large files violate proposed line limits and are hard to maintain:

**Violations:**
- `src/mcp/server.ts` - **1,397 lines** (897 over 500 limit) ❌
- `src/server.ts` - **660 lines** (160 over 500 limit) ❌
- `src/services/infrastructure/manager.ts` - **596 lines** (196 over 400 limit) ❌
- `src/services/zfs/manager.ts` - **548 lines** (148 over 400 limit) ❌
- `src/services/arr/arr-optimizer.ts` - **487 lines** (87 over 400 limit) ❌
- `src/services/ups/ups-monitor.ts` - **464 lines** (64 over 400 limit) ❌
- `src/routes/security.ts` - **412 lines** (162 over 250 limit) ❌
- `src/routes/infrastructure.ts` - **298 lines** (48 over 250 limit) ❌
- `src/routes/ups.ts` - **254 lines** (4 over 250 limit) ❌

### Success Criteria

- [ ] All files comply with line limits
- [ ] Clear separation of concerns
- [ ] No functionality broken
- [ ] Tests still pass
- [ ] Better code organization

### Refactoring Plan

See **"Files Requiring Refactoring"** section above for detailed split plans.

**Priority order:**
1. `mcp/server.ts` (most critical)
2. `server.ts` (done in Phase 3)
3. `routes/security.ts`
4. `services/infrastructure/manager.ts`
5. Others as time permits

### Verification Checklist

- [ ] All files under line limits
- [ ] Imports updated
- [ ] Tests passing
- [ ] No circular dependencies
- [ ] Documentation updated

---

## ⚡ PHASE 7: QUICK WINS (1-2 HOURS)

**Duration**: 1-2 hours
**Priority**: 🟢 LOW (but high satisfaction)
**Difficulty**: ⭐

### Quick Win 1: Fix Socket.IO Room Registration

**File**: `src/server.ts` lines 77-118

**Before** (8 duplicate handlers):
```typescript
socket.on('join:system', () => void socket.join('system'));
socket.on('join:storage', () => void socket.join('storage'));
socket.on('join:docker', () => void socket.join('docker'));
socket.on('join:security', () => void socket.join('security'));
socket.on('join:alerts', () => void socket.join('alerts'));
socket.on('join:logs', () => void socket.join('logs'));
socket.on('join:infrastructure', () => void socket.join('infrastructure'));
socket.on('join:arr', () => void socket.join('arr'));
```

**After** (1 loop):
```typescript
const rooms = ['system', 'storage', 'docker', 'security', 'alerts', 'logs', 'infrastructure', 'arr'];

for (const room of rooms) {
  socket.on(`join:${room}`, () => {
    void socket.join(room);
    logger.debug({ room, socketId: socket.id }, 'Client joined room');
  });

  socket.on(`leave:${room}`, () => {
    void socket.leave(room);
    logger.debug({ room, socketId: socket.id }, 'Client left room');
  });
}
```

**Benefit**: 42 lines → 12 lines, easier to add rooms

---

### Quick Win 2: Create Constants File

**File**: Create `src/constants.ts` (~50 lines)

Extract magic numbers:

```typescript
export const MONITORING_INTERVALS = {
  SYSTEM: 30_000,      // 30 seconds
  POOLS: 60_000,       // 1 minute
  DISKS: 120_000,      // 2 minutes
  CONTAINERS: 45_000,  // 45 seconds
  SECURITY: 300_000,   // 5 minutes
  ARR_QUEUE: 120_000,  // 2 minutes
} as const;

export const TEMPERATURE_THRESHOLDS = {
  DISK_WARNING: 50,    // °C
  DISK_CRITICAL: 60,   // °C
  CPU_WARNING: 70,     // °C
  CPU_CRITICAL: 85,    // °C
} as const;

export const ALERT_SEVERITIES = ['info', 'warning', 'critical', 'error'] as const;
export type AlertSeverity = typeof ALERT_SEVERITIES[number];

export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY: 1000,
  MAX_DELAY: 10_000,
  BACKOFF_FACTOR: 2,
} as const;
```

**Benefit**: Centralized configuration, no more magic numbers

---

### Quick Win 3: Add Request Correlation IDs

**File**: `src/middleware/request-context.ts` (~40 lines)

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';

export async function requestContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = request.headers['x-request-id'] || randomUUID();

  // Add to request
  request.id = requestId;

  // Add to response headers
  reply.header('x-request-id', requestId);

  // Add to logger context
  request.log = request.log.child({ requestId });
}
```

Register in server.ts:
```typescript
fastify.addHook('onRequest', requestContext);
```

**Benefit**: Trace requests through logs end-to-end

---

### Quick Win 4: Add npm Scripts

**File**: Update `package.json`

```json
{
  "scripts": {
    "check:all": "npm run lint && npm run type-check && npm test",
    "check:quick": "npm run lint && npm run type-check",
    "dev:debug": "NODE_ENV=development DEBUG=* tsx watch src/server.ts",
    "db:backup": "cp data/home-server-monitor.db data/backup-$(date +%Y%m%d-%H%M%S).db",
    "logs:follow": "tail -f logs/server.log",
    "health:check": "curl http://localhost:3100/health | jq"
  }
}
```

**Benefit**: Common operations easier to run

---

### Quick Win 5: Create Service Status File

**File**: `src/middleware/service-status.ts` (~60 lines)

Write current status to JSON file for monitoring:

```typescript
import { writeFileSync } from 'fs';
import { join } from 'path';

export function writeServiceStatus(services: any[], healthy: boolean): void {
  const status = {
    timestamp: new Date().toISOString(),
    healthy,
    services,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
  };

  writeFileSync(
    join(process.cwd(), 'data', '.service-status.json'),
    JSON.stringify(status, null, 2)
  );
}
```

**Benefit**: External monitoring tools can read status without HTTP

---

## 🤔 PRE-COMMIT HOOK RECOMMENDATION

**Question**: Should you add Husky pre-commit hooks for line limits?

### ✅ YES - Highly Recommended!

**Proposed Limits:**
- `/routes/` → 250 lines max
- `/services/` → 400 lines max
- `/integrations/` → 500 lines max
- Everything else → 500 lines max

**Benefits:**
1. **Prevents technical debt** - Can't merge code that violates limits
2. **Forces good architecture** - Large files must be split logically
3. **Easier code review** - Smaller files = faster reviews
4. **Better collaboration** - Files under 300 lines are easier to understand
5. **Catches issues early** - Before they reach production

**Implementation:**

Create `.husky/pre-commit`:
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run line limit check
node scripts/check-file-sizes.js || exit 1

# Run linting
npm run lint || exit 1

# Run type check
npm run type-check || exit 1
```

Create `scripts/check-file-sizes.js`:
```javascript
#!/usr/bin/env node
import { readFileSync } from 'fs';
import { glob } from 'glob';

const limits = {
  'src/routes/**/*.ts': 250,
  'src/services/**/*.ts': 400,
  'src/integrations/**/*.ts': 500,
  'src/**/*.ts': 500,
};

let violations = [];

for (const [pattern, limit] of Object.entries(limits)) {
  const files = glob.sync(pattern, { ignore: ['**/*.test.ts', '**/*.spec.ts'] });

  for (const file of files) {
    const lines = readFileSync(file, 'utf-8').split('\n').length;

    if (lines > limit) {
      violations.push({ file, lines, limit, over: lines - limit });
    }
  }
}

if (violations.length > 0) {
  console.error('❌ File size violations detected:\n');

  for (const v of violations) {
    console.error(`  ${v.file}: ${v.lines} lines (${v.over} over limit of ${v.limit})`);
  }

  console.error('\nPlease split large files before committing.');
  process.exit(1);
}

console.log('✅ All files within size limits');
```

**Current Violations (would be caught):**
- 9 files currently violate limits
- Forces refactoring before you can commit

### Alternative: Gradual Enforcement

If immediate enforcement is too strict:

1. **Start with warnings** (don't block commits)
2. **Set higher limits initially** (routes: 400, services: 600)
3. **Gradually decrease** over 2-3 months
4. **Grandfather existing files** (only check new/modified files)

**Example gradual config:**
```javascript
const legacyFiles = [
  'src/mcp/server.ts',
  'src/server.ts',
  // ... existing large files
];

// Skip legacy files
if (legacyFiles.includes(file)) {
  console.warn(`⚠️  ${file} is over limit but grandfathered`);
  continue;
}
```

---

## 📚 ADDITIONAL CONTEXT FOR CLAUDE

### Project Architecture

**Tech Stack:**
- **Runtime**: Node.js 20+ with native fetch
- **Framework**: Fastify (not Express!)
- **WebSocket**: Socket.IO
- **Database**: better-sqlite3 (synchronous API, not async!)
- **Logging**: Pino (structured JSON logging)
- **Testing**: Jest with ts-jest
- **TypeScript**: Strict mode enabled

**Key Services:**
1. **TrueNASMonitor** - Polls TrueNAS API every 30-120s for pool/disk/system health
2. **DockerMonitor** - Monitors containers via Portainer API
3. **DiskFailurePredictor** - ML predictions based on SMART data
4. **NotificationService** - Multi-channel alerts (webhook, email, SMS)
5. **SecurityOrchestrator** - Manages Authentik, Cloudflare Tunnel, Fail2ban
6. **InfrastructureManager** - Deploys Docker Compose stacks
7. **ArrOptimizer** - Optimizes Sonarr/Radarr quality profiles and queue

**Database Schema** (40+ tables):
- `pools`, `disks`, `disk_health` - ZFS storage monitoring
- `containers`, `container_stats` - Docker monitoring
- `alerts`, `notifications` - Alerting system
- `security_events`, `auth_sessions` - Security tracking
- `arr_queue`, `arr_history` - Media automation
- `infrastructure_stacks` - Deployment tracking

**Real-time Events** (Socket.IO):
- `system:metrics` - CPU/RAM/disk usage
- `storage:pool-status` - Pool health updates
- `docker:container-status` - Container state changes
- `security:alert` - Security events
- `alert:new` - New alerts created

### Important Patterns

**1. Synchronous Database Operations**

better-sqlite3 is **synchronous**, not async:

```typescript
// ✅ CORRECT (no await):
const pools = db.prepare('SELECT * FROM pools').all();

// ❌ WRONG (don't use await):
const pools = await db.prepare('SELECT * FROM pools').all();
```

**2. Service Lifecycle**

All monitoring services follow this pattern:

```typescript
class Monitor {
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  start() {
    const interval = setInterval(() => {
      void this.monitoringCycle(); // Don't await in setInterval
    }, 60000);

    this.intervals.set('main', interval);
  }

  stop() {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }
}
```

**3. Error Logging Pattern**

Use structured logging with Pino:

```typescript
// ✅ CORRECT:
logger.error({ err: error, context: { poolName } }, 'Failed to monitor pool');

// ❌ WRONG:
logger.error('Failed to monitor pool:', error);
```

**4. Socket.IO Emission**

Emit events to specific rooms:

```typescript
// ✅ Emit to room:
io.to('storage').emit('storage:pool-status', data);

// ✅ Emit to all:
io.emit('alert:new', alert);
```

### Common Pitfalls to Avoid

1. **Don't use async/await with better-sqlite3** - It's synchronous!
2. **Don't create circular dependencies** - Use dependency injection
3. **Don't use `any` type** - This codebase has strict TypeScript
4. **Don't forget to close intervals** - Always clear in `stop()` method
5. **Don't log sensitive data** - API keys, passwords must be redacted
6. **Don't use `console.log`** - Use Pino logger
7. **Don't block event loop** - Keep monitoring cycles fast (<1s)

### Testing Patterns

**Unit Tests:**
```typescript
// Mock external clients
const mockClient = {
  getPools: jest.fn().mockResolvedValue([...]),
};

// Use in-memory database
const db = new Database(':memory:');
db.exec(SCHEMA);

// Test service with mocks
const service = new Service({ client: mockClient, db });
```

**Integration Tests:**
```typescript
// Real database, mocked external APIs
const db = new Database(':memory:');
const mockAPI = createMockAPI();

// Test full flow
await service.monitorPools();
const pools = db.prepare('SELECT * FROM pools').all();
expect(pools).toHaveLength(1);
```

### Environment Variables

**Required:**
- `TRUENAS_HOST`, `TRUENAS_API_KEY`
- `PORTAINER_URL`, `PORTAINER_API_KEY`
- `DATABASE_PATH` (default: `./data/home-server-monitor.db`)

**Optional:**
- `AUTHENTIK_URL`, `AUTHENTIK_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`
- `WEBHOOK_URL` (for notifications)
- `UPS_ENABLED`, `UPS_HOST`, `UPS_NAME`

### File Structure

```
src/
├── server.ts                 # Main entry point (660 lines)
├── core/                     # Core framework (to be created)
│   ├── service-container.ts
│   └── fastify-decorators.ts
├── db/
│   ├── schema.ts             # Database schema (411 lines)
│   └── connection.ts
├── integrations/             # External API clients
│   ├── truenas/client.ts
│   ├── portainer/client.ts
│   ├── authentik/client.ts
│   └── cloudflare/tunnel-client.ts
├── services/                 # Business logic
│   ├── monitoring/
│   │   ├── truenas-monitor.ts (362 lines)
│   │   ├── docker-monitor.ts (308 lines)
│   │   └── disk-predictor.ts
│   ├── security/
│   │   ├── scanner.ts (357 lines)
│   │   └── orchestrator.ts (380 lines)
│   ├── infrastructure/
│   │   └── manager.ts (596 lines) ← NEEDS REFACTORING
│   └── zfs/
│       └── manager.ts (548 lines) ← NEEDS REFACTORING
├── routes/                   # API endpoints
│   ├── monitoring.ts
│   ├── docker.ts
│   ├── security.ts (412 lines) ← NEEDS REFACTORING
│   └── infrastructure.ts (298 lines) ← NEEDS REFACTORING
├── middleware/               # To be created
│   ├── error-handler.ts
│   ├── circuit-breaker.ts
│   └── health-monitor.ts
├── utils/
│   ├── logger.ts
│   ├── metrics.ts (264 lines)
│   └── auth.ts (244 lines)
└── mcp/
    └── server.ts (1397 lines) ← MAJOR REFACTORING NEEDED
```

---

## 🎯 SUCCESS METRICS

Track progress with these metrics:

### Before Tasks
- ❌ 0% routes with error handling
- ❌ 0% integration test coverage for services
- ❌ 660-line server.ts
- ❌ 9 files over size limits
- ❌ 68+ routes with unsafe casting
- ❌ No service recovery mechanism

### After All Phases
- ✅ 100% routes with error handling
- ✅ 45%+ integration test coverage
- ✅ ~200-line server.ts
- ✅ 0 files over size limits
- ✅ 0 unsafe type casts
- ✅ Automatic service recovery
- ✅ Circuit breaker protection
- ✅ Type-safe service access
- ✅ Enterprise-grade architecture

---

## 📝 NOTES FOR CLAUDE CODE FOR WEB

**When implementing these tasks:**

1. **Always run tests after changes** - `npm test`
2. **Check TypeScript compilation** - `npm run type-check`
3. **Verify linting passes** - `npm run lint`
4. **Test manually** - Start server and verify endpoints work
5. **Update documentation** - Keep README and docs in sync
6. **Commit frequently** - Small, atomic commits per feature
7. **Follow existing patterns** - Match the codebase style

**Before making changes:**
1. Read the file you're modifying completely
2. Understand dependencies and imports
3. Check for existing tests
4. Look for similar patterns in codebase

**After making changes:**
1. Run full test suite
2. Check for TypeScript errors
3. Verify no ESLint errors introduced
4. Test the specific feature manually
5. Update related tests

**If stuck:**
1. Check existing similar code in codebase
2. Look at test files for usage examples
3. Review TypeScript types for available methods
4. Ask for clarification if requirements unclear

---

## 🚀 GETTING STARTED

**To begin Phase 1:**

1. Create `src/utils/error-types.ts`
2. Create `src/middleware/error-handler.ts`
3. Register error handler in `src/server.ts`
4. Update one route file (`src/routes/monitoring.ts`) as proof of concept
5. Create tests
6. Verify all tests pass
7. Roll out to remaining 7 route files
8. Update FIX-PLAN.md with completion status

**Commands to run:**
```bash
# Check current state
npm run lint
npm run type-check
npm test

# After changes
npm run check:all

# Manual testing
npm run dev
curl http://localhost:3100/health
```

Good luck! 🎉
