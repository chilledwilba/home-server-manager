# References & Best Practices

**Last Updated:** 2025-11-16

## 📚 Documentation from Context7

### shadcn/ui

**Official Site:** https://ui.shadcn.com

**Installation:**
```bash
cd client
npx shadcn@latest init
npx shadcn@latest add button card input label select switch dialog skeleton badge alert toast sonner
```

**Key Components:**

#### Button
```tsx
import { Button } from '@/components/ui/button';

<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost">Menu Item</Button>
<Button variant="link">Link</Button>

<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>

<Button disabled>Disabled</Button>
<Button disabled={isLoading}>
  {isLoading ? 'Loading...' : 'Submit'}
</Button>
```

#### Card
```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
  <CardFooter>
    Footer content
  </CardFooter>
</Card>
```

#### Form Inputs
```tsx
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Input
<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    type="email"
    placeholder="you@example.com"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />
</div>

// Switch
<div className="flex items-center justify-between">
  <Label htmlFor="notifications">Notifications</Label>
  <Switch
    id="notifications"
    checked={enabled}
    onCheckedChange={setEnabled}
  />
</div>

// Select
<Select value={value} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="Select option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

#### Dialog (Modal)
```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Are you sure?</DialogTitle>
      <DialogDescription>
        This action cannot be undone.
      </DialogDescription>
    </DialogHeader>
    {/* Content */}
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

#### Alert Dialog (Confirmation)
```tsx
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

<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone. This will permanently delete
        your data.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

#### Sonner (Toast Notifications)
```tsx
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';

// In App.tsx
<Toaster />

// Usage
toast.success('Success!');
toast.error('Error occurred');
toast.warning('Warning message');
toast.info('Info message');

// With description
toast('Event created', {
  description: 'Your event has been scheduled',
});

// With action
toast('Changes saved', {
  action: {
    label: 'Undo',
    onClick: () => handleUndo(),
  },
});

// Loading
const toastId = toast.loading('Saving...');
// Later:
toast.success('Saved!', { id: toastId });
// Or on error:
toast.error('Failed', { id: toastId });
```

#### Skeleton (Loading States)
```tsx
import { Skeleton } from '@/components/ui/skeleton';

// Loading card
<Card>
  <CardHeader>
    <Skeleton className="h-4 w-[250px]" />
    <Skeleton className="h-4 w-[200px]" />
  </CardHeader>
  <CardContent>
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  </CardContent>
</Card>
```

---

### TanStack Query

**Official Site:** https://tanstack.com/query

**Installation:**
```bash
cd client
pnpm add @tanstack/react-query
```

**Setup:**
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* app */}
    </QueryClientProvider>
  );
}
```

**Queries (Fetching Data):**
```tsx
import { useQuery } from '@tanstack/react-query';

function Component() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  });

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error: {error.message}</div>;

  return <div>{data.map(/* ... */)}</div>;
}

// With parameters
const { data } = useQuery({
  queryKey: ['todo', todoId],
  queryFn: () => fetchTodo(todoId),
  enabled: !!todoId, // Only fetch if todoId exists
});
```

**Mutations (Creating/Updating/Deleting):**
```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

function Component() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createTodo,
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      toast.success('Todo created!');
    },
    onError: (error) => {
      toast.error('Failed to create', {
        description: error.message,
      });
    },
  });

  const handleSubmit = (data) => {
    mutation.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Button disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating...' : 'Create Todo'}
      </Button>
    </form>
  );
}
```

**Optimistic Updates:**
```tsx
const mutation = useMutation({
  mutationFn: updateTodo,
  onMutate: async (newTodo) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['todos'] });

    // Snapshot previous value
    const previousTodos = queryClient.getQueryData(['todos']);

    // Optimistically update
    queryClient.setQueryData(['todos'], (old) => [...old, newTodo]);

    // Return context with snapshot
    return { previousTodos };
  },
  onError: (err, newTodo, context) => {
    // Rollback on error
    queryClient.setQueryData(['todos'], context.previousTodos);
  },
  onSettled: () => {
    // Always refetch after error or success
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  },
});
```

