# Phase 2: Functional Features

**Priority:** ⭐⭐⭐⭐⭐ CRITICAL
**Estimated Time:** 3-4 days
**Status:** 🔴 Not Started
**Dependencies:** Phase 1 recommended

## 📋 Overview

Implement full functionality for all non-functional UI elements. This includes Settings persistence, Container controls, Error Boundaries, and user feedback systems.

## 🎯 Goals

- ✅ Create Settings backend (API + Database)
- ✅ Implement Settings frontend with state management
- ✅ Add Container control API endpoints
- ✅ Wire up Container start/stop/restart buttons
- ✅ Create React Error Boundaries
- ✅ Add confirmation dialogs for destructive actions
- ✅ Implement loading states for all actions

## 📦 Tasks

### Task 2.1: Settings Backend Implementation ⭐⭐⭐⭐⭐

**Estimated Time:** 2 hours
**Priority:** CRITICAL

**Files to create:**
- `src/db/schema.ts` - Add settings table
- `src/services/settings/settings-service.ts`
- `src/routes/settings.ts`
- `src/schemas/settings.ts`

**Steps:**

1. **Add settings table to schema.ts:**

   File: [src/db/schema.ts](src/db/schema.ts)

   ```typescript
   // Add after existing tables
   export const settingsTable = `
     CREATE TABLE IF NOT EXISTS settings (
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL,
       updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
     )
   `;

   // In initDatabase function, add:
   db.exec(settingsTable);
   ```

2. **Create settings service:**

   Create file: `src/services/settings/settings-service.ts`

   ```typescript
   import type { Database } from 'better-sqlite3';
   import { logger } from '@/utils/logger.js';

   export interface Settings {
     refreshInterval: number;
     alertNotifications: {
       critical: boolean;
       warning: boolean;
       info: boolean;
     };
     truenasUrl: string;
     truenasApiKey: string;
   }

   export class SettingsService {
     private db: Database;

     constructor(db: Database) {
       this.db = db;
       this.initializeDefaults();
     }

     private initializeDefaults(): void {
       const defaults: Settings = {
         refreshInterval: 30,
         alertNotifications: {
           critical: true,
           warning: true,
           info: false,
         },
         truenasUrl: process.env.TRUENAS_HOST || '',
         truenasApiKey: process.env.TRUENAS_API_KEY || '',
       };

       for (const [key, value] of Object.entries(defaults)) {
         this.setIfNotExists(key, value);
       }
     }

     private setIfNotExists(key: string, value: unknown): void {
       const existing = this.db
         .prepare('SELECT value FROM settings WHERE key = ?')
         .get(key);

       if (!existing) {
         this.set(key, value);
       }
     }

     get(key: string): unknown {
       const row = this.db
         .prepare('SELECT value FROM settings WHERE key = ?')
         .get(key) as { value: string } | undefined;

       if (!row) return null;

       try {
         return JSON.parse(row.value);
       } catch {
         return row.value;
       }
     }

     getAll(): Settings {
       const rows = this.db
         .prepare('SELECT key, value FROM settings')
         .all() as Array<{ key: string; value: string }>;

       const settings: Record<string, unknown> = {};
       for (const row of rows) {
         try {
           settings[row.key] = JSON.parse(row.value);
         } catch {
           settings[row.key] = row.value;
         }
       }

       return settings as Settings;
     }

     set(key: string, value: unknown): void {
       const serialized = typeof value === 'string' ? value : JSON.stringify(value);

       this.db
         .prepare(
           'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
         )
         .run(key, serialized, Date.now());

       logger.info({ key, value }, 'Setting updated');
     }

     setMultiple(settings: Partial<Settings>): void {
       const stmt = this.db.prepare(
         'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
       );

       const transaction = this.db.transaction((entries: Array<[string, unknown]>) => {
         for (const [key, value] of entries) {
           const serialized = typeof value === 'string' ? value : JSON.stringify(value);
           stmt.run(key, serialized, Date.now());
         }
       });

       transaction(Object.entries(settings));
       logger.info({ settings }, 'Multiple settings updated');
     }
   }
   ```

