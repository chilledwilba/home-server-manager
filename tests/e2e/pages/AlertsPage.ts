import { BasePage } from '../fixtures.js';

export class AlertsPage extends BasePage {
  get heading() {
    return this.page
      .locator('h1, h2')
      .filter({ hasText: /alerts|notifications/i })
      .first();
  }

  get alertsList() {
    return this.page.locator('[data-testid="alert-list"], .alerts-list, [class*="alert"]');
  }

  alertItem(index: number) {
    return this.alertsList.nth(index);
  }

  get noAlertsMessage() {
    return this.page.locator('text=/no alerts|no notifications/i').first();
  }

  acknowledgeButton(alertIndex: number) {
    return this.alertItem(alertIndex)
      .locator('button:has-text("Acknowledge"), [aria-label*="acknowledge"]')
      .first();
  }

  resolveButton(alertIndex: number) {
    return this.alertItem(alertIndex)
      .locator('button:has-text("Resolve"), [aria-label*="resolve"]')
      .first();
  }

  async goto() {
    await super.goto('/alerts');
  }

  async waitForAlertsLoad() {
    await this.helpers.waitForLoading();
    await this.page.waitForTimeout(1000); // Give time for alerts to load
  }

  async getAlertCount(): Promise<number> {
    await this.waitForAlertsLoad();
    return this.alertsList.count();
  }

  async hasNoAlerts(): Promise<boolean> {
    return this.noAlertsMessage.isVisible().catch(() => false);
  }

  async acknowledgeAlert(index: number) {
    const button = this.acknowledgeButton(index);
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      await this.helpers.waitForApiCall(/\/api\/.*alert/i);
    }
  }

  async resolveAlert(index: number) {
    const button = this.resolveButton(index);
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      await this.helpers.waitForApiCall(/\/api\/.*alert/i);
    }
  }
}
