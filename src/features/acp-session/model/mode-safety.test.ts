import { describe, expect, it } from 'vitest';

import { partitionModes } from './mode-safety';

/**
 * The safety verdict for the "working mode" list used to be a **denylist**.
 *
 * Why that is dangerous (2026-08-17). The code was
 * `modes.filter((m) => !GATE_REMOVING_MODES.has(m.id))` — it hides only what is written down, so
 * **an adapter adding a new mode makes it visible and selectable without our knowing.** If that mode
 * removes the permission gate, one choice undoes this screen's promise and the screen says nothing.
 *
 * A safety device that treats **the unknown as safe** is not a device.
 *
 * And it is an immediate problem: the adapter versions are being bumped
 * (`claude-agent-acp` 0.68→0.69, `codex-acp` 1.3→1.4) while our gate measurements were taken on the
 * **old versions**.
 *
 * **So there are three categories**: measured safe, measured to remove the gate, and **not yet
 * measured**. The last is not hidden (blocking a perfectly good new mode would be a lie too) —
 * instead it is **stated as unknown**. The permission card already uses the same discipline.
 */

const mode = (id: string, name = id) => ({ id, name });

describe('작업 방식 — 아는 것과 모르는 것을 가른다', () => {
  it('관문을 없앤다고 잰 것은 아예 안 보여 준다', () => {
    const out = partitionModes([mode('default'), mode('bypassPermissions')]);
    expect(out.offered.map((m) => m.id)).toEqual(['default']);
    expect(out.unverified).toEqual([]);
  });

  it('codex 의 `agent` 도 숨긴다 — 이름은 평범한데 실측이 다르다', () => {
    // Measured 2026-08-16: launching codex on `agent` wrote outside the working folder with zero
    // permission requests.
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

/**
 * The tests above measure the function **abstractly** — they never look at which modes actually
 * arrive, so they stay green even when the adapter changes its modes. This pins **the measured list**.
 *
 * How it was measured (2026-08-17, the installed app): a `codex-acp` 1.4 session was opened and the
 * "working mode" list unfolded. There were two: `Read-only` and `Agent`. Choosing `Agent` and asking
 * *"write hello to /tmp/atlas-gate-probe.txt"* created a file **outside** the working folder with
 * **no permission card at all** (contents `hello`).
 *
 * So this adapter is offered **read only**. The uncomfortable conclusion is frozen into a test to
 * stop the next person seeing "writing does not work" and quietly opening `agent` — opening it
 * requires **measuring again and editing this block**.
 */
describe('실측한 어댑터 — codex-acp 1.4', () => {
  /** The mode list exactly as it arrived in the session. */
  const CODEX_ACP_1_4_MODES = [
    { id: 'read-only', name: 'Read-only' },
    { id: 'agent', name: 'Agent' },
  ];

  it('읽기 하나만 내준다 — 쓰기 모드는 관문이 없어서 숨긴다', () => {
    const out = partitionModes(CODEX_ACP_1_4_MODES);
    expect(out.offered.map((m) => m.id)).toEqual(['read-only']);
    expect(out.unverified).toEqual([]);
  });

  /*
   * ⚠️ This test comes first. If the adapter cuts down to a single mode, the tests above pass while
   * measuring nothing — "a check that is always green is not a check".
   */
  it('실측 목록에 숨길 것이 실제로 들어 있다 — 아니면 위 검사가 헛돈다', () => {
    expect(CODEX_ACP_1_4_MODES).toHaveLength(2);
    expect(partitionModes(CODEX_ACP_1_4_MODES).offered).toHaveLength(1);
  });
});
