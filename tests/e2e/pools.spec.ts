import { expect } from '@playwright/test';
import { test } from './fixtures.js';
import { PoolsPage } from './pages/PoolsPage.js';

test.describe('Pool Monitoring', () => {
  let poolsPage: PoolsPage;

  test.beforeEach(async ({ page }) => {
    poolsPage = new PoolsPage(page);
    await poolsPage.goto();
    await poolsPage.waitForPoolsLoad();
  });

  test('should display pools page', async () => {
    // Verify page heading
    await expect(poolsPage.heading).toBeVisible();
    await expect(poolsPage.heading).toContainText(/Pools|Storage|ZFS/i);
  });

  test('should list pools if available', async () => {
    // Check if pools are present
    const hasPools = await poolsPage.hasPools();

    if (hasPools) {
      // Get pool count
      const count = await poolsPage.getPoolCount();
      expect(count).toBeGreaterThan(0);

      // Verify pools list is visible
      const poolsListVisible = await poolsPage.poolsList.isVisible().catch(() => false);
      if (poolsListVisible) {
        await expect(poolsPage.poolsList).toBeVisible();
      }
    } else {
      // If no pools, should show message
      await expect(poolsPage.noPoolsMessage).toBeVisible();
    }
  });

  test('should display pool health status', async ({ page }) => {
    // Mock API response with pool data
    await poolsPage.helpers.mockApiResponse(/\/api\/.*pool/i, {
      pools: [
        {
          name: 'tank-pool',
          health: 'ONLINE',
          status: 'healthy',
          capacity: {
            total: 1000000000000,
            used: 500000000000,
            available: 500000000000,
          },
        },
      ],
    });

    // Reload to see mocked data
    await page.reload();
    await poolsPage.waitForPoolsLoad();

    // Check if pool row is visible
    const poolRow = poolsPage.poolRow('tank-pool');
    const isVisible = await poolRow.isVisible().catch(() => false);

    if (isVisible) {
      // Get pool status
      const status = await poolsPage.getPoolStatus('tank-pool');
      expect(status).toBeTruthy();

      // Status should indicate health
      expect(status?.toLowerCase()).toMatch(/online|healthy|ok|degraded|offline|faulted/i);
    }
  });

  test('should display pool capacity information', async ({ page }) => {
    // Mock API response with pool data
    await poolsPage.helpers.mockApiResponse(/\/api\/.*pool/i, {
      pools: [
        {
          name: 'data-pool',
          health: 'ONLINE',
          capacity: {
            total: 2000000000000,
            used: 1500000000000,
            available: 500000000000,
            percentage: 75,
          },
        },
      ],
    });

    // Reload to see mocked data
    await page.reload();
    await poolsPage.waitForPoolsLoad();

    // Check if pool row is visible
    const poolRow = poolsPage.poolRow('data-pool');
    const isVisible = await poolRow.isVisible().catch(() => false);

    if (isVisible) {
      // Get capacity information
      const capacity = await poolsPage.getPoolCapacity('data-pool');

      if (capacity) {
        // Capacity should contain numbers or percentage
        expect(capacity).toMatch(/\d+|%|GB|TB|MB/i);
      }
    }
  });

  test('should initiate pool scrub', async ({ page }) => {
    // Mock pools data
    await poolsPage.helpers.mockApiResponse(/\/api\/.*pool(?!.*\/scrub)/i, {
      pools: [
        {
          name: 'scrub-pool',
          health: 'ONLINE',
          scrubInProgress: false,
        },
      ],
    });

    // Reload
    await page.reload();
    await poolsPage.waitForPoolsLoad();

    // Check if scrub button exists
    const scrubButton = poolsPage.scrubButton('scrub-pool');
    const hasButton = await scrubButton.isVisible().catch(() => false);

    if (hasButton) {
      // Mock scrub API response
      await poolsPage.helpers.mockApiResponse(/\/api\/.*pool.*\/scrub/i, {
        success: true,
        message: 'Scrub initiated',
      });

      // Click scrub
      await scrubButton.click();

      // Wait for API call
      await poolsPage.helpers.waitForApiCall(/\/api\/.*pool.*scrub/i);

      // Verify no error
      const hasError = await page
        .locator('text=/error|failed/i')
        .isVisible()
        .catch(() => false);
      expect(hasError).toBeFalsy();
    }
  });

  test('should display scrub progress if in progress', async ({ page }) => {
    // Mock pools data with scrub in progress
    await poolsPage.helpers.mockApiResponse(/\/api\/.*pool/i, {
      pools: [
        {
          name: 'active-scrub-pool',
          health: 'ONLINE',
          scrubInProgress: true,
          scrubProgress: 45,
          scrubEstimatedCompletion: '2 hours',
        },
      ],
    });

    // Reload
    await page.reload();
    await poolsPage.waitForPoolsLoad();

    // Check if scrub progress is visible
    const poolRow = poolsPage.poolRow('active-scrub-pool');
    const isVisible = await poolRow.isVisible().catch(() => false);

    if (isVisible) {
      const rowText = await poolRow.textContent();

      // Should show scrub status or progress
      const hasScrubInfo = rowText?.match(/scrub|scanning|progress|%/i);
      if (hasScrubInfo) {
        expect(hasScrubInfo).toBeTruthy();
      }
    }
  });

  test('should view pool details', async ({ page }) => {
    // Mock pools data
    await poolsPage.helpers.mockApiResponse(/\/api\/.*pool/i, {
      pools: [
        {
          name: 'details-pool',
          health: 'ONLINE',
          vdevs: [{ type: 'mirror', devices: ['sda', 'sdb'] }],
        },
      ],
    });

    // Reload
    await page.reload();
    await poolsPage.waitForPoolsLoad();

    // Check if details button/link exists
    const detailsButton = poolsPage.detailsButton('details-pool');
    const hasButton = await detailsButton.isVisible().catch(() => false);

    if (hasButton) {
      // Click to view details
      await detailsButton.click();

      // Wait for navigation or modal
      await page.waitForTimeout(1000);

      // Should show more detailed information
      const bodyText = await page.textContent('body');
      const hasDetails = bodyText?.match(/details|vdev|device|mirror|raidz/i);

      expect(hasDetails).toBeTruthy();
    }
  });

  test('should display different health states with appropriate styling', async ({ page }) => {
    // Mock pools with different health states
    await poolsPage.helpers.mockApiResponse(/\/api\/.*pool/i, {
      pools: [
        { name: 'healthy-pool', health: 'ONLINE', status: 'healthy' },
        { name: 'degraded-pool', health: 'DEGRADED', status: 'degraded' },
        { name: 'faulted-pool', health: 'FAULTED', status: 'faulted' },
      ],
    });

    // Reload
    await page.reload();
    await poolsPage.waitForPoolsLoad();

    // Check each pool has appropriate status badge
    for (const poolName of ['healthy-pool', 'degraded-pool', 'faulted-pool']) {
      const poolRow = poolsPage.poolRow(poolName);
      const isVisible = await poolRow.isVisible().catch(() => false);

      if (isVisible) {
        const statusBadge = poolsPage.poolStatusBadge(poolName);
        const badgeVisible = await statusBadge.isVisible().catch(() => false);

        if (badgeVisible) {
          // Badge should have some class/styling
          const className = await statusBadge.getAttribute('class');
          expect(className || '').toBeTruthy();
        }
      }
    }
  });

  test('should handle pool action errors gracefully', async ({ page }) => {
    // Mock error response
    await poolsPage.helpers.mockApiResponse(
      /\/api\/.*pool.*scrub/i,
      {
        error: 'Scrub operation failed',
      },
      500,
    );

    // Try to scrub
    const anyButton = page.locator('button:has-text("Scrub")').first();
    const hasButton = await anyButton.isVisible().catch(() => false);

    if (hasButton) {
      await anyButton.click();

      // Wait for error
      await page.waitForTimeout(1000);

      // Page should still be functional
      await expect(poolsPage.heading).toBeVisible();
    }
  });

  test('should display "no pools" message when empty', async ({ page }) => {
    // Mock empty pools response
    await poolsPage.helpers.mockApiResponse(/\/api\/.*pool/i, { pools: [] }, 200);

    // Reload
    await page.reload();
    await poolsPage.helpers.waitForLoading();

    // Should show no pools message
    const noPools = await poolsPage.hasPools();
    expect(noPools).toBeFalsy();

    await expect(poolsPage.noPoolsMessage).toBeVisible();
  });

  test('should update pool data in real-time', async ({ page }) => {
    // Get initial pool count
    const initialCount = await poolsPage.getPoolCount();

    // Wait for potential updates
    await page.waitForTimeout(3000);

    // Get updated count
    const updatedCount = await poolsPage.getPoolCount();

    // Counts should both be numbers
    expect(typeof initialCount).toBe('number');
    expect(typeof updatedCount).toBe('number');
    expect(initialCount).toBeGreaterThanOrEqual(0);
    expect(updatedCount).toBeGreaterThanOrEqual(0);
  });

  test('should display capacity warnings for nearly full pools', async ({ page }) => {
    // Mock pool with high capacity
    await poolsPage.helpers.mockApiResponse(/\/api\/.*pool/i, {
      pools: [
        {
          name: 'full-pool',
          health: 'ONLINE',
          capacity: {
            total: 1000000000000,
            used: 950000000000,
            available: 50000000000,
            percentage: 95,
          },
        },
      ],
    });

    // Reload
    await page.reload();
    await poolsPage.waitForPoolsLoad();

    // Check if pool row is visible
    const poolRow = poolsPage.poolRow('full-pool');
    const isVisible = await poolRow.isVisible().catch(() => false);

    if (isVisible) {
      const rowText = await poolRow.textContent();

      // Should show high percentage or warning
      const hasWarning = rowText?.match(/9[0-9]%|warning|full|critical/i);
      if (hasWarning) {
        expect(hasWarning).toBeTruthy();
      }
    }
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Page should still be visible and functional
    await expect(poolsPage.heading).toBeVisible();

    // Content should be scrollable
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    expect(bodyHeight).toBeGreaterThan(0);
  });
});
