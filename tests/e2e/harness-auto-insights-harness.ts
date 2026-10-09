import { expect, type Locator, type Page } from '@playwright/test';

export async function hintPanel(page: Page, button: Locator): Promise<Locator> {
  const id = (await button.getAttribute('aria-describedby'))!;
  return page.locator(`[id="${id}"]`);
}

export async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect, 'measured element has no box').not.toBeNull();
  return rect!;
}
