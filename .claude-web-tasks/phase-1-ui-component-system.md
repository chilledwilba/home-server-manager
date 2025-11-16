# Phase 1: UI Component System

**Priority:** ⭐⭐⭐⭐⭐ CRITICAL
**Estimated Time:** 2-3 days
**Status:** 🔴 Not Started

## 📋 Overview

Install and configure shadcn/ui component library to establish a consistent, accessible design system. This phase replaces custom Tailwind components with professional, tested components and adds a toast notification system.

## 🎯 Goals

- ✅ Install shadcn/ui CLI and dependencies
- ✅ Configure shadcn/ui for the project
- ✅ Install core components (Button, Card, Input, etc.)
- ✅ Install Sonner for toast notifications
- ✅ Replace existing components with shadcn/ui
- ✅ Remove console.log, add toast feedback

## 📦 Tasks

### Task 1.1: Install and Configure shadcn/ui ⭐⭐⭐⭐⭐

**Estimated Time:** 30 minutes
**Files to modify:**
- `client/package.json`
- `client/components.json` (new)
- `client/tailwind.config.js`
- `client/tsconfig.json`

**Steps:**

1. **Navigate to client directory:**
   ```bash
   cd client
   ```

2. **Initialize shadcn/ui:**
   ```bash
   npx shadcn@latest init
   ```

   **Configuration options:**
   - Style: `New York`
   - Base color: `Zinc`
   - CSS variables: `Yes`
   - Where is your global CSS file: `src/styles/globals.css`
   - Configure import alias: `@/` → `./src/`
   - Are you using React Server Components: `No`

3. **Verify** `components.json` was created with correct paths

4. **Install core components:**
   ```bash
   npx shadcn@latest add button
   npx shadcn@latest add card
   npx shadcn@latest add input
   npx shadcn@latest add label
   npx shadcn@latest add select
   npx shadcn@latest add switch
   npx shadcn@latest add dialog
   npx shadcn@latest add skeleton
   npx shadcn@latest add badge
   npx shadcn@latest add alert
   npx shadcn@latest add toast
   npx shadcn@latest add sonner
   ```

**Success Criteria:**
- ✅ All components installed to `client/src/components/ui/`
- ✅ No TypeScript errors
- ✅ `pnpm type-check:client` passes

**Documentation:**
- shadcn/ui installation: https://ui.shadcn.com/docs/installation/vite
- Components: https://ui.shadcn.com/docs/components

---

### Task 1.2: Setup Sonner Toast System ⭐⭐⭐⭐⭐

**Estimated Time:** 20 minutes
**Files to modify:**
- `client/src/App.tsx`
- `client/src/hooks/useWebSocket.ts`

**Steps:**

1. **Add Toaster to App.tsx:**

   Read the current [App.tsx](client/src/App.tsx) and add Toaster component:

   ```tsx
   import { Toaster } from '@/components/ui/sonner';

   function App() {
     return (
       <Router>
         <Layout>
           <Routes>
             {/* existing routes */}
           </Routes>
         </Layout>
         <Toaster />
       </Router>
     );
   }
   ```

