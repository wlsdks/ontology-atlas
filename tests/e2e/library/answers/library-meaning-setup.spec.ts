import { expect, test, type Page } from '@playwright/test';
import type { VectorStatus } from '../../../../src/shared/lib/vault-folder/tauri-vault-vectors';
import { seedFirstRunSeen } from '../../first-run-seed';
import {
  installLibraryWorkHarness,
  LIBRARY_VECTOR_FAILURES,
  LIBRARY_VECTOR_MODEL_FAILED,
  LIBRARY_VECTOR_PROBE,
  LIBRARY_VECTOR_SCRIPT,
  type LibraryVectorsScript,
  type LibraryWorkHarness,
} from '../../library-work-harness';
import { stubDirectoryPicker } from '../../vault-picker-stub';

const VAULT_ROOT = '/Users/probe/Ontology Atlas/launch';
const CHOICE_KEY = 'ontology-atlas:vault-vectors:v1';
const FILES = {
  'project.md': '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Launch\nslug: launch\n---\n\n# Launch\n',
  'wiki/architecture.md': '---\ntitle: Architecture\nstatus: draft\n---\n\n## Summary\n\nHow the launch is built.\n',
  'sources/architecture.docx': 'Architecture evidence\n',
};

type Call = { method: string; params?: unknown };

