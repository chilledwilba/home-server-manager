# TODO-01: Enterprise-Level Project Scaffold

## Goal
Set up a production-grade TypeScript project with enterprise tooling, following patterns from the Shopify tracker project.

## Success Criteria
- [ ] TypeScript strict mode configured
- [ ] ESLint + Prettier (or Biome) working
- [ ] Husky git hooks active
- [ ] Conventional commits enforced
- [ ] Dotenvx vault configured
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] Update index.md progress tracker

## Phase 1: Project Initialization

### 1.1 Create Project Structure
```bash
# Create project directory
mkdir home-server-monitor
cd home-server-monitor

# Initialize git
git init

# Create .gitignore
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.bun/

# Environment
.env
.env.local
.env.*.local
.env.keys
!.env.example
!.env.vault

# Database
*.db
*.sqlite
data/

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Build
dist/
build/
*.tsbuildinfo

# IDE
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
.idea/
*.swp
*.swo
.DS_Store

# Testing
coverage/
.nyc_output/

# Temporary
tmp/
temp/
EOF

# Initialize with Bun
bun init -y

# Create directory structure
mkdir -p .github/workflows
mkdir -p .husky
mkdir -p config
mkdir -p docker
mkdir -p docs/api
mkdir -p scripts
mkdir -p src/{config,db/migrations,integrations,mcp,routes,services,types,utils}
mkdir -p tests/{unit,integration,e2e}
```

### 1.2 Install Dependencies

```bash
# Core framework
bun add fastify @fastify/cors @fastify/env @fastify/helmet @fastify/rate-limit

# TypeScript
bun add -d typescript @types/node tsx

# Database
bun add better-sqlite3
bun add -d @types/better-sqlite3

# Real-time
bun add socket.io
bun add -d @socket.io/typed-events

# Validation
bun add zod

# Logging
bun add pino pino-pretty

# Configuration
bun add dotenv @dotenvx/dotenvx

# Testing
bun add -d jest @types/jest ts-jest supertest @types/supertest

# Code quality
bun add -d eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
bun add -d prettier eslint-config-prettier eslint-plugin-prettier
bun add -d @biomejs/biome  # Alternative all-in-one

# Git hooks
bun add -d husky lint-staged @commitlint/cli @commitlint/config-conventional

# Documentation
bun add -d typedoc

# Type checking
bun add -d type-fest  # Useful type utilities
```

## Phase 2: TypeScript Configuration

### 2.1 Create `tsconfig.json`
```json
{
  "compilerOptions": {
    // Language and Environment
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",

    // Bun specific
    "types": ["bun-types", "node", "jest"],

    // Emit
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": true,

    // Interop Constraints
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,

    // Type Checking - STRICT MODE
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true,
    "allowUnusedLabels": false,
    "allowUnreachableCode": false,

    // Skip Lib Check
    "skipLibCheck": true,

    // Paths
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"],
      "@config/*": ["config/*"],
      "@db/*": ["db/*"],
      "@integrations/*": ["integrations/*"],
      "@routes/*": ["routes/*"],
      "@services/*": ["services/*"],
      "@types/*": ["types/*"],
      "@utils/*": ["utils/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests", "coverage"]
}
```

### 2.2 Create `tsconfig.build.json`
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["**/*.spec.ts", "**/*.test.ts", "tests"]
}
```

## Phase 3: Code Quality Tools

### 3.1 Create `.eslintrc.js`
```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:@typescript-eslint/strict',
    'prettier',
  ],
  rules: {
    // TypeScript strict rules
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',

    // General best practices
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'prefer-const': 'error',
    'curly': 'error',
    'eqeqeq': 'error',

    // Prettier integration
    'prettier/prettier': 'error',
  },
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['dist', 'coverage', 'node_modules', '*.js'],
};
```

### 3.2 Create `.prettierrc`
```json
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "proseWrap": "preserve"
}
```

### 3.3 Create `biome.json` (Alternative to ESLint+Prettier)
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf",
    "ignore": ["dist", "coverage", "node_modules"]
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": {
        "noForEach": "off"
      },
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error"
      },
      "style": {
        "useConst": "error",
        "useTemplate": "error",
        "noVar": "error"
      },
      "suspicious": {
        "noExplicitAny": "error",
        "noDebugger": "error",
        "noConsoleLog": "warn"
      }
    },
    "ignore": ["dist", "coverage", "node_modules"]
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always",
      "trailingCommas": "all",
      "arrowParentheses": "always"
    }
  }
}
```

