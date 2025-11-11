# TODO-11: Dashboard UI (Enhanced with Shopify Project Patterns)

> Production-ready dashboard using proven patterns from your Shopify TV Screen project

## 📋 Phase Overview

**Objective**: Build enterprise-grade dashboard with shadcn/ui, Storybook, and best practices from your Shopify project

**Duration**: 6-8 hours (includes Storybook setup)

**Prerequisites**:
- ✅ Phase 0-10 complete (backend fully functional)
- ✅ Reference: Your Shopify client architecture
- ✅ Copy patterns from `/shopify-tv-screen/client/`

## 🎯 Success Criteria

- [ ] shadcn/ui components installed and configured
- [ ] Storybook running with all components documented
- [ ] Query key factory pattern implemented
- [ ] Socket.IO integration with auto cache invalidation
- [ ] Dark mode with theme persistence
- [ ] Mobile responsive (tested on phone)
- [ ] <2s initial load, <100ms interactions
- [ ] Sentry error tracking configured

## 📚 Technology Stack (From Your Shopify Project)

### Core (Already Proven in Your Shopify Project)
```json
{
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "react-router-dom": "^7.9.4",
  "typescript": "~5.9.3",
  "vite": "^7.1.12"
}
```

### UI Framework (shadcn/ui Stack)
```json
{
  "@radix-ui/react-dialog": "^1.1.15",
  "@radix-ui/react-dropdown-menu": "^2.1.16",
  "@radix-ui/react-select": "^2.2.6",
  "@radix-ui/react-separator": "^1.1.7",
  "@radix-ui/react-slot": "^1.2.3",
  "@radix-ui/react-tooltip": "^1.2.8",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "tailwind-merge": "^3.3.1",
  "tailwindcss-animate": "^1.0.7",
  "lucide-react": "^0.548.0"
}
```

### State & Data
```json
{
  "@tanstack/react-query": "^5.71.10",
  "@tanstack/react-query-devtools": "^5.71.10",
  "socket.io-client": "^4.8.1",
  "zod": "^3.25.76",
  "zustand": "^4.4.7"
}
```

### Visualization
```json
{
  "recharts": "^2.10.0",
  "framer-motion": "^12.23.24"
}
```

### Utilities
```json
{
  "date-fns": "^4.1.0",
  "sonner": "^2.0.7",
  "react-helmet-async": "^2.0.5"
}
```

### Development
```json
{
  "@storybook/react": "^8.0.0",
  "@storybook/addon-essentials": "^8.0.0",
  "@storybook/addon-interactions": "^8.0.0",
  "@storybook/blocks": "^8.0.0",
  "@sentry/react": "^10.22.0",
  "@sentry/vite-plugin": "^4.6.0"
}
```

## 📝 Implementation Tasks

### 1. Project Setup (Copy from Shopify)

**Initialize with Vite + shadcn/ui**:

```bash
cd home-server-monitor
mkdir client && cd client

# Initialize Vite project
bun create vite . --template react-ts

# Install dependencies (same as your Shopify project)
bun add react react-dom react-router-dom
bun add @tanstack/react-query @tanstack/react-query-devtools
bun add socket.io-client zod zustand
bun add date-fns sonner react-helmet-async
bun add framer-motion lucide-react
bun add recharts

# Radix UI (shadcn primitives)
bun add @radix-ui/react-dialog @radix-ui/react-dropdown-menu
bun add @radix-ui/react-select @radix-ui/react-separator
bun add @radix-ui/react-slot @radix-ui/react-tooltip

# Tailwind utilities
bun add class-variance-authority clsx tailwind-merge
bun add tailwindcss-animate

# Dev dependencies
bun add -d tailwindcss@next @tailwindcss/postcss@next autoprefixer
bun add -d @types/node @types/react @types/react-dom
bun add -d @vitejs/plugin-react
bun add -d typescript eslint
bun add -d @sentry/react @sentry/vite-plugin

# Initialize shadcn/ui
bunx shadcn@latest init
```

**Select options**:
- Style: Default
- Base color: Neutral
- CSS variables: Yes