3. **Create settings routes:**

   Create file: `src/routes/settings.ts`

   ```typescript
   import type { FastifyInstance } from 'fastify';
   import { z } from 'zod';
   import { getServiceContainer } from '@/core/fastify-decorators.js';

   const settingsSchema = z.object({
     refreshInterval: z.number().min(10).max(300).optional(),
     alertNotifications: z.object({
       critical: z.boolean().optional(),
       warning: z.boolean().optional(),
       info: z.boolean().optional(),
     }).optional(),
     truenasUrl: z.string().url().optional(),
     truenasApiKey: z.string().optional(),
   });

   export async function settingsRoutes(fastify: FastifyInstance) {
     const { settings } = getServiceContainer(fastify);

     // GET /api/settings
     fastify.get('/api/settings', {
       schema: {
         description: 'Get all settings',
         tags: ['settings'],
         response: {
           200: {
             type: 'object',
             properties: {
               refreshInterval: { type: 'number' },
               alertNotifications: {
                 type: 'object',
                 properties: {
                   critical: { type: 'boolean' },
                   warning: { type: 'boolean' },
                   info: { type: 'boolean' },
                 },
               },
               truenasUrl: { type: 'string' },
               truenasApiKey: { type: 'string' },
             },
           },
         },
       },
     }, async () => {
       return settings.getAll();
     });

     // PUT /api/settings
     fastify.put('/api/settings', {
       schema: {
         description: 'Update settings',
         tags: ['settings'],
         body: {
           type: 'object',
           properties: {
             refreshInterval: { type: 'number', minimum: 10, maximum: 300 },
             alertNotifications: {
               type: 'object',
               properties: {
                 critical: { type: 'boolean' },
                 warning: { type: 'boolean' },
                 info: { type: 'boolean' },
               },
             },
             truenasUrl: { type: 'string' },
             truenasApiKey: { type: 'string' },
           },
         },
         response: {
           200: {
             type: 'object',
             properties: {
               success: { type: 'boolean' },
               message: { type: 'string' },
             },
           },
         },
       },
     }, async (request, reply) => {
       const parsed = settingsSchema.safeParse(request.body);

       if (!parsed.success) {
         return reply.code(400).send({
           success: false,
           message: 'Invalid settings data',
           errors: parsed.error.errors,
         });
       }

       settings.setMultiple(parsed.data);

       return {
         success: true,
         message: 'Settings updated successfully',
       };
     });
   }
   ```

4. **Register service in ServiceContainer:**

   File: [src/core/service-container.ts](src/core/service-container.ts)

   Add to constructor (after database initialization):
   ```typescript
   import { SettingsService } from '@/services/settings/settings-service.js';

   // In constructor:
   this.settings = new SettingsService(this.db);
   ```

   Add to interface:
   ```typescript
   export interface ServiceContainer {
     // ... existing services
     settings: SettingsService;
   }
   ```

5. **Register routes:**

   File: [src/core/routes-initializer.ts](src/core/routes-initializer.ts)

   ```typescript
   import { settingsRoutes } from '@/routes/settings.js';

   // In initializeRoutes function:
   await fastify.register(settingsRoutes);
   ```

**Success Criteria:**
- ✅ Settings table created in database
- ✅ GET /api/settings returns current settings
- ✅ PUT /api/settings updates settings
- ✅ Type checks pass
- ✅ Default settings are initialized

**Testing:**
```bash
# Start server
pnpm dev

# Test GET
curl http://localhost:3100/api/settings | jq

# Test PUT
curl -X PUT http://localhost:3100/api/settings \
  -H "Content-Type: application/json" \
  -d '{"refreshInterval": 60, "alertNotifications": {"critical": true, "warning": false, "info": false}}'
```

---

### Task 2.2: Settings Frontend Implementation ⭐⭐⭐⭐⭐

**Estimated Time:** 2 hours
**Priority:** CRITICAL

**Files to modify:**
- `client/src/pages/Settings.tsx`
- `client/src/lib/api-client.ts`

**Steps:**