## Phase 4: Git Hooks and Commit Standards

### 4.1 Create `commitlint.config.js`
```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation
        'style',    // Formatting
        'refactor', // Code restructuring
        'perf',     // Performance
        'test',     // Tests
        'build',    // Build system
        'ci',       // CI/CD
        'chore',    // Maintenance
        'revert',   // Revert commit
      ],
    ],
    'subject-case': [2, 'never', ['upper-case']],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100],
  },
};
```

### 4.2 Create `.lintstagedrc.json`
```json
{
  "*.{ts,tsx}": [
    "eslint --fix",
    "prettier --write",
    "jest --bail --findRelatedTests --passWithNoTests"
  ],
  "*.{json,md,yml,yaml}": ["prettier --write"],
  "*.{js,jsx}": ["eslint --fix", "prettier --write"]
}
```

### 4.3 Initialize Husky
```bash
# Initialize husky
npx husky init

# Add pre-commit hook
cat > .husky/pre-commit << 'EOF'
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run lint-staged
npx lint-staged

# Type check
bun run type-check
EOF

# Add commit-msg hook
cat > .husky/commit-msg << 'EOF'
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Validate commit message
npx commitlint --edit "$1"
EOF

# Add pre-push hook
cat > .husky/pre-push << 'EOF'
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Run tests before push
bun test
EOF

# Make hooks executable
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg
chmod +x .husky/pre-push
```

## Phase 5: Environment and Security

### 5.1 Create `.env.example`

> **IMPORTANT**: These are **MOCK/EXAMPLE** values for building the project. Replace with real values when deploying locally.

```bash
# Server Configuration
NODE_ENV=development
PORT=3100
HOST=0.0.0.0

# TrueNAS Configuration (MOCK VALUES - replace when deploying)
TRUENAS_HOST=192.168.1.100
TRUENAS_API_KEY=mock-truenas-api-key-replace-on-deploy
TRUENAS_USERNAME=admin
TRUENAS_PASSWORD=

# Portainer Configuration (MOCK VALUES - replace when deploying)
PORTAINER_HOST=192.168.1.100
PORTAINER_PORT=9000
PORTAINER_TOKEN=mock-portainer-token-replace-on-deploy

# Database
DB_PATH=./data/monitor.db

# Security
API_TOKEN=mock-api-token-for-development-only
ENABLE_WRITE_OPERATIONS=false
REQUIRE_CONFIRMATION=true

# Logging
LOG_LEVEL=info

# Monitoring Intervals (ms)
POLL_SYSTEM_INTERVAL=30000
POLL_DOCKER_INTERVAL=5000
POLL_SMART_INTERVAL=3600000

# Optional: Arr Apps (leave empty for now - configure during deployment)
SONARR_HOST=
SONARR_PORT=8989
SONARR_API_KEY=

RADARR_HOST=
RADARR_PORT=7878
RADARR_API_KEY=

PROWLARR_HOST=
PROWLARR_PORT=9696
PROWLARR_API_KEY=

# Optional: Plex (leave empty for now - configure during deployment)
PLEX_HOST=
PLEX_PORT=32400
PLEX_TOKEN=

# Optional: Alerting Services (leave empty for now - configure during deployment)
# Discord
DISCORD_WEBHOOK_URL=

# Pushover
PUSHOVER_APP_TOKEN=
PUSHOVER_USER_KEY=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Email (SMTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=

# Optional: Local LLM (leave empty for now)
OLLAMA_HOST=
OLLAMA_PORT=11434
OLLAMA_MODEL=llama2

# Optional: OpenAI/Anthropic (leave empty for now)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

### 5.2 Set up dotenvx (Optional during build phase)

> **NOTE**: During the build phase, you can skip dotenvx encryption. Just use the mock values from `.env.example`. Encryption is only needed when deploying with real API keys.

```bash
# For now, just copy the example
cp .env.example .env

