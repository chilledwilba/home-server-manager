# Contributing to Home Server Manager

Thank you for your interest in contributing to Home Server Manager! This guide will help you get started.

## 📋 Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)

## 🚀 Development Setup

### Prerequisites

- Node.js >= 20.0.0 or Bun >= 1.0.0
- pnpm (recommended package manager)
- Git

### First-Time Setup

```bash
# Clone the repository
git clone https://github.com/your-org/home-server-manager.git
cd home-server-manager

# Run the setup script (installs dependencies, migrates DB, seeds data)
pnpm setup

# Start development server
pnpm dev

# In another terminal, start the client
pnpm dev:client

# Or run both together
pnpm dev:all
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key variables:
- `PORT`: Server port (default: 3100)
- `NODE_ENV`: Environment (development/production)
- `DATABASE_PATH`: SQLite database path

## 📁 Project Structure

```
home-server-manager/
├── src/                    # Backend source code
│   ├── core/              # Core application (service container, routes)
│   ├── routes/            # API route handlers
│   ├── services/          # Business logic services
│   ├── integrations/      # External service integrations
│   ├── db/                # Database schemas and migrations
│   └── utils/             # Shared utilities
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   └── lib/           # Frontend utilities
├── tests/                  # Test files
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   └── e2e/               # End-to-end tests
├── scripts/                # Build and utility scripts
└── .claude-web-tasks/      # Development roadmap
```

## 🛠 Development Workflow

### Available Scripts

**Development:**
```bash
pnpm dev              # Start backend server (watch mode)
pnpm dev:client       # Start frontend dev server
pnpm dev:all          # Start both backend and frontend concurrently
pnpm dev:debug        # Start with debug logging
```

**Building:**
```bash
pnpm build            # Build backend
pnpm build:client     # Build frontend
pnpm build:all        # Build both
```

**Type Checking:**
```bash
pnpm type-check               # Check backend types
pnpm type-check:client        # Check frontend types
pnpm type-check:watch         # Watch mode
```

**Linting & Formatting:**
```bash
pnpm lint             # Lint code
pnpm lint:fix         # Fix linting issues
pnpm format           # Format code with Biome
pnpm check            # Lint + format
```

**Testing:**
```bash
pnpm test             # Run all Jest tests
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage
pnpm test:unit        # Run unit tests only
pnpm test:integration # Run integration tests only
pnpm test:e2e         # Run Playwright E2E tests
pnpm test:e2e:ui      # Run E2E tests with UI
```

**Database:**
```bash
pnpm db:migrate       # Run database migrations
pnpm db:seed          # Seed database with test data
pnpm db:reset         # Reset database (drop + migrate + seed)
pnpm db:backup        # Backup database
pnpm db:status        # Check database files
```

**Utilities:**
```bash
pnpm health           # Check server health
pnpm metrics          # View server metrics
pnpm logs:tail        # Follow application logs
pnpm logs:error       # Follow error logs
pnpm logs:clean       # Clean log files
pnpm clean            # Clean build artifacts
pnpm clean:cache      # Clean all caches
```

## 📐 Code Standards

### TypeScript

- Use **strict mode** - all code must pass `tsc --noEmit` with no errors
- Prefer `type` over `interface` for simple types
- Use `interface` for extensible object shapes
- Always provide return types for public functions
- Avoid `any` - use `unknown` if type is truly unknown

### React

- Use **functional components** with hooks
- Use **TypeScript** for all components
- Follow shadcn/ui patterns for UI components
- Use TanStack Query for data fetching
- Implement proper loading and error states

### File Organization

- One component per file
- Co-locate tests with source files (`.test.ts` suffix)
- Group related files in directories
- Use barrel exports (`index.ts`) for public APIs

### Naming Conventions

- **Files**: kebab-case (`user-service.ts`)
- **Components**: PascalCase (`UserProfile.tsx`)
- **Functions**: camelCase (`getUserData()`)
- **Constants**: UPPER_SNAKE_CASE (`API_BASE_URL`)
- **Types/Interfaces**: PascalCase (`User`, `ApiResponse`)

### Code Style

We use **Biome** for linting and formatting:

```bash
# Format on save is enabled in VSCode
# Or run manually:
pnpm check
```

Key style rules:
- 2 spaces for indentation
- Single quotes for strings
- Semicolons required
- Trailing commas in multiline
- 100 character line length (soft limit)

## 🧪 Testing

### Unit Tests

Test individual functions and components:

```typescript
// user-service.test.ts
import { describe, expect, it } from '@jest/globals';
import { UserService } from './user-service';

describe('UserService', () => {
  it('should create a user', async () => {
    const service = new UserService(mockDb);
    const user = await service.create({ name: 'John' });
    expect(user.name).toBe('John');
  });
});
```

### Integration Tests

Test API endpoints:

```typescript
// routes/users.test.ts
import request from 'supertest';
import { app } from '../server';

describe('POST /api/users', () => {
  it('should create a user', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ name: 'John' })
      .expect(201);

    expect(response.body.data.name).toBe('John');
  });
});
```

### E2E Tests

Test full user flows:

```typescript
// tests/e2e/dashboard.spec.ts
import { test, expect } from '@playwright/test';

test('dashboard displays metrics', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Dashboard');
  await expect(page.locator('[data-testid="metrics"]')).toBeVisible();
});
```

### Coverage Goals

- Maintain **> 60%** overall coverage
- New features should have **> 80%** coverage
- Critical paths require **100%** coverage

## 📝 Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Commit Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
feat(api): add user authentication endpoint

- Add JWT token generation
- Implement login/logout routes
- Add password hashing with bcrypt

Closes #123
```

```bash
fix(ui): resolve container grid layout on mobile

The grid was breaking on screens < 768px.
Changed from fixed columns to responsive grid.

Fixes #456
```

### Commit Hooks

Pre-commit hooks run automatically:
- Linting with Biome
- Type checking
- Formatting

Pre-push hooks:
- Type checking
- All tests must pass

## 🔄 Pull Request Process

### Before Submitting

1. **Update from main:**
   ```bash
   git checkout main
   git pull origin main
   git checkout your-branch
   git rebase main
   ```

2. **Run all checks:**
   ```bash
   pnpm check:all   # lint + type-check + tests
   ```

3. **Update documentation:**
   - Update README if adding features
   - Add JSDoc comments to public APIs
   - Update CHANGELOG.md

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally
```

### Review Process

1. **Automated Checks**: CI must pass (tests, linting, type-checking)
2. **Code Review**: At least one approval required
3. **Testing**: Reviewer should test functionality
4. **Merge**: Squash and merge to main

## 🐛 Bug Reports

Include:
- Clear description
- Steps to reproduce
- Expected vs actual behavior
- Environment (Node version, OS, browser)
- Screenshots/logs if applicable

## 💡 Feature Requests

Include:
- Use case description
- Proposed solution
- Alternative solutions considered
- Impact on existing features

## 🆘 Getting Help

- Check the [docs](./docs)
- Search existing [issues](https://github.com/your-org/home-server-manager/issues)
- Join our [Discord](#) (if available)
- Tag maintainers in your PR/issue

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing! 🎉**
