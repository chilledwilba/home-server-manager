import { BasePage } from '../fixtures.js';

/**
 * Dashboard Page Object Model
 */
export class DashboardPage extends BasePage {
  // Locators
  get heading() {
    return this.page.locator('h1').first();
  }

  get metricsSection() {
    return this.page.locator('[data-testid="metrics"], .metrics, [class*="metrics"]').first();
  }

  get cpuMetric() {
    return this.page.locator('text=/CPU/i').first();
  }

  get memoryMetric() {
    return this.page.locator('text=/Memory|RAM/i').first();
  }

  get storageMetric() {
    return this.page.locator('text=/Storage|Disk/i').first();
  }

  get alertsSection() {
    return this.page.locator('[data-testid="alerts"], .alerts, [class*="alert"]').first();
  }

  get poolsSection() {
    return this.page.locator('[data-testid="pools"], .pools, [class*="pool"]').first();
  }

  get containersSection() {
    return this.page
      .locator('[data-testid="containers"], .containers, [class*="container"]')
      .first();
  }

  // Actions
  async navigateToPools() {
    const link = this.page
      .locator('a[href*="pools"], a:has-text("Pools"), button:has-text("Pools")')
      .first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await this.helpers.waitForNavigation(/pools/);
    }
  }

  async navigateToAlerts() {
    const link = this.page
      .locator('a[href*="alerts"], a:has-text("Alerts"), button:has-text("Alerts")')
      .first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await this.helpers.waitForNavigation(/alerts/);
    }
  }

  async navigateToContainers() {
    const link = this.page
      .locator('a[href*="containers"], a[href*="docker"], a:has-text("Containers")')
      .first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await this.helpers.waitForNavigation(/containers|docker/);
    }
  }

  async waitForMetricsToLoad() {
    await this.helpers.waitForLoading();
    // Wait for at least one metric to be visible
    await this.page
      .locator('text=/CPU|Memory|Storage|Pool/i')
      .first()
      .waitFor({ state: 'visible' });
  }

  async waitForDashboardReady() {
    await this.page.waitForLoadState('networkidle');
    await this.helpers.waitForLoading();
  }

  // Assertions
  async isDisplayed(): Promise<boolean> {
    return this.heading.isVisible();
  }

  async hasMetrics(): Promise<boolean> {
    return (
      (await this.helpers.elementExists('[data-testid="metrics"]')) ||
      (await this.helpers.elementExists('.metrics')) ||
      (await this.page.locator('text=/CPU|Memory|Storage/i').count()) > 0
    );
  }
}
