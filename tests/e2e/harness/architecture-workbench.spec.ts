import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from '../first-run-seed';
import { HARNESS_VAULT_ROOT, installHarnessRuntime, mountHarnessVault } from '../harness-tab-fixture';
import { useDogfoodSample } from '../sample-source';
import { waitForAnimationsDone, waitForBoxStill } from '../settle';

test.use({ viewport: { width: 1512, height: 945 } });

/* A conformance record for the harness vault's storefront profile: one climbing violation among observed imports. */
const STOREFRONT_RECORD = {
  contract: 'architectureRecord:v1',
  profile: { uid: '0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d', slug: 'storefront-web', contentHash: `sha256:${'ab'.repeat(32)}` },
  brief: {
    contract: 'architectureBrief:v1',
    measured: {
      at: '2026-08-28T09:30:00.000Z',
      tool: { name: 'ontology-atlas', version: '1.0.0' },
      source: { kind: 'git', revision: 'a8df66d', dirty: false },
    },
    conformance: {
      status: 'violated',
      violationCount: 1,
      violations: [{ fromRole: 'shared', toRole: 'features', from: 'src/shared/lib/x.ts', to: 'src/features/cart/index.ts' }],
      observedRoleEdges: [
        { fromRole: 'routing', toRole: 'views', count: 12 },
        { fromRole: 'views', toRole: 'widgets', count: 56 },
        { fromRole: 'views', toRole: 'shared', count: 61 },
        { fromRole: 'views', toRole: 'views', count: 300 },
        { fromRole: 'widgets', toRole: 'features', count: 54 },
        { fromRole: 'widgets', toRole: 'shared', count: 88 },
        { fromRole: 'features', toRole: 'entities', count: 38 },
        { fromRole: 'features', toRole: 'shared', count: 97 },
        { fromRole: 'entities', toRole: 'shared', count: 23 },
        { fromRole: 'shared', toRole: 'features', count: 1 },
      ],
      unknown: { coverageIncomplete: false, unmappedEdges: 0, unruledEdges: 0, emptyRoles: [] },
    },
  },
};

/** Serves the record from the harness vault's `.ontology-atlas/architecture/` folder. */
async function openRecordedStorefront(page: Page) {
  await installHarnessRuntime(page);
  await page.addInitScript(
    ({ vaultRoot, record }) => {
      const files: Record<string, string> = {
        '.ontology-atlas/architecture/storefront-web.json': JSON.stringify(record),
      };
      const stampMs = Date.UTC(2026, 7, 28);
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
        }
      ).__TAURI_INTERNALS__;
      const inner = internals.invoke.bind(internals);
      internals.invoke = (command, args = {}) => {
        const path = String(args.relativePath ?? '').replace(/^\/+|\/+$/g, '');
        if (args.rootPath !== vaultRoot || !path.startsWith('.ontology-atlas')) return inner(command, args);
        if (command === 'vault_path_exists') {
          return Promise.resolve(path in files || Object.keys(files).some((file) => file.startsWith(`${path}/`)));
        }
        if (command === 'read_vault_binary_file' && path in files) {
          const body = new TextEncoder().encode(files[path]);
          const stamped = new Uint8Array(8 + body.length);
          new DataView(stamped.buffer).setBigUint64(0, BigInt(stampMs), true);
          stamped.set(body, 8);
          return Promise.resolve(stamped.buffer);
        }
        if (command === 'read_vault_text_file' && path in files) {
          return Promise.resolve({ text: files[path], lastModified: stampMs });
        }
        if (command === 'list_vault_directory') {
          const prefix = path ? `${path}/` : '';
          const entries = new Map<string, string>();
          for (const file of Object.keys(files)) {
            if (!file.startsWith(prefix)) continue;
            const [name, child] = file.slice(prefix.length).split('/');
            entries.set(name!, child ? 'directory' : 'file');
          }
          if (entries.size === 0) return Promise.reject(new Error(`No such file or directory (os error 2): ${path}`));
          return Promise.resolve([...entries].map(([name, kind]) => ({ name, kind })));
        }
        return inner(command, args);
      };
    },
    { vaultRoot: HARNESS_VAULT_ROOT, record: STOREFRONT_RECORD },
  );
  await mountHarnessVault(page);
  await page.goto('/ko/architecture/?view=architecture&guides=off');
  await expect(page.getByTestId('architecture-arcs')).toBeVisible({ timeout: 60_000 });
}

