import { expect, type Locator } from '@playwright/test';

export async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect, 'measured element has no box').not.toBeNull();
  return rect!;
}
