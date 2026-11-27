import { expect, type Page } from '@playwright/test';
import { installDesktopRailRuntime, mountDesktopVault } from '../desktop-rail-arrival-harness';
import { waitForBoxStill } from '../settle';

const PICKED_FILE = '/Users/probe/Downloads/motion.txt';

/**
 * Opens the Library of an empty folder in the installed app, with the native add-documents dialog and
 * the copy into `sources/` held by the spec: `__finishPicker` / `__cancelPicker` answer the open dialog (each is a function only while one is open),
 * and `__finishWrite` lets the held copy land (or fail, with `failure`). `__writing` is true while a
 * copy waits, `__writes` counts the copies that landed, and `__sourceWalks` counts the directory
 * listings the app asked the native side for. Only the first copy is held: a second pick of the same
 * file is a duplicate the native side refuses before it writes.
 */
export async function openEmptyLibrary(page: Page, failure = false) {
  await installDesktopRailRuntime(
    page,
    { 'project.md': '---\nkind: project\nslug: source-motion\ntitle: Source motion\n---\n' },
    undefined,
    {
      replaceFixture: true,
      writable: true,
      externalFiles: { [PICKED_FILE]: 'source motion fixture\n' },
      sourcePick: { files: [PICKED_FILE] },
    },
  );
  await page.addInitScript((failure) => {
    type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    const audit = window as unknown as {
      __finishPicker?: () => void; __cancelPicker?: () => void; __finishWrite?: () => void;
      __writing?: boolean; __writes: number; __sourceWalks: number;
    };
    audit.__writes = 0;
    audit.__sourceWalks = 0;
    const bridge = (window as unknown as { __TAURI_INTERNALS__: { invoke: Invoke } }).__TAURI_INTERNALS__;
    const nativeInvoke = bridge.invoke.bind(bridge);
    bridge.invoke = async (command, args = {}) => {
      if (command === 'pick_source_files') {
        const chosen = await nativeInvoke(command, args);
        return new Promise((resolve) => {
          const answer = (paths: unknown) => () => {
            audit.__finishPicker = undefined;
            audit.__cancelPicker = undefined;
            resolve(paths);
          };
          audit.__finishPicker = answer(chosen);
          audit.__cancelPicker = answer([]);
        });
      }
      if (command === 'import_source_files' && audit.__writes === 0) {
        audit.__writing = true;
        await new Promise<void>((resolve, reject) => {
          audit.__finishWrite = () => (failure ? reject(new Error('Simulated write refusal')) : resolve());
        });
        audit.__writes++;
      }
      if (command === 'list_vault_directory') audit.__sourceWalks++;
      return nativeInvoke(command, args);
    };
  }, failure);
  await mountDesktopVault(page, 'en');
  await page.goto('/en/library/?guides=off');
  await expect(page.getByTestId('library-start-add-files')).toBeVisible();
  await waitForBoxStill(page.getByTestId('library-start-add-files'));
}
export const visibleAdd = (page: Page) => page.locator('[data-testid="library-start-add-files"]:visible, [data-testid="library-add-files"]:visible');
export const run = (page: Page, field: '__finishPicker' | '__finishWrite' | '__cancelPicker') => page.evaluate((field) => {
  const action = (window as unknown as Record<string, () => void>)[field];
  action();
}, field);
