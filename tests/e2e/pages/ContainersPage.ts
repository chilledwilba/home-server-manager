import { BasePage } from '../fixtures.js';

export class ContainersPage extends BasePage {
  get heading() {
    return this.page
      .locator('h1, h2')
      .filter({ hasText: /containers|docker/i })
      .first();
  }

  containerRow(containerName: string) {
    return this.page
      .locator(`tr, [class*="container-row"]`)
      .filter({ hasText: containerName })
      .first();
  }

  startButton(containerName?: string) {
    if (containerName) {
      return this.containerRow(containerName)
        .locator('button:has-text("Start"), [aria-label*="start"]')
        .first();
    }
    return this.page.locator('button:has-text("Start"), [aria-label*="start"]').first();
  }

  stopButton(containerName?: string) {
    if (containerName) {
      return this.containerRow(containerName)
        .locator('button:has-text("Stop"), [aria-label*="stop"]')
        .first();
    }
    return this.page.locator('button:has-text("Stop"), [aria-label*="stop"]').first();
  }

  restartButton(containerName?: string) {
    if (containerName) {
      return this.containerRow(containerName)
        .locator('button:has-text("Restart"), [aria-label*="restart"]')
        .first();
    }
    return this.page.locator('button:has-text("Restart"), [aria-label*="restart"]').first();
  }

  statusBadge(containerName: string) {
    return this.containerRow(containerName).locator('[class*="status"], [class*="badge"]').first();
  }

  async goto() {
    await super.goto('/containers');
  }

  async waitForContainersLoad() {
    await this.helpers.waitForLoading();
    await this.page
      .locator('text=/containers|docker/i')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });
  }

  async getContainerStatus(containerName: string): Promise<string | null> {
    const statusElement = this.statusBadge(containerName);
    if (await statusElement.isVisible().catch(() => false)) {
      return statusElement.textContent();
    }
    return null;
  }

  async clickStart(containerName?: string) {
    const button = this.startButton(containerName);
    await button.click();
    await this.helpers.waitForApiCall(/\/api\/.*container/i);
  }

  async clickStop(containerName?: string) {
    const button = this.stopButton(containerName);
    await button.click();
    await this.helpers.waitForApiCall(/\/api\/.*container/i);
  }

  async clickRestart(containerName?: string) {
    const button = this.restartButton(containerName);
    await button.click();
    await this.helpers.waitForApiCall(/\/api\/.*container/i);
  }
}
