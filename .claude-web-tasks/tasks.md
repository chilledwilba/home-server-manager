# Home Server Manager - Enterprise Quality Tasks

> **Status**: Ready for implementation
> **Last Updated**: 2025-11-15
> **Total Tasks**: 10 priorities, ~40 sub-tasks
> **Estimated Time**: 25-35 hours total

## 🎯 Current Focus: Priority 2

Start with: **Priority 2 - Test Coverage to 30%+**

## 📊 Progress Tracker

| Priority | Task                       | Status         | Time Est. | Completed  |
| -------- | -------------------------- | -------------- | --------- | ---------- |
| P1       | npm → pnpm Migration       | 🟢 Completed   | 2-3h      | 2025-11-15 |
| P2       | Test Coverage to 30%+      | 🟡 In Progress | 4-6h      | -          |
| P3       | OpenAPI/Swagger Docs       | 🔴 Not Started | 3-4h      | -          |
| P4       | Error Handling Standard    | 🔴 Not Started | 2-3h      | -          |
| P5       | Feature Flags System       | 🔴 Not Started | 2-3h      | -          |
| P6       | Context7 MCP Integration   | 🔴 Not Started | 1-2h      | -          |
| P7       | DB Migration Safety        | 🔴 Not Started | 2-3h      | -          |
| P8       | E2E Test Foundation        | 🔴 Not Started | 3-4h      | -          |
| P9       | Dependency Update Strategy | 🔴 Not Started | 1-2h      | -          |
| P10      | Performance Monitoring     | 🔴 Not Started | 2-3h      | -          |

**Status Legend**: 🔴 Not Started | 🟡 In Progress | 🟢 Completed | 🔵 Blocked

---

## 📝 How to Use This Document

### For Claude Code for Web:

1. **Start**: Prompt with "Continue tasks.md"
2. **Pick up**: Claude will read this file and continue from current priority
3. **Update**: After completing tasks, update the progress tracker
4. **Document**: Add completed tasks to `completed.md`
5. **Block**: Add any blockers to `issues.md`

### Task Completion Protocol:

When completing a task:

1. ✅ Update status in Progress Tracker above
2. ✅ Add entry to `completed.md` with timestamp and commit hash
3. ✅ Move to next task or priority
4. ✅ If blocked, document in `issues.md`

---

# Priority 1: Migrate npm → pnpm ⚡

**Status**: 🟢 Completed
**Estimated Time**: 2-3 hours
**Why**: pnpm is faster (50%+), more efficient disk usage, stricter dependency resolution prevents phantom dependencies
**Impact**: HIGH - Affects entire build pipeline, CI/CD, Docker

## Current State Analysis

- ✅ pnpm v10.22.0 installed on system
- ❌ Project using npm (package-lock.json files exist)
- ❌ CI/CD configured for npm
- ❌ Dockerfile using npm
- ❌ Git hooks reference npm

## Task Checklist

### Step 1: Create pnpm Workspace Configuration

- [ ] Create `pnpm-workspace.yaml` in project root
  ```yaml
  packages:
    - 'client'
  ```

### Step 2: Clean npm Artifacts

- [ ] Remove `package-lock.json` from root
- [ ] Remove `client/package-lock.json`
- [ ] Add to `.gitignore`:
  ```
  package-lock.json
  pnpm-lock.yaml
  ```

### Step 3: Update Root package.json Scripts

- [ ] Update all scripts that use `npm` to use `pnpm`
- [ ] Change `npm ci` → `pnpm install --frozen-lockfile`
- [ ] Change `npm run` → `pnpm run`
- [ ] Update client-related scripts:
  - `dev:client`: `cd client && pnpm run dev` → `pnpm --filter home-server-monitor-ui dev`
  - `build:client`: `cd client && pnpm run build` → `pnpm --filter home-server-monitor-ui build`
  - `type-check:client`: `cd client && pnpm run type-check` → `pnpm --filter home-server-monitor-ui type-check`

### Step 4: Update CI/CD Pipeline

- [ ] Update `.github/workflows/ci.yml`:
  - Change `cache: 'npm'` → `cache: 'pnpm'`
  - Add pnpm installation step before dependencies:
    ```yaml
    - name: Install pnpm
      uses: pnpm/action-setup@v2
      with:
        version: 10
    ```
  - Change `npm ci` → `pnpm install --frozen-lockfile`
  - Change `npm run` → `pnpm run`
  - Change `npm audit` → `pnpm audit`