# Later, when deploying with real API keys:
# 1. Install dotenvx CLI
# curl -sfS https://dotenvx.sh/install.sh | sh
#
# 2. Edit .env with your real values
#
# 3. Encrypt it
# dotenvx encrypt
#
# This creates:
# - .env.vault (safe to commit)
# - .env.keys (NEVER commit - add to .gitignore)
```

## Phase 6: Testing Configuration

### 6.1 Create `jest.config.js`
```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        ...require('./tsconfig.json').compilerOptions,
        noUnusedLocals: false,
        noUnusedParameters: false,
      },
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/types/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@db/(.*)$': '<rootDir>/src/db/$1',
    '^@integrations/(.*)$': '<rootDir>/src/integrations/$1',
    '^@routes/(.*)$': '<rootDir>/src/routes/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  verbose: true,
};
```

### 6.2 Create `tests/setup.ts`
```typescript
// Test setup file
import { config } from 'dotenv';

// Load test environment
config({ path: '.env.test' });

// Mock logger in tests
jest.mock('@utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Increase timeout for integration tests
jest.setTimeout(10000);

// Clean up after tests
afterAll(async () => {
  // Close any open handles
  await new Promise((resolve) => setTimeout(resolve, 100));
});
```

## Phase 7: Package.json Scripts

### 7.1 Update `package.json`
```json
{
  "name": "home-server-monitor",
  "version": "0.1.0",
  "description": "Enterprise-grade TrueNAS monitoring with AI assistance",
  "main": "dist/server.js",
  "type": "module",
  "engines": {
    "node": ">=20.0.0",
    "bun": ">=1.0.0"
  },
  "scripts": {
    "dev": "bun run --watch src/server.ts",
    "build": "bun build src/server.ts --outdir=dist --target=bun",
    "start": "NODE_ENV=production bun run dist/server.js",

    "type-check": "tsc --noEmit",
    "type-check:watch": "tsc --noEmit --watch",

    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "format": "prettier --write \"src/**/*.{ts,json,md}\"",
    "format:check": "prettier --check \"src/**/*.{ts,json,md}\"",

    "biome:check": "biome check --write src",
    "biome:ci": "biome ci src",

    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "jest tests/e2e",

    "db:migrate": "bun run scripts/migrate.ts",
    "db:seed": "bun run scripts/seed.ts",
    "db:reset": "rm -f data/*.db && bun run db:migrate && bun run db:seed",

    "env:encrypt": "dotenvx encrypt",
    "env:decrypt": "dotenvx decrypt",
    "env:vault:status": "dotenvx vault status",

    "docker:build": "docker build -t home-server-monitor .",
    "docker:run": "docker-compose up",
    "docker:stop": "docker-compose down",

    "docs:generate": "typedoc --out docs/api src",

    "security:scan": "npm audit && bun outdated",

    "prepare": "husky",
    "precommit": "lint-staged",
    "prepush": "bun run type-check && bun test"
  },
  "keywords": [
    "truenas",
    "monitoring",
    "typescript",
    "fastify",
    "mcp",
    "ai"
  ],
  "author": "Your Name",
  "license": "MIT"
}
```

## Phase 8: Initial Source Files

### 8.1 Create `src/types/index.ts`
```typescript
/**
 * Core type definitions for Home Server Monitor
 */

import type { z } from 'zod';

// Re-export zod for convenience
export { z };

/**
 * System Information Types
 */
export interface SystemInfo {
  hostname: string;
  version: string;
  uptime: string;
  cpuModel: string;
  cpuCores: number;
  ramTotal: number;
  bootTime: Date;
}

export interface SystemStats {
  cpu: {
    usage: number;
    temperature: number;
    perCore: number[];
  };
  memory: {
    used: number;
    available: number;
    arc: number; // ZFS ARC cache
    percentage: number;
  };
  network: {
    rxRate: number;
    txRate: number;
  };
  loadAverage: [number, number, number];
}

/**
 * Storage Types
 */
export interface PoolInfo {
  name: string;
  type: 'personal' | 'media' | 'apps' | 'boot' | 'unknown';
  status: 'ONLINE' | 'DEGRADED' | 'FAULTED';
  health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  capacity: {
    used: number;
    available: number;
    total: number;
    percent: number;
  };
  topology: unknown; // Will be refined based on actual API
  lastScrub: Date | null;
  scrubErrors: number;
  encryption: boolean;
  autotrim: boolean;
}

export interface DiskInfo {
  identifier: string;
  name: string;
  model: string;
  serial: string;
  size: number;
  type: 'HDD' | 'SSD' | 'NVMe';
  temperature: number;
  smartStatus: string;
  isNVMe: boolean;
  isIronWolf: boolean;
  isCritical: boolean;
}

export interface SmartData {
  diskName: string;
  temperature: number;
  powerOnHours: number;
  reallocatedSectors: number;
  pendingSectors: number;
  healthStatus: 'PASSED' | 'FAILED';
  loadCycleCount?: number;
  spinRetryCount?: number;
}

/**
 * Container Types
 */
export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: 'running' | 'stopped' | 'restarting' | 'paused';
  status: string;
  created: Date;
  ports: Array<{
    private: number;
    public?: number;
    type: string;
  }>;
  labels: Record<string, string>;
  isArrApp: boolean;
  isPlex: boolean;
  isCritical: boolean;
}

