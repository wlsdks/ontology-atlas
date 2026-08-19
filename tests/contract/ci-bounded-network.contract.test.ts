import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **CI 의 네트워크 대기에는 상한이 있어야 한다.**
 *
 * 2026-08-19~20, E2E 잡이 하루에 여섯 번 죽었다. 죽은 자리는 테스트가 아니라
 * 준비 스텝(`playwright install-deps chromium`)이었고, 모양은 이랬다:
 * `Ign: http://azure.archive.ubuntu.com/... InRelease` 를 19분 42초 반복하다
 * 잡 타임아웃에 걸려 `The operation was canceled.` **테스트는 한 줄도 안 돌았고**
 * 네 샤드가 같은 자리에서 같이 죽어 PR 하나에 재실행 여섯 번이 들었다.
 *
 * apt 는 기다리는 데 상한이 없다. 그래서 상한을 밖에서 씌웠는데, 그 씌움은
 * **되돌리기가 너무 쉽다** — 누가 스텝을 「원래대로」 한 줄로 되돌려도 평소에는
 * 아무 일도 안 일어나고, 미러가 흔들리는 날에만 다시 20분을 잃는다. 그날
 * 그것을 알아차릴 방법이 없으므로 여기서 잠근다.
 *
 * ## 왜 텍스트로 읽나
 *
 * 이 저장소에는 YAML 파서 의존성이 없고, 이 검사 하나 때문에 들이지 않는다.
 * 대신 **아무것도 못 찾았을 때 초록이 되는 것**을 막는 단언을 같이 둔다 —
 * 스텝 이름이 바뀌어 정규식이 빗나가면 그 단언이 먼저 터진다.
 */

const ACTION = join(process.cwd(), '.github', 'actions', 'setup-playwright', 'action.yml');
const WORKFLOW = join(process.cwd(), '.github', 'workflows', 'e2e.yml');

const action = readFileSync(ACTION, 'utf8');
const workflow = readFileSync(WORKFLOW, 'utf8');

/** `run:` 블록 하나하나를 한 줄로 눌러 돌려준다(YAML 접힘 표기 `>-` 때문). */
function runBlocks(source: string): string[] {
  const blocks: string[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*)run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const [, indent, inline] = match;
    const body: string[] = inline && !['|', '>-', '>', '|-'].includes(inline.trim()) ? [inline] : [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() === '') continue;
      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent <= indent.length) break;
      body.push(line.trim());
    }
    blocks.push(body.join(' '));
  }
  return blocks;
}

const blocks = runBlocks(action);
const playwrightInstalls = blocks.filter((block) => /playwright\s+install/.test(block));

describe('CI 준비 스텝은 무한정 기다리지 않는다', () => {
  it('놀고 있지 않다 — 검사할 스텝을 실제로 찾았다', () => {
    // 스텝 이름이나 표기가 바뀌어 정규식이 빗나가면 여기서 먼저 터진다.
    expect(blocks.length, 'setup-playwright 에서 run 블록을 하나도 못 읽었다').toBeGreaterThan(3);
    expect(
      playwrightInstalls.length,
      'playwright install 스텝을 하나도 못 찾았다 — 이 검사가 아무것도 안 보고 있다',
    ).toBeGreaterThanOrEqual(2);
  });

  it.each(playwrightInstalls)('상한과 재시도를 거쳐 돈다: %s', (block) => {
    expect(block, '`run-with-retry.mjs` 를 거치지 않는다').toContain('scripts/run-with-retry.mjs');
    expect(block, '`--timeout-ms=` 가 없다 — 상한 없는 대기가 돌아왔다').toMatch(/--timeout-ms=\d+/);
    expect(block, '`--attempts=` 가 없다').toMatch(/--attempts=\d+/);
  });

  it('apt 자신에게도 대기 상한이 있다', () => {
    expect(action).toMatch(/Acquire::http::Timeout\s+"\d+"/);
    expect(action).toMatch(/Acquire::https::Timeout\s+"\d+"/);
    expect(action).toMatch(/Acquire::Retries\s+"\d+"/);
  });

  it('준비가 최악으로 굴러도 테스트가 돌 시간이 남는다', () => {
    // 최악 = (시도 수 × 상한) 을 전부 더한 것. 이 값이 잡 타임아웃을 먹어
    // 버리면 상한을 씌운 의미가 없다 — 20분을 30분으로 옮겼을 뿐이 된다.
    let worstMs = 0;
    for (const block of playwrightInstalls) {
      const attempts = Number(/--attempts=(\d+)/.exec(block)?.[1] ?? 0);
      const timeoutMs = Number(/--timeout-ms=(\d+)/.exec(block)?.[1] ?? 0);
      worstMs += attempts * timeoutMs;
    }

    const jobTimeouts = [...workflow.matchAll(/^\s*timeout-minutes:\s*(\d+)\s*$/gm)].map((m) =>
      Number(m[1]),
    );
    expect(jobTimeouts.length, 'e2e.yml 에서 잡 타임아웃을 못 읽었다').toBeGreaterThanOrEqual(3);

    const tightestMs = Math.min(...jobTimeouts) * 60_000;
    // 절반이 기준이다. 준비가 최악으로 굴러도 잡의 남은 절반은 테스트 몫이다.
    expect(worstMs, `준비 최악 ${Math.round(worstMs / 60_000)}분이 잡 예산의 절반을 넘는다`).
      toBeLessThan(tightestMs / 2);
  });
});
