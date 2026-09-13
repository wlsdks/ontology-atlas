import { expect, test } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { stubDirectoryPicker } from './vault-picker-stub';

/**
 * **Relaunching with more than one folder asks which one, and the rail always says which
 * one you are in.**
 *
 * Owner report (2026-09-13): once the app is set up, relaunching always drops you in the
 * same folder with no say in it, and the settings row that could change it is somewhere he
 * would not have thought to look.
 *
 * Why this is an end-to-end spec and not only a hook test: the launch rule is a
 * *conspiracy* between four places - the cold restore that defers, the source-landing
 * predicate that must then choose the local source, the welcome gate that renders the
 * folder screen for an idle session, and the rail slot the shell registers. Each one is unit
 * tested; only a real browser reload proves they agree. The unit tests pass with any one of
 * them disconnected.
 *
 * The picker is the OPFS stub (`vault-picker-stub.ts`), which hands back a real
 * `FileSystemDirectoryHandle` under a fresh name per pick - so two picks are genuinely two
 * folders in the recent list, deduped by the same identity rule the store uses.
 */

const SHOT_DIR = '.tmp/vault-switch-shots';

const VAULT_SEED = {
  'project.md': [
    '---',
    'kind: project',
    'title: Launch Choice',
    '---',
    '',
    'A folder used to prove the launch chooser.',
  ].join('\n'),
  'domains/reading.md': ['---', 'kind: domain', 'title: Reading', '---', '', 'A domain.'].join(
    '\n',
  ),
  'notes.md': ['---', 'title: Loose note', '---', '', 'Not a concept.'].join('\n'),
};

/**
 * Waits for an entering `Surface` to finish its entrance before it is photographed.
 *
 * `toBeVisible` is true the instant the element has a box, and a `Surface` enters from
 * `opacity: 0` over about 150ms - so a screenshot taken on visibility alone catches the
 * popover at opacity 0 and reads as a rendering defect (it did: the first capture looked
 * like the map's INDEX panel was painting over it). Measured samples: 0, 0.70, 0.98, 1.
 */
async function settled(page: import('@playwright/test').Page, testId: string) {
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          const el = document.querySelector(`[data-testid="${id}"]`);
          return el ? Number(getComputedStyle(el).opacity) : 0;
        }, testId),
      { timeout: 10_000 },
    )
    .toBe(1);
}

/**
 * **The chooser's accent belongs to the folder list, in every channel.**
 *
 * The strongest chroma (saturation × value, alpha composited over the canvas so a 32%-alpha
 * hairline is judged as it is seen) inside a subtree — reading border, background and glyph
 * colour, which is where an accent can hide.
 *
 * Why this is measured rather than asserted on a class name: the first correction gated only
 * the *border* of the "open another folder" card, and the same card's glyph stayed at
 * `--color-indigo-accent`. Measured on the rendered chooser (guardian, 2026-09-13), the door's
 * glyph scored 0.561 against the list's 0.153 — so the screen still pointed at the door that
 * makes a *third* folder while its border claimed to defer. A class-name assertion would have
 * passed that state; the ranking is the fact, so the ranking is what is checked. The header's
 * brand lockup is deliberately out of scope: it is identity above the question, not an answer
 * to it.
 *
 * The whole computation happens in the page — pixel arrays crossing the CDP boundary cost
 * seconds, computed styles cost milliseconds.
 */