### Step 5: Update Dockerfile

- [ ] Update `Dockerfile` to use pnpm:

  ```dockerfile
  # Multi-stage build for Home Server Monitor
  FROM node:20-alpine AS builder

  # Install pnpm
  RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

  WORKDIR /app

  # Copy package files
  COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
  COPY client/package.json ./client/
  COPY tsconfig.json ./
  COPY tsconfig.build.json ./

  # Install dependencies
  RUN pnpm install --frozen-lockfile

  # Copy source code
  COPY src ./src
  COPY client/src ./client/src

  # Build TypeScript
  RUN pnpm run build
  RUN pnpm --filter home-server-monitor-ui build

  # Production stage
  FROM node:20-alpine

  # Install pnpm
  RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

  WORKDIR /app

  # Install production dependencies only
  COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
  COPY client/package.json ./client/
  RUN pnpm install --prod --frozen-lockfile && pnpm store prune

  # Copy built application
  COPY --from=builder /app/dist ./dist
  COPY --from=builder /app/client/dist ./dist/client

  # Create data directory for SQLite
  RUN mkdir -p /app/data

  # Health check
  HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3100/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

  # Expose port
  EXPOSE 3100

  # Run as non-root user
  USER node

  # Start application
  CMD ["node", "dist/server.js"]
  ```

### Step 6: Update Docker Compose

- [ ] Update `docker-compose.yml` if needed (likely no changes required)

### Step 7: Update Git Hooks

- [ ] Update `.husky/pre-commit`:

  ```bash
  #!/bin/sh
  . "$(dirname "$0")/_/husky.sh"

  # Check file sizes (WARNING ONLY - does not block commits)
  node scripts/check-file-sizes.js --mode=warning

  # Run lint-staged
  pnpm exec lint-staged

  # Type check
  pnpm run type-check
  ```

- [ ] Update `.husky/pre-push`:

  ```bash
  #!/bin/sh
  . "$(dirname "$0")/_/husky.sh"

  # Type check
  pnpm run type-check

  # Run tests
  pnpm test
  ```

### Step 8: Update lint-staged Configuration

- [ ] `.lintstagedrc.json` should work as-is (uses npx which pnpm supports)
- [ ] Test to ensure it works with pnpm

### Step 9: Initial Installation

- [ ] Run `pnpm install` in project root
- [ ] Verify `pnpm-lock.yaml` created
- [ ] Verify `node_modules` structure

### Step 10: Update Documentation

- [ ] Update README.md (if exists) with pnpm commands
- [ ] Update any setup guides in `docs/` directory
- [ ] Update `docs/home-server-monitor/QUICK-START.md`
- [ ] Update `docs/home-server-monitor/DEPLOYMENT-CONFIG.md`

### Step 11: Verification Tests

- [ ] Run `pnpm install` - should complete without errors
- [ ] Run `pnpm run type-check` - should pass
- [ ] Run `pnpm run lint` - should pass
- [ ] Run `pnpm test` - should pass
- [ ] Run `pnpm run build` - should build server
- [ ] Run `pnpm --filter home-server-monitor-ui build` - should build client
- [ ] Run `pnpm run build:all` - should build both
- [ ] Test git hooks trigger correctly
- [ ] Build Docker image: `docker build -t home-server-monitor:test .`

## Acceptance Criteria

- ✅ `pnpm install` works in root and installs both root + client deps
- ✅ All scripts run with pnpm
- ✅ CI passes with pnpm
- ✅ Docker builds successfully with pnpm
- ✅ Git hooks work with pnpm
- ✅ No `package-lock.json` files remain
- ✅ `pnpm-lock.yaml` generated and committed
- ✅ Documentation updated

## Common Issues & Solutions

**Issue**: pnpm command not found
**Solution**: Run `corepack enable` or install pnpm globally: `npm install -g pnpm@10`

**Issue**: Workspace dependencies not resolving
**Solution**: Ensure `pnpm-workspace.yaml` correctly lists all workspace packages

**Issue**: CI failing on cache
**Solution**: Clear GitHub Actions cache, ensure pnpm/action-setup@v2 installed

