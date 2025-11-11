# Best Patterns to Copy from Shopify TV Screen Project

> This document maps proven patterns from your Shopify project to the Home Server Monitor

## 🎯 Quick Reference

| Pattern | Shopify Location | Home Server Location | Why It's Great |
|---------|-----------------|---------------------|----------------|
| shadcn/ui setup | `/client/components.json` | `/client/components.json` | Production-proven component system |
| Query Key Factory | `/client/src/lib/query-keys.ts` | `/client/src/lib/query-keys.ts` | Type-safe cache management |
| Socket Context | `/client/src/hooks/useSocketContext.ts` | `/client/src/contexts/socket-context.tsx` | Auto cache invalidation |
| Variant Separation | `/client/src/components/ui/button-variants.ts` | Same pattern | Maintainable styling |
| Custom Hooks | `/client/src/hooks/*.ts` | `/client/src/hooks/*.ts` | Clean separation of concerns |
| API Client | `/client/src/lib/fetch.ts` | `/client/src/lib/api-client.ts` | Centralized requests |
| Error Handling | `/client/src/lib/sentry.ts` | `/client/src/lib/sentry.ts` | Production monitoring |

## 📦 1. Package.json Dependencies (Copy These)

### From `/shopify-tv-screen/client/package.json`

**Core React Stack**:
```json
{
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "react-router-dom": "^7.9.4"
}
```

**shadcn/ui Dependencies** (Already using!):
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

**State & Data**:
```json
{
  "@tanstack/react-query": "^5.71.10",
  "@tanstack/react-query-devtools": "^5.71.10",
  "socket.io-client": "^4.8.1",
  "zod": "^3.25.76",
  "zustand": "^4.4.7"
}
```

**UI Enhancements**:
```json
{
  "framer-motion": "^12.23.24",
  "sonner": "^2.0.7",
  "date-fns": "^4.1.0",
  "react-helmet-async": "^2.0.5"
}
```

**Charts** (Use Recharts for simpler setup than ApexCharts):
```json
{
  "recharts": "^2.10.0"
}
```

**Error Tracking**:
```json
{
  "@sentry/react": "^10.22.0",
  "@sentry/vite-plugin": "^4.6.0"
}
```

## 🏗️ 2. Project Structure (Mirror This)

```bash
# Your Shopify Structure          # Home Server Structure
client/                            client/
├── components.json                ├── components.json         # ✅ Copy this
├── src/                           ├── src/
│   ├── components/                │   ├── components/
│   │   ├── ui/                    │   │   ├── ui/            # ✅ Copy pattern
│   │   │   ├── button.tsx         │   │   │   ├── button.tsx
│   │   │   └── button-variants.ts │   │   │   └── button-variants.ts
│   │   └── [features]/            │   │   └── dashboard/     # New: monitoring components
│   ├── hooks/                     │   ├── hooks/             # ✅ Copy pattern
│   │   ├── useOrders.ts           │   │   ├── use-pools.ts
│   │   ├── useSocketContext.ts    │   │   ├── use-containers.ts
│   │   └── usePrinters.ts         │   │   └── use-alerts.ts
│   ├── lib/                       │   ├── lib/               # ✅ Copy these files
│   │   ├── query-keys.ts          │   │   ├── query-keys.ts  # ⭐ Copy this!
│   │   ├── utils.ts               │   │   ├── utils.ts       # ✅ Copy this
│   │   └── fetch.ts               │   │   └── api-client.ts
│   ├── contexts/                  │   ├── contexts/
│   │   └── SocketContext.tsx      │   │   └── socket-context.tsx
│   └── pages/                     │   └── pages/
│       ├── Dashboard.tsx          │       ├── dashboard.tsx
│       └── Invoices.tsx           │       └── pools.tsx
└── tailwind.config.js             └── tailwind.config.js     # ✅ Copy config
```

## ⭐ 3. Query Key Factory (Copy This Exactly!)

### From: `/shopify-tv-screen/client/src/lib/query-keys.ts`

**Your Shopify Pattern**:
```typescript
export const queryKeys = {
  orders: {
    all: ['orders'] as const,
    lists: () => [...queryKeys.orders.all, 'list'] as const,
    list: (filters?: string) => [...queryKeys.orders.lists(), { filters }] as const,
    details: () => [...queryKeys.orders.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.orders.details(), id] as const,
  },
}
```

