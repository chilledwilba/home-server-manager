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