**Issue**: Docker build fails on pnpm install
**Solution**: Ensure `corepack enable` runs before pnpm commands

## Commit Strategy

```bash
# After completing all steps:
git add .
git commit -m "chore: migrate from npm to pnpm

- Add pnpm-workspace.yaml for monorepo structure
- Remove package-lock.json files
- Update all scripts to use pnpm
- Update CI/CD pipeline for pnpm
- Update Dockerfile to use pnpm with corepack
- Update git hooks for pnpm
- Update documentation

Benefits:
- 50%+ faster installations
- More efficient disk usage with content-addressable store
- Stricter dependency resolution prevents phantom deps
- Better monorepo support with workspace features

🤖 Generated with Claude Code"
```

---

# Priority 2: Test Coverage to 30%+ 🧪

**Status**: 🟡 In Progress
**Estimated Time**: 4-6 hours
**Why**: Currently at ~11%, below 25% threshold. Need safety net before adding features.
**Impact**: HIGH - Enables confident refactoring and feature additions

**Progress**:

- ✅ Created comprehensive unit tests for Security Scanner (27 test cases)
- 🔄 Working on additional service coverage

## Current State Analysis

From test coverage report:

- **Current Coverage**: ~24% (below 25% threshold)
- **Services with 0% coverage**: security scanner, ZFS manager, Arr optimizer, UPS services
- **Utils**: 38% coverage (need improvement)
- **Test Types**: Unit tests exist, integration tests minimal, E2E setup exists but minimal tests

## Task Checklist

### Step 1: Create Integration Test Infrastructure

- [ ] Create `tests/integration/setup.ts` with test database setup
- [ ] Create `tests/integration/helpers/test-server.ts` - lightweight Fastify instance for testing
- [ ] Create `tests/integration/helpers/mock-clients.ts` - mock TrueNAS, Portainer clients
- [ ] Create `tests/integration/fixtures/` directory with test data

### Step 2: Add Critical Integration Tests

#### File: `tests/integration/api/health.test.ts`

- [ ] Test GET `/health` returns 200
- [ ] Test health check includes database status
- [ ] Test health check includes service status
- [ ] Test health check fails when database unavailable

#### File: `tests/integration/services/monitoring-flow.test.ts`

- [ ] Test full monitoring cycle:
  1. Initialize ServiceContainer
  2. Start monitoring
  3. Collect metrics
  4. Store in database
  5. Emit WebSocket events
  6. Shutdown gracefully

#### File: `tests/integration/database/migrations.test.ts`

- [ ] Test all migrations run successfully
- [ ] Test migrations are idempotent (can run multiple times)
- [ ] Test rollback works (if supported)
- [ ] Test data integrity after migrations

### Step 3: Add Unit Tests for Uncovered Services

#### File: `tests/unit/services/security/scanner.test.ts`

- [ ] Test container permission scanning
- [ ] Test file permission detection
- [ ] Test vulnerability detection
- [ ] Test finding severity calculation
- [ ] Mock external API calls

#### File: `tests/unit/services/zfs/manager.test.ts`

- [ ] Test snapshot creation logic
- [ ] Test scrub scheduling
- [ ] Test pool health parsing
- [ ] Test error handling
- [ ] Mock TrueNAS client

#### File: `tests/unit/services/arr/arr-optimizer.test.ts`

- [ ] Test queue optimization logic
- [ ] Test download path recommendations
- [ ] Test concurrent download calculations
- [ ] Mock Arr API clients

#### File: `tests/unit/utils/metrics.test.ts`

- [ ] Test metric registration
- [ ] Test metric recording
- [ ] Test Prometheus format export

### Step 4: Improve Existing Test Coverage

#### Enhance `tests/unit/utils/validation.test.ts`

- [ ] Add edge case tests
- [ ] Test all validation schemas
- [ ] Test error messages

#### Enhance `tests/unit/middleware/error-handler.test.ts`

- [ ] Test all error types
- [ ] Test error transformation
- [ ] Test correlation ID inclusion

### Step 5: Update Test Configuration

- [ ] Update `jest.config.js` coverage threshold to 30%:
  ```javascript
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30,
    },
  },
  ```

### Step 6: Add Test Helpers

- [ ] Create `tests/helpers/assertions.ts` - custom Jest matchers
- [ ] Create `tests/helpers/factories.ts` - test data factories
- [ ] Create `tests/helpers/database.ts` - database test utilities

