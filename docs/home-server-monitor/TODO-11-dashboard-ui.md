# TODO-11: Dashboard UI (Optional)

> Real-time web dashboard for monitoring and control

## 📋 Phase Overview

**Objective**: Create an optional web interface for visual monitoring and management

**Duration**: 4-6 hours

**Prerequisites**:
- ✅ Phase 0-10 complete (backend fully functional)
- ✅ API endpoints working
- ✅ WebSocket real-time updates

## 🎯 Success Criteria

- [ ] Dashboard loads in <2 seconds
- [ ] Real-time updates working
- [ ] Mobile responsive
- [ ] Dark mode support
- [ ] Accessible (WCAG 2.1 AA)
- [ ] Works without JavaScript (basic functionality)

## 📚 Learning Context

### Why Optional?

The CLI and MCP integration might be sufficient, but a dashboard provides:

1. **At-a-glance monitoring**: Visual status overview
2. **Mobile access**: Check from your phone
3. **Non-technical users**: Family members can see status
4. **TV display**: Full-screen monitoring display
5. **Historical graphs**: Trend visualization

## 🏗️ Architecture

```
React App → Fastify Static → API/WebSocket → Real-time Updates
     ↓           ↓               ↓                ↓
  Vite Build  Production     REST/Socket.IO   Server Push
```

## 📁 File Structure

```bash
client/
├── public/
│   ├── index.html
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── Dashboard/
│   │   │   ├── PoolStatus.tsx
│   │   │   ├── SystemMetrics.tsx
│   │   │   ├── ContainerGrid.tsx
│   │   │   ├── AlertFeed.tsx
│   │   │   └── QuickActions.tsx
│   │   ├── Monitoring/
│   │   │   ├── DiskHealth.tsx
│   │   │   ├── NetworkStatus.tsx
│   │   │   └── ServiceHealth.tsx
│   │   ├── Charts/
│   │   │   ├── MetricChart.tsx
│   │   │   ├── PoolUsageChart.tsx
│   │   │   └── HistoryGraph.tsx
│   │   └── Layout/
│   │       ├── Header.tsx
│   │       ├── Sidebar.tsx
│   │       └── Footer.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── useMetrics.ts
│   │   └── useAlerts.ts
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Pools.tsx
│   │   ├── Containers.tsx
│   │   ├── Alerts.tsx
│   │   ├── Security.tsx
│   │   └── Settings.tsx
│   ├── lib/
│   │   ├── api-client.ts
│   │   └── socket-client.ts
│   ├── styles/
│   │   └── globals.css
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## 📝 Implementation Tasks

### 1. Project Setup

Create `client/package.json`:

```json
{
  "name": "home-server-monitor-ui",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit",
    "lint": "eslint . --ext ts,tsx"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "@tanstack/react-query": "^5.12.0",
    "socket.io-client": "^4.7.2",
    "recharts": "^2.10.0",
    "date-fns": "^3.0.0",
    "clsx": "^2.0.0",
    "lucide-react": "^0.300.0",
    "zustand": "^4.4.7"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@typescript-eslint/eslint-plugin": "^6.14.0",
    "@typescript-eslint/parser": "^6.14.0",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.55.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.3.0",
    "typescript": "^5.3.3",
    "vite": "^5.0.8"
  }
}
```

### 2. Main Dashboard Component

Create `client/src/pages/Dashboard.tsx`:

```typescript
import React, { useEffect, useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useMetrics } from '@/hooks/useMetrics';
import { PoolStatus } from '@/components/Dashboard/PoolStatus';
import { SystemMetrics } from '@/components/Dashboard/SystemMetrics';
import { ContainerGrid } from '@/components/Dashboard/ContainerGrid';
import { AlertFeed } from '@/components/Dashboard/AlertFeed';
import { QuickActions } from '@/components/Dashboard/QuickActions';
import { Activity, Server, HardDrive, Shield, Bell } from 'lucide-react';

