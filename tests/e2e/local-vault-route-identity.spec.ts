import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from './first-run-seed';
import { stubDirectoryPicker } from './vault-picker-stub';

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
  destination: 'architecture' | 'docs' | 'insights' | 'projects',
  localMarker: string,
) {
  await startFrameTextTrace(page);
  await page.getByTestId(`app-nav-rail-item-${destination}`).click();
  await expect(page.locator('main')).toContainText(localMarker, { timeout: 20_000 });
  await page.waitForTimeout(250);
  const frames = await stopFrameTextTrace(page);

  expect(frames.length, `${destination}: 프레임 표본이 없다`).toBeGreaterThan(2);
  const leaked = frames.flatMap((text, index) =>
    SAMPLE_MARKERS.filter((marker) => text.includes(marker)).map((marker) => ({ index, marker })),
  );
  expect(
    leaked,
    `${destination}: 로컬 볼트가 열린 뒤 번들 샘플이 한 프레임이라도 그려졌다`,
  ).toEqual([]);
}

test('선택한 로컬 볼트의 LNB 전환은 번들 샘플을 한 프레임도 그리지 않는다', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await stubDirectoryPicker(page, LOCAL_ONLY_VAULT);
  await seedFirstRunSeen(page);

  // Reproduce the owner's profile: the Storefront docs source and its order slug existed first.
  await page.goto('/ko/docs/?guides=off&slug=domains%2Forder', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Orders/ }).first()).toBeVisible({ timeout: 20_000 });

  // Mount the local vault through the web seam first, then switch the same already-running shared
  // bundle into its installed-shell branch. This avoids replacing the real FSA read with a fake
  // native picker while still exercising the desktop render boundary in a production static export.
  await page.goto('/ko/topology/?guides=off');
  await page.getByTestId('first-run-starter-open').click();
  await expect(page.getByTestId('vault-guide-sheet')).toBeVisible();
  await page.getByTestId('vault-guide-pick-existing').click();
  await expect(page.getByText('로컬 전용 프로젝트').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
      invoke: () => Promise.reject(new Error('stub')),
      transformCallback: (callback: unknown) => callback,
    };
    (window as unknown as { isTauri?: boolean }).isTauri = true;
  });

  await expectLocalOnlyTransition(page, 'architecture', 'Local Only Architecture');
  const installedRail = page.getByTestId('app-nav-rail');
  await expect(installedRail).toHaveAttribute('data-hidden', 'false');
  expect(
    await installedRail.evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    '실제 로컬 볼트가 열린 설치 셸의 LNB 폭이 0이다',
  ).toBeGreaterThan(0);
  await expectLocalOnlyTransition(page, 'docs', 'Local Only Capability');
  await expect(page.getByTestId('docs-missing-slug-banner')).toHaveCount(0);
  await expectLocalOnlyTransition(page, 'insights', '로컬 전용 역량');
  await expectLocalOnlyTransition(page, 'projects', 'Local Only Project');
});

test('설치 셸의 목적지 프리렌더는 hydration 전에도 번들 sample을 넣지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as {
      __TAURI_INTERNALS__?: unknown;
      isTauri?: boolean;
      __initialVaultTexts?: string[];
    };
    state.__TAURI_INTERNALS__ = {
      invoke: () => Promise.reject(new Error('stub')),
      transformCallback: (callback: unknown) => callback,
    };
    state.isTauri = true;
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
  expect(leaked, '설치 앱 정적 HTML에 sample 세계가 먼저 들어왔다').toEqual([]);
});