## Example Test Structure

### Integration Test Template:

```typescript
// tests/integration/api/health.test.ts
import { setupTestServer, closeTestServer } from '../helpers/test-server';
import type { FastifyInstance } from 'fastify';
import supertest from 'supertest';

describe('Health API Integration', () => {
  let app: FastifyInstance;
  let request: supertest.SuperTest<supertest.Test>;

  beforeAll(async () => {
    app = await setupTestServer();
    request = supertest(app.server);
  });

  afterAll(async () => {
    await closeTestServer(app);
  });

  it('should return 200 on health check', async () => {
    const response = await request.get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'healthy');
  });

  it('should include database status', async () => {
    const response = await request.get('/health');
    expect(response.body).toHaveProperty('database');
    expect(response.body.database).toHaveProperty('connected', true);
  });
});
```

### Unit Test Template:

```typescript
// tests/unit/services/security/scanner.test.ts
import { SecurityScanner } from '@/services/security/scanner';
import type Database from 'better-sqlite3';
import { createMockDatabase } from '../../../helpers/database';

describe('SecurityScanner', () => {
  let scanner: SecurityScanner;
  let mockDb: Database.Database;

  beforeEach(() => {
    mockDb = createMockDatabase();
    scanner = new SecurityScanner(mockDb);
  });

  afterEach(() => {
    mockDb.close();
  });

  describe('scanContainerPermissions', () => {
    it('should detect containers running as root', async () => {
      const findings = await scanner.scanContainerPermissions();

      const rootFindings = findings.filter((f) => f.title.includes('Running as root'));

      expect(rootFindings.length).toBeGreaterThan(0);
      expect(rootFindings[0]).toHaveProperty('severity', 'high');
    });

    it('should detect world-writable permissions', async () => {
      // Test implementation
    });
  });
});
```

## Acceptance Criteria

- ✅ Test coverage ≥ 30% for all metrics (branches, functions, lines, statements)
- ✅ At least 3 integration tests covering critical paths
- ✅ Unit tests for previously uncovered services (security, ZFS, Arr)
- ✅ `pnpm test` passes all tests
- ✅ `pnpm run test:coverage` shows ≥30% coverage
- ✅ CI pipeline passes with new coverage threshold

## Verification Commands

```bash
# Run all tests with coverage
pnpm run test:coverage

# Run only integration tests
pnpm run test:integration

# Run only unit tests
pnpm run test:unit

# Watch mode during development
pnpm run test:watch
```

## Commit Strategy

```bash
git commit -m "test: increase test coverage to 30%+

- Add integration tests for health API, monitoring flow, and database migrations
- Add unit tests for security scanner, ZFS manager, and Arr optimizer
- Create test helpers and factories for better test code reuse
- Update Jest coverage threshold to 30%
- Add test documentation and examples

Coverage improvement: 24% → 30%+

🤖 Generated with Claude Code"
```

---

# Priority 3: OpenAPI/Swagger Documentation 📚

**Status**: 🔴 Not Started
**Estimated Time**: 3-4 hours
**Why**: Enterprise-level API documentation, enables contract testing, better developer experience
**Impact**: MEDIUM - Improves maintainability and onboarding

## Task Checklist

### Step 1: Install Dependencies

- [ ] Install `@fastify/swagger`: `pnpm add @fastify/swagger`
- [ ] Install `@fastify/swagger-ui`: `pnpm add @fastify/swagger-ui`
- [ ] Install `zod-to-json-schema`: `pnpm add zod-to-json-schema`

### Step 2: Create Swagger Configuration

- [ ] Create `src/config/swagger.ts`:

  ```typescript
  import type { SwaggerOptions } from '@fastify/swagger';
  import type { FastifySwaggerUiOptions } from '@fastify/swagger-ui';

  export const swaggerConfig: SwaggerOptions = {
    openapi: {
      info: {
        title: 'Home Server Manager API',
        description: 'Enterprise-grade TrueNAS monitoring with AI assistance',
        version: '0.1.0',
      },
      servers: [
        {
          url: 'http://localhost:3100',
          description: 'Development server',
        },
      ],
      tags: [
        { name: 'health', description: 'Health check endpoints' },
        { name: 'metrics', description: 'Prometheus metrics' },
        { name: 'truenas', description: 'TrueNAS integration endpoints' },
        { name: 'containers', description: 'Docker container management' },
        { name: 'pools', description: 'ZFS pool management' },
        { name: 'alerts', description: 'Alert management' },
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
          },
        },
      },
    },
  };

  export const swaggerUiConfig: FastifySwaggerUiOptions = {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: true,
  };
  ```