**Adapt to Home Server**:
```typescript
export const queryKeys = {
  pools: {
    all: ['pools'] as const,
    lists: () => [...queryKeys.pools.all, 'list'] as const,
    list: (filters?: string) => [...queryKeys.pools.lists(), { filters }] as const,
    details: () => [...queryKeys.pools.all, 'detail'] as const,
    detail: (name: string) => [...queryKeys.pools.details(), name] as const,
    health: (name: string) => [...queryKeys.pools.detail(name), 'health'] as const,
  },

  containers: {
    all: ['containers'] as const,
    lists: () => [...queryKeys.containers.all, 'list'] as const,
    list: (status?: string) => [...queryKeys.containers.lists(), { status }] as const,
    details: () => [...queryKeys.containers.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.containers.details(), id] as const,
  },

  // Add more as needed...
}
```

**Why This Pattern?**:
- ✅ Type-safe query keys
- ✅ Prevents typos
- ✅ Hierarchical invalidation
- ✅ Auto-completion in IDE

## 🔌 4. Socket.IO Integration (Copy This Pattern!)

### From: `/shopify-tv-screen/client/src/hooks/useSocketContext.ts`

**Your Shopify Pattern**:
```typescript
// Shopify: Auto-invalidate on socket events
socket.on('order:updated', () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
});

socket.on('printer:status', () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.printers.all });
});
```

**Adapt to Home Server**:
```typescript
// Home Server: Auto-invalidate on socket events
socket.on('pool:status', () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.pools.all });
});

socket.on('container:status', () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.containers.all });
});

socket.on('alert:new', (alert) => {
  queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
  toast.info(alert.title, { description: alert.message });
});
```

**Why This Pattern?**:
- ✅ Automatic UI updates
- ✅ No manual refetching
- ✅ Optimistic updates
- ✅ Centralized event handling

## 🎨 5. Component Variant Pattern (Copy This!)

### From: `/shopify-tv-screen/client/src/components/ui/button-variants.ts`

**Your Shopify Pattern** (Separated variants):
```typescript
// button-variants.ts
import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'base classes here',
  {
    variants: {
      variant: { /* ... */ },
      size: { /* ... */ }
    }
  }
);

// button.tsx
import { buttonVariants } from './button-variants';

const Button = ({ variant, size, ...props }) => (
  <button className={cn(buttonVariants({ variant, size }))} {...props} />
);
```

**Why This Pattern?**:
- ✅ Variants in separate file (easier to maintain)
- ✅ Can be tweaked with tools like `tweakcn`
- ✅ Type-safe variants
- ✅ Reusable across components

## 🪝 6. Custom Hooks Pattern (Copy This!)

### From: `/shopify-tv-screen/client/src/hooks/useOrders.ts`

**Your Shopify Pattern**:
```typescript
export function useOrders(filters?: string) {
  return useQuery({
    queryKey: queryKeys.orders.list(filters),
    queryFn: () => fetchOrders(filters),
    refetchInterval: 30000,
    staleTime: 10000,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: queryKeys.orders.detail(id),
    queryFn: () => fetchOrder(id),
    enabled: !!id,
  });
}
```

**Adapt to Home Server**:
```typescript
export function usePools() {
  return useQuery({
    queryKey: queryKeys.pools.lists(),
    queryFn: () => apiClient.getPools(),
    refetchInterval: 30000,
    staleTime: 10000,
  });
}

export function usePool(name: string) {
  return useQuery({
    queryKey: queryKeys.pools.detail(name),
    queryFn: () => apiClient.getPoolStatus(name),
    enabled: !!name,
  });
}
```

## 🎯 7. Toast Notifications (Copy This!)

### From: Your Shopify project using Sonner

**Installation**:
```bash
bun add sonner
bunx shadcn@latest add sonner
```

**Usage**:
```typescript
import { toast } from 'sonner';

// Success
toast.success('Pool scrub completed', {
  description: 'No errors found'
});

// Error
toast.error('Container crashed', {
  description: 'Click to view logs',
  action: {
    label: 'View Logs',
    onClick: () => router.push('/logs')
  }
});

// Loading
const promise = restartContainer(id);
toast.promise(promise, {
  loading: 'Restarting container...',
  success: 'Container restarted',
  error: 'Failed to restart container'
});
```