/** Every text mark in the picture, each probed at its centre and four inset corners. */
function readOverlaps(page: Page) {
  return page.evaluate(() => {
    const marks = [
      ...document.querySelectorAll<HTMLElement>('[data-graph-box] span:not(:has(span))'),
    ].filter((mark) => (mark.textContent ?? '').trim() && getComputedStyle(mark).visibility === 'visible');
    const covered: string[] = [];
    for (const mark of marks) {
      const rect = mark.getBoundingClientRect();
      const inset = Math.min(2, rect.width / 4, rect.height / 4);
      const points = [
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + inset, rect.top + inset],
        [rect.right - inset, rect.top + inset],
        [rect.left + inset, rect.bottom - inset],
        [rect.right - inset, rect.bottom - inset],
      ] as const;
      for (const [x, y] of points) {
        const hit = document.elementFromPoint(x, y);
        if (hit !== mark && !mark.contains(hit)) {
          covered.push(`${mark.textContent} is under ${hit?.outerHTML.slice(0, 80) ?? 'nothing'}`);
          break;
        }
      }
    }
    const labels = [
      ...document.querySelectorAll('[data-testid^="architecture-arc-count-"], [data-testid^="architecture-arc-violation-"]'),
      ...marks,
    ].map((node) => ({ text: node.textContent, rect: node.getBoundingClientRect() }));
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const [a, b] = [labels[i]!.rect, labels[j]!.rect];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
          covered.push(`${labels[i]!.text} touches ${labels[j]!.text}`);
        }
      }
    }
    return { marks: marks.length, covered };
  });
}

test('the agent task chooser offers a re-check and an improvement search beside the derived task', async ({ page }) => {
  await seedFirstRunSeen(page);
  await useDogfoodSample(page);
  await page.addInitScript(() => {
    (window as unknown as { __copied: string[] }).__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { __copied: string[] }).__copied.push(text);
        },
      },
    });
  });
  await page.goto('/ko/architecture/?view=architecture&guides=off');
  await expect(page.getByTestId('architecture-graph')).toBeVisible();

  const trigger = page.getByTestId('architecture-agent-task-menu');
  await expect(page.getByTestId('architecture-agent-task-popover')).toHaveCount(0);
  await trigger.click();
  const menu = page.getByTestId('architecture-agent-task-popover');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveCount(3);
  await expect(menu.getByTestId('architecture-agent-task-verify')).toHaveAttribute('aria-current', 'true');
  /* The menu owns the space under the trigger: nothing covers its items. */
  const owns = await menu.getByTestId('architecture-agent-task-improve').evaluate((item) => {
    const rect = item.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === item || item.contains(hit);
  });
  expect(owns).toBe(true);

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  /* Escape closed the menu only; no dock was open, and none opened. */
  await expect(page.getByTestId('architecture-inspector')).toHaveAttribute('data-architecture-inspector', 'none');

  await trigger.click();
  await menu.getByTestId('architecture-agent-task-improve').click();
  await expect(page.getByTestId('architecture-agent-action')).toHaveAttribute('data-architecture-copy-state', 'copied');
  const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
  expect(copied).toHaveLength(1);
  expect(copied[0]).toContain('"kind":"improve"');
  expect(copied[0]).toContain('This is an improvement-finding task');
  expect(copied[0]).toContain('Write nothing');
});

test('obsolete workflow-stage links do not resurrect the removed prose panels', async ({ page }) => {
  await page.goto('/ko/architecture/?view=architecture&stage=plan');
  await expect(page.getByTestId('architecture-graph')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.locator('[data-architecture-stage]')).toHaveCount(0);
  await expect(page.locator('pre[aria-label]')).toHaveCount(0);

  await page.getByTestId('architecture-graph-box-application').click();
  const address = new URL(page.url()).searchParams;
  expect(address.get('stage')).toBeNull();
  expect(address.get('role')).toBe('application');
});

test('keyboard opens, closes, restores focus, and reopens the selected role', async ({ page }) => {
  await page.goto('/ko/architecture/?view=architecture&guides=off');

  const rules = page.getByTestId('architecture-inspector-toggle');
  await rules.focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('architecture-rules')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(rules).toBeFocused();

  const role = page.getByTestId('architecture-graph-box-application');
  await role.focus();
  await page.keyboard.press('Enter');
  await expect(role).toHaveAttribute('aria-pressed', 'true');
  await expect(role).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('architecture-inspector')).toHaveAttribute('data-architecture-inspector', 'role');

  await page.keyboard.press('Escape');
  await expect(role).toBeFocused();
  await expect(role).toHaveAttribute('aria-pressed', 'false');
  await expect(role).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('Space');
  await expect(role).toHaveAttribute('aria-expanded', 'true');
  await expect(role).toHaveAttribute('aria-pressed', 'true');

  /* The role dock takes width from the picture, never a role from view. */
  await waitForAnimationsDone(page.locator('body'));
  await waitForBoxStill(page.getByTestId('architecture-graph'));
  const stage = await page.getByTestId('architecture-stage').boundingBox();
  for (const box of await page.locator('[data-graph-box]').all()) {
    const rect = (await box.boundingBox())!;
    expect(rect.x + rect.width).toBeLessThanOrEqual(stage!.x + stage!.width + 1);
  }
});

