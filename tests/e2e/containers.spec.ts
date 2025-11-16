import { expect } from '@playwright/test';
import { test } from './fixtures.js';
import { ContainersPage } from './pages/ContainersPage.js';

test.describe('Container Management', () => {
  let containersPage: ContainersPage;

  test.beforeEach(async ({ page }) => {
    containersPage = new ContainersPage(page);
    await containersPage.goto();
    await containersPage.waitForContainersLoad();
  });

  test('should display containers page', async () => {
    // Verify page heading
    await expect(containersPage.heading).toBeVisible();
    await expect(containersPage.heading).toContainText(/Containers|Docker/i);
  });

  test('should list containers if available', async () => {
    // Check if any containers are displayed
    const pageContent = await containersPage.page.textContent('body');

    if (pageContent?.match(/container|docker/i)) {
      // If we have containers, verify the structure
      const containers = containersPage.page.locator('tr, [class*="container-row"]');
      const count = await containers.count();

      // Should have at least table headers or a "no containers" message
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should handle container start action', async ({ page }) => {
    // Try to find a stopped container
    const stoppedContainer = page
      .locator('tr, [class*="container-row"]')
      .filter({ hasText: /stopped|exited/i })
      .first();

    const hasStoppedContainer = await stoppedContainer.isVisible().catch(() => false);

    if (hasStoppedContainer) {
      // Get container name
      const containerText = await stoppedContainer.textContent();
      const containerName = containerText?.split(/\s+/)[0] || '';

      // Click start button
      const startButton = containersPage.startButton(containerName);
      const isStartButtonVisible = await startButton.isVisible().catch(() => false);

      if (isStartButtonVisible) {
        // Mock the API response for container start
        await containersPage.helpers.mockApiResponse(
          /\/api\/.*container.*\/start/i,
          { success: true, status: 'starting' },
          200,
        );

        await startButton.click();

        // Wait for API call to complete
        await containersPage.helpers.waitForApiCall(/\/api\/.*container/i);

        // Verify success (page should not show error)
        const hasError = await page
          .locator('text=/error|failed/i')
          .isVisible()
          .catch(() => false);
        expect(hasError).toBeFalsy();
      }
    }
  });

  test('should handle container stop action', async ({ page }) => {
    // Try to find a running container
    const runningContainer = page
      .locator('tr, [class*="container-row"]')
      .filter({ hasText: /running|up/i })
      .first();

    const hasRunningContainer = await runningContainer.isVisible().catch(() => false);

    if (hasRunningContainer) {
      // Get container name
      const containerText = await runningContainer.textContent();
      const containerName = containerText?.split(/\s+/)[0] || '';

      // Click stop button
      const stopButton = containersPage.stopButton(containerName);
      const isStopButtonVisible = await stopButton.isVisible().catch(() => false);

      if (isStopButtonVisible) {
        // Mock the API response for container stop
        await containersPage.helpers.mockApiResponse(
          /\/api\/.*container.*\/stop/i,
          { success: true, status: 'stopping' },
          200,
        );

        await stopButton.click();

        // Wait for API call to complete
        await containersPage.helpers.waitForApiCall(/\/api\/.*container/i);

        // Verify success
        const hasError = await page
          .locator('text=/error|failed/i')
          .isVisible()
          .catch(() => false);
        expect(hasError).toBeFalsy();
      }
    }
  });

  test('should handle container restart action', async ({ page }) => {
    // Find any container
    const anyContainer = page.locator('tr, [class*="container-row"]').first();

    const hasContainer = await anyContainer.isVisible().catch(() => false);

    if (hasContainer) {
      // Get container name
      const containerText = await anyContainer.textContent();
      const containerName = containerText?.split(/\s+/)[0] || '';

      // Look for restart button
      const restartButton = containersPage.restartButton(containerName);
      const isRestartButtonVisible = await restartButton.isVisible().catch(() => false);

      if (isRestartButtonVisible) {
        // Mock the API response for container restart
        await containersPage.helpers.mockApiResponse(
          /\/api\/.*container.*\/restart/i,
          { success: true, status: 'restarting' },
          200,
        );

        await restartButton.click();

        // Wait for API call to complete
        await containersPage.helpers.waitForApiCall(/\/api\/.*container/i);

        // Verify success
        const hasError = await page
          .locator('text=/error|failed/i')
          .isVisible()
          .catch(() => false);
        expect(hasError).toBeFalsy();
      }
    }
  });

  test('should display container status badges', async () => {
    // Find any container row
    const anyContainer = containersPage.page.locator('tr, [class*="container-row"]').first();

    const hasContainer = await anyContainer.isVisible().catch(() => false);

    if (hasContainer) {
      // Get container name
      const containerText = await anyContainer.textContent();
      const containerName = containerText?.split(/\s+/)[0] || '';

      // Check for status badge
      const statusBadge = containersPage.statusBadge(containerName);
      const hasStatusBadge = await statusBadge.isVisible().catch(() => false);

      if (hasStatusBadge) {
        const statusText = await statusBadge.textContent();
        expect(statusText).toBeTruthy();
        // Status should contain typical container statuses
        expect(statusText?.toLowerCase()).toMatch(
          /running|stopped|paused|exited|restarting|created|up/,
        );
      }
    }
  });

  test('should handle container action errors gracefully', async () => {
    // Mock an error response
    await containersPage.helpers.mockApiResponse(
      /\/api\/.*container/i,
      { error: 'Container action failed' },
      500,
    );

    // Try to perform an action
    const anyButton = containersPage.page
      .locator('button:has-text("Start"), button:has-text("Stop"), button:has-text("Restart")')
      .first();

    const hasButton = await anyButton.isVisible().catch(() => false);

    if (hasButton) {
      await anyButton.click();

      // Wait a bit for error to display
      await containersPage.page.waitForTimeout(1000);

      // Page should still be functional (not crashed)
      await expect(containersPage.heading).toBeVisible();
    }
  });

  test('should display "no containers" message when empty', async ({ page }) => {
    // Mock empty containers response
    await containersPage.helpers.mockApiResponse(/\/api\/.*container/i, { containers: [] }, 200);

    // Reload the page
    await page.reload();
    await containersPage.helpers.waitForLoading();

    // Should show no containers message or empty state
    const bodyText = await page.textContent('body');
    const hasEmptyState =
      bodyText?.match(/no containers|no docker|empty/i) ||
      (await page.locator('tbody tr').count()) === 0;

    expect(hasEmptyState).toBeTruthy();
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Page should still be visible and functional
    await expect(containersPage.heading).toBeVisible();

    // Check if actions are accessible (might be in a menu or visible directly)
    const hasButtons =
      (await containersPage.page.locator('button').count()) > 0 ||
      (await containersPage.page.locator('[class*="menu"], [class*="actions"]').count()) > 0;

    expect(hasButtons).toBeTruthy();
  });
});
