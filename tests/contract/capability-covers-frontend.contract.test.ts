import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Gate against the capability silently falling behind what the frontend calls.
 *
 * On 2026-08-24 the main window's capability was narrowed from `core:default`'s nine
 * permission sets to four, each with a named caller, verified on a packaged build. That
 * narrowing is only correct for the code that existed on that day, and nothing made it
 * stay correct.
 *
 * **The trap this exists to close.** `@tauri-apps/api/core` exports a `Resource` class
 * whose `close()` calls `invoke('plugin:resources|close')`, and `core:resources` is not
 * granted. Nothing constructs a `Resource` today, so it never fires. But a future feature
 * that uses one would **construct it successfully** — construction is not IPC — and fail
 * only when it tried to clean up, as a denied permission, with a symptom ("something is
 * not being released") a long way from its cause. The person who added the feature would
 * have no reason to suspect a capability file.
 *
 * So the check is not "is `core:resources` granted". Granting a permission nothing calls
 * is the habit the narrowing removed. The check is that **whatever the frontend actually
 * uses, the capability covers** — which fires in the commit that introduces the usage,
 * where the author can still see why.
 *
 * **Why a contract test rather than lint.** The rule spans two files that share no import
 * graph: a TypeScript import in `src/` and a JSON permission list in `src-tauri/`. ESLint
 * sees one and never the other.
 */

const repoRoot = join(import.meta.dirname, '..', '..');

/**
 * Each row: a frontend surface, and the permissions it cannot work without.
 *
 * Each detector matches a static `from '...'` **and** a dynamic `import('...')`. That is not
 * pedantry: the one `@tauri-apps/api/app` call this app makes is a dynamic import, and a
 * from-only detector reported the module unused while it was being used on every settings
 * screen. The known-surfaces assertion below caught exactly that while this file was written.
 *
 * Verified against `node_modules/@tauri-apps/api` on 2026-08-24. `Image` and `TrayIcon`
 * both extend `Resource`, so they need the resources grant as well as their own.
 * `Channel` deliberately has no row: it is **not** a `Resource` and calls nothing under
 * `plugin:resources`, so adopting one needs no new permission.
 */
const REQUIREMENTS: { label: string; detect: RegExp; needs: string[] }[] = [
  {
    label: "`Resource` from @tauri-apps/api/core",
    // The import name, a subclass, or a direct construction. `invoke`/`isTauri` from the
    // same module are not resource-backed and must not match.
    detect: /extends\s+Resource\b|new\s+Resource\b|import\s*\{[^}]*\bResource\b[^}]*\}\s*from\s*['"]@tauri-apps\/api\/core['"]|import\s*\(\s*['"]@tauri-apps\/api\/core['"]\s*\)[\s\S]{0,80}\bResource\b/,
    needs: ['core:resources:default'],
  },
  {
    label: '@tauri-apps/api/image',
    detect: /(?:from|import\s*\()\s*['"]@tauri-apps\/api\/image['"]/,
    needs: ['core:image:default', 'core:resources:default'],
  },
  {
    label: '@tauri-apps/api/tray',
    detect: /(?:from|import\s*\()\s*['"]@tauri-apps\/api\/tray['"]/,
    needs: ['core:tray:default', 'core:resources:default'],
  },
  {
    label: '@tauri-apps/api/menu',
    detect: /(?:from|import\s*\()\s*['"]@tauri-apps\/api\/menu['"]/,
    needs: ['core:menu:default'],
  },
  {
    label: '@tauri-apps/api/path',
    detect: /(?:from|import\s*\()\s*['"]@tauri-apps\/api\/path['"]/,
    needs: ['core:path:default'],
  },
  {
    label: '@tauri-apps/api/window',
    detect: /(?:from|import\s*\()\s*['"]@tauri-apps\/api\/window['"]/,
    needs: ['core:window:default'],
  },
  {
    label: '@tauri-apps/api/webview',
    detect: /(?:from|import\s*\()\s*['"]@tauri-apps\/api\/webview['"]/,
    needs: ['core:webview:default'],
  },
  {
    label: '@tauri-apps/api/event',
    detect: /(?:from|import\s*\()\s*['"]@tauri-apps\/api\/event['"]/,
    needs: ['core:event:default'],
  },
  {
    label: '@tauri-apps/api/app',
    detect: /(?:from|import\s*\()\s*['"]@tauri-apps\/api\/app['"]/,
    needs: ['core:app:default'],
  },
];

function frontendSources(): { path: string; body: string }[] {
  const roots = ['src', 'app'];
  return roots.flatMap((root) =>
    readdirSync(join(repoRoot, root), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name))
      // Generated vault data is not authored frontend code, and tests may name an API
      // they only assert about rather than call.
      .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path))
      .filter((path) => !path.includes(`${'entities'}/docs-vault/data`))
      .map((path) => ({ path: relative(repoRoot, path), body: readFileSync(path, 'utf8') })),
  );
}

const sources = frontendSources();
const granted: string[] = JSON.parse(
  readFileSync(join(repoRoot, 'src-tauri/capabilities/default.json'), 'utf8'),
).permissions;

/** `core:default` is the umbrella; if it is granted every core set is covered. */
const covers = (permission: string) =>
  granted.includes(permission) ||
  (permission.startsWith('core:') && granted.includes('core:default'));

describe('the window capability covers what the frontend actually calls', () => {
  it('scans a real file set that still contains a known Tauri consumer', () => {
    // Without this the gate is loudest when broken: a renamed directory would scan nothing
    // and report every requirement satisfied.
    expect(sources.length).toBeGreaterThan(100);
    expect(sources.map((file) => file.path)).toContain('src/shared/lib/tauri-acp.ts');
  });

  it('still detects the surfaces this app is known to use', () => {
    // `event` and `app` are called today and are granted. If the detector stops seeing them,
    // it has stopped seeing everything, and the assertion below would pass by blindness.
    for (const label of ['@tauri-apps/api/event', '@tauri-apps/api/app']) {
      const rule = REQUIREMENTS.find((item) => item.label === label)!;
      expect(
        sources.some((file) => rule.detect.test(file.body)),
        `${label} is used by this app; the detector must find it`,
      ).toBe(true);
    }
  });

  it('grants a permission for every resource-backed or core API the frontend imports', () => {
    const missing = REQUIREMENTS.flatMap((rule) => {
      const users = sources.filter((file) => rule.detect.test(file.body));
      if (users.length === 0) return [];
      return rule.needs
        .filter((permission) => !covers(permission))
        .map((permission) => ({ permission, rule: rule.label, firstUser: users[0].path }));
    });

    expect(
      missing,
      `the frontend uses APIs the capability does not permit — the call will fail at runtime, ` +
        `not at build time:\n${missing
          .map((gap) => `  ${gap.rule} (first used in ${gap.firstUser}) needs ${gap.permission}`)
          .join('\n')}\n` +
        `Add the permission to src-tauri/capabilities/default.json AND to the reviewed list in ` +
        `scripts/check-desktop-readiness.mjs, naming the caller.`,
    ).toEqual([]);
  });

  it('does not demand a permission for Channel, which is not a Resource', () => {
    // The narrowing's whole point is that unused permissions do not get granted. A gate that
    // demanded `core:resources` for a plain `Channel` would push the habit straight back.
    expect(REQUIREMENTS.some((rule) => rule.label.includes('Channel'))).toBe(false);
    const channelUse = `import { Channel } from '@tauri-apps/api/core';\nnew Channel();`;
    const resourceRule = REQUIREMENTS[0];
    expect(resourceRule.detect.test(channelUse)).toBe(false);
  });
});