test('a link carries the chosen role, and refuses one the profile lacks', async ({ page }) => {
  await page.goto('/ko/architecture/?view=architecture');

  await page.getByTestId('architecture-graph-box-application').click();
  expect(new URL(page.url()).searchParams.get('role')).toBe('application');

  await page.reload();
  await expect(page.getByTestId('architecture-graph-box-application')).toHaveAttribute('aria-pressed', 'true');

  /* Deselecting takes it back out, so the bare address keeps meaning "nothing chosen". */
  await page.getByTestId('architecture-graph-box-application').click();
  expect(new URL(page.url()).searchParams.get('role')).toBeNull();

  /* A role the profile lacks gets no detail panel, and the screen says the link was declined. */
  await page.goto('/ko/architecture/?role=not-a-real-role');
  await expect(page.locator('[data-testid^="architecture-concepts-"]')).toHaveCount(0);
  const notice = page.getByTestId('architecture-role-not-in-profile');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('not-a-real-role');

  await page.goto('/ko/architecture/?view=architecture');
  await expect(page.getByTestId('architecture-inspector')).toHaveAttribute('data-architecture-inspector', 'none');
  await expect(notice).toHaveCount(0);
  /* The button opens the profile's rules, never a role's answer: nothing has been chosen. */
  await page.getByTestId('architecture-inspector-toggle').click();
  await expect(page.getByTestId('architecture-inspector')).toHaveAttribute('data-architecture-inspector', 'rules');
  await expect(page.getByTestId('architecture-rules')).toBeVisible();

  await page.goto('/ko/architecture/?role=application');
  await expect(page.getByTestId('architecture-inspector')).toHaveAttribute('data-architecture-inspector', 'role');
  await expect(page.getByTestId('architecture-role-detail-empty')).toHaveCount(0);
  await expect(notice).toHaveCount(0);
});

for (const [width, height] of [
  [1512, 945],
  [1280, 800],
] as const) {
  test(`at ${width}x${height} every role band is in view before a scan, with no arc, scroll or covered label`, async ({ page }) => {
    await seedFirstRunSeen(page);
    await useDogfoodSample(page);
    await page.setViewportSize({ width, height });
    await page.goto('/ko/architecture/?view=architecture&guides=off');
    const graph = page.getByTestId('architecture-graph');
    await expect(graph).toBeVisible({ timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await waitForBoxStill(graph);

    await expect(page.locator('[data-graph-box]')).toHaveCount(7);
    await expect(graph).toHaveAttribute('data-arc-count', '0');
    await expect(page.getByTestId('architecture-legend')).toHaveCount(0);
    await expect(page.getByTestId('architecture-status')).toHaveText('아직 검사하지 않음');

    const fit = await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="architecture-stage"]') as HTMLElement;
      const frame = stage.getBoundingClientRect();
      const outside = [...document.querySelectorAll('[data-graph-box]')]
        .filter((box) => {
          const rect = box.getBoundingClientRect();
          return rect.top < frame.top - 1 || rect.bottom > frame.bottom + 1 || rect.right > frame.right + 1;
        })
        .map((box) => box.getAttribute('data-graph-box'));
      return {
        outside,
        stageScrolls: stage.scrollHeight > stage.clientHeight + 1,
        pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth,
        bandsScrollSideways: [...document.querySelectorAll('[data-testid^="architecture-band-"]')].filter(
          (band) => band.scrollWidth > band.clientWidth + 1,
        ).length,
      };
    });
    expect(fit.outside, `${fit.outside.join(', ')} out of view`).toEqual([]);
    expect(fit.stageScrolls).toBe(false);
    expect(fit.pageScrollsSideways).toBe(false);
    expect(fit.bandsScrollSideways).toBe(0);

    const overlaps = await readOverlaps(page);
    expect(overlaps.marks).toBeGreaterThan(14);
    expect(overlaps.covered, overlaps.covered.join('\n')).toEqual([]);
  });
}