1. **Add API client methods:**

   File: [client/src/lib/api-client.ts](client/src/lib/api-client.ts)

   ```typescript
   // Add to apiClient object:
   settings: {
     getAll: async () => {
       const response = await fetch(`${API_BASE_URL}/api/settings`);
       if (!response.ok) throw new Error('Failed to fetch settings');
       return response.json();
     },
     update: async (settings: Partial<Settings>) => {
       const response = await fetch(`${API_BASE_URL}/api/settings`, {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(settings),
       });
       if (!response.ok) throw new Error('Failed to update settings');
       return response.json();
     },
   },
   ```

2. **Implement Settings page with TanStack Query:**

   File: [client/src/pages/Settings.tsx](client/src/pages/Settings.tsx)

   ```tsx
   import { Settings as SettingsIcon } from 'lucide-react';
   import { useState } from 'react';
   import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
   import { toast } from 'sonner';

   import { Button } from '@/components/ui/button';
   import {
     Card,
     CardContent,
     CardDescription,
     CardHeader,
     CardTitle,
   } from '@/components/ui/card';
   import { Input } from '@/components/ui/input';
   import { Label } from '@/components/ui/label';
   import {
     Select,
     SelectContent,
     SelectItem,
     SelectTrigger,
     SelectValue,
   } from '@/components/ui/select';
   import { Switch } from '@/components/ui/switch';
   import { apiClient } from '@/lib/api-client';

   interface Settings {
     refreshInterval: number;
     alertNotifications: {
       critical: boolean;
       warning: boolean;
       info: boolean;
     };
     truenasUrl: string;
     truenasApiKey: string;
   }

   export function Settings() {
     const queryClient = useQueryClient();

     // Fetch settings
     const { data: settings, isLoading } = useQuery<Settings>({
       queryKey: ['settings'],
       queryFn: apiClient.settings.getAll,
     });

     // Local state for form
     const [formData, setFormData] = useState<Settings | null>(null);

     // Use settings as initial form data
     const currentSettings = formData || settings;

     // Update mutation
     const updateMutation = useMutation({
       mutationFn: apiClient.settings.update,
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: ['settings'] });
         toast.success('Settings saved successfully');
       },
       onError: (error) => {
         toast.error('Failed to save settings', {
           description: error.message,
         });
       },
     });

     const handleSave = () => {
       if (currentSettings) {
         updateMutation.mutate(currentSettings);
       }
     };

     const handleReset = () => {
       setFormData(settings || null);
       toast.info('Settings reset to last saved values');
     };

     if (isLoading) {
       return <div>Loading settings...</div>;
     }

     if (!currentSettings) {
       return <div>Failed to load settings</div>;
     }

     return (
       <div className="space-y-6">
         <div className="flex items-center justify-between">
           <h1 className="text-2xl font-bold flex items-center gap-2">
             <SettingsIcon className="w-6 h-6" />
             Settings
           </h1>
         </div>

         <Card>
           <CardHeader>
             <CardTitle>General Settings</CardTitle>
             <CardDescription>Configure your monitoring preferences</CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="space-y-2">
               <Label htmlFor="refresh-interval">Refresh Interval</Label>
               <Select
                 value={String(currentSettings.refreshInterval)}
                 onValueChange={(value) =>
                   setFormData({ ...currentSettings, refreshInterval: Number(value) })
                 }
               >
                 <SelectTrigger id="refresh-interval">
                   <SelectValue placeholder="Select interval" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="10">10 seconds</SelectItem>
                   <SelectItem value="30">30 seconds</SelectItem>
                   <SelectItem value="60">1 minute</SelectItem>
                   <SelectItem value="300">5 minutes</SelectItem>
                 </SelectContent>
               </Select>
             </div>

             <div className="space-y-3">
               <Label>Alert Notifications</Label>
               <div className="space-y-2">
                 <div className="flex items-center justify-between">
                   <Label htmlFor="critical-alerts" className="font-normal">
                     Critical alerts
                   </Label>
                   <Switch
                     id="critical-alerts"
                     checked={currentSettings.alertNotifications.critical}
                     onCheckedChange={(checked) =>
                       setFormData({
                         ...currentSettings,
                         alertNotifications: {
                           ...currentSettings.alertNotifications,
                           critical: checked,
                         },
                       })
                     }
                   />
                 </div>
                 <div className="flex items-center justify-between">
                   <Label htmlFor="warning-alerts" className="font-normal">
                     Warning alerts
                   </Label>
                   <Switch
                     id="warning-alerts"
                     checked={currentSettings.alertNotifications.warning}
                     onCheckedChange={(checked) =>
                       setFormData({
                         ...currentSettings,
                         alertNotifications: {
                           ...currentSettings.alertNotifications,
                           warning: checked,
                         },
                       })
                     }
                   />
                 </div>
                 <div className="flex items-center justify-between">
                   <Label htmlFor="info-alerts" className="font-normal">
                     Info alerts
                   </Label>
                   <Switch
                     id="info-alerts"
                     checked={currentSettings.alertNotifications.info}
                     onCheckedChange={(checked) =>
                       setFormData({
                         ...currentSettings,
                         alertNotifications: {
                           ...currentSettings.alertNotifications,
                           info: checked,
                         },
                       })
                     }
                   />
                 </div>
               </div>
             </div>
           </CardContent>
         </Card>

         <Card>
           <CardHeader>
             <CardTitle>TrueNAS Connection</CardTitle>
             <CardDescription>Configure your TrueNAS API connection</CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="space-y-2">
               <Label htmlFor="api-url">API URL</Label>
               <Input
                 id="api-url"
                 type="url"
                 placeholder="http://truenas.local/api/v2.0"
                 value={currentSettings.truenasUrl}
                 onChange={(e) =>
                   setFormData({ ...currentSettings, truenasUrl: e.target.value })
                 }
               />
             </div>
             <div className="space-y-2">
               <Label htmlFor="api-key">API Key</Label>
               <Input
                 id="api-key"
                 type="password"
                 placeholder="Enter API key"
                 value={currentSettings.truenasApiKey}
                 onChange={(e) =>
                   setFormData({ ...currentSettings, truenasApiKey: e.target.value })
                 }
               />
             </div>
             <Button variant="outline">Test Connection</Button>
           </CardContent>
         </Card>

         <div className="flex gap-4">
           <Button size="lg" onClick={handleSave} disabled={updateMutation.isPending}>
             {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
           </Button>
           <Button variant="outline" size="lg" onClick={handleReset}>
             Reset to Defaults
           </Button>
         </div>
       </div>
     );
   }
   ```

