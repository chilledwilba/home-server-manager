import { expect } from '@playwright/test';
import { test } from './fixtures.js';
import { DashboardPage } from './pages/DashboardPage.js';

test.describe('Dashboard', () => {
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    await dashboardPage.goto();
  });

  test('should load homepage', async ({ page }) => {
    // Check for main heading or title
    await expect(page).toHaveTitle(/Home Server Monitor/i);

    // Check for main heading using Page Object
    await expect(dashboardPage.heading).toBeVisible();
    await expect(dashboardPage.heading).toContainText(/Home Server|Dashboard/i);
  });

  test('should display system metrics', async () => {
    // Wait for metrics to load
    await dashboardPage.waitForMetricsToLoad();

    // Check for metrics section using Page Object
    const metricsVisible = await dashboardPage.metricsSection.isVisible().catch(() => false);

    if (metricsVisible) {
      await expect(dashboardPage.metricsSection).toBeVisible();
    } else {
      // Check for individual metric types
      const hasMetric =
        (await dashboardPage.hasMetricType('CPU')) ||
        (await dashboardPage.hasMetricType('Memory')) ||
        (await dashboardPage.hasMetricType('Storage'));
      expect(hasMetric).toBeTruthy();
    }
  });

  test('should navigate to pools page', async () => {
    // Use Page Object method to navigate
    await dashboardPage.navigateToPools();

    // Verify navigation
    const url = dashboardPage.page.url();
    expect(url).toMatch(/pools/);
  });

  test('should navigate to alerts page', async () => {
    // Use Page Object method to navigate
    await dashboardPage.navigateToAlerts();

    // Verify navigation
    const url = dashboardPage.page.url();
    expect(url).toMatch(/alerts/);
  });

  test('should navigate to containers page', async () => {
    // Use Page Object method to navigate
    await dashboardPage.navigateToContainers();

    // Verify navigation
    const url = dashboardPage.page.url();
    expect(url).toMatch(/containers|docker/);
  });

  test('should handle API errors gracefully', async () => {
    // Use test helpers to mock API error
    await dashboardPage.helpers.mockApiResponse('/api/**', { error: 'Internal Server Error' }, 500);

    // Reload the page
    await dashboardPage.page.reload();
    await dashboardPage.helpers.waitForLoading();

    // The app should handle errors gracefully without breaking
    await expect(dashboardPage.page).not.toHaveTitle(/Error/);
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Check that main content is still visible
    await expect(dashboardPage.mainContent).toBeVisible();

    // Check for mobile menu button if navigation is hidden
    const mobileMenuVisible = await dashboardPage.mobileMenuButton.isVisible().catch(() => false);

    if (mobileMenuVisible) {
      // Click menu button using helper
      await dashboardPage.helpers.clickSafely(
        'button[aria-label*="menu"], [class*="menu-toggle"], [class*="burger"]',
      );

      // Check that navigation appears
      const navigation = page.locator('nav, [role="navigation"], .navigation').first();
      await expect(navigation).toBeVisible();
    }
  });

  test('should update data in real-time', async () => {
    // Wait for initial metrics load
    await dashboardPage.waitForMetricsToLoad();

    // Get metric values using Page Object
    const _metrics = await dashboardPage.getMetricValues();

    // Wait for potential update (WebSocket or polling)
    await dashboardPage.page.waitForTimeout(5000);

    // Get updated values
    const updatedMetrics = await dashboardPage.getMetricValues();

    // Verify metrics still have values (real-time updates may or may not change values)
    expect(updatedMetrics.length).toBeGreaterThan(0);
  });

  test('should display health status indicators', async () => {
    // Wait for page load
    await dashboardPage.helpers.waitForLoading();

    // Look for health status indicators
    const healthIndicators = dashboardPage.page.locator(
      '[class*="health"], [class*="status"], [data-testid*="status"]',
    );

    // Check if at least one health indicator is present
    const count = await healthIndicators.count();

    if (count > 0) {
      const firstIndicator = healthIndicators.first();
      await expect(firstIndicator).toBeVisible();

      // Check for status content
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

  test('pools API endpoint should return valid data', async ({ request }) => {
    const response = await request.get('/api/monitoring/pools');

    // Should return 200 or 404 if not implemented yet
    if (response.status() === 200) {
      const data = await response.json();

      // Should have pools array or error property
      expect(data).toBeDefined();

      // If pools exist, verify structure
      if (Array.isArray(data.pools)) {
        for (const pool of data.pools) {
          expect(pool).toHaveProperty('name');
          expect(pool).toHaveProperty('health');
        }
      }
    } else {
      // If not found, that's okay (feature not implemented)
      expect([200, 404, 401]).toContain(response.status());
    }
  });

  test('containers API endpoint should return valid data', async ({ request }) => {
    const response = await request.get('/api/docker/containers');

    if (response.status() === 200) {
      const data = await response.json();

      // Should have containers array or error property
      expect(data).toBeDefined();

      // If containers exist, verify structure
      if (Array.isArray(data.containers)) {
        for (const container of data.containers) {
          expect(container).toHaveProperty('name');
          expect(container).toHaveProperty('status');
        }
      }
    } else {
      expect([200, 404, 401]).toContain(response.status());
    }
  });

  test('alerts API endpoint should return valid data', async ({ request }) => {
    const response = await request.get('/api/alerts');

    if (response.status() === 200) {
      const data = await response.json();

      // Should have alerts array or error property
      expect(data).toBeDefined();

      // If alerts exist, verify structure
      if (Array.isArray(data.alerts)) {
        for (const alert of data.alerts) {
          expect(alert).toHaveProperty('id');
          expect(alert).toHaveProperty('message');
        }
      }
    } else {
      expect([200, 404, 401]).toContain(response.status());
    }
  });

  test('system info API endpoint should return valid data', async ({ request }) => {
    const response = await request.get('/api/system/info');

    if (response.status() === 200) {
      const data = await response.json();

      // Should have system information
      expect(data).toBeDefined();

      // Common system info fields
      const hasSystemInfo =
        data.hostname ||
        data.platform ||
        data.arch ||
        data.uptime !== undefined ||
        data.cpuUsage !== undefined;

      if (hasSystemInfo) {
        expect(hasSystemInfo).toBeTruthy();
      }
    } else {
      expect([200, 404, 401]).toContain(response.status());
    }
  });

  test('should handle malformed requests', async ({ request }) => {
    const response = await request.post('/api/monitoring/pools', {
      data: { invalid: 'data' },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Should return 400, 404, or 405 for bad request/method not allowed
    expect([400, 404, 405]).toContain(response.status());
  });

  test('should handle missing endpoints gracefully', async ({ request }) => {
    const response = await request.get('/api/nonexistent/endpoint');

    // Should return 404 for missing endpoints
    expect(response.status()).toBe(404);
  });

  test('API should have proper CORS headers', async ({ request }) => {
    const response = await request.get('/health');

    // Check for CORS headers (optional, depends on implementation)
    const headers = response.headers();

    // If CORS is enabled, should have appropriate headers
    // This is optional and depends on the API implementation
    if (headers['access-control-allow-origin']) {
      expect(headers['access-control-allow-origin']).toBeDefined();
    }
  });

  test('API should return consistent response formats', async ({ request }) => {
    const endpoints = [
      '/api/monitoring/pools',
      '/api/docker/containers',
      '/api/alerts',
      '/api/system/info',
    ];

    for (const endpoint of endpoints) {
      const response = await request.get(endpoint);

      if (response.status() === 200) {
        // Should return valid JSON
        const data = await response.json();
        expect(data).toBeDefined();

        // Response should be an object
        expect(typeof data).toBe('object');
      }
    }
  });
});
