import { expect, type Page } from '@playwright/test';
import { seedFirstRunSeen } from './first-run-seed';
import { stubDirectoryPicker } from './vault-picker-stub';
import { waitForBoxStill } from './settle';

export async function openEmptyLibrary(page: Page, failure = false) {
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, { 'project.md': '---\nkind: project\nslug: source-motion\ntitle: Source motion\n---\n' });
  await page.addInitScript((failure) => {
    const audit = window as unknown as {
      __finishPicker?: () => void; __cancelPicker?: () => void; __finishWrite?: () => void;
      __writing?: boolean; __writes: number;
    };
    audit.__writes = 0;
    Object.assign(window, { showOpenFilePicker: () => new Promise((resolve) => {
      audit.__finishPicker = () => resolve([{ kind: 'file', name: 'motion.txt', getFile: async () => new File(['source motion fixture\n'], 'motion.txt', { type: 'text/plain' }) }]);
      audit.__cancelPicker = () => resolve([]);
    }) });
    const original = FileSystemWritableFileStream.prototype.write;
    FileSystemWritableFileStream.prototype.write = async function (data) {
      if (data instanceof ArrayBuffer && new TextDecoder().decode(data) === 'source motion fixture\n') {
        audit.__writing = true;
        await new Promise<void>((resolve, reject) => { audit.__finishWrite = () => failure ? reject(new Error('Simulated write refusal')) : resolve(); });
        audit.__writes++;
      }
      return original.call(this, data);
    };
  }, failure);
  await page.goto('/en/library/?guides=off');
  await page.getByTestId('library-open-vault').click();
  await expect(page.getByTestId('library-start-add-files')).toBeVisible();
  await waitForBoxStill(page.getByTestId('library-start-add-files'));
}
export const visibleAdd = (page: Page) => page.locator('[data-testid="library-start-add-files"]:visible, [data-testid="library-add-files"]:visible');
export const run = (page: Page, field: '__finishPicker' | '__finishWrite' | '__cancelPicker') => page.evaluate((field) => {
  const action = (window as unknown as Record<string, () => void>)[field];
  action();
}, field);