async function strongestChroma(page: import('@playwright/test').Page, selector: string) {
  return page.evaluate((sel) => {
    const parse = (value: string | null) => {
      const match = /rgba?\(([^)]+)\)/.exec(value ?? '');
      if (!match) return null;
      const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };
    const canvas = parse(
      getComputedStyle(document.documentElement).getPropertyValue('--color-canvas'),
    ) ?? { r: 8, g: 9, b: 11, a: 1 };
    const score = (colour: { r: number; g: number; b: number; a: number }) => {
      const r = (colour.r * colour.a + canvas.r * (1 - colour.a)) / 255;
      const g = (colour.g * colour.a + canvas.g * (1 - colour.a)) / 255;
      const b = (colour.b * colour.a + canvas.b * (1 - colour.a)) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      return max === 0 ? 0 : ((max - min) / max) * max;
    };
    let best = 0;
    const roots = Array.from(document.querySelectorAll(sel));
    for (const root of roots) {
      for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        const style = getComputedStyle(el);
        const candidates = [
          parseFloat(style.borderTopWidth) > 0 ? parse(style.borderTopColor) : null,
          parse(style.backgroundColor),
          el.tagName.toLowerCase() === 'svg' ? parse(style.color) : null,
        ];
        for (const colour of candidates) {
          if (!colour || colour.a <= 0.02) continue;
          best = Math.max(best, score(colour));
        }
      }
    }
    // The subject count travels with the score: a selector that matches nothing scores 0,
    // and 0 passes every "quieter than the list" comparison without measuring anything.
    return { score: Number(best.toFixed(3)), subjects: roots.length };
  }, selector);
}