2. **Replace console.log in useWebSocket.ts:**

   File: [client/src/hooks/useWebSocket.ts](client/src/hooks/useWebSocket.ts#L28)

   **Remove:**
   ```tsx
   console.log('WebSocket connected');
   console.log('WebSocket disconnected');
   ```

   **Replace with:**
   ```tsx
   import { toast } from 'sonner';

   socket.on('connect', () => {
     toast.success('Connected to server', {
       description: 'Real-time updates are active',
     });
     setConnected(true);
   });

   socket.on('disconnect', () => {
     toast.warning('Disconnected from server', {
       description: 'Trying to reconnect...',
     });
     setConnected(false);
   });
   ```

**Success Criteria:**
- ✅ Toaster component renders in app
- ✅ Toast appears on WebSocket connect/disconnect
- ✅ No console.log statements remain
- ✅ `pnpm type-check:client` passes

**Reference:**
```tsx
// Sonner toast examples from Context7:
toast.success('Success message');
toast.error('Error message');
toast.warning('Warning message');
toast.info('Info message');
toast('Default message', {
  description: 'Additional context',
  action: {
    label: 'Undo',
    onClick: () => console.log('Undo'),
  },
});
```

---

### Task 1.3: Replace Dashboard Components ⭐⭐⭐⭐

**Estimated Time:** 2 hours
**Files to modify:**
- `client/src/pages/Dashboard.tsx`
- `client/src/components/Dashboard/SystemMetrics.tsx`
- `client/src/components/Dashboard/ContainerGrid.tsx`
- `client/src/components/Dashboard/PoolStatus.tsx`
- `client/src/components/Dashboard/AlertFeed.tsx`

**Steps:**

1. **Replace StatCard in Dashboard.tsx:**

   Current file: [client/src/pages/Dashboard.tsx](client/src/pages/Dashboard.tsx#L119)

   **Replace the StatCard component (lines 119-139) with:**
   ```tsx
   import { Card, CardContent } from '@/components/ui/card';
   import { Badge } from '@/components/ui/badge';

   function StatCard({ icon, title, value, color }: StatCardProps) {
     const colorClasses = {
       green: 'text-green-600 bg-green-100 dark:bg-green-900/20',
       red: 'text-red-600 bg-red-100 dark:bg-red-900/20',
       blue: 'text-blue-600 bg-blue-100 dark:bg-blue-900/20',
       purple: 'text-purple-600 bg-purple-100 dark:bg-purple-900/20',
       yellow: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20',
     };

     return (
       <Card>
         <CardContent className="p-6">
           <div className="flex items-center justify-between">
             <div>
               <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
               <p className="text-2xl font-semibold mt-1">{value}</p>
             </div>
             <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
               {icon}
             </div>
           </div>
         </CardContent>
       </Card>
     );
   }
   ```

2. **Update card classes throughout Dashboard.tsx:**

   **Replace:**
   ```tsx
   <div className="card">
     <h2 className="card-header">
   ```

   **With:**
   ```tsx
   import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

   <Card>
     <CardHeader>
       <CardTitle className="flex items-center gap-2">
   ```

3. **Update SystemMetrics.tsx:**

   File: [client/src/components/Dashboard/SystemMetrics.tsx](client/src/components/Dashboard/SystemMetrics.tsx)

   - Replace custom progress bars with shadcn Progress component
   - Wrap metric cards in shadcn Card components
   - Import: `import { Card, CardContent } from '@/components/ui/card';`
   - Import: `import { Progress } from '@/components/ui/progress';` (install if needed)

4. **Update ContainerGrid.tsx:**

   File: [client/src/components/Dashboard/ContainerGrid.tsx](client/src/components/Dashboard/ContainerGrid.tsx)

   - Replace border divs with Card components
   - Replace status spans with Badge component
   - Replace buttons with shadcn Button component

   **Example replacement:**
   ```tsx
   import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
   import { Badge } from '@/components/ui/badge';
   import { Button } from '@/components/ui/button';

   <Card key={container.id} className="hover:shadow-md transition-shadow">
     <CardHeader className="pb-3">
       <div className="flex items-center justify-between">
         <CardTitle className="flex items-center gap-2 text-base">
           <Container className="w-5 h-5 text-primary-500" />
           {container.name}
         </CardTitle>
         <Badge variant={container.status.toLowerCase() === 'running' ? 'success' : 'secondary'}>
           {container.status}
         </Badge>
       </div>
     </CardHeader>
     <CardContent>
       {/* content */}
     </CardContent>
   </Card>
   ```

**Success Criteria:**
- ✅ All Dashboard components use shadcn/ui
- ✅ Consistent styling across all cards
- ✅ Proper TypeScript types
- ✅ No visual regressions
- ✅ Dark mode works correctly

**Testing:**
```bash
cd client
pnpm dev
```
- Open http://localhost:5173
- Verify all components render correctly
- Toggle dark mode
- Check responsive breakpoints

---

### Task 1.4: Replace Settings Page Components ⭐⭐⭐

**Estimated Time:** 1 hour
**Files to modify:**
- `client/src/pages/Settings.tsx`

**Steps:**

1. **Update Settings.tsx with shadcn/ui components:**

   Current file: [client/src/pages/Settings.tsx](client/src/pages/Settings.tsx)

   **Replace all form elements:**
   ```tsx
   import { Button } from '@/components/ui/button';
   import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
   import { Input } from '@/components/ui/input';
   import { Label } from '@/components/ui/label';
   import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
   import { Switch } from '@/components/ui/switch';

   export function Settings() {
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
               <Select defaultValue="30">
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
                   <Label htmlFor="critical-alerts" className="font-normal">Critical alerts</Label>
                   <Switch id="critical-alerts" defaultChecked />
                 </div>
                 <div className="flex items-center justify-between">
                   <Label htmlFor="warning-alerts" className="font-normal">Warning alerts</Label>
                   <Switch id="warning-alerts" defaultChecked />
                 </div>
                 <div className="flex items-center justify-between">
                   <Label htmlFor="info-alerts" className="font-normal">Info alerts</Label>
                   <Switch id="info-alerts" />
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
               />
             </div>
             <div className="space-y-2">
               <Label htmlFor="api-key">API Key</Label>
               <Input
                 id="api-key"
                 type="password"
                 placeholder="Enter API key"
               />
             </div>
             <Button>Test Connection</Button>
           </CardContent>
         </Card>

         <div className="flex gap-4">
           <Button size="lg">Save Settings</Button>
           <Button variant="outline" size="lg">Reset to Defaults</Button>
         </div>
       </div>
     );
   }
   ```

**Success Criteria:**
- ✅ All form inputs use shadcn/ui components
- ✅ Proper spacing and layout
- ✅ Dark mode compatible
- ✅ Accessible labels and descriptions

---

### Task 1.5: Update Sidebar and Header ⭐⭐⭐

**Estimated Time:** 30 minutes
**Files to modify:**
- `client/src/components/Layout/Sidebar.tsx`
- `client/src/components/Layout/Header.tsx`

**Steps:**

1. **Update Sidebar.tsx:**

   File: [client/src/components/Layout/Sidebar.tsx](client/src/components/Layout/Sidebar.tsx)

   - Wrap navigation in Card component
   - Use Button component with variant="ghost" for nav items

   ```tsx
   import { Card } from '@/components/ui/card';
   import { Button } from '@/components/ui/button';

   // Update NavLink rendering:
   <NavLink
     key={item.to}
     to={item.to}
     className={({ isActive }) => cn(isActive && "bg-accent")}
   >
     {({ isActive }) => (
       <Button
         variant="ghost"
         className={cn(
           "w-full justify-start gap-3",
           isActive && "bg-accent"
         )}
       >
         <item.icon className="w-5 h-5" />
         <span>{item.label}</span>
       </Button>
     )}
   </NavLink>
   ```

2. **Add cn utility:**

   Install if not present:
   ```bash
   npx shadcn@latest add utils
   ```

   This adds the `cn` className utility for conditional styling.

**Success Criteria:**
- ✅ Sidebar uses shadcn components
- ✅ Active state styling works
- ✅ Hover effects are smooth
- ✅ Mobile responsive

---

### Task 1.6: Remove Custom Tailwind Utilities ⭐⭐

**Estimated Time:** 20 minutes
**Files to modify:**
- `client/src/styles/globals.css`

**Steps:**

1. **Review and clean up globals.css:**

   File: [client/src/styles/globals.css](client/src/styles/globals.css)

   **Keep:**
   - Tailwind directives (`@tailwind base;` etc.)
   - Base layer customizations
   - Scrollbar utilities (if still needed)

   **Consider removing:**
   - `.card`, `.card-header` classes (now using shadcn Card)
   - `.btn-primary`, `.btn-secondary`, `.btn-danger` (now using shadcn Button)
   - `.badge-*` classes (now using shadcn Badge)
   - `.stat-*` classes (replaced with shadcn components)

   **Important:** Don't remove until all components are migrated!

2. **Update tailwind.config.js if needed:**

   Ensure shadcn/ui theme variables are properly configured.

**Success Criteria:**
- ✅ No unused CSS utilities
- ✅ All components still render correctly
- ✅ No visual regressions

---

## 🧪 Testing Checklist

After completing all tasks:

- [ ] Run type check: `cd client && pnpm type-check`
- [ ] Run linter: `cd client && pnpm lint`
- [ ] Start dev server: `pnpm dev:client`
- [ ] Test in browser (Chrome/Firefox/Safari)
- [ ] Test dark mode toggle
- [ ] Test mobile viewport (use DevTools)
- [ ] Test all pages:
  - [ ] Dashboard
  - [ ] Pools
  - [ ] Containers
  - [ ] Alerts
  - [ ] Security
  - [ ] Arr Monitoring
  - [ ] Settings
- [ ] Verify toast notifications appear on WebSocket events
- [ ] Check console for errors
- [ ] Test keyboard navigation
- [ ] Test screen reader compatibility (if possible)

---

## 📝 Documentation & References

### shadcn/ui Resources (from Context7)

**Installation:**
```bash
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add input
npx shadcn@latest add label
npx shadcn@latest add select
npx shadcn@latest add dialog
npx shadcn@latest add sonner
```

**Sonner Toast Examples:**
```tsx
import { toast } from 'sonner';

// Success
toast.success('Settings saved successfully');

// Error
toast.error('Failed to save settings', {
  description: 'Please check your connection',
});

// With action
toast('Event created', {
  description: 'Sunday, December 03, 2023',
  action: {
    label: 'Undo',
    onClick: () => handleUndo(),
  },
});
```

**Card Component:**
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
  <CardFooter>
    {/* Footer */}
  </CardFooter>
</Card>
```

**Button Variants:**
```tsx
<Button variant="default">Default</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

<Button size="default">Default</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon">Icon</Button>
```

---

## ⚠️ Common Issues & Solutions

### Issue 1: Components not found
**Error:** `Cannot find module '@/components/ui/button'`

**Solution:**
- Verify `components.json` has correct paths
- Check `tsconfig.json` has path alias: `"@/*": ["./src/*"]`
- Restart TypeScript server in VSCode

### Issue 2: Styles not applying
**Error:** Components look unstyled

**Solution:**
- Ensure `globals.css` is imported in `main.tsx`
- Verify Tailwind config includes component paths
- Check shadcn/ui theme variables are in `globals.css`

### Issue 3: Dark mode not working
**Error:** Components don't respect dark mode

**Solution:**
- Ensure `darkMode: 'class'` in `tailwind.config.js`
- Check `<html>` or `<body>` has `dark` class when dark mode is active
- Verify component variants include dark mode styles

---

## ✅ Completion Criteria

Phase 1 is complete when:

- ✅ shadcn/ui is installed and configured
- ✅ All core components are installed
- ✅ Sonner toast system is working
- ✅ Dashboard components use shadcn/ui
- ✅ Settings page uses shadcn/ui
- ✅ Sidebar uses shadcn/ui buttons
- ✅ No console.log in WebSocket hook
- ✅ All type checks pass
- ✅ All pages render correctly
- ✅ Dark mode works
- ✅ No visual regressions

---

## 📊 Progress Tracking

Update [PROGRESS.md](.claude-web-tasks/PROGRESS.md) after completing each task:

```markdown
## Phase 1: UI Component System

- [x] Task 1.1: Install and Configure shadcn/ui
- [x] Task 1.2: Setup Sonner Toast System
- [ ] Task 1.3: Replace Dashboard Components
- [ ] Task 1.4: Replace Settings Page Components
- [ ] Task 1.5: Update Sidebar and Header
- [ ] Task 1.6: Remove Custom Tailwind Utilities

**Status:** 33% Complete (2/6 tasks)
```

---

## 🔄 Next Steps

After completing Phase 1:

1. Update `@.claude-web-tasks/tasks.md` to mark Phase 1 as 🟢 Complete
2. Update progress percentage
3. Continue to Phase 2:
   ```
   Continue @.claude-web-tasks/phase-2-functional-features.md
   ```

---

**Ready to start?** Begin with Task 1.1! 🚀