test('an explicit (hexagonal) profile draws the same bands and no rule arc before a scan', async ({ page }) => {
  await page.goto('/en/architecture/?view=architecture&guides=off');
  const graph = page.getByTestId('architecture-graph');
  await expect(graph).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('architecture-band-adapter')).toBeVisible();
  await expect(page.getByTestId('architecture-band-domain')).toBeVisible();
  /* Allowed-but-unobserved rules stay in the rules panel; the arcs are only the code's imports. */
  await expect(graph).toHaveAttribute('data-arc-count', '0');
  await expect(page.locator('[data-arc-from]')).toHaveCount(0);
});

test('a recorded profile draws observed imports as named arcs, the violation dashed in red', async ({ page }) => {
  await openRecordedStorefront(page);
  const graph = page.getByTestId('architecture-graph');
  await expect(graph).toHaveAttribute('data-arc-count', '9');
  await expect(page.getByTestId('architecture-status')).toContainText('거스르는 import 1개');

  const violation = page.getByTestId('architecture-arc-shared-features');
  await expect(violation).toHaveAttribute('data-arc-violated', 'true');
  await expect(violation.locator('[data-arc-stroke]')).toHaveAttribute('stroke-dasharray', '4 4');
  await expect(page.getByTestId('architecture-arc-violation-shared-features')).toBeVisible();
  await expect(page.getByRole('img', { name: /→ .*: 규칙을 거스르는 import 1개$/ })).toHaveCount(1);
  for (const hit of await page.locator('[data-testid^="architecture-arc-hit-"]').all()) {
    await expect(hit).toHaveAccessibleName(/ → /);
  }
  await expect(page.getByTestId('architecture-legend')).toBeVisible();

  await waitForAnimationsDone(graph);
  const overlaps = await readOverlaps(page);
  expect(overlaps.covered, overlaps.covered.join('\n')).toEqual([]);
});

test('choosing a band brightens and numbers its arcs, and hovering an arc names it', async ({ page }) => {
  await openRecordedStorefront(page);
  await page.getByTestId('architecture-graph-box-views').click();
  await expect(page.getByTestId('architecture-arc-views-widgets')).toHaveAttribute('data-arc-state', 'bright');
  await expect(page.getByTestId('architecture-arc-features-shared')).toHaveAttribute('data-arc-state', 'dim');
  await expect(page.getByTestId('architecture-arc-count-views-widgets')).toHaveText('56');
  await expect(page.getByTestId('architecture-arc-count-views-shared')).toHaveText('61');
  await expect(page.getByTestId('architecture-arc-count-features-shared')).toHaveCount(0);
  await waitForAnimationsDone(page.getByTestId('architecture-graph'));
  const overlaps = await readOverlaps(page);
  expect(overlaps.covered, overlaps.covered.join('\n')).toEqual([]);

  /* Hover the stroke itself, at half its length, not the centre of its bounding box. */
  const point = await page.getByTestId('architecture-arc-hit-features-shared').evaluate((path) => {
    const stroke = path as SVGPathElement;
    const at = stroke.getPointAtLength(stroke.getTotalLength() / 2);
    const screen = new DOMPoint(at.x, at.y).matrixTransform(stroke.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.move(point.x, point.y);
  await expect(page.getByRole('tooltip')).toContainText('피처 → 공유 기반 97');
});

test('below xl the arc column narrows, then gives way to each band naming its strongest import', async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 720 });
  await openRecordedStorefront(page);
  await expect(page.getByTestId('architecture-graph')).toHaveAttribute('data-arc-count', '9');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  /* Without a side dock, the rules toggle brings the rules section on screen instead. */
  await page.getByTestId('architecture-inspector-toggle').click();
  await expect(page.getByTestId('architecture-rules')).toBeInViewport();

  await page.setViewportSize({ width: 560, height: 900 });
  await expect(page.getByTestId('architecture-graph')).toHaveAttribute('data-arc-count', '0');
  await expect(page.getByTestId('architecture-strongest-out-views')).toContainText('61');
  await expect(page.getByTestId('architecture-strongest-out-shared')).toContainText('1');
  const sideways = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth > window.innerWidth,
    bands: [...document.querySelectorAll('[data-testid^="architecture-band-"]')].filter(
      (band) => band.scrollWidth > band.clientWidth + 1,
    ).length,
  }));
  expect(sideways).toEqual({ page: false, bands: 0 });
});