**Success Criteria:**
- ✅ Settings load from backend
- ✅ Form fields update local state
- ✅ Save button persists changes
- ✅ Toast notifications on success/error
- ✅ Reset button works
- ✅ Loading states during save

**Testing:**
- Load Settings page
- Change refresh interval
- Toggle alert notifications
- Click Save
- Verify toast appears
- Refresh page
- Verify settings persist

---

### Task 2.3: Container Control Backend ⭐⭐⭐⭐⭐

**Estimated Time:** 1.5 hours

**Files to modify:**
- `src/routes/docker.ts`

**Steps:**

1. **Add container control endpoints:**

   File: [src/routes/docker.ts](src/routes/docker.ts)

   Add these routes:

   ```typescript
   // POST /api/containers/:id/start
   fastify.post<{ Params: { id: string } }>(
     '/api/containers/:id/start',
     {
       schema: {
         description: 'Start a container',
         tags: ['containers'],
         params: {
           type: 'object',
           properties: {
             id: { type: 'string' },
           },
         },
         response: {
           200: {
             type: 'object',
             properties: {
               success: { type: 'boolean' },
               message: { type: 'string' },
             },
           },
         },
       },
     },
     async (request, reply) => {
       const { id } = request.params;
       const { portainer } = getServiceContainer(fastify);

       try {
         await portainer.startContainer(id);
         return {
           success: true,
           message: `Container ${id} started successfully`,
         };
       } catch (error) {
         fastify.log.error({ error, containerId: id }, 'Failed to start container');
         return reply.code(500).send({
           success: false,
           message: 'Failed to start container',
           error: error instanceof Error ? error.message : 'Unknown error',
         });
       }
     }
   );

   // POST /api/containers/:id/stop
   fastify.post<{ Params: { id: string } }>(
     '/api/containers/:id/stop',
     {
       schema: {
         description: 'Stop a container',
         tags: ['containers'],
         params: {
           type: 'object',
           properties: {
             id: { type: 'string' },
           },
         },
         response: {
           200: {
             type: 'object',
             properties: {
               success: { type: 'boolean' },
               message: { type: 'string' },
             },
           },
         },
       },
     },
     async (request, reply) => {
       const { id } = request.params;
       const { portainer } = getServiceContainer(fastify);

       try {
         await portainer.stopContainer(id);
         return {
           success: true,
           message: `Container ${id} stopped successfully`,
         };
       } catch (error) {
         fastify.log.error({ error, containerId: id }, 'Failed to stop container');
         return reply.code(500).send({
           success: false,
           message: 'Failed to stop container',
           error: error instanceof Error ? error.message : 'Unknown error',
         });
       }
     }
   );

   // POST /api/containers/:id/restart
   fastify.post<{ Params: { id: string } }>(
     '/api/containers/:id/restart',
     {
       schema: {
         description: 'Restart a container',
         tags: ['containers'],
         params: {
           type: 'object',
           properties: {
             id: { type: 'string' },
           },
         },
         response: {
           200: {
             type: 'object',
             properties: {
               success: { type: 'boolean' },
               message: { type: 'string' },
             },
           },
         },
       },
     },
     async (request, reply) => {
       const { id } = request.params;
       const { portainer } = getServiceContainer(fastify);

       try {
         await portainer.restartContainer(id);
         return {
           success: true,
           message: `Container ${id} restarted successfully`,
         };
       } catch (error) {
         fastify.log.error({ error, containerId: id }, 'Failed to restart container');
         return reply.code(500).send({
           success: false,
           message: 'Failed to restart container',
           error: error instanceof Error ? error.message : 'Unknown error',
         });
       }
     }
   );
   ```

