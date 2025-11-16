# Project Context for Claude Code for Web

**Last Updated:** 2025-11-16

## 📁 Project Overview

**Name:** Home Server Manager
**Description:** Enterprise-grade TrueNAS monitoring with AI assistance
**Type:** Full-stack TypeScript application (Backend + Frontend)
**Status:** Active development, moving to enterprise-level quality

## 🏗️ Architecture

### Backend
- **Framework:** Fastify 5.6.2
- **Runtime:** Node.js 20+ / Bun 1.0+
- **Language:** TypeScript 5.9.3 (strict mode)
- **Database:** SQLite (better-sqlite3)
- **Real-time:** Socket.IO 4.8.1
- **Validation:** Zod 4.1.12
- **Logging:** Pino 10.1.0

### Frontend
- **Framework:** React 18.2.0
- **Build Tool:** Vite 5.0.8
- **State:** TanStack Query 5.12.0 (server state) + Zustand 4.4.7 (client state)
- **Styling:** Tailwind CSS 3.3.0
- **UI Library:** shadcn/ui (being added in Phase 1)
- **Router:** React Router DOM 6.20.0
- **Charts:** Recharts 2.10.0

### Development Tools
- **Linter/Formatter:** Biome 2.3.4
- **Testing:** Jest 30.2.0 + Playwright 1.56.1
- **Git Hooks:** Husky 9.1.7
- **Package Manager:** pnpm

## 📂 Project Structure

```
/Users/will/Documents/GitHub/home-server-manager/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/       # UI components
│   │   ├── hooks/            # Custom hooks
│   │   ├── lib/              # Utilities
│   │   ├── pages/            # Page components
│   │   └── styles/           # CSS files
│   ├── package.json
│   └── vite.config.ts
├── src/                       # Backend
│   ├── core/                 # Core modules
│   ├── db/                   # Database
│   ├── integrations/         # External APIs
│   ├── routes/               # API routes
│   ├── services/             # Business logic
│   └── server.ts             # Entry point
├── tests/                     # Test suites
└── package.json              # Backend dependencies
```

## 🎯 Current Goals

We are transforming this project to **enterprise-level** quality by:

1. **Adding shadcn/ui** - Professional component library
2. **Completing features** - Make all UI functional
3. **Improving code quality** - Remove tech debt
4. **Polishing UX** - Loading states, animations, responsive
5. **Increasing test coverage** - Target 60%+
6. **Optimizing performance** - Fast and efficient

## 🔑 Key Files

### Backend
- `src/core/service-container.ts` - Dependency injection container
- `src/core/routes-initializer.ts` - Route registration
- `src/db/schema.ts` - Database schema
- `src/server.ts` - Main entry point

### Frontend
- `client/src/App.tsx` - Root component
- `client/src/main.tsx` - Entry point
- `client/src/pages/*.tsx` - Page components
- `client/src/components/**/*.tsx` - Reusable components
- `client/src/lib/api-client.ts` - API client
- `client/tailwind.config.js` - Tailwind config

## 🛠️ Common Commands

### Development
```bash
# Backend dev server
pnpm dev

# Frontend dev server
pnpm dev:client

# Run both (from root)
pnpm dev:all  # After adding this script
```

### Type Checking
```bash
# Backend
pnpm type-check

# Frontend
pnpm type-check:client
```

### Testing
```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# All tests
pnpm test:all
```

### Linting
```bash
# Check
pnpm lint

# Fix
pnpm lint:fix
```

## 🌐 Environment

- **Port:** Backend runs on 3100
- **Port:** Frontend dev server on 5173
- **Database:** SQLite at `./data/home-server-monitor.db`
- **Environment:** See `.env.example` for all config

## 📝 Code Style

### TypeScript
- **Strict mode enabled**
- Use `type` for simple types, `interface` for objects
- Prefer functional components
- Use explicit return types for functions

### React
- Functional components only
- Use hooks (useState, useEffect, custom hooks)
- TanStack Query for server state
- Zustand for client state (if needed)

### Naming Conventions
- **Components:** PascalCase (e.g., `SystemMetrics`)
- **Files:** kebab-case for non-components (e.g., `api-client.ts`)
- **Hooks:** camelCase starting with `use` (e.g., `useWebSocket`)
- **Types:** PascalCase (e.g., `ContainerInfo`)

## 🎨 Styling Guidelines

### Before Phase 1 (Current)
- Tailwind utility classes
- Custom CSS in `globals.css`
- Custom `.card`, `.btn-primary` classes

### After Phase 1 (Target)
- shadcn/ui components
- Consistent design tokens
- Dark mode support
- Accessible by default

## 🔄 Git Workflow

```bash
# Make changes
git add .
git commit -m "feat: add feature description"
git push

# Conventional Commits format:
# feat: new feature
# fix: bug fix
# docs: documentation
# style: formatting
# refactor: code restructuring
# test: adding tests
# chore: maintenance
```

## 📚 Important Patterns

### Service Container Pattern
Services are managed by `ServiceContainer`:
```typescript
import { getServiceContainer } from '@/core/fastify-decorators.js';

const { portainer, truenas } = getServiceContainer(fastify);
```

### API Routes Pattern
```typescript
export async function exampleRoutes(fastify: FastifyInstance) {
  fastify.get('/api/example', {
    schema: { /* OpenAPI schema */ },
  }, async (request, reply) => {
    // Handler
  });
}
```

### TanStack Query Pattern (Frontend)
```typescript
// Query
const { data, isLoading, error } = useQuery({
  queryKey: ['key'],
  queryFn: apiClient.method,
});

// Mutation
const mutation = useMutation({
  mutationFn: apiClient.method,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['key'] });
    toast.success('Success!');
  },
  onError: (error) => {
    toast.error('Failed', { description: error.message });
  },
});
```

## ⚠️ Known Constraints

1. **Solo developer** - Keep things maintainable
2. **Claude Code heavy** - Optimize for AI-assisted development
3. **No breaking changes** - Maintain backwards compatibility
4. **Performance matters** - Monitor bundle size and metrics
5. **Type safety first** - No `any` types without good reason

## 🔐 Security Considerations

- API keys in environment variables
- No secrets in code or commits
- Input validation with Zod
- Sanitize user inputs
- Use HTTPS in production

## 🎯 Success Metrics

- **Type Safety:** Zero TypeScript errors
- **Code Quality:** Biome linter passes
- **Test Coverage:** 60%+ on backend, 40%+ on frontend
- **Performance:** <3s Time to Interactive
- **Bundle Size:** <300KB gzipped
- **Accessibility:** WCAG 2.1 AA compliant

## 📖 Useful Resources

- **shadcn/ui:** https://ui.shadcn.com
- **TanStack Query:** https://tanstack.com/query
- **Tailwind CSS:** https://tailwindcss.com
- **Fastify:** https://fastify.dev
- **Zod:** https://zod.dev

## 💡 Tips for Claude Code for Web

1. **Read before writing** - Always read files before modifying
2. **Type check often** - Run `pnpm type-check` frequently
3. **Test changes** - Start dev server and verify in browser
4. **Follow patterns** - Use existing code as examples
5. **Document issues** - Update ISSUES.md if stuck
6. **Update progress** - Mark tasks complete in PROGRESS.md
7. **Use Context7** - Reference docs for best practices

---

**Need help?** Check [@.claude-web-tasks/REFERENCES.md](.claude-web-tasks/REFERENCES.md) for code examples and best practices.