/** Opens one folder through the stubbed picker, from the first-run starter. */
async function pickFolderFromFirstRun(page: import('@playwright/test').Page) {
  await page.goto('/en/topology/?e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByTestId('vault-switch-rail-tile')).toBeVisible({ timeout: 60_000 });
}

test.describe('the launch asks which folder when it knows more than one', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 945 });
    await seedFirstRunSeen(page);
    await stubDirectoryPicker(page, VAULT_SEED);
  });

  test('one folder resumes, two folders stop at a chooser whose rows carry facts', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    // ── First folder. The rail tile appearing is itself the proof that the open folder's
    // identity is now on screen, because the tile renders only while a vault is loaded.
    await pickFolderFromFirstRun(page);
    const firstName = await page.getByTestId('vault-switch-rail-tile').innerText();
    expect(firstName.trim().length).toBeGreaterThan(0);

    // ── With one folder known, a reload must NOT ask. A chooser here would be a toll on
    // every launch for a screen with one button.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('vault-switch-rail-tile')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('recent-vault-list')).toHaveCount(0);
    await page.screenshot({ path: `${SHOT_DIR}/01-one-folder-resumes.png`, fullPage: false });

    // ── Second folder, opened through the rail switcher — the way out that did not exist.
    await page.getByTestId('vault-switch-rail-tile').click();
    await expect(page.getByTestId('vault-switch-popover')).toBeVisible();
    await settled(page, 'vault-switch-popover');
    await page.screenshot({ path: `${SHOT_DIR}/02-rail-switcher-open.png` });
    await page.getByTestId('vault-switch-pick-other').click();
    await expect(page.getByTestId('vault-switch-rail-tile')).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(async () => (await page.getByTestId('vault-switch-rail-tile').innerText()).trim(), {
        timeout: 60_000,
      })
      .not.toBe(firstName.trim());

    // ── Now two folders are known, so the launch must stop and ask.
    //
    // `?shell=desktop` is the installed shell's own override (`isDesktopShell`), and it is
    // the honest surface to assert on: in the real app `AppShell` sends every workbench
    // route to `/` while no vault is loaded, and `RootEntryPage` renders `FirstRunPage`
    // there. That screen - not the docs welcome - is where the owner's relaunch lands.
    await page.goto('/en/?shell=desktop&e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
    const list = page.getByTestId('recent-vault-list');
    await expect(list).toBeVisible({ timeout: 60_000 });
    const rows = page.getByTestId('recent-vault-row');
    await expect(rows).toHaveCount(2, { timeout: 30_000 });
    // Nothing was loaded behind the chooser: the rail has no folder to name yet.
    await expect(page.getByTestId('vault-switch-rail-tile')).toHaveCount(0);

    // ── Rows state facts, not bare names. Two of three documents are concepts
    // (`project.md`, `domains/reading.md`); `notes.md` carries no kind.
    const listText = await list.innerText();
    expect(listText).toMatch(/3 documents/);
    expect(listText).toMatch(/2 concepts/);
    expect(listText).toMatch(/opened /);
    // Exactly one row is marked as where the last session was.
    await expect(page.locator('[data-testid="recent-vault-row"][data-current="true"]')).toHaveCount(
      1,
    );
    await page.screenshot({ path: `${SHOT_DIR}/03-launch-chooser-app-surface.png` });

    // ── The list is what the screen points at. See `strongestChroma` for why this is
    // measured across every colour channel instead of read off a class name.
    const appList = await strongestChroma(page, '[data-testid="recent-vault-list"]');
    const appDoors = await strongestChroma(
      page,
      '[data-testid="first-run-open"], [data-testid="first-run-create"], [data-testid="first-run-just-start"]',
    );
    expect(appDoors.subjects, 'no door card was measured on the launch chooser').toBeGreaterThan(0);
    expect(appList.score, 'the chooser list must carry a visible accent').toBeGreaterThan(0.1);
    expect(
      appDoors.score,
      `a door card out-coloured the folder list on the app's launch screen (door ${appDoors.score} >= list ${appList.score})`,
    ).toBeLessThan(appList.score);

    // ── The same chooser on the web's own ingress, the docs surface. One list, two seats:
    // if these disagreed, the folder facts would depend on how you arrived.
    await page.goto('/en/docs/?source=local&e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('recent-vault-list')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('recent-vault-row')).toHaveCount(2, { timeout: 30_000 });
    await page.screenshot({ path: `${SHOT_DIR}/03b-launch-chooser-docs-surface.png` });

    // The second seat owes the same ranking, or the answer depends on how you arrived.
    const docsList = await strongestChroma(page, '[data-testid="recent-vault-list"]');
    const docsDoors = await strongestChroma(
      page,
      'main#main aside[aria-label] button:not([data-testid="recent-vault-open"]):not([data-testid="recent-vault-forget"]):not([data-testid="recent-vault-locate"])',
    );
    expect(docsDoors.subjects, 'no door card was measured on the docs chooser').toBeGreaterThan(0);
    expect(docsList.score, 'the docs chooser list must carry a visible accent').toBeGreaterThan(
      0.1,
    );
    expect(
      docsDoors.score,
      `a door card out-coloured the folder list on the docs chooser (door ${docsDoors.score} >= list ${docsList.score})`,
    ).toBeLessThan(docsList.score);

    // ── Choosing the folder that was not current opens it, and the rail names it.
    const otherRow = page
      .locator('[data-testid="recent-vault-row"][data-current="false"]')
      .first();
    const otherLabel = (await otherRow.innerText()).split('\n')[0].trim();
    await otherRow.getByTestId('recent-vault-open').click();
    await expect(page.getByTestId('vault-switch-rail-tile')).toBeVisible({ timeout: 60_000 });
    /*
     * The rail label keeps the **end** of the name and drops the head behind an ellipsis, so
     * it is a suffix of the row's name rather than a substring of it - which is the whole
     * point: two folders that share a prefix have to differ on the rail.
     */
    const tileLabel = (await page.getByTestId('vault-switch-rail-tile').innerText()).trim();
    expect(otherLabel.endsWith(tileLabel.replace(/^\u2026/, ''))).toBe(true);
    // And the full name is still available to anyone who cannot read the truncation.
    expect(
      await page.getByTestId('vault-switch-rail-tile').getAttribute('aria-label'),
    ).toContain(otherLabel);
    /*
     * **CSS must not truncate on top of the JS truncation.** At an earlier budget the label
     * overflowed its 63px box and `truncate` added a second ellipsis at the other end, so
     * the screen showed `…9302420…` and the preserved tail was cut off again. Measuring
     * overflow keeps the character budget honest rather than guessed.
     */
    const labelFits = await page.evaluate(() => {
      const tile = document.querySelector('[data-testid="vault-switch-rail-tile"]');
      const label = tile?.querySelector('span:last-child');
      if (!label) return null;
      return { scrollWidth: label.scrollWidth, clientWidth: label.clientWidth };
    });
    expect(labelFits, 'the rail tile must have a label element').not.toBeNull();
    expect(
      labelFits!.scrollWidth,
      `rail label overflows its box (${labelFits!.scrollWidth} > ${labelFits!.clientWidth}), so CSS adds a second ellipsis`,
    ).toBeLessThanOrEqual(labelFits!.clientWidth);
    await page.screenshot({ path: `${SHOT_DIR}/04-chosen-folder-named-on-rail.png` });
  });

  test('a folder whose permission is refused says so before it is pressed', async ({ page }) => {
    test.setTimeout(240_000);

    await pickFolderFromFirstRun(page);
    await page.getByTestId('vault-switch-rail-tile').click();
    await page.getByTestId('vault-switch-pick-other').click();
    await expect(page.getByTestId('vault-switch-rail-tile')).toBeVisible({ timeout: 60_000 });

    /*
     * Make the stored handles answer `denied` to the non-prompting permission query. This is
     * the browser half of "a stored handle can go stale": the folder is still there, but this
     * browser will not read it from a press. The desktop half is `vault_path_exists` on the
     * stored absolute path, which no browser session can exercise - named as not covered.
     */
    await page.addInitScript(() => {
      const proto = (
        window as unknown as {
          FileSystemHandle?: { prototype: Record<string, unknown> };
        }
      ).FileSystemHandle?.prototype;
      if (proto) proto.queryPermission = async () => 'denied';
    });

    await page.goto('/en/?shell=desktop&e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
    const list = page.getByTestId('recent-vault-list');
    await expect(list).toBeVisible({ timeout: 60_000 });

    // Every row says why it cannot be opened, and none of them is an open button.
    const notices = page.locator('[data-testid="recent-vault-notice-blocked"]');
    await expect(notices.first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('recent-vault-open')).toHaveCount(0);
    // The action that is actually available on a folder that will not open.
    await expect(page.getByTestId('recent-vault-forget').first()).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/05-blocked-rows-say-why.png`, fullPage: false });
  });
});

/**
 * **The chooser is reachable by no existing sweep, so it brings its own touch floor.**
 *
 * `touch-target-contract.spec.ts` measures every control it can reach, and it cannot reach
 * this one: the chooser needs two folders already in IndexedDB, which no sweep arranges. So
 * that gate stayed green while the row's action chips measured 41.5x44 under a coarse
 * pointer - height promoted, width not, because `shape: 'chip'` carries only the height half
 * of the floor (responsive seat, 2026-09-13, measured). This case is the floor for this
 * surface, with the same `Math.round(...) < 44` filter that gate uses.
 */
test.describe('the chooser meets the touch floor it is never swept for', () => {
  test.use({ hasTouch: true, isMobile: false });

  test('every control on a known-folder row is at least 44 by 44', async ({ page }) => {
    test.setTimeout(240_000);
    await seedFirstRunSeen(page);
    await stubDirectoryPicker(page, VAULT_SEED);

    /*
     * The two folders are picked at a width where the rail exists, because below `lg` the
     * rail and its switcher are hidden — which is itself a named limit of this change. The
     * measurement then happens at 390, where the chooser still renders on the docs surface.
     */
    await page.setViewportSize({ width: 1512, height: 945 });
    await pickFolderFromFirstRun(page);
    await page.getByTestId('vault-switch-rail-tile').click();
    await page.getByTestId('vault-switch-pick-other').click();
    await expect(page.getByTestId('vault-switch-rail-tile')).toBeVisible({ timeout: 60_000 });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/docs/?source=local&e2e=1&guides=off', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('recent-vault-list')).toBeVisible({ timeout: 60_000 });

    const undersized = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid="recent-vault-row"]'));
      const bad: string[] = [];
      for (const row of rows) {
        for (const control of Array.from(row.querySelectorAll('button'))) {
          const r = control.getBoundingClientRect();
          if (Math.round(r.width) < 44 || Math.round(r.height) < 44) {
            bad.push(
              `${control.getAttribute('data-testid') ?? control.tagName}: ${Math.round(r.width)}x${Math.round(r.height)}`,
            );
          }
        }
      }
      return bad;
    });

    // Anti-idle: a chooser with no rows would pass this with an empty list.
    await expect(page.getByTestId('recent-vault-row')).toHaveCount(2, { timeout: 30_000 });
    expect(undersized, undersized.join(' · ')).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      'the chooser must not scroll sideways at 390',
    ).toBe(true);
  });
});