### Step 3: Register Swagger in Server

- [ ] Update `src/server.ts` to register Swagger plugins:

  ```typescript
  import fastifySwagger from '@fastify/swagger';
  import fastifySwaggerUi from '@fastify/swagger-ui';
  import { swaggerConfig, swaggerUiConfig } from './config/swagger.js';

  // After creating Fastify instance, before routes:
  await app.register(fastifySwagger, swaggerConfig);
  await app.register(fastifySwaggerUi, swaggerUiConfig);
  ```

### Step 4: Add Schema Definitions

#### Create `src/schemas/health.schema.ts`

- [ ] Define health check response schema using Zod
- [ ] Convert to JSON Schema for OpenAPI

  ```typescript
  import { z } from 'zod';
  import { zodToJsonSchema } from 'zod-to-json-schema';

  export const healthResponseSchema = z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    timestamp: z.string().datetime(),
    database: z.object({
      connected: z.boolean(),
    }),
    services: z.object({
      truenasMonitor: z.boolean(),
      dockerMonitor: z.boolean(),
    }),
  });

  export const healthResponseJsonSchema = zodToJsonSchema(healthResponseSchema, 'HealthResponse');
  ```

#### Create `src/schemas/error.schema.ts`

- [ ] Define standard error response schema

#### Create schemas for each domain:

- [ ] `src/schemas/truenas.schema.ts`
- [ ] `src/schemas/containers.schema.ts`
- [ ] `src/schemas/pools.schema.ts`
- [ ] `src/schemas/alerts.schema.ts`

### Step 5: Add Route Documentation

#### Update `src/core/health-routes.ts`

- [ ] Add schema to health route:
  ```typescript
  app.get(
    '/health',
    {
      schema: {
        description: 'Health check endpoint',
        tags: ['health'],
        response: {
          200: healthResponseJsonSchema,
        },
      },
    },
    async (request, reply) => {
      // existing implementation
    },
  );
  ```

#### Update all routes in `src/routes/**/*.ts`

- [ ] Add schemas to all GET routes
- [ ] Add schemas to all POST routes
- [ ] Add schemas to all PUT/PATCH routes
- [ ] Add schemas to all DELETE routes

### Step 6: Add Request Validation

- [ ] Update routes to validate request bodies against schemas
- [ ] Add query parameter validation
- [ ] Add path parameter validation

### Step 7: Generate OpenAPI Specification

- [ ] Add script to `package.json`:

  ```json
  {
    "scripts": {
      "openapi:generate": "tsx scripts/generate-openapi.ts"
    }
  }
  ```

- [ ] Create `scripts/generate-openapi.ts`:

  ```typescript
  import { writeFileSync } from 'fs';
  import { app } from '../src/server.js';

  async function generateOpenAPI() {
    await app.ready();
    const spec = app.swagger();
    writeFileSync('openapi.json', JSON.stringify(spec, null, 2), 'utf-8');
    console.log('OpenAPI spec generated: openapi.json');
    process.exit(0);
  }

  generateOpenAPI();
  ```

### Step 8: Documentation

- [ ] Create `docs/API.md` with:
  - API overview
  - Authentication
  - Rate limiting
  - Error handling
  - Code examples
- [ ] Add link to Swagger UI in README

## Acceptance Criteria

- ✅ Swagger UI accessible at `http://localhost:3100/api/docs`
- ✅ All routes documented with descriptions
- ✅ Request/response schemas defined for all endpoints
- ✅ Schema validation enabled on all routes
- ✅ OpenAPI 3.1 spec exportable to `openapi.json`
- ✅ API documentation includes examples
- ✅ Tags properly categorize endpoints

## Verification Commands

```bash
# Start server
pnpm run dev

# Access Swagger UI
open http://localhost:3100/api/docs

# Generate OpenAPI spec
pnpm run openapi:generate

# Validate generated spec
npx @redocly/cli lint openapi.json
```

## Commit Strategy

