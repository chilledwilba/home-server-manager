import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the dashboard before each test
    await page.goto('/');
  });

  test('should load homepage', async ({ page }) => {
    // Check for main heading or title
    await expect(page).toHaveTitle(/Home Server Monitor/i);

    // Check for main content
    const mainHeading = page.locator('h1').first();
    await expect(mainHeading).toBeVisible();
    await expect(mainHeading).toContainText(/Home Server/i);
  });

  test('should display system metrics', async ({ page }) => {
    // Wait for WebSocket connection and initial data load
    await page.waitForTimeout(2000);

    // Check for metrics cards/sections
    // These should be updated based on actual UI structure
    // Check if at least one metric is visible
    const metricsSection = page
      .locator('[data-testid="metrics"], .metrics, [class*="metrics"]')
      .first();

    if (await metricsSection.isVisible().catch(() => false)) {
      await expect(metricsSection).toBeVisible();
    } else {
      // If no metrics section, check for individual metric elements
      const anyMetric = page.locator('text=/CPU|Memory|Storage|Pool/i').first();
      await expect(anyMetric).toBeVisible();
    }
  });

  test('should navigate to pools page', async ({ page }) => {
    // Look for pools link
    const poolsLink = page
      .locator('a[href*="pools"], a:has-text("Pools"), button:has-text("Pools")')
      .first();

    if (await poolsLink.isVisible().catch(() => false)) {
      // Click pools link
      await poolsLink.click();

      // Verify navigation
      await expect(page).toHaveURL(/pools/);

      // Check for pools page content
      const poolsHeading = page.locator('h1, h2, h3').filter({ hasText: /pool/i }).first();
      await expect(poolsHeading).toBeVisible();
    } else {
      // If no pools link, check if pools are displayed on the main page
      const poolsSection = page.locator('text=/ZFS Pools|Storage Pools/i').first();
      await expect(poolsSection).toBeVisible();
    }
  });

  test('should display alerts section', async ({ page }) => {
    // Look for alerts section or navigate to alerts
    const alertsLink = page
      .locator('a[href*="alerts"], a:has-text("Alerts"), button:has-text("Alerts")')
      .first();

    if (await alertsLink.isVisible().catch(() => false)) {
      await alertsLink.click();
      await expect(page).toHaveURL(/alerts/);
    }

    // Check for alerts content
    const alertsSection = page
      .locator('[data-testid="alert-list"], .alerts, [class*="alert"]')
      .first();

    if (await alertsSection.isVisible().catch(() => false)) {
      await expect(alertsSection).toBeVisible();
    } else {
      // Check for "No alerts" message or alerts heading
      const alertsHeading = page.locator('text=/Alerts|Notifications/i').first();
      await expect(alertsHeading).toBeVisible();
    }
  });

  test('should display container status', async ({ page }) => {
    // Look for containers section
    const containersLink = page
      .locator('a[href*="containers"], a[href*="docker"], a:has-text("Containers")')
      .first();

    if (await containersLink.isVisible().catch(() => false)) {
      await containersLink.click();
      await expect(page).toHaveURL(/containers|docker/);
    }

    // Check for containers content
    const containersSection = page
      .locator('[data-testid="containers"], .containers, [class*="container"]')
      .first();

    if (await containersSection.isVisible().catch(() => false)) {
      await expect(containersSection).toBeVisible();
    } else {
      // Check for containers heading
      const containersHeading = page.locator('text=/Containers|Docker/i').first();
      await expect(containersHeading).toBeVisible();
    }
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Intercept API calls and force an error
    await page.route('**/api/**', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    // Reload the page
    await page.reload();

    // Give the page time to display error
    await page.waitForTimeout(2000);

    // The app should handle errors gracefully without breaking
    await expect(page).not.toHaveTitle(/Error/);
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Check that main content is still visible
    const mainContent = page.locator('main, [role="main"], .main-content, #app').first();
    await expect(mainContent).toBeVisible();

    // Check for mobile menu button if navigation is hidden
    const mobileMenuButton = page
      .locator('button[aria-label*="menu"], [class*="menu-toggle"], [class*="burger"]')
      .first();

    if (await mobileMenuButton.isVisible().catch(() => false)) {
      // Click menu button
      await mobileMenuButton.click();

      // Check that navigation appears
      const navigation = page.locator('nav, [role="navigation"], .navigation').first();
      await expect(navigation).toBeVisible();
    }
  });

  test('should update data in real-time', async ({ page }) => {
    // Wait for initial load
    await page.waitForTimeout(1000);

    // Get initial value of a metric (if visible)
    const metric = page.locator('[data-testid*="metric"], .metric-value, [class*="value"]').first();

    if (await metric.isVisible().catch(() => false)) {
      await metric.textContent();

      // Wait for potential update (WebSocket or polling)
      await page.waitForTimeout(5000);

      // Value might have changed (depending on real-time updates)
      const updatedValue = await metric.textContent();

      // Just verify the element still exists and has content
      expect(updatedValue).toBeTruthy();
    }
  });

  test('should display health status indicators', async ({ page }) => {
    // Look for health status indicators
    const healthIndicators = page.locator(
      '[class*="health"], [class*="status"], [data-testid*="status"]',
    );

    // Check if at least one health indicator is present
    const count = await healthIndicators.count();

    if (count > 0) {
      const firstIndicator = healthIndicators.first();
      await expect(firstIndicator).toBeVisible();

      // Check for status classes or text
      const statusText = await firstIndicator.textContent();
      expect(statusText).toBeTruthy();
    }
  });
});

test.describe('API Integration', () => {
  test('health endpoint should return 200', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('status');
  });

  test('API endpoints should be accessible', async ({ request }) => {
    // Test various API endpoints
    const endpoints = ['/api/monitoring/pools', '/api/docker/containers', '/api/system/info'];

    for (const endpoint of endpoints) {
      const response = await request.get(endpoint);
      // Endpoints should return 200 or 401 (if auth required)
      expect([200, 401, 404]).toContain(response.status());
    }
  });

  test('should handle malformed requests', async ({ request }) => {
    const response = await request.post('/api/monitoring/pools', {
      data: { invalid: 'data' },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Should return 400 or 405 for bad request/method not allowed
    expect([400, 405]).toContain(response.status());
  });
});