**Success Criteria:**
- ✅ POST /api/containers/:id/start works
- ✅ POST /api/containers/:id/stop works
- ✅ POST /api/containers/:id/restart works
- ✅ Proper error handling
- ✅ Swagger documentation updated

---

### Task 2.4: Container Control Frontend ⭐⭐⭐⭐⭐

**Estimated Time:** 1.5 hours

**Files to modify:**
- `client/src/components/Dashboard/ContainerGrid.tsx`
- `client/src/lib/api-client.ts`

**Steps:**

1. **Add API methods:**

   File: [client/src/lib/api-client.ts](client/src/lib/api-client.ts)

   ```typescript
   containers: {
     start: async (id: string) => {
       const response = await fetch(`${API_BASE_URL}/api/containers/${id}/start`, {
         method: 'POST',
       });
       if (!response.ok) throw new Error('Failed to start container');
       return response.json();
     },
     stop: async (id: string) => {
       const response = await fetch(`${API_BASE_URL}/api/containers/${id}/stop`, {
         method: 'POST',
       });
       if (!response.ok) throw new Error('Failed to stop container');
       return response.json();
     },
     restart: async (id: string) => {
       const response = await fetch(`${API_BASE_URL}/api/containers/${id}/restart`, {
         method: 'POST',
       });
       if (!response.ok) throw new Error('Failed to restart container');
       return response.json();
     },
   },
   ```