### 2. Copy Configuration Files from Shopify

**Create `components.json`** (copy from your Shopify project):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks",
    "contexts": "@/contexts"
  }
}
```

**Install shadcn components** (same as Shopify):

```bash
bunx shadcn@latest add button
bunx shadcn@latest add card
bunx shadcn@latest add badge
bunx shadcn@latest add input
bunx shadcn@latest add select
bunx shadcn@latest add separator
bunx shadcn@latest add sheet
bunx shadcn@latest add skeleton
bunx shadcn@latest add tooltip
bunx shadcn@latest add dialog
bunx shadcn@latest add dropdown-menu
bunx shadcn@latest add sidebar
bunx shadcn@latest add table
bunx shadcn@latest add tabs
bunx shadcn@latest add alert
bunx shadcn@latest add progress
bunx shadcn@latest add switch
```

### 3. Setup Variant Pattern (Like Your Shopify Project)

**Separate variants from components**:

Create `src/components/ui/button-variants.ts`:

```typescript
import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
```

Update `src/components/ui/button.tsx`:

```typescript
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { buttonVariants, type ButtonVariants } from './button-variants';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariants {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button };
```

### 4. Query Key Factory Pattern (From Your Shopify Project)

Create `src/lib/query-keys.ts`:

```typescript
/**
 * Query Key Factory
 *
 * Centralized, type-safe query keys for TanStack Query.
 * Pattern copied from Shopify TV Screen project.
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
 */

export const queryKeys = {
  // Pools
  pools: {
    all: ['pools'] as const,
    lists: () => [...queryKeys.pools.all, 'list'] as const,
    list: (filters?: string) => [...queryKeys.pools.lists(), { filters }] as const,
    details: () => [...queryKeys.pools.all, 'detail'] as const,
    detail: (name: string) => [...queryKeys.pools.details(), name] as const,
    health: (name: string) => [...queryKeys.pools.detail(name), 'health'] as const,
  },

  // Containers
  containers: {
    all: ['containers'] as const,
    lists: () => [...queryKeys.containers.all, 'list'] as const,
    list: (status?: string) => [...queryKeys.containers.lists(), { status }] as const,
    details: () => [...queryKeys.containers.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.containers.details(), id] as const,
    stats: (id: string) => [...queryKeys.containers.detail(id), 'stats'] as const,
  },

  // Alerts
  alerts: {
    all: ['alerts'] as const,
    lists: () => [...queryKeys.alerts.all, 'list'] as const,
    list: (filters?: { severity?: string; resolved?: boolean }) =>
      [...queryKeys.alerts.lists(), filters] as const,
    details: () => [...queryKeys.alerts.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.alerts.details(), id] as const,
    stats: () => [...queryKeys.alerts.all, 'stats'] as const,
  },

  // Metrics
  metrics: {
    all: ['metrics'] as const,
    system: () => [...queryKeys.metrics.all, 'system'] as const,
    realtime: () => [...queryKeys.metrics.all, 'realtime'] as const,
    history: (range: string) => [...queryKeys.metrics.all, 'history', range] as const,
  },

  // Security
  security: {
    all: ['security'] as const,
    status: () => [...queryKeys.security.all, 'status'] as const,
    bannedIPs: () => [...queryKeys.security.all, 'bannedIPs'] as const,
    threats: () => [...queryKeys.security.all, 'threats'] as const,
  },

  // Remediation
  remediation: {
    all: ['remediation'] as const,
    plans: () => [...queryKeys.remediation.all, 'plans'] as const,
    pending: () => [...queryKeys.remediation.plans(), 'pending'] as const,
    history: () => [...queryKeys.remediation.all, 'history'] as const,
  },
} as const;
```

### 5. Socket.IO Context (Pattern from Shopify)

Create `src/contexts/socket-context.tsx`:

```typescript
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const socketInstance = io(import.meta.env.VITE_API_URL || 'http://localhost:3100', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected');
      setConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
      setConnected(false);
    });

    // Real-time updates with automatic cache invalidation
    socketInstance.on('pool:status', () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pools.all });
    });

    socketInstance.on('container:status', () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.containers.all });
    });

    socketInstance.on('alert:new', (alert) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
      // Optionally show toast notification
    });

    socketInstance.on('metrics:update', () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.metrics.all });
    });

    socketInstance.on('security:event', () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.security.all });
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [queryClient]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
}
```

### 6. Custom Hooks (Pattern from Shopify)

Create `src/hooks/use-pools.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiClient } from '@/lib/api-client';

