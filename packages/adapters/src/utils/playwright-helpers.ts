/**
 * Shared Playwright helper utilities for all platform adapters.
 * These are reusable automation primitives for selector-based interaction.
 * Not platform-specific; safe to import in any adapter.
 */

/**
 * Try clicking each selector in order; throws if none succeed.
 */
export async function clickFirst(page: any, selectors: string[], options: { timeout?: number } = {}): Promise<void> {
  let lastError: unknown;
  for (const selector of selectors) {
    try {
      await page.locator(selector).first().click({ timeout: options.timeout ?? 8_000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not click any selector: ${selectors.join(" | ")}`);
}

/**
 * Click the first selector that is currently visible.
 * Returns true if clicked, false otherwise.
 */
export async function clickFirstVisible(page: any, selectors: string[], options: { timeout?: number } = {}): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const loc = page.locator(selector).first();
      const visible = await loc.isVisible({ timeout: options.timeout ?? 3_000 }).catch(() => false);
      if (visible) {
        await loc.click({ timeout: options.timeout ?? 3_000 });
        return true;
      }
    } catch {
      // try next
    }
  }
  return false;
}

/**
 * Check whether any selector is visible.
 */
export async function hasVisible(page: any, selectors: string[], timeout = 3_000): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const visible = await page.locator(selector).first().isVisible({ timeout }).catch(() => false);
      if (visible) return true;
    } catch {
      // try next
    }
  }
  return false;
}
