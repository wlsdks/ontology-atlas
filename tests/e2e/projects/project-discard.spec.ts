import { expect, test } from '@playwright/test';
import { stubDirectoryPicker } from '../vault-picker-stub';
import { seedFirstRunSeen } from '../first-run-seed';
import { FIXTURE_VAULT } from '../fixture-vault';

async function openEditor(page: import('@playwright/test').Page) {
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, FIXTURE_VAULT);
  await page.goto('/ko/topology/?guides=off');
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByTestId('first-run-starter')).toBeHidden();
  await page.goto('/ko/project/fallback/?slug=storefront&mode=edit&returnTo=%2Fproject%2Ffallback%2F%3Fslug%3Dstorefront&guides=off');
  await expect(page.getByRole('heading', { level: 1, name: '온라인 상점', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '이름', exact: true })).toHaveValue('Online Store');
}

test('unsaved project edits survive Escape and Keep editing, then leave only on explicit discard', async ({ page }) => {
  await openEditor(page);
  const name = page.getByRole('textbox', { name: '이름', exact: true });
  const original = await name.inputValue();
  const originalHeading = await page.getByRole('heading', { level: 1 }).innerText();
  await name.fill('Unsaved project probe');
  const cancel = page.getByRole('button', { name: '취소', exact: true }).first();
  await cancel.click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('project-discard-dialog')).toBeHidden();
  await expect(name).toHaveValue('Unsaved project probe');
  await cancel.click();
  const dialog = page.getByTestId('project-discard-dialog');
  await expect(dialog.getByRole('button', { name: '계속 편집' })).toBeFocused();
  await dialog.getByRole('button', { name: '계속 편집' }).click();
  await expect(dialog).toBeHidden();
  await expect(cancel).toBeFocused();
  await expect(name).toHaveValue('Unsaved project probe');
  await page.getByTestId('project-editor-back-link').click();
  await dialog.getByRole('button', { name: '버리고 나가기' }).click();
  await expect(page).toHaveURL(/\/project\/fallback\/\?slug=storefront$/);
  await expect(page.getByRole('heading', { name: originalHeading, exact: true })).toBeVisible();
  await page.goto('/ko/project/fallback/?slug=storefront&mode=edit&guides=off');
  await expect(page.getByRole('textbox', { name: '이름', exact: true })).toHaveValue(original);
});

test('discarding for Duplicate opens the requested copy from saved data', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('textbox', { name: '이름', exact: true }).fill('Unsaved duplicate probe');
  await page.getByTestId('project-editor-duplicate').click();
  await page.getByTestId('project-discard-dialog').getByRole('button', { name: '버리고 나가기' }).click();
  await expect(page).toHaveURL(/\/project\/new\/\?from=storefront&returnTo=/);
  await expect(page.getByRole('textbox', { name: '이름', exact: true })).not.toHaveValue('Unsaved duplicate probe');
});
