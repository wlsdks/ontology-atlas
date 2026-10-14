import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The capability must cover whatever the frontend uses from `@tauri-apps/api`: a `Resource` is
 * constructed fine and only fails at `close()` without `core:resources`. A contract test, since
 * the rule spans TS imports and a JSON permission list that share no import graph.
 */

const repoRoot = join(import.meta.dirname, '..', '..', '..');

/**
 * Detectors match static `from` imports and dynamic `import()`. `Image` and `TrayIcon` extend
 * `Resource`, so they need its grant too; `Channel` is not a `Resource` and needs no new permission.
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
    expect(sources.map((file) => file.path)).toContain('src/shared/lib/agent-chat/tauri-acp.ts');
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
        `scripts/desktop/check-desktop-readiness.mjs, naming the caller.`,
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