```bash
git commit -m "docs: add OpenAPI/Swagger documentation

- Install @fastify/swagger and @fastify/swagger-ui
- Create Swagger configuration with OpenAPI 3.1 spec
- Add Zod schemas for all request/response types
- Document all API endpoints with schemas
- Add schema validation to routes
- Generate openapi.json specification
- Add API documentation

Swagger UI available at /api/docs

🤖 Generated with Claude Code"
```

---

# Priority 4: Standardize Error Handling 🛡️

**Status**: 🔴 Not Started
**Estimated Time**: 2-3 hours
**Why**: Consistent error responses, better debugging, production-ready
**Impact**: MEDIUM - Improves reliability and debugging

## Current State Analysis

- ✅ Basic error types exist in `src/utils/error-types.ts`
- ✅ Error handler middleware exists in `src/middleware/error-handler.ts`
- ❌ No standardized error codes
- ❌ No error severity levels
- ❌ Inconsistent error responses across services
- ❌ Stack traces may leak in production

## Task Checklist

### Step 1: Enhanced Error Type System

#### Update `src/utils/error-types.ts`

- [ ] Add error code enumeration:

  ```typescript
  export enum ErrorCode {
    // System Errors (1000-1999)
    INTERNAL_ERROR = 'ERR_INTERNAL_1000',
    DATABASE_ERROR = 'ERR_DATABASE_1001',
    CONFIGURATION_ERROR = 'ERR_CONFIG_1002',

    // TrueNAS Errors (2000-2999)
    TRUENAS_CONNECTION_FAILED = 'ERR_TRUENAS_2000',
    TRUENAS_AUTH_FAILED = 'ERR_TRUENAS_2001',
    TRUENAS_POOL_NOT_FOUND = 'ERR_TRUENAS_2002',
    TRUENAS_API_ERROR = 'ERR_TRUENAS_2003',

    // Portainer/Docker Errors (3000-3999)
    PORTAINER_CONNECTION_FAILED = 'ERR_PORTAINER_3000',
    PORTAINER_AUTH_FAILED = 'ERR_PORTAINER_3001',
    CONTAINER_NOT_FOUND = 'ERR_CONTAINER_3002',
    CONTAINER_START_FAILED = 'ERR_CONTAINER_3003',

    // ZFS Errors (4000-4999)
    ZFS_SNAPSHOT_FAILED = 'ERR_ZFS_4000',
    ZFS_SCRUB_FAILED = 'ERR_ZFS_4001',
    ZFS_POOL_DEGRADED = 'ERR_ZFS_4002',

    // Validation Errors (5000-5999)
    VALIDATION_ERROR = 'ERR_VALIDATION_5000',
    INVALID_INPUT = 'ERR_VALIDATION_5001',
    MISSING_REQUIRED_FIELD = 'ERR_VALIDATION_5002',

    // Authentication/Authorization (6000-6999)
    UNAUTHORIZED = 'ERR_AUTH_6000',
    FORBIDDEN = 'ERR_AUTH_6001',
    INVALID_API_KEY = 'ERR_AUTH_6002',
  }

  export enum ErrorSeverity {
    CRITICAL = 'critical', // System down, data loss risk
    HIGH = 'high', // Major functionality broken
    MEDIUM = 'medium', // Feature degraded
    LOW = 'low', // Minor issue
  }

  export interface ErrorMetadata {
    code: ErrorCode;
    severity: ErrorSeverity;
    recoverable: boolean;
    recoverySuggestion?: string;
    correlationId?: string;
    context?: Record<string, unknown>;
  }
  ```

- [ ] Update existing error classes to include metadata:

  ```typescript
  export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly severity: ErrorSeverity;
    public readonly recoverable: boolean;
    public readonly recoverySuggestion?: string;
    public readonly correlationId?: string;
    public readonly context?: Record<string, unknown>;
    public readonly statusCode: number;

    constructor(message: string, metadata: ErrorMetadata, statusCode = 500) {
      super(message);
      this.name = this.constructor.name;
      this.code = metadata.code;
      this.severity = metadata.severity;
      this.recoverable = metadata.recoverable;
      this.recoverySuggestion = metadata.recoverySuggestion;
      this.correlationId = metadata.correlationId;
      this.context = metadata.context;
      this.statusCode = statusCode;
      Error.captureStackTrace(this, this.constructor);
    }
  }
  ```

