/**
 * Shared Playwright helpers for browser automation adapters.
 * Used by browser automation adapters such as Facebook, Instagram, Threads, and X.
 */

/**
 * Click the first matching selector. Throws if none succeeds.
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
 * Click the first visible matching selector. Returns true if clicked, false if none visible.
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
 * Check if any of the given selectors is visible. Returns true if found.
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

/**
 * Capture a screenshot from the first page in a context.
 */
export async function captureScreenshot(context: any, dir: string, name: string): Promise<string> {
  const { mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${name}.png`);
  const pages = context.pages();
  if (pages.length > 0) {
    await pages[0].screenshot({ path: filePath, fullPage: false });
  }
  return filePath;
}
