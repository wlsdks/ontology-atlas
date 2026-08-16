import { describe, expect, it } from 'vitest';

import { partitionModes } from './mode-safety';

/**
 * 「작업 방식」 목록의 안전 판정은 **거부목록**이었다.
 *
 * ## 왜 그게 위험한가 (2026-08-17)
 *
 * 코드는 이랬다: `modes.filter((m) => !GATE_REMOVING_MODES.has(m.id))`.
 * 이름을 적어 둔 것만 숨긴다 — **어댑터가 새 모드를 더하면 우리가 모르는 채로
 * 사용자에게 보이고, 고를 수 있다.** 그 모드가 관문을 없애는 것이면 사용자는
 * 한 번의 선택으로 이 화면의 약속을 무르게 되고, 화면은 아무 말도 안 한다.
 *
 * 안전 장치가 **모르는 것을 안전한 것처럼** 다루면 그건 장치가 아니다.
 *
 * 그리고 이건 지금 당장 문제다: 어댑터 버전을 올리는 중이고
 * (`claude-agent-acp` 0.68→0.69 · `codex-acp` 1.3→1.4), 우리 관문 실측은
 * **옛 버전에서** 한 것이다.
 *
 * ## 그래서 셋으로 가른다
 *
 * 재 봐서 안전한 것 · 재 봐서 관문을 없애는 것 · **아직 안 재 본 것**.
 * 마지막을 숨기지는 않는다(멀쩡한 새 모드를 막으면 그것도 거짓말이다) —
 * 대신 **모른다고 말한다.** 권한 카드가 이미 같은 규율을 쓴다.
 */

const mode = (id: string, name = id) => ({ id, name });

describe('작업 방식 — 아는 것과 모르는 것을 가른다', () => {
  it('관문을 없앤다고 잰 것은 아예 안 보여 준다', () => {
    const out = partitionModes([mode('default'), mode('bypassPermissions')]);
    expect(out.offered.map((m) => m.id)).toEqual(['default']);
    expect(out.unverified).toEqual([]);
  });

  it('codex 의 `agent` 도 숨긴다 — 이름은 평범한데 실측이 다르다', () => {
    // 실측(2026-08-16): codex 를 `agent` 로 띄우니 작업 폴더 밖에 쓰면서
    // 권한 요청이 0회였다.
    const out = partitionModes([mode('agent'), mode('read-only')]);
    expect(out.offered.map((m) => m.id)).toEqual(['read-only']);
  });

  it('재 봐서 안전한 것은 그냥 보여 준다', () => {
    const out = partitionModes([mode('default'), mode('read-only'), mode('plan')]);
    expect(out.unverified).toEqual([]);
    expect(out.offered).toHaveLength(3);
  });

  it('**모르는 모드는 보여 주되 모른다고 표시한다**', () => {
    const out = partitionModes([mode('default'), mode('turbo-yolo')]);
    expect(out.offered.map((m) => m.id)).toEqual(['default', 'turbo-yolo']);
    expect(out.unverified).toEqual(['turbo-yolo']);
  });

  it('모르는 것을 숨기지 않는다 — 멀쩡한 새 모드를 막는 것도 거짓말이다', () => {
    const out = partitionModes([mode('some-new-safe-mode')]);
    expect(out.offered).toHaveLength(1);
  });

  it('대소문자와 공백에 흔들리지 않는다 — 어댑터마다 표기가 다르다', () => {
    expect(partitionModes([mode(' BypassPermissions ')]).offered).toEqual([]);
    expect(partitionModes([mode('Read-Only')]).unverified).toEqual([]);
  });

  it('모양이 깨진 항목은 조용히 버리지 않고 모르는 것으로 센다', () => {
    const out = partitionModes([{ id: '', name: 'x' }, mode('default')]);
    expect(out.offered.map((m) => m.id)).toEqual(['default']);
    expect(out.dropped).toBe(1);
  });

  it('빈 목록은 빈 결과다', () => {
    expect(partitionModes([])).toEqual({ offered: [], unverified: [], dropped: 0 });
  });
});