**Async/Await with Mutations:**
```tsx
const mutation = useMutation({ mutationFn: createTodo });

const handleSubmit = async () => {
  try {
    const result = await mutation.mutateAsync(todoData);
    console.log('Created:', result);
    navigate('/todos');
  } catch (error) {
    console.error('Failed:', error);
  }
};
```

---

## 🎨 Styling Patterns

### Tailwind CSS Classes

**Layout:**
```tsx
<div className="flex items-center justify-between">
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
<div className="space-y-4">  // Vertical spacing
<div className="space-x-2">  // Horizontal spacing
```

**Responsive:**
```tsx
<div className="hidden md:block">  // Show on md and up
<div className="block md:hidden">  // Show only on small
<div className="text-sm md:text-base lg:text-lg">  // Responsive text
```

**Dark Mode:**
```tsx
<div className="bg-white dark:bg-gray-800">
<div className="text-gray-900 dark:text-gray-100">
<div className="border-gray-200 dark:border-gray-700">
```

**Common Patterns:**
```tsx
// Card-like container
<div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">

// Hover effect
<div className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">

// Flex row with gap
<div className="flex items-center gap-2">

// Full width button
<Button className="w-full">

// Truncate text
<p className="truncate">Long text that will be cut off...</p>

// Line clamp (max lines)
<p className="line-clamp-2">Multi-line text...</p>
```

---

## 🔧 Common Patterns

### Loading States
```tsx
// Simple loading
{isLoading && <Skeleton className="h-20 w-full" />}
{!isLoading && <Content data={data} />}

// With multiple states
{isLoading ? (
  <Skeleton className="h-20 w-full" />
) : isError ? (
  <Alert variant="destructive">{error.message}</Alert>
) : (
  <Content data={data} />
)}
```

### Error Handling
```tsx
// API error handling
try {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
} catch (error) {
  toast.error('Request failed', {
    description: error instanceof Error ? error.message : 'Unknown error',
  });
  throw error;
}
```

### Form State Management
```tsx
function FormComponent() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
  });

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form>
      <Input
        value={formData.name}
        onChange={(e) => updateField('name', e.target.value)}
      />
      <Input
        value={formData.email}
        onChange={(e) => updateField('email', e.target.value)}
      />
    </form>
  );
}
```

### Confirmation Dialogs
```tsx
// Always use AlertDialog for destructive actions
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Confirm deletion</AlertDialogTitle>
      <AlertDialogDescription>
        This will permanently delete "{itemName}". Continue?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## 🐛 Debugging Tips

### TypeScript Errors
```bash
# Full type check
cd client && pnpm type-check

# Watch mode
cd client && pnpm type-check:watch
```

### React DevTools
- Install React DevTools browser extension
- Inspect component props and state
- Profile performance with Profiler tab

### TanStack Query DevTools
```tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

<QueryClientProvider client={queryClient}>
  <App />
  <ReactQueryDevtools initialIsOpen={false} />
</QueryClientProvider>
```

---

## ✅ Best Practices

1. **Always use TypeScript types** - No `any` unless absolutely necessary
2. **Extract reusable logic to hooks** - Keep components clean
3. **Use TanStack Query for server state** - Don't use useState for API data
4. **Use Sonner for all notifications** - Consistent user feedback
5. **Add loading states to all async operations** - Better UX
6. **Use AlertDialog for destructive actions** - Prevent accidents
7. **Handle errors gracefully** - Show user-friendly messages
8. **Keep components small** - Split large components
9. **Use semantic HTML** - Better accessibility
10. **Test in dark mode** - Ensure it looks good in both themes

---

## 🔗 External Resources

- **shadcn/ui:** https://ui.shadcn.com
- **TanStack Query:** https://tanstack.com/query/latest/docs/framework/react/overview
- **Tailwind CSS:** https://tailwindcss.com/docs
- **Radix UI:** https://www.radix-ui.com (shadcn/ui uses this)
- **Zod:** https://zod.dev (validation)
- **React Hook Form:** https://react-hook-form.com (complex forms)