2. **Update ContainerGrid with mutations:**

   File: [client/src/components/Dashboard/ContainerGrid.tsx](client/src/components/Dashboard/ContainerGrid.tsx)

   ```tsx
   import { Container, Play, RefreshCw, Square } from 'lucide-react';
   import { useMutation, useQueryClient } from '@tanstack/react-query';
   import { toast } from 'sonner';

   import { Button } from '@/components/ui/button';
   import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
   import { Badge } from '@/components/ui/badge';
   import {
     AlertDialog,
     AlertDialogAction,
     AlertDialogCancel,
     AlertDialogContent,
     AlertDialogDescription,
     AlertDialogFooter,
     AlertDialogHeader,
     AlertDialogTitle,
     AlertDialogTrigger,
   } from '@/components/ui/alert-dialog';
   import { apiClient } from '@/lib/api-client';
   import { formatRelativeTime } from '@/lib/utils';

   // ... existing interfaces

   export function ContainerGrid({ containers }: ContainerGridProps) {
     const queryClient = useQueryClient();

     const startMutation = useMutation({
       mutationFn: apiClient.containers.start,
       onSuccess: (_, containerId) => {
         queryClient.invalidateQueries({ queryKey: ['containers'] });
         toast.success('Container started successfully');
       },
       onError: (error) => {
         toast.error('Failed to start container', {
           description: error.message,
         });
       },
     });

     const stopMutation = useMutation({
       mutationFn: apiClient.containers.stop,
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: ['containers'] });
         toast.success('Container stopped successfully');
       },
       onError: (error) => {
         toast.error('Failed to stop container', {
           description: error.message,
         });
       },
     });

     const restartMutation = useMutation({
       mutationFn: apiClient.containers.restart,
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: ['containers'] });
         toast.success('Container restarted successfully');
       },
       onError: (error) => {
         toast.error('Failed to restart container', {
           description: error.message,
         });
       },
     });

     if (!containers || containers.length === 0) {
       return (
         <div className="text-center py-8 text-gray-500 dark:text-gray-400">
           No containers found
         </div>
       );
     }

     return (
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
         {containers.map((container) => (
           <Card key={container.id} className="hover:shadow-md transition-shadow">
             <CardHeader className="pb-3">
               <div className="flex items-center justify-between">
                 <CardTitle className="flex items-center gap-2 text-base">
                   <Container className="w-5 h-5 text-primary-500" />
                   <span className="truncate">{container.name}</span>
                 </CardTitle>
                 <Badge
                   variant={
                     container.status.toLowerCase() === 'running'
                       ? 'default'
                       : 'secondary'
                   }
                 >
                   {container.status}
                 </Badge>
               </div>
             </CardHeader>
             <CardContent className="space-y-3">
               {container.image && (
                 <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                   {container.image}
                 </div>
               )}

               {container.created && (
                 <div className="text-xs text-gray-400 dark:text-gray-500">
                   Created {formatRelativeTime(container.created)}
                 </div>
               )}

               <div className="flex gap-2">
                 {container.status.toLowerCase() === 'running' ? (
                   <AlertDialog>
                     <AlertDialogTrigger asChild>
                       <Button
                         variant="destructive"
                         size="sm"
                         className="flex-1"
                         disabled={stopMutation.isPending}
                       >
                         <Square className="w-3 h-3 mr-1" />
                         Stop
                       </Button>
                     </AlertDialogTrigger>
                     <AlertDialogContent>
                       <AlertDialogHeader>
                         <AlertDialogTitle>Stop Container?</AlertDialogTitle>
                         <AlertDialogDescription>
                           Are you sure you want to stop "{container.name}"? This
                           will gracefully shut down the container.
                         </AlertDialogDescription>
                       </AlertDialogHeader>
                       <AlertDialogFooter>
                         <AlertDialogCancel>Cancel</AlertDialogCancel>
                         <AlertDialogAction
                           onClick={() => stopMutation.mutate(container.id)}
                         >
                           Stop Container
                         </AlertDialogAction>
                       </AlertDialogFooter>
                     </AlertDialogContent>
                   </AlertDialog>
                 ) : (
                   <Button
                     variant="default"
                     size="sm"
                     className="flex-1"
                     onClick={() => startMutation.mutate(container.id)}
                     disabled={startMutation.isPending}
                   >
                     <Play className="w-3 h-3 mr-1" />
                     {startMutation.isPending ? 'Starting...' : 'Start'}
                   </Button>
                 )}

                 <AlertDialog>
                   <AlertDialogTrigger asChild>
                     <Button
                       variant="outline"
                       size="sm"
                       className="flex-1"
                       disabled={restartMutation.isPending}
                     >
                       <RefreshCw className="w-3 h-3 mr-1" />
                       Restart
                     </Button>
                   </AlertDialogTrigger>
                   <AlertDialogContent>
                     <AlertDialogHeader>
                       <AlertDialogTitle>Restart Container?</AlertDialogTitle>
                       <AlertDialogDescription>
                         Are you sure you want to restart "{container.name}"? This
                         will stop and then start the container.
                       </AlertDialogDescription>
                     </AlertDialogHeader>
                     <AlertDialogFooter>
                       <AlertDialogCancel>Cancel</AlertDialogCancel>
                       <AlertDialogAction
                         onClick={() => restartMutation.mutate(container.id)}
                       >
                         Restart Container
                       </AlertDialogAction>
                     </AlertDialogFooter>
                   </AlertDialogContent>
                 </AlertDialog>
               </div>
             </CardContent>
           </Card>
         ))}
       </div>
     );
   }
   ```

