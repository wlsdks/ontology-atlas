import { expect, test, type Page } from '@playwright/test';

import {
  DESKTOP_VAULT_ROOT,
  chooseDesktopFolder,
  installDesktopRailRuntime,
  storefrontFiles,
} from '../desktop-rail-arrival-harness';
import { waitFrames } from '../settle';

const LOCAL_ONLY_ROOT = '/Users/probe/local-only';

const PROJECT_UID = '10000000-0000-4000-8000-000000000001';

const LOCAL_ONLY_VAULT = {
  'local-only.md': `---
uid: ${PROJECT_UID}
kind: project
slug: local-only
title: Local Only Project
display_ko: 로컬 전용 프로젝트
contains: [domains/local-only]
---

# Local Only Project

This marker exists only in the mounted vault.
`,
  'domains/local-only.md': `---
uid: 10000000-0000-4000-8000-000000000002
kind: domain
slug: domains/local-only
title: Local Only Domain
display_ko: 로컬 전용 도메인
capabilities: [capabilities/local-only]
---

# Local Only Domain
`,
  'capabilities/local-only.md': `---
uid: 10000000-0000-4000-8000-000000000003
kind: capability
slug: capabilities/local-only
title: Local Only Capability
display_ko: 로컬 전용 역량
domain: domains/local-only
---

# Local Only Capability
`,
  'architecture/local-only.md': `---
architecture_schema: architecture-profile/v1
profile_uid: 10000000-0000-4000-8000-000000000004
profile_slug: local-only
project_uid: ${PROJECT_UID}
title: Local Only Architecture
created_by: human
patterns: [source-organization:layered]
scope_paths: [src/**]
role_order: [interface, meaning]
role_interface: [src/app/**]
role_meaning: [src/domain/**]
summary_interface: The local entry layer.
summary_meaning: The local meaning layer.
dependency_policy: lower-only
dependency_usages: [value]
evidence: [local-only.md]
---

# Local Only Architecture
`,
} as const;

const SAMPLE_MARKERS = [
  'Online Store',
  'Storefront Services',
  '쿠폰 발급',
  '고객 메시지 발송',
  '주문 확정',
  'domains/order',
] as const;

async function startFrameTextTrace(page: Page) {
  await page.evaluate(() => {
    const state = window as unknown as {
      __vaultIdentityFrames?: string[];
      __stopVaultIdentityFrames?: () => void;
    };
    state.__vaultIdentityFrames = [];
    let running = true;
    state.__stopVaultIdentityFrames = () => {
      running = false;
    };
    const sample = () => {
      if (!running) return;
      state.__vaultIdentityFrames!.push(document.body.innerText);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function stopFrameTextTrace(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const state = window as unknown as {
      __vaultIdentityFrames?: string[];
      __stopVaultIdentityFrames?: () => void;
    };
    state.__stopVaultIdentityFrames?.();
    return state.__vaultIdentityFrames ?? [];
  });
}

async function expectLocalOnlyTransition(
  page: Page,
  destination: 'architecture' | 'library' | 'projects',
  localMarker: string,
  section?: 'ontology',
) {
  await startFrameTextTrace(page);
  const railItem = page.getByTestId(`app-nav-rail-item-${destination}`);
  await railItem.click();
  // Arrival first: the previous screen's `main` can still hold the marker (the library lists the
  // same capability), so asserting text before the route commits passes on the wrong screen.
  await expect(railItem).toHaveAttribute('aria-current', 'page');
  if (section) {
    const tab = page.getByTestId(`library-workspace-${section}`);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
  if (destination === 'architecture') {
    // The app arrives on the Harness overview; the reviewed profile is on its blueprint tab.
    const blueprint = page.locator('#harness-tab-architecture');
    await blueprint.click();
    await expect(blueprint).toHaveAttribute('aria-selected', 'true');
  }
  await expect(page.locator('main')).toContainText(localMarker, { timeout: 20_000 });
  // Keep sampling for a run of drawn frames after arrival, so a late flash of the sample is caught.
  await waitFrames(page, 15);
  const frames = await stopFrameTextTrace(page);

  expect(frames.length, `${destination}: there are no frame samples`).toBeGreaterThan(2);
  const leaked = frames.flatMap((text, index) =>
    SAMPLE_MARKERS.filter((marker) => text.includes(marker)).map((marker) => ({ index, marker })),
  );
  expect(
    leaked,
    `${destination}: the bundled sample was drawn in at least one frame after the local vault opened`,
  ).toEqual([]);
}

test('switching the LNB in a chosen local vault draws the bundled sample in no frame', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await installDesktopRailRuntime(page, {}, undefined, {
    replaceFixture: true,
    folders: { [DESKTOP_VAULT_ROOT]: storefrontFiles(), [LOCAL_ONLY_ROOT]: LOCAL_ONLY_VAULT },
    vaultPick: DESKTOP_VAULT_ROOT,
  });

  // Start from the Storefront folder with its order document loaded.
  await page.goto('/ko/?guides=off');
  await page.getByTestId('first-run-open').click();
  await page.getByTestId('app-nav-rail').waitFor({ timeout: 60_000 });
  await expect(page.getByText(/온라인 상점|Online Store/).first()).toBeVisible({ timeout: 20_000 });

  // Switch to the local-only folder through the rail, the way a person does.
  await chooseDesktopFolder(page, LOCAL_ONLY_ROOT);
  await page.getByTestId('vault-switch-rail-tile').click();
  await page.getByTestId('vault-switch-pick-other').click();
  await expect(page.getByText('로컬 전용 프로젝트').first()).toBeVisible({ timeout: 30_000 });

  await expectLocalOnlyTransition(page, 'architecture', 'Local Only Architecture');
  const installedRail = page.getByTestId('app-nav-rail');
  await expect(installedRail).toHaveAttribute('data-hidden', 'false');
  expect(
    await installedRail.evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    'the LNB width is 0 in the installed shell with a real local vault open',
  ).toBeGreaterThan(0);
  await expectLocalOnlyTransition(page, 'library', 'Local Only Capability', 'ontology');
  await expect(page.getByTestId('docs-missing-slug-banner')).toHaveCount(0);
  // On a Korean screen every destination draws a concept by `display_<locale>`, including projects;
  // the canonical `title` stays what identifies the document.
  await expectLocalOnlyTransition(page, 'projects', '로컬 전용 프로젝트');
});

test('the destination prerender of the installed shell puts no bundled sample in even before hydration', async ({ page }) => {
  await installDesktopRailRuntime(page, {}, undefined, { replaceFixture: true });
  await page.addInitScript(() => {
    const state = window as unknown as { __initialVaultTexts?: string[] };
    state.__initialVaultTexts = [];
    const observer = new MutationObserver(() => {
      const text = document.body?.innerText;
      if (text) state.__initialVaultTexts!.push(text);
    });
    observer.observe(document, { childList: true, subtree: true, characterData: true });
  });

  await page.goto('/ko/architecture/?guides=off', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('first-run-open')).toBeVisible({ timeout: 20_000 });
  const frames = await page.evaluate(
    () =>
      (window as unknown as { __initialVaultTexts?: string[] }).__initialVaultTexts ?? [],
  );
  const leaked = frames.flatMap((text, index) =>
    SAMPLE_MARKERS.filter((marker) => text.includes(marker)).map((marker) => ({ index, marker })),
  );
  expect(leaked, 'the sample world came first into the static HTML of the installed app').toEqual([]);
});