export interface ContainerStats {
  cpu: {
    percentage: number;
    cores: number;
  };
  memory: {
    used: number;
    limit: number;
    percentage: number;
  };
  network: {
    rx: number;
    tx: number;
  };
  io: {
    read: number;
    write: number;
  };
}

/**
 * Alert Types
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface Alert {
  id: number;
  type: string;
  severity: AlertSeverity;
  message: string;
  details?: unknown;
  triggeredAt: Date;
  acknowledged: boolean;
  resolved: boolean;
  actionable?: boolean;
  suggestedAction?: string;
}

/**
 * Security Types
 */
export interface SecurityFinding {
  container: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  recommendation: string;
  cve?: string;
  fixed: boolean;
  foundAt?: Date;
  fixedAt?: Date;
}

/**
 * Configuration Types
 */
export interface Config {
  server: {
    port: number;
    host: string;
  };
  truenas: {
    host: string;
    apiKey: string;
    timeout: number;
  };
  portainer?: {
    host: string;
    port: number;
    token: string;
    endpointId: number;
  };
  database: {
    path: string;
  };
  monitoring: {
    enabled: boolean;
    intervals: {
      system: number;
      docker: number;
      storage: number;
      smart: number;
    };
  };
  security: {
    apiToken?: string;
    enableWrite: boolean;
    requireConfirmation: boolean;
  };
}

/**
 * API Response Types
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T = unknown> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * MCP Types
 */
export interface MCPAction {
  id: string;
  type: string;
  input: unknown;
  timestamp: Date;
  confirmed: boolean;
}

/**
 * Type Guards
 */
export function isContainerRunning(container: ContainerInfo): boolean {
  return container.state === 'running';
}

export function isCriticalAlert(alert: Alert): boolean {
  return alert.severity === 'critical' && !alert.resolved;
}

export function isHealthyPool(pool: PoolInfo): boolean {
  return pool.status === 'ONLINE' && pool.health === 'HEALTHY';
}
```

### 8.2 Create `src/utils/logger.ts`
```typescript
import pino from 'pino';
import type { Logger } from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

export const logger: Logger = pino({
  level: logLevel,
  transport: isProduction
    ? undefined // Use default JSON in production
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'SYS:standard',
          singleLine: false,
        },
      },
  base: {
    env: process.env.NODE_ENV,
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-api-key"]', '*.apiKey', '*.token'],
    censor: '[REDACTED]',
  },
});

// Create child loggers for different modules
export const createLogger = (module: string): Logger => {
  return logger.child({ module });
};

// Export specialized loggers
export const dbLogger = createLogger('database');
export const apiLogger = createLogger('api');
export const securityLogger = createLogger('security');
export const mcpLogger = createLogger('mcp');
```

### 8.3 Create `src/server.ts` (Minimal)
```typescript
import Fastify from 'fastify';
import { logger } from './utils/logger';

/**
 * Build and configure the Fastify server
 */