export function Dashboard() {
  const { connected, lastMessage } = useWebSocket();
  const { metrics, isLoading } = useMetrics();
  const [alerts, setAlerts] = useState<any[]>([]);

  // Handle real-time updates
  useEffect(() => {
    if (lastMessage?.type === 'alert:new') {
      setAlerts(prev => [lastMessage.data, ...prev.slice(0, 9)]);
    }
  }, [lastMessage]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Server className="w-6 h-6" />}
          title="System Status"
          value={metrics?.system?.status || 'Unknown'}
          color={metrics?.system?.status === 'Healthy' ? 'green' : 'red'}
        />
        <StatCard
          icon={<HardDrive className="w-6 h-6" />}
          title="Storage Health"
          value={`${metrics?.pools?.length || 0} Pools`}
          color="blue"
        />
        <StatCard
          icon={<Shield className="w-6 h-6" />}
          title="Security"
          value={metrics?.security?.status || 'Active'}
          color="purple"
        />
        <StatCard
          icon={<Bell className="w-6 h-6" />}
          title="Active Alerts"
          value={alerts.filter(a => !a.resolved).length.toString()}
          color={alerts.some(a => a.severity === 'critical') ? 'red' : 'yellow'}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column - 2 cols */}
        <div className="xl:col-span-2 space-y-6">
          {/* Pool Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              Storage Pools
            </h2>
            <PoolStatus pools={metrics?.pools || []} />
          </div>

          {/* System Metrics */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5" />
              System Metrics
            </h2>
            <SystemMetrics metrics={metrics?.system} />
          </div>

          {/* Container Grid */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">
              Docker Containers
            </h2>
            <ContainerGrid containers={metrics?.containers || []} />
          </div>
        </div>

        {/* Right Column - 1 col */}
        <div className="space-y-6">
          {/* Alert Feed */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Recent Alerts
            </h2>
            <AlertFeed alerts={alerts} />
          </div>

          {/* Quick Actions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">
              Quick Actions
            </h2>
            <QuickActions />
          </div>
        </div>
      </div>

      {/* Connection Status */}
      <ConnectionStatus connected={connected} />
    </div>
  );
}

// Stat Card Component
function StatCard({ icon, title, value, color }: {
  icon: React.ReactNode;
  title: string;
  value: string;
  color: string;
}) {
  const colorClasses = {
    green: 'text-green-600 bg-green-100 dark:bg-green-900/20',
    red: 'text-red-600 bg-red-100 dark:bg-red-900/20',
    blue: 'text-blue-600 bg-blue-100 dark:bg-blue-900/20',
    purple: 'text-purple-600 bg-purple-100 dark:bg-purple-900/20',
    yellow: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20'
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-semibold mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// Connection Status Component
function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className="fixed bottom-4 right-4">
      <div className={`
        flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg
        ${connected
          ? 'bg-green-500 text-white'
          : 'bg-red-500 text-white animate-pulse'
        }
      `}>
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-white' : 'bg-white animate-pulse'}`} />
        <span className="text-sm font-medium">
          {connected ? 'Connected' : 'Reconnecting...'}
        </span>
      </div>
    </div>
  );
}
```

### 3. Pool Status Component

Create `client/src/components/Dashboard/PoolStatus.tsx`:

```typescript
import React from 'react';
import { HardDrive, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { formatBytes } from '@/lib/utils';

interface Pool {
  name: string;
  status: string;
  capacity: number;
  used: number;
  available: number;
  health: string;
  disks: Array<{
    name: string;
    status: string;
    temperature: number;
  }>;
}

export function PoolStatus({ pools }: { pools: Pool[] }) {
  return (
    <div className="space-y-4">
      {pools.map((pool) => {
        const usagePercent = (pool.used / pool.capacity) * 100;
        const statusIcon = getStatusIcon(pool.status);
        const statusColor = getStatusColor(pool.status);

        return (
          <div key={pool.name} className="border dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-gray-500" />
                <h3 className="font-medium">{pool.name}</h3>
                <span className={`ml-2 ${statusColor}`}>
                  {statusIcon}
                </span>
              </div>
              <span className={`
                px-2 py-1 text-xs rounded-full
                ${pool.status === 'ONLINE'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                }
              `}>
                {pool.status}
              </span>
            </div>

            {/* Usage Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                <span>{formatBytes(pool.used)} used</span>
                <span>{formatBytes(pool.available)} free</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    usagePercent > 90 ? 'bg-red-500' :
                    usagePercent > 80 ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              <div className="text-center text-sm text-gray-500 mt-1">
                {usagePercent.toFixed(1)}% used of {formatBytes(pool.capacity)}
              </div>
            </div>

            {/* Disk Status */}
            <div className="grid grid-cols-2 gap-2">
              {pool.disks.map((disk) => (
                <div
                  key={disk.name}
                  className="flex items-center gap-2 text-sm p-2 bg-gray-50 dark:bg-gray-900 rounded"
                >
                  <div className={`w-2 h-2 rounded-full ${
                    disk.status === 'ONLINE' ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <span className="truncate">{disk.name}</span>
                  <span className={`ml-auto ${
                    disk.temperature > 50 ? 'text-red-500' :
                    disk.temperature > 45 ? 'text-yellow-500' :
                    'text-gray-500'
                  }`}>
                    {disk.temperature}°C
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'ONLINE':
      return <CheckCircle className="w-4 h-4" />;
    case 'DEGRADED':
      return <AlertTriangle className="w-4 h-4" />;
    case 'FAULTED':
      return <XCircle className="w-4 h-4" />;
    default:
      return null;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'ONLINE':
      return 'text-green-500';
    case 'DEGRADED':
      return 'text-yellow-500';
    case 'FAULTED':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
}
```

### 4. WebSocket Hook

Create `client/src/hooks/useWebSocket.ts`:

```typescript
import { useEffect, useState, useCallback, useRef } from 'react';
import io, { Socket } from 'socket.io-client';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: Date;
}

export function useWebSocket(url: string = 'http://localhost:3100') {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Create socket connection
    const socket = io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketRef.current = socket;

    // Connection handlers
    socket.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    });

    // Message handlers
    socket.on('metrics:update', (data) => {
      setLastMessage({
        type: 'metrics:update',
        data,
        timestamp: new Date()
      });
    });

    socket.on('alert:new', (data) => {
      setLastMessage({
        type: 'alert:new',
        data,
        timestamp: new Date()
      });
    });

    socket.on('pool:status', (data) => {
      setLastMessage({
        type: 'pool:status',
        data,
        timestamp: new Date()
      });
    });

    socket.on('container:status', (data) => {
      setLastMessage({
        type: 'container:status',
        data,
        timestamp: new Date()
      });
    });

    socket.on('security:status', (data) => {
      setLastMessage({
        type: 'security:status',
        data,
        timestamp: new Date()
      });
    });

    // Cleanup
    return () => {
      socket.disconnect();
    };
  }, [url]);

  // Send message
  const sendMessage = useCallback((event: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  // Subscribe to specific event
  const subscribe = useCallback((event: string, handler: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler);

      // Return unsubscribe function
      return () => {
        socketRef.current?.off(event, handler);
      };
    }
  }, []);

  return {
    connected,
    lastMessage,
    sendMessage,
    subscribe
  };
}
```

### 5. API Client

Create `client/src/lib/api-client.ts`:

```typescript
import { QueryClient } from '@tanstack/react-query';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3100';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 30000, // 30 seconds
      staleTime: 10000, // 10 seconds
      retry: 3
    }
  }
});

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('auth_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  // System metrics
  async getMetrics() {
    return this.request<any>('/api/v1/metrics');
  }

  // Pool operations
  async getPools() {
    return this.request<any>('/api/v1/pools');
  }

  async getPoolStatus(poolName: string) {
    return this.request<any>(`/api/v1/pools/${poolName}`);
  }

  // Container operations
  async getContainers() {
    return this.request<any>('/api/v1/containers');
  }

  async restartContainer(containerId: string) {
    return this.request<any>(`/api/v1/containers/${containerId}/restart`, {
      method: 'POST'
    });
  }

  // Alert operations
  async getAlerts(params?: {
    severity?: string;
    resolved?: boolean;
    limit?: number;
  }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request<any>(`/api/v1/alerts${query ? `?${query}` : ''}`);
  }

  async acknowledgeAlert(alertId: string, userId: string) {
    return this.request<any>(`/api/v1/alerts/${alertId}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  }

  // Security operations
  async getSecurityStatus() {
    return this.request<any>('/api/v1/security/status');
  }

  async getBannedIPs() {
    return this.request<any>('/api/v1/security/banned-ips');
  }

  // Remediation operations
  async getPendingPlans() {
    return this.request<any>('/api/v1/remediation/plans/pending');
  }

  async approvePlan(planId: string, userId: string) {
    return this.request<any>(`/api/v1/remediation/plans/${planId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  }

  async rejectPlan(planId: string, userId: string, reason: string) {
    return this.request<any>(`/api/v1/remediation/plans/${planId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ userId, reason })
    });
  }

  // Settings
  async getSettings() {
    return this.request<any>('/api/v1/settings');
  }

  async updateSettings(settings: any) {
    return this.request<any>('/api/v1/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }
}

export const apiClient = new ApiClient();
```

### 6. Tailwind Configuration

Create `client/tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
```

### 7. Vite Configuration

Create `client/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
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
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist/client',
    sourcemap: true,
  },
});
```

### 8. Static Serving in Fastify

Add to `src/server.ts`:

```typescript
// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, '../client/dist'),
    prefix: '/',
  });

  // SPA fallback
  fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api')) {
      reply.status(404).send({ error: 'Not found' });
    } else {
      reply.sendFile('index.html');
    }
  });
}
```

## 🧪 Testing

### Development

```bash
# Terminal 1 - Backend
bun run dev

# Terminal 2 - Frontend
cd client && npm run dev
```

### Production Build

```bash
# Build frontend
cd client && npm run build

# Start production server
NODE_ENV=production bun run start
```

## 📚 Additional Resources

- [React Documentation](https://react.dev/)
- [Vite Guide](https://vitejs.dev/guide/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Recharts](https://recharts.org/)
- [TanStack Query](https://tanstack.com/query/latest)

## 🎓 Learning Notes

### UI Best Practices

1. **Real-time First**: WebSocket for live updates
2. **Optimistic Updates**: Update UI before server confirms
3. **Progressive Enhancement**: Works without JS
4. **Mobile First**: Design for small screens
5. **Dark Mode**: Respect user preference

## ✅ Completion Checklist

- [ ] React app scaffolded
- [ ] Dashboard components created
- [ ] WebSocket integration working
- [ ] API client implemented
- [ ] Real-time updates functioning
- [ ] Mobile responsive design
- [ ] Dark mode toggle working
- [ ] Charts and graphs rendering
- [ ] Production build tested
- [ ] Static serving configured

## 🚀 Next Steps

After completing this phase:

1. **Test UI**: Check all components work
2. **Optimize**: Lazy load heavy components
3. **Add PWA**: Make installable
4. **Add TV Mode**: Full-screen display
5. **Proceed to Phase 12**: Deployment

---

**Remember**: The UI is optional. The system is fully functional via CLI and MCP. Only build if you need visual monitoring.