- [ ] Create specific error classes:

  ```typescript
  export class TrueNASError extends AppError {
    constructor(message: string, code: ErrorCode, context?: Record<string, unknown>) {
      super(
        message,
        {
          code,
          severity: ErrorSeverity.HIGH,
          recoverable: true,
          recoverySuggestion: 'Check TrueNAS API connection and credentials',
          context,
        },
        503,
      );
    }
  }

  export class PortainerError extends AppError {
    /* ... */
  }
  export class ZFSError extends AppError {
    /* ... */
  }
  export class ValidationError extends AppError {
    /* ... */
  }
  ```

### Step 2: Create Error Response Transformer

#### Create `src/middleware/error-transformer.ts`

- [ ] Implement error transformation middleware:

  ```typescript
  import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
  import { AppError, ErrorCode, ErrorSeverity } from '../utils/error-types.js';
  import { logger } from '../utils/logger.js';

  export interface StandardErrorResponse {
    error: {
      code: string;
      message: string;
      severity: ErrorSeverity;
      recoverable: boolean;
      recoverySuggestion?: string;
      correlationId: string;
      timestamp: string;
      path: string;
      stack?: string; // Only in development
      context?: Record<string, unknown>;
    };
  }

  export function errorTransformer(
    error: Error | FastifyError | AppError,
    request: FastifyRequest,
    reply: FastifyReply,
  ): StandardErrorResponse {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const correlationId = request.id || generateCorrelationId();

    let errorResponse: StandardErrorResponse;

    if (error instanceof AppError) {
      // Custom application error
      errorResponse = {
        error: {
          code: error.code,
          message: error.message,
          severity: error.severity,
          recoverable: error.recoverable,
          recoverySuggestion: error.recoverySuggestion,
          correlationId,
          timestamp: new Date().toISOString(),
          path: request.url,
          ...(isDevelopment && { stack: error.stack }),
          ...(error.context && { context: error.context }),
        },
      };

      // Log based on severity
      if (error.severity === ErrorSeverity.CRITICAL) {
        logger.fatal({ err: error, correlationId }, error.message);
      } else if (error.severity === ErrorSeverity.HIGH) {
        logger.error({ err: error, correlationId }, error.message);
      } else {
        logger.warn({ err: error, correlationId }, error.message);
      }

      reply.status(error.statusCode);
    } else if ('statusCode' in error && error.statusCode) {
      // Fastify error
      errorResponse = {
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: error.message,
          severity: ErrorSeverity.MEDIUM,
          recoverable: true,
          correlationId,
          timestamp: new Date().toISOString(),
          path: request.url,
          ...(isDevelopment && { stack: error.stack }),
        },
      };

      logger.error({ err: error, correlationId }, error.message);
      reply.status(error.statusCode);
    } else {
      // Unknown error
      errorResponse = {
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: isDevelopment ? error.message : 'Internal server error',
          severity: ErrorSeverity.CRITICAL,
          recoverable: false,
          recoverySuggestion: 'Contact system administrator',
          correlationId,
          timestamp: new Date().toISOString(),
          path: request.url,
          ...(isDevelopment && { stack: error.stack }),
        },
      };

      logger.fatal({ err: error, correlationId }, 'Unhandled error');
      reply.status(500);
    }

    return errorResponse;
  }

  function generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  ```

### Step 3: Update Error Handler Middleware

#### Update `src/middleware/error-handler.ts`

- [ ] Integrate error transformer:

  ```typescript
  import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
  import { errorTransformer } from './error-transformer.js';

  export function errorHandler(
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    const errorResponse = errorTransformer(error, request, reply);
    reply.send(errorResponse);
  }
  ```

### Step 4: Create Result Type for Error Handling

#### Create `src/utils/result.ts`