3. **Install AlertDialog component if not present:**

   ```bash
   cd client
   npx shadcn@latest add alert-dialog
   ```

**Success Criteria:**
- ✅ Start button works and shows loading state
- ✅ Stop button shows confirmation dialog
- ✅ Restart button shows confirmation dialog
- ✅ Toast notifications on success/error
- ✅ Container list refreshes after action
- ✅ Buttons disabled during mutation

---

### Task 2.5: Error Boundary Implementation ⭐⭐⭐⭐

**Estimated Time:** 1 hour

**Files to create:**
- `client/src/components/ErrorBoundary.tsx`

**Files to modify:**
- `client/src/App.tsx`

**Steps:**

1. **Install react-error-boundary:**

   ```bash
   cd client
   pnpm add react-error-boundary
   ```

2. **Create ErrorBoundary component:**

   Create file: `client/src/components/ErrorBoundary.tsx`

   ```tsx
   import { Component, type ReactNode } from 'react';
   import { AlertCircle, RefreshCw } from 'lucide-react';
   import { Button } from './ui/button';
   import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';

   interface Props {
     children: ReactNode;
   }

   interface State {
     hasError: boolean;
     error: Error | null;
   }

   export class ErrorBoundary extends Component<Props, State> {
     constructor(props: Props) {
       super(props);
       this.state = { hasError: false, error: null };
     }

     static getDerivedStateFromError(error: Error): State {
       return { hasError: true, error };
     }

     componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
       console.error('Error caught by boundary:', error, errorInfo);
     }

     render() {
       if (this.state.hasError) {
         return (
           <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
             <Card className="max-w-md w-full">
               <CardHeader>
                 <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                   <AlertCircle className="w-6 h-6" />
                   <CardTitle>Something went wrong</CardTitle>
                 </div>
                 <CardDescription>
                   The application encountered an unexpected error
                 </CardDescription>
               </CardHeader>
               <CardContent>
                 <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                   <p className="text-sm font-mono text-red-800 dark:text-red-200">
                     {this.state.error?.message || 'Unknown error'}
                   </p>
                 </div>
               </CardContent>
               <CardFooter className="flex gap-2">
                 <Button
                   onClick={() => window.location.reload()}
                   className="flex items-center gap-2"
                 >
                   <RefreshCw className="w-4 h-4" />
                   Reload Page
                 </Button>
                 <Button
                   variant="outline"
                   onClick={() => (window.location.href = '/')}
                 >
                   Go to Dashboard
                 </Button>
               </CardFooter>
             </Card>
           </div>
         );
       }

       return this.props.children;
     }
   }
   ```

3. **Wrap App with ErrorBoundary:**

   File: [client/src/App.tsx](client/src/App.tsx)

   ```tsx
   import { ErrorBoundary } from './components/ErrorBoundary';
   import { Toaster } from '@/components/ui/sonner';
   // ... other imports

   function App() {
     return (
       <ErrorBoundary>
         <Router>
           <Layout>
             <Routes>
               {/* routes */}
             </Routes>
           </Layout>
           <Toaster />
         </Router>
       </ErrorBoundary>
     );
   }
   ```

**Success Criteria:**
- ✅ ErrorBoundary catches React errors
- ✅ Shows user-friendly error message
- ✅ Provides reload and home buttons
- ✅ Logs error to console
- ✅ Dark mode compatible

---

## ✅ Completion Criteria

Phase 2 is complete when:

- ✅ Settings backend API is functional
- ✅ Settings page saves/loads data
- ✅ Container start/stop/restart works
- ✅ Confirmation dialogs for destructive actions
- ✅ Toast notifications for all actions
- ✅ Loading states during operations
- ✅ Error boundary catches errors
- ✅ All type checks pass
- ✅ No broken functionality

---

## 📊 Next Steps

After completing Phase 2, continue to **Phase 3: Code Quality**
```
Continue @.claude-web-tasks/phase-3-code-quality.md
```
