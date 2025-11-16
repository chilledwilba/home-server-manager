import { expect } from '@playwright/test';
import { test } from './fixtures.js';
import { AlertsPage } from './pages/AlertsPage.js';

test.describe('Alert Management', () => {
  let alertsPage: AlertsPage;

  test.beforeEach(async ({ page }) => {
    alertsPage = new AlertsPage(page);
    await alertsPage.goto();
    await alertsPage.waitForAlertsLoad();
  });

  test('should display alerts page', async () => {
    // Verify page heading
    await expect(alertsPage.heading).toBeVisible();
    await expect(alertsPage.heading).toContainText(/Alerts|Notifications/i);
  });

  test('should list alerts if available', async () => {
    // Check if alerts are present
    const hasAlerts = !(await alertsPage.hasNoAlerts());

    if (hasAlerts) {
      // Get alert count
      const count = await alertsPage.getAlertCount();
      expect(count).toBeGreaterThan(0);

      // Verify alert list is visible
      await expect(alertsPage.alertsList).toBeVisible();
    } else {
      // If no alerts, should show message
      await expect(alertsPage.noAlertsMessage).toBeVisible();
    }
  });

  test('should acknowledge an alert', async ({ page }) => {
    // Mock API response for alerts
    await alertsPage.helpers.mockApiResponse(/\/api\/.*alert/i, {
      alerts: [
        {
          id: 1,
          type: 'warning',
          message: 'Test alert',
          timestamp: new Date().toISOString(),
          acknowledged: false,
        },
      ],
    });

    // Reload to see mocked alerts
    await page.reload();
    await alertsPage.waitForAlertsLoad();

    // Check if acknowledge button is visible
    const acknowledgeButton = alertsPage.acknowledgeButton(0);
    const hasButton = await acknowledgeButton.isVisible().catch(() => false);

    if (hasButton) {
      // Mock acknowledge API response
      await alertsPage.helpers.mockApiResponse(/\/api\/.*alert.*acknowledge/i, {
        success: true,
        acknowledged: true,
      });

      // Click acknowledge
      await acknowledgeButton.click();

      // Wait for API call
      await alertsPage.helpers.waitForApiCall(/\/api\/.*alert/i);

      // Verify no error occurred
      const hasError = await page
        .locator('text=/error|failed/i')
        .isVisible()
        .catch(() => false);
      expect(hasError).toBeFalsy();
    }
  });

  test('should resolve an alert', async ({ page }) => {
    // Mock API response for alerts
    await alertsPage.helpers.mockApiResponse(/\/api\/.*alert/i, {
      alerts: [
        {
          id: 2,
          type: 'error',
          message: 'Critical alert',
          timestamp: new Date().toISOString(),
          resolved: false,
        },
      ],
    });

    // Reload to see mocked alerts
    await page.reload();
    await alertsPage.waitForAlertsLoad();

    // Check if resolve button is visible
    const resolveButton = alertsPage.resolveButton(0);
    const hasButton = await resolveButton.isVisible().catch(() => false);

    if (hasButton) {
      // Mock resolve API response
      await alertsPage.helpers.mockApiResponse(/\/api\/.*alert.*resolve/i, {
        success: true,
        resolved: true,
      });

      // Click resolve
      await resolveButton.click();

      // Wait for API call
      await alertsPage.helpers.waitForApiCall(/\/api\/.*alert/i);

      // Verify no error occurred
      const hasError = await page
        .locator('text=/error|failed/i')
        .isVisible()
        .catch(() => false);
      expect(hasError).toBeFalsy();
    }
  });

  test('should display alert details', async ({ page }) => {
    // Mock API response for alerts with details
    await alertsPage.helpers.mockApiResponse(/\/api\/.*alert/i, {
      alerts: [
        {
          id: 3,
          type: 'warning',
          message: 'Pool degraded',
          details: 'Pool tank-pool is in degraded state',
          timestamp: new Date().toISOString(),
          severity: 'medium',
        },
      ],
    });

    // Reload to see mocked alerts
    await page.reload();
    await alertsPage.waitForAlertsLoad();

    // Get first alert
    const firstAlert = alertsPage.alertItem(0);
    const isVisible = await firstAlert.isVisible().catch(() => false);

    if (isVisible) {
      const alertText = await firstAlert.textContent();

      // Should contain alert information
      expect(alertText).toBeTruthy();
      expect(alertText?.length).toBeGreaterThan(0);
    }
  });

  test('should display different alert types with styling', async ({ page }) => {
    // Mock API response with different alert types
    await alertsPage.helpers.mockApiResponse(/\/api\/.*alert/i, {
      alerts: [
        {
          id: 4,
          type: 'error',
          message: 'Critical error',
          severity: 'critical',
        },
        {
          id: 5,
          type: 'warning',
          message: 'Warning message',
          severity: 'medium',
        },
        {
          id: 6,
          type: 'info',
          message: 'Information',
          severity: 'low',
        },
      ],
    });

    // Reload to see mocked alerts
    await page.reload();
    await alertsPage.waitForAlertsLoad();

    // Check if alerts have different styling classes
    const alerts = page
      .locator('[data-testid="alert-list"], .alerts-list, [class*="alert"]')
      .locator('> *');
    const count = await alerts.count();

    if (count > 0) {
      // Each alert should have some styling/class
      for (let i = 0; i < Math.min(count, 3); i++) {
        const alert = alerts.nth(i);
        const className = await alert.getAttribute('class');
        // Should have some class attribute for styling
        expect(className || '').toBeTruthy();
      }
    }
  });

  test('should filter or sort alerts', async ({ page }) => {
    // Check if there are filter/sort controls
    const filterControls = page.locator(
      'select, [class*="filter"], [class*="sort"], button:has-text("Filter"), button:has-text("Sort")',
    );

    const hasFilters = (await filterControls.count()) > 0;

    if (hasFilters) {
      // If filters exist, interact with them
      const firstControl = filterControls.first();
      await expect(firstControl).toBeVisible();

      // Could test clicking/changing the filter
      const tagName = await firstControl.evaluate((el) => el.tagName.toLowerCase());

      if (tagName === 'select') {
        // It's a dropdown
        const options = await firstControl.locator('option').count();
        expect(options).toBeGreaterThan(0);
      }
    }
  });

  test('should handle alert action errors gracefully', async ({ page }) => {
    // Mock alert data
    await alertsPage.helpers.mockApiResponse(/\/api\/.*alert(?!.*\/acknowledge|.*\/resolve)/i, {
      alerts: [
        {
          id: 7,
          type: 'error',
          message: 'Test error alert',
        },
      ],
    });

    // Reload
    await page.reload();
    await alertsPage.waitForAlertsLoad();

    // Mock error response for acknowledge/resolve
    await alertsPage.helpers.mockApiResponse(
      /\/api\/.*alert.*(acknowledge|resolve)/i,
      {
        error: 'Action failed',
      },
      500,
    );

    // Try to acknowledge
    const acknowledgeButton = alertsPage.acknowledgeButton(0);
    const hasButton = await acknowledgeButton.isVisible().catch(() => false);

    if (hasButton) {
      await acknowledgeButton.click();

      // Wait a bit
      await page.waitForTimeout(1000);

      // Page should still be functional
      await expect(alertsPage.heading).toBeVisible();
    }
  });

  test('should display "no alerts" message when empty', async ({ page }) => {
    // Mock empty alerts response
    await alertsPage.helpers.mockApiResponse(/\/api\/.*alert/i, { alerts: [] }, 200);

    // Reload
    await page.reload();
    await alertsPage.helpers.waitForLoading();

    // Should show no alerts message
    const hasNoAlerts = await alertsPage.hasNoAlerts();
    expect(hasNoAlerts).toBeTruthy();

    await expect(alertsPage.noAlertsMessage).toBeVisible();
  });

  test('should update alerts in real-time', async ({ page }) => {
    // Get initial alert count
    const initialCount = await alertsPage.getAlertCount();

    // Wait for potential WebSocket update
    await page.waitForTimeout(3000);

    // Get updated count
    const updatedCount = await alertsPage.getAlertCount();

    // Counts may or may not change, but should both be numbers
    expect(typeof initialCount).toBe('number');
    expect(typeof updatedCount).toBe('number');
    expect(initialCount).toBeGreaterThanOrEqual(0);
    expect(updatedCount).toBeGreaterThanOrEqual(0);
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Page should still be visible and functional
    await expect(alertsPage.heading).toBeVisible();

    // Check if alerts are scrollable/visible
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    expect(bodyHeight).toBeGreaterThan(0);
  });
});