async function buildServer() {
  const fastify = Fastify({
    logger,
    trustProxy: true,
  });

  // Health check endpoint
  fastify.get('/health', async () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
    };
  });

  return fastify;
}

/**
 * Start the server
 */
async function start(): Promise<void> {
  try {
    const server = await buildServer();
    const port = parseInt(process.env.PORT || '3100', 10);
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });

    logger.info({
      msg: 'Server started successfully',
      port,
      host,
      env: process.env.NODE_ENV,
    });
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
});

// Start server
void start();
```

### 8.4 Create First Test `tests/unit/server.test.ts`
```typescript
import { describe, it, expect, jest } from '@jest/globals';

describe('Server', () => {
  it('should start without errors', () => {
    expect(true).toBe(true);
  });

  // TODO: Add actual server tests
  it.todo('should respond to health check');
  it.todo('should handle graceful shutdown');
});
```

## Phase 9: Docker Configuration

### 9.1 Create `Dockerfile`
```dockerfile
# Multi-stage build for production
FROM oven/bun:1 AS base
WORKDIR /app

# Dependencies stage
FROM base AS deps
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Production stage
FROM base AS production
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 nodejs && \
    adduser -D -u 1001 -G nodejs nodejs

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs package.json ./

# Create data directory
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

USER nodejs

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

CMD ["bun", "run", "dist/server.js"]
```

### 9.2 Create `docker-compose.yml`
```yaml
version: '3.8'

services:
  home-server-monitor:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: home-server-monitor
    restart: unless-stopped
    ports:
      - "3100:3100"
    environment:
      - NODE_ENV=production
      - PORT=3100
      - HOST=0.0.0.0
    env_file:
      - .env
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    networks:
      - monitoring
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3100/health"]
      interval: 30s
      timeout: 3s
      retries: 3

networks:
  monitoring:
    driver: bridge
```

## Phase 10: GitHub Actions CI/CD

### 10.1 Create `.github/workflows/ci.yml`
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [20.x]

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}
          restore-keys: |
            ${{ runner.os }}-bun-

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Type check
        run: bun run type-check

      - name: Lint
        run: bun run lint

      - name: Format check
        run: bun run format:check

      - name: Test
        run: bun run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: false

      - name: Build
        run: bun run build

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run security audit
        run: npm audit --audit-level=high
```

## Phase 11: Validation & Testing

### Run all checks
```bash
# Type checking
bun run type-check
# Should output: No errors

# Linting
bun run lint
# Should output: No errors

# Formatting
bun run format:check
# Should output: All matched files use Prettier code style

# Tests
bun test
# Should show: 1 passing test

# Start server
bun run dev
# Should start on port 3100

# Test health endpoint
curl http://localhost:3100/health
# Should return: {"status":"healthy",...}
```

## Common Issues & Solutions

### Issue: TypeScript path aliases not working
```bash
# Ensure tsconfig.json paths are correct
# Install tsconfig-paths for runtime
bun add -d tsconfig-paths
```

### Issue: Husky hooks not running
```bash
# Reinstall husky
rm -rf .husky
npx husky init
# Re-add hooks as shown above
```

### Issue: ESLint/Prettier conflicts
```bash
# Use Biome instead (simpler)
bun run biome:check
```

### Issue: Dotenvx not found
```bash
# Install globally
npm i -g @dotenvx/dotenvx
# Or use npx
npx dotenvx encrypt
```

## Checklist for Completion

- [ ] Project structure created
- [ ] All dependencies installed
- [ ] TypeScript strict mode working
- [ ] ESLint configured (or Biome)
- [ ] Prettier configured
- [ ] Husky hooks active
- [ ] Commitlint working
- [ ] Tests running
- [ ] Server starts successfully
- [ ] Health endpoint responds
- [ ] Docker builds successfully
- [ ] Dotenvx vault configured
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Update index.md: Mark Phase 1 as 🟢 Complete

## Next Steps

After completing this TODO:
1. Commit with message: `feat: initial enterprise scaffold with TypeScript strict mode`
2. Update index.md progress tracker
3. Proceed to TODO-02 for TrueNAS integration

---

**Remember**: This is an enterprise-grade setup. Don't skip any steps. Each configuration is important for maintaining code quality throughout the project.