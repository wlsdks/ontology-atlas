import { expect, test, type Page } from '@playwright/test';

import { seedFirstRunSeen } from '../first-run-seed';
import { HARNESS_VAULT_ROOT, installHarnessRuntime, mountHarnessVault } from '../harness-tab-fixture';
import { useDogfoodSample } from '../sample-source';

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
        if (command === 'vault_path_exists' && (path in files || Object.keys(files).some((file) => file.startsWith(`${path}/`)))) {
          return Promise.resolve(true);
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
          if (entries.size === 0) return inner(command, args);
          /* The fixture's own entries (the project-source binding) stay beside the served record. */
          return (inner(command, args) as Promise<Array<{ name: string; kind: string }>>)
            .catch(() => [])
            .then((own) => [
              ...own.filter((entry) => !entries.has(entry.name)),
              ...[...entries].map(([name, kind]) => ({ name, kind })),
            ]);
        }
        return inner(command, args);
      };
    },
    { vaultRoot: HARNESS_VAULT_ROOT, record: STOREFRONT_RECORD },
  );
  await mountHarnessVault(page);
  await page.goto('/ko/architecture/?view=architecture&guides=off');
  await expect(page.getByTestId('architecture-matrix')).toBeVisible({ timeout: 60_000 });
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
  await expect(page.getByTestId('architecture-matrix')).toBeVisible();

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
  /* Escape closed the menu only; the role pane stays. */
  await expect(page.getByTestId('architecture-inspector')).toBeVisible();

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
  await expect(page.getByTestId('architecture-matrix')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.locator('[data-architecture-stage]')).toHaveCount(0);
  await expect(page.locator('pre[aria-label]')).toHaveCount(0);

  await page.getByTestId('architecture-role-application').click();
  const address = new URL(page.url()).searchParams;
  expect(address.get('stage')).toBeNull();
  expect(address.get('role')).toBe('application');
});


test('the violation is a cell named by its pair and count, under a numeral equal to the record', async ({ page }) => {
  await openRecordedStorefront(page);
  await expect(page.getByTestId('architecture-violation-count')).toHaveText(
    String(STOREFRONT_RECORD.brief.conformance.violationCount),
  );
  const violation = page.getByTestId('architecture-cell-shared-features');
  await expect(violation).toHaveAttribute('data-cell-kind', 'violation');
  await expect(violation).toHaveAccessibleName('공유 기반 → 피처 · 규칙을 거스르는 import 1개');
  await expect(violation).toHaveText('1');
  await expect(page.locator('[data-cell-kind="violation"]')).toHaveCount(1);
});

test("arriving selects the violation's source role and lists that role's modules", async ({ page }) => {
  await openRecordedStorefront(page);
  await expect(page.getByTestId('architecture-role-shared')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('architecture-role-detail')).toHaveAttribute('data-role', 'shared');
  await expect(page.getByTestId('architecture-modules-shared')).toContainText('ui');
  await expect(page.getByTestId('architecture-imports-shared')).toContainText('src/shared/lib/x.ts');
});

test('choosing another row header moves the pane and the address to that role', async ({ page }) => {
  await openRecordedStorefront(page);
  await page.getByTestId('architecture-role-features').click();
  await expect(page.getByTestId('architecture-role-detail')).toHaveAttribute('data-role', 'features');
  await expect(page.getByTestId('architecture-modules-features')).toContainText('cart');
  expect(new URL(page.url()).searchParams.get('role')).toBe('features');

  await page.reload();
  await expect(page.getByTestId('architecture-role-features')).toHaveAttribute('aria-pressed', 'true', { timeout: 60_000 });
});

test('nothing on the architecture tab unfolds in place', async ({ page }) => {
  await openRecordedStorefront(page);
  await expect(page.getByTestId('architecture-role-detail')).toBeVisible();
  /* The app shell's own disclosures (folder switcher, settings) are outside the sub-tab. */
  await expect(page.getByRole('tabpanel').locator('[aria-expanded]')).toHaveCount(0);
});

test('at 1280x800 the verdict, every cell and the pane are in view and the page does not scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openRecordedStorefront(page);
  await page.evaluate(() => document.fonts.ready);
  const fit = await page.evaluate(() => {
    const inView = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight + 1 && rect.right <= window.innerWidth + 1;
    };
    const grid = document.querySelector('[data-testid="architecture-matrix"]')!;
    const frame = grid.parentElement!.getBoundingClientRect();
    const clipped = [...grid.querySelectorAll('[data-cell-kind]')]
      .filter((cell) => {
        const rect = cell.getBoundingClientRect();
        return !inView(cell) || rect.bottom > frame.bottom + 1 || rect.right > frame.right + 1;
      })
      .map((cell) => cell.getAttribute('data-testid'));
    const layout = document.querySelector('[data-testid="architecture-layout-scroll"]') as HTMLElement;
    return {
      cells: grid.querySelectorAll('[data-cell-kind]').length,
      clipped,
      pageScrolls:
        document.documentElement.scrollHeight > window.innerHeight + 1 ||
        document.documentElement.scrollWidth > window.innerWidth + 1,
      layoutScrolls: layout.scrollHeight > layout.clientHeight + 1,
      verdictInView: inView(document.querySelector('[data-testid="architecture-violation-count"]')!),
      paneInView: inView(document.querySelector('[data-testid="architecture-role-detail"] h2')!),
    };
  });
  expect(fit.cells).toBe(49);
  expect(fit.clipped, `${fit.clipped.join(', ')} clipped`).toEqual([]);
  expect(fit.pageScrolls).toBe(false);
  expect(fit.layoutScrolls).toBe(false);
  expect(fit.verdictInView).toBe(true);
  expect(fit.paneInView).toBe(true);
});

test("an explicit (hexagonal) profile allows the cells each role's reach names, wherever they fall", async ({ page }) => {
  await page.goto('/en/architecture/?view=architecture&guides=off');
  await expect(page.getByTestId('architecture-matrix')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('architecture-cell-adapter-domain')).toHaveAttribute('data-cell-kind', 'allowed');
  await expect(page.getByTestId('architecture-cell-domain-adapter')).toHaveAttribute('data-cell-kind', 'forbidden');
  await expect(page.getByTestId('architecture-status')).toHaveText('Not checked yet');
});

test('a link to a role the profile lacks is declined in words', async ({ page }) => {
  await page.goto('/ko/architecture/?view=architecture&role=not-a-real-role');
  const notice = page.getByTestId('architecture-role-not-in-profile');
  await expect(notice).toBeVisible({ timeout: 60_000 });
  await expect(notice).toContainText('not-a-real-role');
  await expect(page.getByTestId('architecture-role-detail')).toBeVisible();
});
