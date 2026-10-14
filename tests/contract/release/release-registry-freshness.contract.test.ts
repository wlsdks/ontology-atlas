import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Whether the snapshot is current needs the network and is not checked here; what is guarded is that
 * `pnpm acp:registry:check` stays on the release path. It runs at release, not per PR, because it goes
 * red when upstream publishes and would randomly block unrelated PRs.
 */

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const workflow = readFileSync(
  path.join(repoRoot, '.github', 'workflows', 'release-macos.yml'),
  'utf8',
);

/**
 * Keeps only lines that actually **execute** — comments (`#`) are dropped.
 *
 * ⚠️ **The first version was a fake gate** (caught by a probe the same day). It
 * searched the whole file for a string, and this workflow's **comments** also contain
 * the command name (explaining why the step is there), so **deleting the step still
 * passed.** What the check measures is whether it executes, not whether the
 * characters appear somewhere.
 */
const executableLines = workflow
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n');
const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
) as { scripts?: Record<string, string> };

describe('릴리스 전 ACP 레지스트리 신선도', () => {
  it('검사 스크립트가 실재한다', () => {
    expect(manifest.scripts?.['acp:registry:check']).toBeDefined();
    // Registered without `--check` it is an **overwrite**, not a check — running that on
    // the release path silently updates and passes.
    expect(manifest.scripts?.['acp:registry:check']).toContain('--check');
  });

  it('릴리스 워크플로가 그 검사를 실제로 부른다', () => {
    expect(
      /run:\s*pnpm acp:registry:check/.test(executableLines),
      'Nothing on the release path asks whether the registry is fresh. ' +
        'This script once existed with no caller, and nine entries went stale meanwhile',
    ).toBe(true);
  });

  it('빌드보다 **먼저** 묻는다 — 다 만들고 나서 물으면 시간을 버린다', () => {
    const checkAt = executableLines.search(/run:\s*pnpm acp:registry:check/);
    const buildAt = executableLines.indexOf('build-macos:');
    expect(checkAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(-1);
    expect(checkAt, '신선도 검사가 빌드 잡보다 뒤에 있다').toBeLessThan(buildAt);
  });

  it('검사기가 헛돌지 않는다 — 워크플로를 실제로 읽어 왔다', () => {
    // If the file cannot be read or its path changes, every test above can pass silently.
    expect(executableLines).toContain('admit-release:');
    expect(executableLines.length).toBeGreaterThan(2000);
    // Content must remain after comments are stripped — an over-eager filter collapses
    // every test above into silent passing.
    expect(executableLines).toContain('pnpm desktop:release-tag');
  });
});