export function usePools() {
  return useQuery({
    queryKey: queryKeys.pools.lists(),
    queryFn: () => apiClient.getPools(),
    refetchInterval: 30000, // 30 seconds
    staleTime: 10000, // 10 seconds
  });
}

export function usePool(poolName: string) {
  return useQuery({
    queryKey: queryKeys.pools.detail(poolName),
    queryFn: () => apiClient.getPoolStatus(poolName),
    enabled: !!poolName,
    refetchInterval: 15000,
  });
}

export function usePoolHealth(poolName: string) {
  return useQuery({
    queryKey: queryKeys.pools.health(poolName),
    queryFn: () => apiClient.getPoolHealth(poolName),
    enabled: !!poolName,
    refetchInterval: 60000, // 1 minute
  });
}
```

Create `src/hooks/use-alerts.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

export function useAlerts(filters?: { severity?: string; resolved?: boolean }) {
  return useQuery({
    queryKey: queryKeys.alerts.list(filters),
    queryFn: () => apiClient.getAlerts(filters),
    refetchInterval: 10000, // 10 seconds
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ alertId, userId }: { alertId: string; userId: string }) =>
      apiClient.acknowledgeAlert(alertId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
      toast.success('Alert acknowledged');
    },
    onError: () => {
      toast.error('Failed to acknowledge alert');
    },
  });
}
```

### 7. Dashboard Components

Create `src/components/dashboard/pool-status.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { HardDrive, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePools } from '@/hooks/use-pools';
import { Skeleton } from '@/components/ui/skeleton';

