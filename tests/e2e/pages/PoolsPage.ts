import { BasePage } from '../fixtures.js';

export class PoolsPage extends BasePage {
  get heading() {
    return this.page
      .locator('h1, h2')
      .filter({ hasText: /pools|storage|zfs/i })
      .first();
  }

  get poolsList() {
    return this.page.locator('[data-testid="pools-list"], .pools-list, [class*="pool"]');
  }

  poolRow(poolName: string) {
    return this.page.locator('tr, [class*="pool-row"]').filter({ hasText: poolName }).first();
  }

  poolStatusBadge(poolName: string) {
    return this.poolRow(poolName)
      .locator('[class*="status"], [class*="badge"], [class*="health"]')
      .first();
  }

  poolCapacity(poolName: string) {
    return this.poolRow(poolName)
      .locator('[class*="capacity"], [class*="usage"], [data-testid*="capacity"]')
      .first();
  }

  poolHealthIndicator(poolName: string) {
    return this.poolRow(poolName).locator('[class*="health"], [data-testid*="health"]').first();
  }

  get noPoolsMessage() {
    return this.page.locator('text=/no pools|no storage|no zfs/i').first();
  }

  scrubButton(poolName?: string) {
    if (poolName) {
      return this.poolRow(poolName)
        .locator('button:has-text("Scrub"), [aria-label*="scrub"]')
        .first();
    }
    return this.page.locator('button:has-text("Scrub"), [aria-label*="scrub"]').first();
  }

  detailsButton(poolName: string) {
    return this.poolRow(poolName)
      .locator('button:has-text("Details"), [aria-label*="details"], a:has-text("Details")')
      .first();
  }

  async goto() {
    await super.goto('/pools');
  }

  async waitForPoolsLoad() {
    await this.helpers.waitForLoading();
    await this.page
      .locator('text=/pools|storage|zfs/i')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });
  }

  async getPoolCount(): Promise<number> {
    await this.waitForPoolsLoad();
    const pools = this.page.locator('tr, [class*="pool-row"]').filter({ hasText: /pool|tank/i });
    return pools.count();
  }

  async hasPools(): Promise<boolean> {
    const noPools = await this.noPoolsMessage.isVisible().catch(() => false);
    return !noPools;
  }

  async getPoolStatus(poolName: string): Promise<string | null> {
    const statusElement = this.poolStatusBadge(poolName);
    if (await statusElement.isVisible().catch(() => false)) {
      return statusElement.textContent();
    }
    return null;
  }

  async getPoolCapacity(poolName: string): Promise<string | null> {
    const capacityElement = this.poolCapacity(poolName);
    if (await capacityElement.isVisible().catch(() => false)) {
      return capacityElement.textContent();
    }
    return null;
  }

  async clickScrub(poolName?: string) {
    const button = this.scrubButton(poolName);
    await button.click();
    await this.helpers.waitForApiCall(/\/api\/.*pool.*scrub/i);
  }

  async viewPoolDetails(poolName: string) {
    const button = this.detailsButton(poolName);
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      await this.helpers.waitForLoading();
    }
  }
}
