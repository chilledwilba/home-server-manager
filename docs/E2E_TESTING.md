# E2E Testing Guide

Comprehensive guide for End-to-End (E2E) testing with Playwright in the Home Server Monitor project.

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Page Object Models](#page-object-models)
- [Test Fixtures](#test-fixtures)
- [Best Practices](#best-practices)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

## Overview

This project uses [Playwright](https://playwright.dev/) for E2E testing. Playwright is a modern testing framework that allows you to test across multiple browsers (Chromium, Firefox, WebKit) with excellent developer experience.

### Test Coverage

Our E2E test suite covers 5 critical user flows:

1. **Dashboard Load and Data Display** - Verifying the main dashboard loads correctly and displays system metrics
2. **Container Management** - Testing Docker container start/stop/restart operations
3. **Alert Viewing and Acknowledgment** - Testing alert notifications and user interactions
4. **Pool Status Monitoring** - Verifying ZFS pool health and capacity monitoring
5. **API Integration** - Testing API endpoints and error handling

### Test Organization

```
tests/e2e/
├── fixtures.ts              # Test fixtures and helpers
├── pages/                   # Page Object Models
│   ├── DashboardPage.ts
│   ├── ContainersPage.ts
│   ├── AlertsPage.ts
│   └── PoolsPage.ts
├── dashboard.spec.ts        # Dashboard tests
├── containers.spec.ts       # Container management tests
├── alerts.spec.ts          # Alert management tests
└── pools.spec.ts           # Pool monitoring tests
```

## Setup

### Prerequisites

- Node.js 20.x or higher
- pnpm package manager
- All project dependencies installed

### Install Playwright Browsers

```bash
# Install all browsers
npx playwright install

# Or install specific browsers
npx playwright install chromium
npx playwright install firefox
npx playwright install webkit

# Install with system dependencies (for CI)
npx playwright install --with-deps
```

### Configuration

Playwright configuration is in `playwright.config.ts`:

```typescript
{
  testDir: './tests/e2e',
  baseURL: 'http://localhost:3100',
  timeout: 30000,
  expect: { timeout: 5000 },
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },
  ],
}
```

## Running Tests

### Basic Commands

```bash
# Run all E2E tests
pnpm run test:e2e

# Run tests in UI mode (interactive)
pnpm run test:e2e:ui

# Run tests in headed mode (see browser)
pnpm run test:e2e:headed

# Run specific test file
npx playwright test dashboard.spec.ts

# Run tests matching a pattern
npx playwright test --grep "should display"

# Run tests on specific browser
npx playwright test --project=chromium

# Run in debug mode
npx playwright test --debug

# Generate test report
npx playwright show-report
```

### Running Tests During Development

```bash
# Start dev server in one terminal
pnpm run dev

# In another terminal, run tests
pnpm run test:e2e
```

### Watch Mode

```bash
# Run tests in watch mode (reruns on file changes)
npx playwright test --ui
```

## Writing Tests

### Basic Test Structure

```typescript
import { expect } from '@playwright/test';
import { test } from './fixtures.js';
import { DashboardPage } from './pages/DashboardPage.js';

test.describe('Feature Name', () => {
  let page: DashboardPage;

  test.beforeEach(async ({ page: playwrightPage }) => {
    page = new DashboardPage(playwrightPage);
    await page.goto();
  });

  test('should do something', async () => {
    // Arrange
    await page.waitForLoad();

    // Act
    await page.clickButton();

    // Assert
    await expect(page.result).toBeVisible();
  });
});
```

### Using Test Fixtures

Our test fixtures provide useful helpers:

```typescript
test('should mock API response', async ({ page, helpers }) => {
  // Mock API response
  await helpers.mockApiResponse('/api/pools', {
    pools: [{ name: 'tank', health: 'ONLINE' }],
  });

  // Wait for API call
  await helpers.waitForApiCall(/\/api\/pools/);

  // Click safely with retry
  await helpers.clickSafely('button#submit');

  // Wait for loading spinner
  await helpers.waitForLoading();
});
```

### Test Helpers Available

- `waitForApiCall(pattern, timeout)` - Wait for specific API call
- `mockApiResponse(pattern, response, status)` - Mock API responses
- `clickSafely(selector, timeout)` - Click with retry logic
- `waitForLoading()` - Wait for loading indicators
- `typeWithDelay(selector, text, delay)` - Type with realistic delays
- `selectDropdown(selector, value)` - Select dropdown option
- `uploadFile(selector, filePath)` - Upload file input
- `takeScreenshotOnFailure(testInfo)` - Auto screenshot on failure

## Page Object Models

### What is a Page Object Model?

Page Object Models (POM) are a design pattern that creates an abstraction layer between tests and the UI. Each page/component gets its own class with methods representing user actions.

### Benefits

- **Maintainability**: UI changes only require updates to page objects, not all tests
- **Reusability**: Page methods can be reused across multiple tests
- **Readability**: Tests read more like user stories
- **Type Safety**: TypeScript provides autocomplete and type checking

### Creating a Page Object

```typescript
import type { Page } from '@playwright/test';
import { BasePage } from '../fixtures.js';

export class MyFeaturePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Getters for elements
  get heading() {
    return this.page.locator('h1').first();
  }

  get submitButton() {
    return this.page.locator('button[type="submit"]');
  }

  // Methods for actions
  async goto() {
    await super.goto('/my-feature');
  }

  async fillForm(data: { name: string; email: string }) {
    await this.page.fill('input[name="name"]', data.name);
    await this.page.fill('input[name="email"]', data.email);
  }

  async submit() {
    await this.submitButton.click();
    await this.helpers.waitForApiCall(/\/api\/submit/);
  }
}
```

### Using Page Objects in Tests

```typescript
test('should submit form successfully', async ({ page }) => {
  const myPage = new MyFeaturePage(page);

  await myPage.goto();
  await myPage.fillForm({
    name: 'Test User',
    email: 'test@example.com',
  });
  await myPage.submit();

  await expect(myPage.heading).toContainText('Success');
});
```

### Existing Page Objects

#### DashboardPage

```typescript
const dashboard = new DashboardPage(page);
await dashboard.goto();
await dashboard.waitForMetricsToLoad();
await dashboard.navigateToPools();
const metrics = await dashboard.getMetricValues();
const hasMetric = await dashboard.hasMetricType('CPU');
```

#### ContainersPage

```typescript
const containers = new ContainersPage(page);
await containers.goto();
await containers.waitForContainersLoad();
await containers.clickStart('my-container');
await containers.clickStop('my-container');
const status = await containers.getContainerStatus('my-container');
```

#### AlertsPage

```typescript
const alerts = new AlertsPage(page);
await alerts.goto();
await alerts.waitForAlertsLoad();
await alerts.acknowledgeAlert(0);
await alerts.resolveAlert(0);
const count = await alerts.getAlertCount();
const hasAlerts = await alerts.hasNoAlerts();
```

#### PoolsPage

```typescript
const pools = new PoolsPage(page);
await pools.goto();
await pools.waitForPoolsLoad();
await pools.clickScrub('tank-pool');
await pools.viewPoolDetails('tank-pool');
const status = await pools.getPoolStatus('tank-pool');
const capacity = await pools.getPoolCapacity('tank-pool');
```

## Best Practices

### 1. Use Page Object Models

✅ **Good**: Use page objects for reusability
```typescript
const dashboard = new DashboardPage(page);
await dashboard.navigateToPools();
```

❌ **Bad**: Directly interact with selectors
```typescript
await page.click('a[href="/pools"]');
```

### 2. Wait for Elements Properly

✅ **Good**: Use Playwright's auto-waiting
```typescript
await expect(page.locator('h1')).toBeVisible();
```

❌ **Bad**: Use arbitrary timeouts
```typescript
await page.waitForTimeout(5000);
await page.locator('h1');
```

### 3. Use Flexible Selectors

✅ **Good**: Multiple selector strategies
```typescript
page.locator('[data-testid="submit"], button:has-text("Submit")');
```

❌ **Bad**: Fragile CSS selectors
```typescript
page.locator('div.container > div:nth-child(3) > button');
```

### 4. Handle Optional Elements Gracefully

✅ **Good**: Check visibility before interaction
```typescript
const button = page.locator('button');
if (await button.isVisible().catch(() => false)) {
  await button.click();
}
```

❌ **Bad**: Assume element exists
```typescript
await page.locator('button').click(); // May fail if not present
```

### 5. Mock External Dependencies

✅ **Good**: Mock API responses in tests
```typescript
await helpers.mockApiResponse('/api/data', { data: mockData });
```

❌ **Bad**: Depend on real API in tests
```typescript
// Test waits for real API call - slow and flaky
```

### 6. Write Independent Tests

✅ **Good**: Each test is self-contained
```typescript
test('test 1', async () => {
  await page.goto('/');
  // Test logic
});

test('test 2', async () => {
  await page.goto('/');
  // Different test logic
});
```

❌ **Bad**: Tests depend on previous test state
```typescript
test('test 1', async () => {
  await page.goto('/');
  // Leaves state
});

test('test 2', async () => {
  // Depends on test 1's state
});
```

### 7. Use Descriptive Test Names

✅ **Good**: Clear what test verifies
```typescript
test('should display error message when form submission fails', async () => {
  // ...
});
```

❌ **Bad**: Vague test names
```typescript
test('test 1', async () => {
  // ...
});
```

### 8. Group Related Tests

✅ **Good**: Use describe blocks
```typescript
test.describe('User Authentication', () => {
  test.describe('Login', () => {
    test('should login with valid credentials', async () => {});
    test('should show error with invalid credentials', async () => {});
  });

  test.describe('Logout', () => {
    test('should logout successfully', async () => {});
  });
});
```

### 9. Handle Test Data Cleanup

```typescript
test.afterEach(async () => {
  // Clean up test data
  await helpers.mockApiResponse('/api/reset', { success: true });
});
```

### 10. Take Screenshots on Failure

```typescript
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== 'passed') {
    await page.screenshot({
      path: `test-results/failure-${testInfo.title}.png`,
    });
  }
});
```

## CI/CD Integration

### GitHub Actions

E2E tests run automatically on every push and pull request via GitHub Actions.

Configuration in `.github/workflows/ci.yml`:

```yaml
e2e:
  runs-on: ubuntu-latest
  timeout-minutes: 20

  steps:
    - uses: actions/checkout@v4
    - name: Install pnpm
      uses: pnpm/action-setup@v2
      with:
        version: 10
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '22.x'
        cache: 'pnpm'
    - name: Install dependencies
      run: pnpm install --frozen-lockfile
    - name: Install Playwright browsers
      run: npx playwright install --with-deps chromium
    - name: Build application
      run: pnpm run build
    - name: Run E2E tests
      run: pnpm run test:e2e
      env:
        CI: true
    - name: Upload Playwright report
      uses: actions/upload-artifact@v4
      if: always()
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 30
```

### Viewing Test Results in CI

1. Go to the "Actions" tab in GitHub
2. Click on the workflow run
3. Navigate to the "e2e" job
4. Download artifacts (playwright-report, e2e-test-results)
5. Extract and open `index.html` for detailed report

### CI Environment Variables

```bash
CI=true                    # Indicates running in CI
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0  # Download browsers
```

## Troubleshooting

### Tests Are Flaky

**Issue**: Tests pass sometimes, fail other times

**Solutions**:
- Use Playwright's built-in auto-waiting instead of timeouts
- Check for race conditions in your code
- Ensure tests are independent (no shared state)
- Use `test.beforeEach` to reset state
- Increase timeout for slow operations

```typescript
// Instead of:
await page.waitForTimeout(1000);

// Use:
await expect(element).toBeVisible();
```

### Timeouts

**Issue**: Tests timeout waiting for elements

**Solutions**:
- Increase timeout in playwright.config.ts
- Check if element selector is correct
- Verify the element actually appears in the UI
- Check network requests are completing

```typescript
// Increase timeout for specific test
test('slow test', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
  // ...
});
```

### Element Not Found

**Issue**: `Error: Element not found`

**Solutions**:
- Use flexible selectors with multiple strategies
- Check element is actually in the DOM
- Wait for element to appear
- Use `.first()` if multiple matches

```typescript
// Flexible selector
await page.locator('[data-testid="button"], button:has-text("Submit")').first();
```

### Browser Not Installed

**Issue**: `Browser not found`

**Solution**:
```bash
npx playwright install chromium
```

### Port Already in Use

**Issue**: `EADDRINUSE: address already in use`

**Solution**:
- Stop the dev server
- Kill processes using port 3100
- Change port in playwright.config.ts

```bash
# Find process using port 3100
lsof -i :3100

# Kill the process
kill -9 <PID>
```

### Tests Pass Locally but Fail in CI

**Possible Causes**:
- Different Node.js version
- Missing environment variables
- CI has different timing characteristics
- Browser differences

**Solutions**:
- Match Node.js version with CI
- Set CI environment variables
- Use `process.env.CI` checks for CI-specific behavior
- Run tests in Docker locally to match CI

### Debugging Tests

```bash
# Debug mode (opens inspector)
npx playwright test --debug

# Run with headed browser
npx playwright test --headed

# Slow down execution
npx playwright test --slow-mo=1000

# Generate trace
npx playwright test --trace on

# View trace
npx playwright show-trace trace.zip
```

### Common Error Messages

#### "Navigation timeout"
- Server not running
- Wrong base URL
- Network issues

#### "Target closed"
- Browser crashed
- Page navigated away unexpectedly

#### "Strict mode violation"
- Selector matches multiple elements
- Use `.first()` or more specific selector

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright API Reference](https://playwright.dev/docs/api/class-playwright)
- [Playwright Testing Guide](https://playwright.dev/docs/intro)

## Contributing

When adding new E2E tests:

1. Create Page Object Models for new pages/components
2. Use existing test fixtures and helpers
3. Follow naming conventions (`feature.spec.ts`)
4. Add tests to appropriate describe blocks
5. Ensure tests are independent and can run in any order
6. Mock external dependencies (APIs, WebSockets)
7. Update this documentation if adding new patterns/helpers

## Test Statistics

Current test coverage:
- Dashboard: 10 tests
- Containers: 9 tests
- Alerts: 11 tests
- Pools: 13 tests
- API Integration: 9 tests
- **Total: 52 E2E tests**

Target coverage: All critical user flows (5/5 ✅)