export function PoolStatus() {
  const { data: pools, isLoading } = usePools();

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {pools?.map((pool) => {
        const usagePercent = (pool.used / pool.capacity) * 100;
        const statusIcon = getStatusIcon(pool.status);
        const statusVariant = getStatusVariant(pool.status);

        return (
          <Card key={pool.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                {pool.name}
              </CardTitle>
              <Badge variant={statusVariant}>{pool.status}</Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {formatBytes(pool.used)} / {formatBytes(pool.capacity)}
                  </span>
                  <span className="font-medium">{usagePercent.toFixed(1)}%</span>
                </div>
                <Progress
                  value={usagePercent}
                  className={cn(
                    usagePercent > 90 && 'bg-destructive',
                    usagePercent > 80 && usagePercent <= 90 && 'bg-warning'
                  )}
                />
                {pool.disks && (
                  <div className="pt-2 space-y-1">
                    {pool.disks.map((disk) => (
                      <div
                        key={disk.name}
                        className="flex items-center justify-between text-xs text-muted-foreground"
                      >
                        <span className="flex items-center gap-1">
                          <div
                            className={cn(
                              'h-2 w-2 rounded-full',
                              disk.status === 'ONLINE' ? 'bg-green-500' : 'bg-red-500'
                            )}
                          />
                          {disk.name}
                        </span>
                        <span
                          className={cn(
                            disk.temperature > 50 && 'text-destructive',
                            disk.temperature > 45 &&
                              disk.temperature <= 50 &&
                              'text-warning'
                          )}
                        >
                          {disk.temperature}°C
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'ONLINE':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'DEGRADED':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    default:
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
  }
}

function getStatusVariant(status: string): 'default' | 'destructive' | 'outline' | 'secondary' {
  switch (status) {
    case 'ONLINE':
      return 'default';
    case 'DEGRADED':
      return 'outline';
    default:
      return 'destructive';
  }
}

function formatBytes(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}
```

### 8. Storybook Setup

**Install Storybook**:

```bash
bunx storybook@latest init
```

**Create story** for `PoolStatus`:

Create `src/components/dashboard/pool-status.stories.tsx`:

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PoolStatus } from './pool-status';

const queryClient = new QueryClient();

const meta: Meta<typeof PoolStatus> = {
  title: 'Dashboard/PoolStatus',
  component: PoolStatus,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof PoolStatus>;

export const Default: Story = {
  parameters: {
    mockData: [
      {
        url: '/api/v1/pools',
        method: 'GET',
        status: 200,
        response: [
          {
            name: 'personal',
            status: 'ONLINE',
            capacity: 4000000000000,
            used: 2000000000000,
            available: 2000000000000,
            disks: [
              { name: 'sda', status: 'ONLINE', temperature: 42 },
              { name: 'sdb', status: 'ONLINE', temperature: 44 },
            ],
          },
        ],
      },
    ],
  },
};

export const Degraded: Story = {
  parameters: {
    mockData: [
      {
        url: '/api/v1/pools',
        method: 'GET',
        status: 200,
        response: [
          {
            name: 'media',
            status: 'DEGRADED',
            capacity: 8000000000000,
            used: 7200000000000,
            available: 800000000000,
            disks: [
              { name: 'sdc', status: 'ONLINE', temperature: 52 },
              { name: 'sdd', status: 'DEGRADED', temperature: 58 },
            ],
          },
        ],
      },
    ],
  },
};
```

### 9. Sentry Error Tracking

Create `src/lib/sentry.ts`:

```typescript
import * as Sentry from '@sentry/react';

export function initSentry() {
  if (import.meta.env.PROD) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration(),
      ],
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });
  }
}
```

Update `src/main.tsx`:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { SocketProvider } from '@/contexts/socket-context';
import { initSentry } from '@/lib/sentry';
import App from './App';
import './index.css';

// Initialize Sentry
initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 30000,
      staleTime: 10000,
      retry: 3,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SocketProvider>
        <App />
        <ReactQueryDevtools initialIsOpen={false} />
      </SocketProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
```

## 🧪 Testing

### Development

```bash
# Terminal 1 - Backend
cd ../
bun run dev

# Terminal 2 - Frontend
cd client
bun run dev

# Terminal 3 - Storybook
bun run storybook
```

### Build & Preview

```bash
bun run build
bun run preview
```

## 📚 Storybook Documentation

Access at: http://localhost:6006

Document all components:
- ✅ UI primitives (Button, Card, Badge, etc.)
- ✅ Dashboard components (PoolStatus, ContainerGrid, etc.)
- ✅ Charts (MetricChart, PoolUsageChart, etc.)
- ✅ Layout components (Header, Sidebar, etc.)

## 🎨 shadcn Blocks (Optional Enhancement)

For rapid page building, install shadcn blocks:

```bash
bunx shadcn@latest add sidebar-01
bunx shadcn@latest add dashboard-01
bunx shadcn@latest add chart-01
```

Browse blocks: https://ui.shadcn.com/blocks

## 🎯 tweakcn (Optional Variant Tweaking)

For visual variant editing:

```bash
bun add -D tweakcn
bunx tweakcn
```

Opens UI to visually edit your CVA variants!

## ✅ Completion Checklist

- [ ] shadcn/ui components installed
- [ ] Variant pattern implemented (separated files)
- [ ] Query key factory created
- [ ] Socket.IO context with auto-invalidation
- [ ] Custom hooks for all data
- [ ] Dashboard components built
- [ ] Storybook stories written
- [ ] Sentry configured
- [ ] Dark mode working
- [ ] Mobile responsive
- [ ] Build optimized (<2s load)
- [ ] All patterns from Shopify project copied

## 🚀 Next Steps

After completion:
1. Deploy Storybook to Chromatic/Netlify
2. Add more components as needed
3. Set up visual regression testing
4. Proceed to Phase 12: Deployment

---

**Remember**: You've already proven this architecture works in production with your Shopify project. Copy the patterns, not the code!