- [ ] Implement Result pattern for safe error handling:

  ```typescript
  /**
   * Result type for safe error handling without exceptions
   * Inspired by Rust's Result<T, E>
   */
  export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

  export const ok = <T>(value: T): Result<T, never> => ({
    ok: true,
    value,
  });

  export const err = <E>(error: E): Result<never, E> => ({
    ok: false,
    error,
  });

  /**
   * Unwrap result or throw error
   */
  export function unwrap<T, E>(result: Result<T, E>): T {
    if (result.ok) {
      return result.value;
    }
    throw result.error;
  }

  /**
   * Unwrap result or return default value
   */
  export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
    return result.ok ? result.value : defaultValue;
  }

  /**
   * Map result value if ok
   */
  export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
    return result.ok ? ok(fn(result.value)) : result;
  }

  /**
   * Map error value if error
   */
  export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
    return result.ok ? result : err(fn(result.error));
  }

  /**
   * Async version of Result
   */
  export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

  /**
   * Wrap async function to return Result
   */
  export async function wrapAsync<T, E = Error>(fn: () => Promise<T>): AsyncResult<T, E> {
    try {
      const value = await fn();
      return ok(value);
    } catch (error) {
      return err(error as E);
    }
  }
  ```

### Step 5: Update Services to Use New Error System

#### Update integration clients:

- [ ] Update `src/integrations/truenas/client.ts` to throw `TrueNASError`
- [ ] Update `src/integrations/portainer/client.ts` to throw `PortainerError`

#### Example:

```typescript
// Before:
throw new Error('Failed to connect to TrueNAS');

// After:
throw new TrueNASError('Failed to connect to TrueNAS API', ErrorCode.TRUENAS_CONNECTION_FAILED, {
  host: this.config.host,
  timeout: this.config.timeout,
});
```

### Step 6: Create Error Documentation

#### Create `docs/ERROR_CODES.md`

- [ ] Document all error codes
- [ ] Include recovery suggestions
- [ ] Add troubleshooting guide

### Step 7: Add Error Monitoring

#### Create `src/utils/error-metrics.ts`

- [ ] Track error counts by code
- [ ] Track error counts by severity
- [ ] Export metrics for Prometheus

## Acceptance Criteria

- ✅ All errors follow standard format with error codes
- ✅ Error severity levels properly assigned
- ✅ Recovery suggestions included where applicable
- ✅ Stack traces only exposed in development
- ✅ Correlation IDs in all error responses
- ✅ Errors properly logged with context
- ✅ Error codes documented
- ✅ Result type pattern available for safe error handling

## Verification

```bash
# Run tests to ensure error handling works
pnpm test

# Test error responses in development
curl http://localhost:3100/api/nonexistent

# Check error logs
pnpm run logs:tail

# Verify error metrics
pnpm run metrics | grep error
```

## Commit Strategy

```bash
git commit -m "feat: standardize error handling with codes and severity

- Add error code enumeration (1000-6999 range)
- Add error severity levels (CRITICAL, HIGH, MEDIUM, LOW)
- Implement error transformer middleware
- Add Result<T, E> pattern for safe error handling
- Update all services to use typed errors
- Add error documentation and troubleshooting guide
- Add error metrics tracking
- Hide stack traces in production
- Include recovery suggestions in errors

Improves debugging and production reliability

🤖 Generated with Claude Code"
```

---

# Priority 5-10 Tasks

> **Note**: Detailed task breakdowns for priorities 5-10 are available in separate files for better organization.

- Priority 5: See `priority-5-feature-flags.md`
- Priority 6: See `priority-6-context7-mcp.md`
- Priority 7: See `priority-7-migration-safety.md`
- Priority 8: See `priority-8-e2e-tests.md`
- Priority 9: See `priority-9-dependency-updates.md`
- Priority 10: See `priority-10-performance-monitoring.md`

---

# 🔄 Task Completion Workflow

When completing a task:

1. **Update Progress Tracker** (top of this file)
   - Change status: 🔴 → 🟡 → 🟢
   - Add completion timestamp

2. **Document in completed.md**
   - Add entry with commit hash
   - Note any deviations from plan
   - Document lessons learned

3. **Check for blockers**
   - If blocked, document in `issues.md`
   - Update status to 🔵 Blocked

4. **Run verification**
   - Execute verification commands
   - Ensure acceptance criteria met

5. **Commit changes**
   - Follow commit message template
   - Reference task in commit

6. **Move to next task**
   - Update "Current Focus" section
   - Begin next priority

---

# 📞 Getting Help

If you encounter issues:

1. Check `issues.md` for known problems
2. Review task-specific troubleshooting section
3. Check project documentation in `docs/`
4. Ask for clarification (update `issues.md` with question)

---

**Last Updated**: 2025-11-15
**Version**: 1.0
**Maintained by**: Claude Code for Web