## 📊 8. Data Fetching Pattern (Copy This!)

### From: `/shopify-tv-screen/client/src/lib/fetch.ts`

**Your Shopify Pattern**:
```typescript
async function fetchWithAuth<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}
```

**Adapt to Home Server**: (Already in TODO-11-enhanced.md)

## 🎨 9. Tailwind Configuration (Copy This!)

### From: `/shopify-tv-screen/client/tailwind.config.js`

```javascript
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        // ... rest of shadcn colors
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [require('tailwindcss-animate')],
}
```

## 🔒 10. Error Boundary (Copy This!)

### From: Your Shopify project using Sentry

```typescript
import * as Sentry from '@sentry/react';

function App() {
  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <YourApp />
    </Sentry.ErrorBoundary>
  );
}

function ErrorFallback({ error, resetError }) {
  return (
    <div className="flex h-screen items-center justify-center">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {error.message}
          </p>
          <Button onClick={resetError}>Try again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

## 🚀 11. Vite Configuration (Copy This!)

### From: `/shopify-tv-screen/client/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    sentryVitePlugin({
      org: 'your-org',
      project: 'home-server-monitor',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3100',
        ws: true,
      },
    },
  },
  build: {
    sourcemap: true,
  },
});
```

## 📝 12. TypeScript Configuration (Copy This!)

### From: `/shopify-tv-screen/client/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

## ✅ Copy Checklist

Use this checklist when setting up the Home Server Monitor UI:

- [ ] Copy `components.json` configuration
- [ ] Install exact same dependencies from Shopify `package.json`
- [ ] Copy `tailwind.config.js` with CSS variables
- [ ] Copy `vite.config.ts` with path aliases
- [ ] Copy `tsconfig.json` with strict mode
- [ ] Copy `query-keys.ts` pattern (adapt to pools/containers/alerts)
- [ ] Copy Socket.IO context with auto-invalidation
- [ ] Copy variant separation pattern (separate `-variants.ts` files)
- [ ] Copy custom hooks pattern (one hook per resource)
- [ ] Copy error boundary with Sentry
- [ ] Copy toast notification pattern with Sonner
- [ ] Copy utils.ts (`cn` function, formatters, etc.)
- [ ] Install shadcn/ui components used in Shopify project

## 🎯 What NOT to Copy

- ❌ Shopify-specific business logic
- ❌ Invoice/packing slip components
- ❌ Print server client (different backend)
- ❌ Order processing hooks
- ❌ Celebration animations (unless you want them!)

## 🎓 Key Learnings from Your Shopify Project

1. **Variant Separation** 🎨
   - Keep variants in separate files
   - Makes tweaking easier
   - Better for theme management

2. **Query Key Factory** 🏭
   - Prevents cache invalidation bugs
   - Type-safe from the start
   - Hierarchical structure

3. **Socket + React Query** ⚡
   - Auto-invalidate on socket events
   - No manual refetching
   - Always fresh data

4. **Custom Hooks** 🪝
   - One hook per resource
   - Encapsulate loading states
   - Reusable across components

5. **Error Boundaries** 🛡️
   - Catch errors gracefully
   - User-friendly fallbacks
   - Integrated with Sentry

## 🚀 Getting Started

1. **Clone the pattern**:
```bash
# Copy entire structure
cp -r shopify-tv-screen/client/src/lib home-server-monitor/client/src/
cp -r shopify-tv-screen/client/src/components/ui home-server-monitor/client/src/components/
cp shopify-tv-screen/client/components.json home-server-monitor/client/
cp shopify-tv-screen/client/tailwind.config.js home-server-monitor/client/
```

2. **Install dependencies**:
```bash
cd home-server-monitor/client
bun install
```

3. **Adapt query keys**:
```bash
# Edit src/lib/query-keys.ts
# Replace: orders, items, printers
# With: pools, containers, alerts
```

4. **Create domain hooks**:
```bash
# Create: src/hooks/use-pools.ts
# Create: src/hooks/use-containers.ts
# Create: src/hooks/use-alerts.ts
```

5. **Build first component**:
```bash
# Create: src/components/dashboard/pool-status.tsx
# Use pattern from Shopify components
```

---

**You've already proven this architecture works in production. Now just adapt it! 🎉**