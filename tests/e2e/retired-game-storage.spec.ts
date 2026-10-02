import { expect, test } from '@playwright/test';
import { seedFirstRunSeen } from './first-run-seed';
import { stubDirectoryPicker } from './vault-picker-stub';

for (const populated of [false, true]) {
  test(`folder entry leaves retired personal saves untouched (${populated ? 'existing' : 'absent'})`, async ({ page }) => {
    await seedFirstRunSeen(page);
    await stubDirectoryPicker(page, {
      'project.md': '---\nuid: 11111111-1111-4111-8111-111111111111\nslug: project\nkind: project\ntitle: Retirement fixture\ncontains:\n  - capabilities/pay\n---\n',
      'capabilities/pay.md': '---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/pay\nkind: capability\ntitle: Pay\n---\n',
    });
    await page.addInitScript((hasSaves) => {
      const entries: Record<string, string> = {
        'ontology-atlas:companion-journal:v1': '{invalid json',
        'ontology-atlas:companion-growth:v1:11111111-1111-4111-8111-111111111111': '{"version":1}',
        'ontology-atlas:companion-game:v1:foreign-project': '{"note":"keep my bytes"}',
        'ontology-atlas:companion-sector:v1:foreign-project': 'x'.repeat(8192),
      };
      const calls: string[] = [];
      const original = Storage.prototype.getItem;
      if (hasSaves) for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
      for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
        const fn = Storage.prototype[method];
        Object.defineProperty(Storage.prototype, method, { configurable: true, value: function (key: string, value: string) {
          if (key.startsWith('ontology-atlas:companion-')) calls.push(`${method}:${key}`);
          return Reflect.apply(fn, this, [key, value]);
        } });
      }
      const clear = Storage.prototype.clear;
      Storage.prototype.clear = function () { calls.push('clear'); return clear.call(this); };
      Object.assign(window, { retiredSaveProbe: () => ({ calls, values: Object.fromEntries(Object.keys(entries).map(key => [key, original.call(localStorage, key)])), expected: Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, hasSaves ? value : null])) }) });
    }, populated);
    await page.goto('/en/topology/?e2e=1&guides=off&index=collapsed');
    await page.getByTestId('topology-switch-to-my-data').click();
    await expect(page.getByTestId('ontology-map-canvas')).toBeVisible();
    await expect(page.getByTestId('companion-trigger')).toHaveCount(0);
    await expect(page.getByTestId('companion-home')).toHaveCount(0);
    await page.getByTestId('topology-concept-search').click();
    const search = page.getByRole('combobox');
    await search.fill('한글 기록');
    await expect(search).toHaveValue('한글 기록');
    await search.press('Escape');
    await page.keyboard.press('j');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('companion-journal')).toHaveCount(0);
    const result = await page.evaluate(() => (window as unknown as { retiredSaveProbe: () => { calls: string[]; values: Record<string, string | null>; expected: Record<string, string | null> } }).retiredSaveProbe());
    expect(result.calls).toEqual([]);
    expect(result.values).toEqual(result.expected);
  });
}

test('first-run folder entry has no personal-game door', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { isTauri: true, __TAURI_INTERNALS__: {
      transformCallback: () => 0,
      invoke: async () => { throw new Error('Native operations unavailable in first-run fixture'); },
    } });
  });
  await page.goto('/en/?shell=desktop&guides=off');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('companion-home')).toHaveCount(0);
  await expect(page.getByTestId('companion-trigger')).toHaveCount(0);
});
