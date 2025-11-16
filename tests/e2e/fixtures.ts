import type { AriaRole, Page } from '@playwright/test';
import { test as base, expect } from '@playwright/test';

/**
 * Extended test fixtures for Home Server Monitor E2E tests
 */

export interface TestFixtures {
  /**
   * Authenticated page (if authentication is needed in future)
   */
  authenticatedPage: Page;

  /**
   * API base URL
   */
  apiUrl: string;
}

/**
 * Test fixtures with common setup and utilities
 */
export const test = base.extend<TestFixtures>({
  /**
   * Authenticated page fixture
   * Currently just returns the page, but can be extended for auth in the future
   */
  authenticatedPage: async ({ page }, use) => {
    // Navigate to home page first
    await page.goto('/');

    // Wait for app to be ready
    await page.waitForLoadState('networkidle');

    // Future: Add authentication logic here if needed
    // await page.fill('[name="username"]', 'admin');
    // await page.fill('[name="password"]', 'password');
    // await page.click('button[type="submit"]');
    // await page.waitForURL('/dashboard');

    await use(page);
  },

  /**
   * API base URL fixture
   */
  apiUrl: async ({ baseURL }, use) => {
    await use(`${baseURL}/api`);
  },
});

/**
 * Common test helpers
 */
export class TestHelpers {
  constructor(private page: Page) {}

  /**
   * Wait for API call to complete
   */
  async waitForApiCall(urlPattern: string | RegExp, timeout = 5000): Promise<void> {
    await this.page.waitForResponse(
      (response) => {
        const url = response.url();
        if (typeof urlPattern === 'string') {
          return url.includes(urlPattern);
        }
        return urlPattern.test(url);
      },
      { timeout },
    );
  }

  /**
   * Wait for WebSocket connection
   */
  async waitForWebSocket(timeout = 5000): Promise<void> {
    await this.page.waitForEvent('websocket', { timeout }).catch(() => {
      // WebSocket may already be connected
    });
  }

  /**
   * Mock API response
   */
  async mockApiResponse(
    urlPattern: string | RegExp,
    response: unknown,
    status = 200,
  ): Promise<void> {
    await this.page.route(urlPattern, (route) => {
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    });
  }

  /**
   * Mock API error
   */
  async mockApiError(
    urlPattern: string | RegExp,
    status = 500,
    message = 'Internal Server Error',
  ): Promise<void> {
    await this.page.route(urlPattern, (route) => {
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          error: message,
          statusCode: status,
        }),
      });
    });
  }

  /**
   * Get element by test ID
   */
  getByTestId(testId: string) {
    return this.page.locator(`[data-testid="${testId}"]`);
  }

  /**
   * Get element by role and name
   */
  getByRoleAndName(role: AriaRole, name: string | RegExp) {
    return this.page.getByRole(role, { name });
  }

  /**
   * Wait for element to be visible with timeout
   */
  async waitForElement(selector: string, timeout = 5000): Promise<void> {
    await this.page.locator(selector).waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for text to appear on page
   */
  async waitForText(text: string | RegExp, timeout = 5000): Promise<void> {
    await this.page.locator(`text=${typeof text === 'string' ? text : text.source}`).waitFor({
      state: 'visible',
      timeout,
    });
  }

  /**
   * Take screenshot with name
   */
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `test-results/screenshots/${name}.png`, fullPage: true });
  }

  /**
   * Wait for loading to complete
   */
  async waitForLoading(): Promise<void> {
    // Wait for any loading spinners to disappear
    const loadingSelectors = [
      '[data-testid="loading"]',
      '.loading',
      '.spinner',
      '[class*="loading"]',
      '[class*="spinner"]',
    ];

    for (const selector of loadingSelectors) {
      await this.page
        .locator(selector)
        .waitFor({ state: 'hidden', timeout: 1000 })
        .catch(() => {
          // Selector might not exist, which is fine
        });
    }
  }

  /**
   * Check if element exists
   */
  async elementExists(selector: string): Promise<boolean> {
    return (await this.page.locator(selector).count()) > 0;
  }

  /**
   * Get element text safely
   */
  async getTextContent(selector: string): Promise<string | null> {
    const element = this.page.locator(selector).first();
    if (await element.isVisible().catch(() => false)) {
      return element.textContent();
    }
    return null;
  }

  /**
   * Click element safely (wait for it to be visible and clickable)
   */
  async clickSafely(selector: string, timeout = 5000): Promise<void> {
    const element = this.page.locator(selector).first();
    await element.waitFor({ state: 'visible', timeout });
    await element.click();
  }

  /**
   * Fill form field safely
   */
  async fillSafely(selector: string, value: string, timeout = 5000): Promise<void> {
    const element = this.page.locator(selector).first();
    await element.waitFor({ state: 'visible', timeout });
    await element.fill(value);
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(urlPattern?: string | RegExp): Promise<void> {
    if (urlPattern) {
      await this.page.waitForURL(urlPattern);
    } else {
      await this.page.waitForLoadState('networkidle');
    }
  }
}

/**
 * Page Object Model base class
 */
export class BasePage {
  protected helpers: TestHelpers;

  constructor(protected page: Page) {
    this.helpers = new TestHelpers(page);
  }

  async goto(path = '/') {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
  }

  async reload() {
    await this.page.reload();
    await this.page.waitForLoadState('networkidle');
  }

  get url() {
    return this.page.url();
  }
}

export { expect };
