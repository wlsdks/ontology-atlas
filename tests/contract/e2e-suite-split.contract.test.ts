import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import playwrightConfig from '../../playwright.config';
import { POST_MERGE_SPECS } from '../e2e/post-merge-specs';

/**
 * **Watches the wiring of the PR-gate / post-merge-sweep split.**
 *
 * The split (2026-08-21) is three pieces: the list (`post-merge-specs.ts`), the
 * projects (`playwright.config.ts`), and the workflow branch (`e2e.yml`). If any
 * one of them drifts **there is no visible signal**: renaming a spec in the list
 * makes it silently belong to no project, deleting `--project=smoke` from the
 * workflow puts PRs back to 13 minutes, and deleting the project wiring from the
 * config kills `--project=smoke` outright as an unknown project. So all three are
 * locked together.
 *
 * ⚠️ The workflow check looks at **run blocks only**. This repository once wrote a
 * contract that passed even after the step was deleted, because the same string
 * appeared in a comment (2026-08-19, caught by `/gate-probe`). The same mistake is
 * now prevented structurally.
 */

const ROOT = process.cwd();
const E2E_DIR = join(ROOT, 'tests', 'e2e');
const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'e2e.yml'), 'utf8');

/**
 * Returns each `run:` block as {the folded single line, the list of continuation
 * indents} — comments cannot enter here.
 *
 * Why the indents come back too (measured on #1178's first run): inside a folded
 * scalar (>-), **a more-indented continuation line is not folded and stays a
 * literal line.** This parser joins everything, so it missed that trap and went
 * green, while on the real runner the script became two lines: line 1 ran the whole
 * suite without a shard and line 2 died with exit 127. So "shape" (uniform
 * indentation) is asserted separately from "content".
 */
function runBlocks(source: string): { text: string; indents: number[] }[] {
  const blocks: { text: string; indents: number[] }[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*)run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const [, indent, inline] = match;
    const body: string[] = inline && !['|', '>-', '>', '|-'].includes(inline.trim()) ? [inline] : [];
    const indents: number[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() === '') continue;
      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent <= indent.length) break;
      body.push(line.trim());
      indents.push(lineIndent);
    }
    blocks.push({ text: body.join(' '), indents });
  }
  return blocks;
}

describe('머지 후 스위프 목록은 실재하는 스펙만 담는다', () => {
  it('비어 있지 않고, 중복이 없다', () => {
    expect(POST_MERGE_SPECS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(POST_MERGE_SPECS).size).toBe(POST_MERGE_SPECS.length);
  });

  it.each([...POST_MERGE_SPECS])('%s 가 tests/e2e 에 실재한다', (file) => {
    // A renamed or deleted spec left in the list belongs to no project and silently
    // disappears — that state is made red here.
    expect(existsSync(join(E2E_DIR, file)), `${file} 이 없다 — rename 했다면 목록도 고쳐라`).toBe(
      true,
    );
  });

  it('워크플로·스크립트가 파일명으로 직접 부르는 스펙은 목록에 못 들어온다', () => {
    // The `web-surface-smoke` job and `test:e2e:static` name files directly. Putting
    // such a file in the post-merge list still runs it (a file argument beats a
    // project filter), but the job's reason for existing ("runs on every PR") and the
    // list's claim ("post-merge") would then contradict each other silently.
    const pkg = readFileSync(join(ROOT, 'package.json'), 'utf8');
    const invoked = [...(workflow + pkg).matchAll(/tests\/e2e\/([\w-]+\.spec\.ts)/g)].map(
      (m) => m[1],
    );
    expect(invoked.length, '직접 부르는 스펙을 하나도 못 찾았다 — 스캐너가 죽었다').toBeGreaterThan(0);
    for (const file of invoked) {
      expect(POST_MERGE_SPECS).not.toContain(file);
    }
  });
});

describe('Playwright 프로젝트가 그 목록에서 나온다', () => {
  const projects = playwrightConfig.projects ?? [];

  it('smoke 와 post-merge 두 프로젝트가 있다', () => {
    expect(projects.map((p) => p.name).sort()).toEqual(['post-merge', 'smoke']);
  });

  it('post-merge 는 목록과 정확히 일치하고, smoke 는 그 여집합이다', () => {
    const globs = POST_MERGE_SPECS.map((file) => `**/${file}`);
    const smoke = projects.find((p) => p.name === 'smoke');
    const postMerge = projects.find((p) => p.name === 'post-merge');
    expect(postMerge?.testMatch).toEqual(globs);
    expect(smoke?.testIgnore).toEqual(globs);
  });
});

describe('워크플로 분기가 살아 있다', () => {
  const blocks = runBlocks(workflow);
  const suiteBlocks = blocks.filter((b) => b.text.includes('--shard='));

  it('샤드 실행 블록을 실제로 찾았다 — 빈 집합 위의 초록이 아니다', () => {
    expect(suiteBlocks.length, 'e2e.yml 에서 --shard 실행 블록을 못 찾았다').toBeGreaterThan(0);
  });

  it('PR 은 smoke 프로젝트만 돈다 — 선택 변수와 그 정의가 둘 다 있다', () => {
    for (const block of suiteBlocks) {
      expect(block.text, '프로젝트 선택 변수가 명령에서 지워졌다').toContain(
        '$PLAYWRIGHT_PROJECT_ARGS',
      );
    }
    // The variable's definition (env) — read with the GitHub expression intact. It
    // must be a `KEY: value` line, not a comment.
    const envLine = workflow
      .split('\n')
      .find((line) => /^\s*PLAYWRIGHT_PROJECT_ARGS:/.test(line));
    expect(envLine, 'PLAYWRIGHT_PROJECT_ARGS 정의(env)가 없다').toBeTruthy();
    expect(envLine!, 'PR 분기(--project=smoke)가 지워졌다').toContain("'--project=smoke'");
    expect(envLine!, 'pull_request 조건이 지워졌다').toContain(
      "github.event_name == 'pull_request'",
    );
    expect(envLine!, 'e2e 인프라 예외가 지워졌다 — 스펙을 고친 PR 이 자기 빨강을 못 본다').toContain(
      "steps.setup.outputs.e2e != 'true'",
    );
  });

  it('CI 스위트는 dev 가 아니라 빌드된 정적 export 를 상대한다', () => {
    // dev compiles a route on its first request, so which spec pays that cost varies
    // with shard composition and execution order, and a different spec died on the
    // 30-second timeout on each run (measured on #1178's first run). Deleting either
    // of these two pieces brings that class of failure back.
    for (const block of suiteBlocks) {
      expect(block.text, '빌드 없이 돈다 — 정적 서버가 낡은 out/ 을 서빙한다').toContain('pnpm build');
      expect(block.text, 'PLAYWRIGHT_STATIC=1 이 지워졌다 — dev 온디맨드 컴파일 복귀').toContain(
        'PLAYWRIGHT_STATIC=1',
      );
    }
  });

  it('샤드 블록에 더 들여쓴 연속 줄이 없다 — 접힘 스칼라의 literal 함정', () => {
    // #1178's first run died in exactly this shape: a more-indented line stayed
    // literal, the script became two lines, and line 2's `--shard=…` exited 127. With
    // this assertion that diff goes red here, before it reaches CI.
    for (const block of suiteBlocks) {
      expect(
        new Set(block.indents).size,
        `샤드 실행 블록의 연속 줄 들여쓰기가 균일하지 않다(${block.indents.join(',')}) — ` +
          'YAML 접힘에서 더 들여쓴 줄은 별도의 literal 줄이 된다',
      ).toBeLessThanOrEqual(1);
    }
  });
});
