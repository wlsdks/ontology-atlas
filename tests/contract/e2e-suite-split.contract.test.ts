import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import playwrightConfig from '../../playwright.config';
import { POST_MERGE_SPECS } from '../e2e/post-merge-specs';

/**
 * **PR 게이트 / 머지 후 스위프 분리의 배선 감시.**
 *
 * 분리(2026-08-21)는 세 조각으로 이루어진다 — 목록(`post-merge-specs.ts`),
 * 프로젝트(`playwright.config.ts`), 워크플로 분기(`e2e.yml`). 셋 중 하나만
 * 어긋나도 **화면에는 아무 신호가 없다**: 목록의 스펙이 rename 되면 그 스펙은
 * 어느 프로젝트에도 안 걸린 채 조용히 사라지고, 워크플로의 `--project=smoke`
 * 가 지워지면 PR 이 도로 13분이 되며, config 의 프로젝트 배선이 지워지면
 * `--project=smoke` 가 «없는 프로젝트» 로 즉사한다. 그래서 셋을 함께 잠근다.
 *
 * ⚠️ 워크플로 검사는 **run 블록만** 본다. 주석에 같은 문자열이 있어서 스텝을
 * 지워도 통과하는 계약을 이 저장소가 실제로 만들었던 적이 있다(2026-08-19,
 * `/gate-probe` 가 잡았다). 같은 실수를 구조로 막는다.
 */

const ROOT = process.cwd();
const E2E_DIR = join(ROOT, 'tests', 'e2e');
const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'e2e.yml'), 'utf8');

/**
 * `run:` 블록 하나하나를 {접힌 한 줄, 연속 줄 들여쓰기 목록} 으로 돌려준다 —
 * 주석은 여기 못 들어온다.
 *
 * 들여쓰기를 같이 돌려주는 이유(#1178 첫 런 실측): 접힘 스칼라(>-) 안에서
 * **더 들여쓴 연속 줄은 접히지 않고 literal 줄로 남는다.** 이 파서는 전부
 * 이어 붙이므로 그 함정을 못 보고 초록을 줬고, 실제 러너에서는 스크립트가
 * 두 줄이 되어 1줄이 샤드 없이 전체를 돌고 2줄이 exit 127 로 죽었다.
 * 그래서 «내용» 단언과 별개로 «모양»(균일 들여쓰기)을 단언한다.
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
    // rename/삭제된 스펙이 목록에 남으면 어느 프로젝트에도 안 걸린 채
    // 조용히 사라진다 — 그 상태를 여기서 빨갛게 만든다.
    expect(existsSync(join(E2E_DIR, file)), `${file} 이 없다 — rename 했다면 목록도 고쳐라`).toBe(
      true,
    );
  });

  it('워크플로·스크립트가 파일명으로 직접 부르는 스펙은 목록에 못 들어온다', () => {
    // `web-surface-smoke` 잡과 `test:e2e:static` 은 파일명을 직접 부른다.
    // 그 파일이 post-merge 목록에 들어가도 실행 자체는 되지만(파일 지정이
    // 프로젝트 필터보다 우선), 「PR 마다 도는 자리」라는 그 잡의 존재 이유와
    // 목록의 주장(머지 후)이 서로 모순된 채 조용히 공존하게 된다.
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
    // 변수의 정의(env) — GitHub 표현식째로 본다. 주석이 아니라 `KEY: 값` 꼴의
    // 줄이어야 한다.
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
    // dev 는 라우트를 첫 요청 때 컴파일한다 — 그 비용을 무는 스펙이 샤드
    // 구성과 실행 순서에 따라 바뀌어, 실행마다 다른 스펙이 30초 타임아웃으로
    // 죽었다(#1178 첫 런 실측). 이 두 조각이 지워지면 그 부류가 돌아온다.
    for (const block of suiteBlocks) {
      expect(block.text, '빌드 없이 돈다 — 정적 서버가 낡은 out/ 을 서빙한다').toContain('pnpm build');
      expect(block.text, 'PLAYWRIGHT_STATIC=1 이 지워졌다 — dev 온디맨드 컴파일 복귀').toContain(
        'PLAYWRIGHT_STATIC=1',
      );
    }
  });

  it('샤드 블록에 더 들여쓴 연속 줄이 없다 — 접힘 스칼라의 literal 함정', () => {
    // #1178 첫 런이 정확히 이 모양으로 죽었다: 더 들여쓴 줄이 literal 로
    // 남아 스크립트가 두 줄이 되고, 2줄 `--shard=…` 가 exit 127. 이 단언이
    // 있으면 그 diff 는 CI 에 닿기 전에 여기서 빨갛다.
    for (const block of suiteBlocks) {
      expect(
        new Set(block.indents).size,
        `샤드 실행 블록의 연속 줄 들여쓰기가 균일하지 않다(${block.indents.join(',')}) — ` +
          'YAML 접힘에서 더 들여쓴 줄은 별도의 literal 줄이 된다',
      ).toBeLessThanOrEqual(1);
    }
  });
});
