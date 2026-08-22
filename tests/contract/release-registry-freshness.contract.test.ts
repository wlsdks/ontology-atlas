import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **Does a release ship with a stale ACP registry?**
 *
 * **Why this exists** (pre-launch review, 2026-08-20). `pnpm acp:registry:check`
 * **already existed**, but it was in neither CI nor a git hook, so **nobody called
 * it**. The snapshot fell quietly behind, and measuring found **9 packages** older
 * than upstream — two of them adapters we actually launch
 * (`claude-agent-acp` 0.69.0→0.70.0 · `codex-acp` 1.4.0→1.6.2).
 *
 * **A gate that exists but never runs is worse than none** — it gives false
 * reassurance. The release this repository lost in 2026-08 had the same shape (a
 * smoke gate whose markers outlived their components).
 *
 * **Why at release rather than every PR.** This check turns red **when upstream
 * publishes**. As a PR gate, someone else's change would randomly block our PRs,
 * making it noise rather than a rule — the same discipline this repository already
 * set for lint rules ("if it is too much to fix in one PR, the rule is warning noise
 * rather than a rule"). A release is started by hand, so asking there blocks exactly
 * one thing: shipping something stale.
 *
 * **What this check guards.** Whether the snapshot is current is **not checked here**
 * (that needs the network, and this repository's CI does not go outside). What is
 * guarded is one thing: **that the place asking the question still exists on the
 * release path.**
 */

const repoRoot = path.resolve(__dirname, '..', '..');
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
      '릴리스 경로에서 레지스트리 신선도를 아무도 묻지 않는다 — ' +
        '이 스크립트는 한때 존재만 하고 아무도 안 불렀고, 그 사이 9개가 낡았다',
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