async function openFolder(page: Page, vectors: LibraryVectorsScript = {}, choice?: object): Promise<LibraryWorkHarness> {
  await seedFirstRunSeen(page);
  if (choice) {
    // Once per test: a later load reads what the screens stored, as the app does.
    await page.addInitScript(([key, value]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
    }, [CHOICE_KEY, JSON.stringify({ [VAULT_ROOT]: choice })]);
  }
  const harness = await installLibraryWorkHarness(page, { files: FILES, vectors });
  await page.goto('/en/');
  await page.getByRole('button', { name: /Open (?:a|my) folder/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Map', exact: true })).toBeVisible();
  return harness;
}

async function openDesk(page: Page, vectors: LibraryVectorsScript = {}, choice?: object): Promise<LibraryWorkHarness> {
  const harness = await openFolder(page, vectors, choice);
  await page.goto('/en/library/?tab=wiki&guides=off');
  await expect(page.getByTestId('meaning-desk-line')).not.toHaveAttribute('data-state', 'pending');
  return harness;
}

const vectorCalls = async (harness: LibraryWorkHarness, page: Page, command: string): Promise<Call[]> =>
  (await harness.snapshot(page)).calls.filter((call) => call.method === command);

const line = (page: Page) => page.getByTestId('meaning-desk-line');

async function rowHeight(page: Page): Promise<number> {
  return line(page).evaluate((element) => element.getBoundingClientRect().height);
}

async function emit(harness: LibraryWorkHarness, page: Page, status: VectorStatus, state: string) {
  await harness.emitVectorStatus(page, status);
  await expect(line(page)).toHaveAttribute('data-state', state);
}

test('offers setup at rest and returns focus to the press when the dialog is dismissed', async ({ page }) => {
  const harness = await openDesk(page);
  await expect(line(page)).toHaveAttribute('data-state', 'words');
  await expect(line(page)).toContainText('Searching by words');
  const setup = page.getByTestId('meaning-desk-setup');
  await expect(setup).toHaveText('Set up search by meaning');

  await setup.click();
  const dialog = page.getByTestId('meaning-setup-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('meaning-setup-cancel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(setup).toBeFocused();
  expect(await vectorCalls(harness, page, 'vault_vectors_prepare')).toEqual([]);
});

test('states the probe figures in every dialog variant and keeps the box size while it answers', async ({ page }) => {
  await openDesk(page, { probe: { ...LIBRARY_VECTOR_PROBE, runner: null }, probeDelayMs: 600 });
  await page.getByTestId('meaning-desk-setup').click();
  const dialog = page.getByTestId('meaning-setup-dialog');
  await expect(page.getByTestId('meaning-setup-placeholder')).toBeVisible();
  // The rise of the opening motion ends before the box is measured.
  await expect.poll(() => dialog.evaluate((element) => getComputedStyle(element).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  const before = await dialog.boundingBox();
  await expect(page.getByTestId('meaning-setup-lead')).toContainText('reads the 2,000 Markdown files');
  const after = await dialog.boundingBox();
  expect(after).toEqual(before);

  await expect(page.getByTestId('meaning-setup-fact-model')).toContainText('bge-m3 by BAAI, MIT licence');
  await expect(page.getByTestId('meaning-setup-fact-download')).toContainText('2.3 GB from huggingface.co, once. 1.2 GB stays on this computer.');
  await expect(page.getByTestId('meaning-setup-fact-memory')).toContainText('About 1.8 GB while preparing, in the background.');
  await expect(page.getByTestId('meaning-setup-fact-sent')).toBeVisible();
  await expect(page.getByTestId('meaning-setup-fact-delete')).toBeVisible();
  await expect(page.getByTestId('meaning-setup-primary')).toHaveText('Download and prepare');
  await expect(page.getByTestId('meaning-setup-primary')).toBeEnabled();
  await expect(page.getByTestId('meaning-setup-runner')).toHaveCount(0);
  await expect(page.getByTestId('meaning-setup-disk-short')).toHaveCount(0);
});

const VARIANTS: Array<[string, LibraryVectorsScript['probe'], (page: Page) => Promise<void>]> = [
  ['the model already here', { ...LIBRARY_VECTOR_PROBE, runner: null, builtin: { ...LIBRARY_VECTOR_PROBE.builtin, onDisk: true } }, async (page) => {
    await expect(page.getByTestId('meaning-setup-fact-download')).toHaveCount(0);
    await expect(page.getByTestId('meaning-setup-primary')).toHaveText('Prepare 2,000 files');
  }],
  ['a disk short of room', { ...LIBRARY_VECTOR_PROBE, runner: null, builtin: { ...LIBRARY_VECTOR_PROBE.builtin, freeBytes: 900_000_000 } }, async (page) => {
    await expect(page.getByTestId('meaning-setup-disk-short')).toHaveText('Preparing needs 2.3 GB free on this disk; 900 MB is free.');
    await expect(page.getByTestId('meaning-setup-primary')).toBeDisabled();
  }],
  ['a runner on this computer', LIBRARY_VECTOR_PROBE, async (page) => {
    await expect(page.getByTestId('meaning-setup-runner')).toHaveText('Use bge-m3:latest in Ollama (no download)');
  }],
  ['a processor without acceleration', { ...LIBRARY_VECTOR_PROBE, runner: null, builtin: { ...LIBRARY_VECTOR_PROBE.builtin, accelerated: false } }, async (page) => {
    await expect(page.getByTestId('meaning-setup-fact-memory')).toContainText('this computer prepares on the processor');
  }],
  ...(['notLocal', 'unreachable'] as const).map((state): [string, LibraryVectorsScript['probe'], (page: Page) => Promise<void>] => [
    `a runner that is ${state}`,
    { ...LIBRARY_VECTOR_PROBE, runner: { state, address: 'http://192.168.1.4:11434', models: ['bge-m3:latest'] } },
    async (page) => {
      await expect(page.getByTestId('meaning-setup-primary')).toBeEnabled();
      await expect(page.getByTestId('meaning-setup-runner')).toHaveCount(0);
    },
  ]),
];

for (const [name, probe, check] of VARIANTS) {
  test(`shows the dialog for ${name}`, async ({ page }) => {
    await openDesk(page, { probe });
    await page.getByTestId('meaning-desk-setup').click();
    await expect(page.getByTestId('meaning-setup-lead')).toBeVisible();
    await check(page);
  });
}

test('closes on the primary press in that frame, stores the choice and follows the job at one height', async ({ page }) => {
  const harness = await openDesk(page);
  await page.getByTestId('meaning-desk-setup').click();
  await expect(page.getByTestId('meaning-setup-primary')).toBeEnabled();
  const closedInFrame = await page.evaluate(() => new Promise<boolean>((resolve) => {
    const primary = document.querySelector<HTMLButtonElement>('[data-testid="meaning-setup-primary"]')!;
    primary.click();
    requestAnimationFrame(() => resolve(document.querySelector('[data-testid="meaning-setup-dialog"]')?.closest('[inert]') !== null
      || document.querySelector('[data-testid="meaning-setup-dialog"]') === null));
  }));
  expect(closedInFrame).toBe(true);
  await expect(page.getByTestId('meaning-setup-dialog')).toHaveCount(0);
  const prepares = await vectorCalls(harness, page, 'vault_vectors_prepare');
  expect(prepares.map((call) => call.params)).toEqual([{ rootPath: VAULT_ROOT, source: { kind: 'builtin' } }]);
  expect(JSON.parse(await page.evaluate((key) => window.localStorage.getItem(key) ?? 'null', CHOICE_KEY))).toEqual({ [VAULT_ROOT]: { source: { kind: 'builtin' }, paused: false } });

  const heights = [await rowHeight(page)];
  await emit(harness, page, LIBRARY_VECTOR_SCRIPT.downloading, 'modelDownloading');
  await expect(line(page)).toContainText('Downloading the model · 32% · 734 MB of 2.3 GB');
  await expect(page.getByTestId('meaning-desk-ring')).toHaveAttribute('data-ring-measure', 'bytes');
  heights.push(await rowHeight(page));
  await emit(harness, page, LIBRARY_VECTOR_SCRIPT.converting, 'modelConverting');
  await expect(line(page)).toContainText('Preparing the model for this computer');
  await expect(page.getByTestId('meaning-desk-ring')).toHaveAttribute('data-ring-measure', 'bytes');
  heights.push(await rowHeight(page));
  await emit(harness, page, LIBRARY_VECTOR_SCRIPT.preparing, 'preparing');
  await expect(line(page)).toContainText('Preparing search by meaning · 312 of 2,000 files');
  await expect(page.getByTestId('meaning-desk-minutes')).toHaveCount(0);
  await expect(page.getByTestId('meaning-desk-file')).toHaveAttribute('title', 'wiki/architecture.md');
  heights.push(await rowHeight(page));
  await emit(harness, page, LIBRARY_VECTOR_SCRIPT.preparingMeasured, 'preparing');
  await expect(page.getByTestId('meaning-desk-minutes')).toHaveText('about 6 min left');
  heights.push(await rowHeight(page));
  await emit(harness, page, LIBRARY_VECTOR_SCRIPT.updating, 'updating');
  await expect(line(page)).toContainText('Updating 3 changed files for search by meaning');
  heights.push(await rowHeight(page));
  await emit(harness, page, LIBRARY_VECTOR_SCRIPT.ready, 'ready');
  await expect(line(page)).toContainText('Searching by words and by meaning · 2,000 files');
  heights.push(await rowHeight(page));
  test.info().annotations.push({ type: 'row heights', description: heights.join(', ') });
  expect(new Set(heights).size).toBe(1);
});

test('stops into Resume, keeps the pause across a reload and resumes with the stored source', async ({ page }) => {
  const harness = await openDesk(page, { status: LIBRARY_VECTOR_SCRIPT.preparingMeasured }, { source: { kind: 'builtin' }, paused: false });
  await expect(line(page)).toHaveAttribute('data-state', 'preparing');
  await page.getByTestId('meaning-desk-stop').click();
  await expect(line(page)).toHaveAttribute('data-state', 'stopped');
  await expect(line(page)).toContainText('Stopped at 1,240 of 2,000 files. Search by meaning covers those files.');
  expect(await vectorCalls(harness, page, 'vault_vectors_stop')).toHaveLength(1);

  await page.goto('/en/');
  await expect(page.getByRole('heading', { name: 'Map', exact: true })).toBeVisible();
  await expect.poll(async () => (await vectorCalls(harness, page, 'vault_vectors_status')).map((call) => call.params))
    .toEqual([{ rootPath: VAULT_ROOT, enabled: true, source: { kind: 'builtin' }, paused: true }]);
  await page.goto('/en/library/?tab=wiki&guides=off');
  await expect(line(page)).toHaveAttribute('data-state', 'stopped');
  expect(await vectorCalls(harness, page, 'vault_vectors_prepare')).toEqual([]);

  await page.getByTestId('meaning-desk-resume').click();
  await expect.poll(async () => (await vectorCalls(harness, page, 'vault_vectors_prepare')).map((call) => call.params))
    .toEqual([{ rootPath: VAULT_ROOT, source: { kind: 'builtin' } }]);
  expect(JSON.parse(await page.evaluate((key) => window.localStorage.getItem(key) ?? 'null', CHOICE_KEY))[VAULT_ROOT].paused).toBe(false);
});

const FAILURE_LINES: Array<[keyof typeof LIBRARY_VECTOR_FAILURES, string, string | null]> = [
  ['download', 'The model download stopped: the connection failed. What is downloaded is kept.', 'resume'],
  ['modelCheck', 'The downloaded file did not match the published model, so Atlas deleted it.', 'downloadAgain'],
  ['needsDirect', 'The model download needs a direct internet connection; this network allows only a proxy.', 'resume'],
  ['diskShort', 'The model download stopped: not enough free space on this disk. What is downloaded is kept.', 'setup'],
  ['modelGone', 'The model is no longer on this computer.', 'downloadAgain'],
  ['runnerDown', 'Ollama did not answer. Start Ollama, then press Resume.', 'resume'],
  ['modelMissing', 'bge-m3:latest is no longer in Ollama.', 'resume'],
  ['modelFailed', 'The model could not run on this computer: its process ended.', 'resume'],
  ['write', "Could not save search by meaning in this computer's cache folder: the disk refused the write.", 'resume'],
  ['auditBlocked', 'Atlas could not write the sent log in .ontology-atlas, so nothing was sent.', 'resume'],
  ['unreadable', "Atlas could not read this folder's files.", 'resume'],
];

test('says every failure with its sentence and the press that fixes it', async ({ page }) => {
  const harness = await openDesk(page, {}, { source: { kind: 'runner', baseUrl: 'http://127.0.0.1:11434', model: 'bge-m3:latest' }, paused: false });
  for (const [failure, sentence, press] of FAILURE_LINES) {
    await harness.emitVectorStatus(page, LIBRARY_VECTOR_FAILURES[failure]);
    await expect(page.getByTestId('meaning-desk-sentence').last()).toContainText(sentence);
    for (const action of ['resume', 'downloadAgain', 'setup', 'stop']) {
      await expect(line(page).getByTestId(`meaning-desk-${action}`).last()).toHaveCount(action === press ? 1 : 0);
    }
  }
  await harness.emitVectorStatus(page, LIBRARY_VECTOR_MODEL_FAILED.load);
  await expect(page.getByTestId('meaning-desk-sentence').last()).toContainText('The model could not run on this computer: the model could not load.');
});

test('shows the running job after leaving the Library and coming back, without a second prepare', async ({ page }) => {
  const harness = await openDesk(page);
  await page.getByTestId('meaning-desk-setup').click();
  await page.getByTestId('meaning-setup-primary').click();
  await emit(harness, page, LIBRARY_VECTOR_SCRIPT.preparing, 'preparing');
  await page.getByTestId('app-nav-rail-item-map').click();
  await expect(page.getByRole('heading', { name: 'Map', exact: true })).toBeVisible();
  await harness.emitVectorStatus(page, LIBRARY_VECTOR_SCRIPT.preparingMeasured);
  await page.getByTestId('app-nav-rail-item-library').click();
  await expect(line(page)).toHaveAttribute('data-state', 'preparing');
  await expect(line(page)).toContainText('1,240 of 2,000 files');
  expect(await vectorCalls(harness, page, 'vault_vectors_prepare')).toHaveLength(1);
});

test('tells the app the stored choice once at folder open, away from the Library, and nothing without one', async ({ page }) => {
  const withChoice = await openFolder(page, {}, { source: { kind: 'builtin' }, paused: false });
  await expect.poll(async () => (await vectorCalls(withChoice, page, 'vault_vectors_status')).map((call) => call.params))
    .toEqual([{ rootPath: VAULT_ROOT, enabled: true, source: { kind: 'builtin' }, paused: false }]);
  expect(page.url()).not.toContain('/library');
});

test('sends no choice at folder open when none is stored', async ({ page }) => {
  const harness = await openFolder(page);
  await page.waitForFunction(() => document.readyState === 'complete');
  const calls = await vectorCalls(harness, page, 'vault_vectors_status');
  expect(calls.filter((call) => (call.params as { source?: unknown }).source != null)).toEqual([]);
});

test('keeps the last status when the app refuses a command', async ({ page }) => {
  const harness = await openDesk(page, { status: LIBRARY_VECTOR_SCRIPT.preparing, refuse: ['vault_vectors_stop'] }, { source: { kind: 'builtin' }, paused: false });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByTestId('meaning-desk-stop').click();
  await expect.poll(async () => (await vectorCalls(harness, page, 'vault_vectors_stop')).length).toBe(1);
  await expect(line(page)).toHaveAttribute('data-state', 'preparing');
  expect(errors).toEqual([]);
});

async function openPrivacy(page: Page) {
  await page.getByTestId('app-settings-trigger').first().click();
  await page.getByRole('button', { name: /Privacy · data/ }).first().click();
}

test('lists search by meaning and its model in Settings and deletes each', async ({ page }) => {
  const harness = await openFolder(page, {
    status: LIBRARY_VECTOR_SCRIPT.ready,
    probe: { ...LIBRARY_VECTOR_PROBE, builtin: { ...LIBRARY_VECTOR_PROBE.builtin, onDisk: true } },
  }, { source: { kind: 'builtin' }, paused: false });
  await openPrivacy(page);
  const meaning = page.getByTestId('app-settings-vector-size');
  const model = page.getByTestId('app-settings-vector-model');
  await expect(meaning).toContainText('14 MB for this folder. Delete removes it; preparing again reads every file.');
  await expect(model).toContainText('1.2 GB, bge-m3 by BAAI (MIT).');

  for (const [chip, command] of [['app-settings-vector-delete', 'vault_vectors_delete'], ['app-settings-vector-model-delete', 'vault_vectors_delete_model']] as const) {
    await page.getByTestId(chip).click();
    await expect(page.getByTestId(chip)).toHaveText('Press again to delete');
    await page.waitForTimeout(600); // measurement window: the armed chip ignores a second press inside its double-click guard.
    await page.getByTestId(chip).click();
    await expect.poll(async () => (await vectorCalls(harness, page, command)).length).toBe(1);
  }
  await expect(meaning).toContainText("Deleted this folder's search by meaning.");
  expect(await page.evaluate((key) => window.localStorage.getItem(key), CHOICE_KEY)).toBeNull();
});

test('leaves search by meaning out of Settings while the index is off', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('ontology-atlas:vault-index:v1', 'off'));
  await openFolder(page, { status: LIBRARY_VECTOR_SCRIPT.ready });
  await openPrivacy(page);
  await expect(page.getByTestId('app-settings-vault-index-switch-row')).toBeVisible();
  await expect(page.getByTestId('app-settings-vector-size')).toHaveCount(0);
  await expect(page.getByTestId('app-settings-vector-model')).toHaveCount(0);
});

test('says search by meaning lives in the app on the web, with no press and no command', async ({ page }) => {
  await stubDirectoryPicker(page, FILES);
  await seedFirstRunSeen(page);
  await page.goto('/en/topology/?guides=off');
  await page.getByTestId('first-run-starter-open').click();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByTestId('first-run-starter')).toHaveCount(0);
  await page.goto('/en/library/?tab=wiki&guides=off');
  await expect(line(page)).toHaveAttribute('data-state', 'web');
  await expect(line(page)).toContainText('Search by meaning works in the installed app');
  await expect(line(page).getByRole('button')).toHaveCount(0);
});

test('keeps the line within two lines at 1040 wide with every press reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 760 });
  const harness = await openDesk(page);
  const states: Array<[VectorStatus | null, string]> = [
    [null, 'setup'],
    [LIBRARY_VECTOR_SCRIPT.preparingMeasured, 'stop'],
    [LIBRARY_VECTOR_SCRIPT.stopped, 'resume'],
    [LIBRARY_VECTOR_FAILURES.write, 'resume'],
    [LIBRARY_VECTOR_FAILURES.modelCheck, 'downloadAgain'],
  ];
  for (const [status, press] of states) {
    if (status) await harness.emitVectorStatus(page, status);
    const button = line(page).getByTestId(`meaning-desk-${press}`).last();
    await expect(button).toBeVisible();
    await page.waitForTimeout(400); // measurement window: the sentence cross-over settles before hit-testing.
    const { lines, hits } = await button.evaluate((element) => {
      const row = element.closest('[data-testid="meaning-desk-line"]')!;
      const lineHeight = parseFloat(getComputedStyle(row).lineHeight);
      const box = element.getBoundingClientRect();
      const points = [[0.5, 0.5], [0.15, 0.3], [0.85, 0.3], [0.15, 0.7], [0.85, 0.7]];
      return {
        lines: Math.round(row.getBoundingClientRect().height / Math.max(lineHeight, 24)),
        hits: points.map(([x, y]) => {
          const hit = document.elementFromPoint(box.left + box.width * x!, box.top + box.height * y!);
          return hit === element || element.contains(hit);
        }),
      };
    });
    expect(lines).toBeLessThanOrEqual(2);
    expect(hits).toEqual([true, true, true, true, true]);
  }
});

async function recordRing(page: Page): Promise<{ values: number[]; events: number[] }> {
  return page.evaluate(async () => {
    const harness = (window as unknown as { __atlasLibraryWorkHarness: { emitVectorStatus(status: unknown): void } }).__atlasLibraryWorkHarness;
    const base = { phase: 'preparing', failure: null, failureDetail: null, filesTotal: 2000, passagesDone: 0, passagesTotal: 10000, updating: false, currentPath: 'wiki/architecture.md', passagesPerSecond: null, model: null, vectorsBytes: 0 };
    const values: number[] = [];
    const events: number[] = [];
    let running = true;
    const sample = () => {
      const ring = document.querySelector('[data-testid="meaning-desk-ring"]');
      if (ring) values.push(Number(ring.getAttribute('data-ring-value')));
      if (running) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    for (let index = 1; index <= 8; index += 1) {
      events.push((index * 50) / 2000);
      harness.emitVectorStatus({ ...base, filesDone: index * 50 });
      // measurement window: events arrive a quarter second apart, as the app sends them.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    running = false;
    return { values, events };
  });
}

test('glides the ring between events without going back or skipping one', async ({ page }) => {
  await openDesk(page, {}, { source: { kind: 'builtin' }, paused: false });
  const { values, events } = await recordRing(page);
  const step = events[0]!;
  for (let index = 1; index < values.length; index += 1) {
    expect(values[index]! - values[index - 1]!).toBeGreaterThanOrEqual(0);
    expect(values[index]! - values[index - 1]!).toBeLessThanOrEqual(step + 1e-4);
  }
  expect(values.some((value) => !events.some((event) => Math.abs(event - value) < 1e-4))).toBe(true);
  expect(values.at(-1)).toBeCloseTo(events.at(-1)!, 4);
});

test('shows each value at its end under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDesk(page, {}, { source: { kind: 'builtin' }, paused: false });
  const { values, events } = await recordRing(page);
  expect(values.every((value) => value === 0 || events.some((event) => Math.abs(event - value) < 1e-4))).toBe(true);
});
