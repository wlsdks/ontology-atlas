import { describe, expect, it } from 'vitest';

import { partitionModes } from './mode-safety';

/**
 * The safety decision has three categories: measured safe, measured to remove the gate, and
 * not yet measured; the last is shown stated as unknown, not hidden.
 */

const mode = (id: string, name = id) => ({ id, name });

describe('작업 방식 — 아는 것과 모르는 것을 가른다', () => {
  it('관문을 없앤다고 잰 것은 아예 안 보여 준다', () => {
    const out = partitionModes([mode('default'), mode('bypassPermissions')]);
    expect(out.offered.map((m) => m.id)).toEqual(['default']);
    expect(out.unverified).toEqual([]);
  });

  it('codex 의 `agent` 도 숨긴다 — 이름은 평범한데 실측이 다르다', () => {
    // Launching codex on `agent` wrote outside the working folder with zero permission requests.
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
 * Pins the measured `codex-acp` 1.6.2 mode list: `read-only` maps to the real read-only
 * sandbox, the others to writable ones. Opening `agent` requires measuring again and editing
 * this block.
 */
describe('실측한 어댑터 — codex-acp 1.6.2', () => {
  /** The mode list exactly as it arrived in the session. */
  const CODEX_ACP_1_6_2_MODES = [
    { id: 'read-only', name: 'Read-only' },
    { id: 'agent', name: 'Agent' },
    { id: 'agent-full-access', name: 'Agent (full access)' },
  ];

  it('읽기 하나만 내준다 — 쓰기 모드는 관문이 없어서 숨긴다', () => {
    const out = partitionModes(CODEX_ACP_1_6_2_MODES);
    expect(out.offered.map((m) => m.id)).toEqual(['read-only']);
    expect(out.unverified).toEqual([]);
  });

  /*
   * ⚠️ This test comes first. If the adapter cuts down to a single mode, the tests above pass while
   * measuring nothing — "a check that is always green is not a check".
   */
  it('실측 목록에 숨길 것이 실제로 들어 있다 — 아니면 위 검사가 헛돈다', () => {
    expect(CODEX_ACP_1_6_2_MODES).toHaveLength(3);
    expect(partitionModes(CODEX_ACP_1_6_2_MODES).offered).toHaveLength(1);
  });
});

/**
 * The adapter states a kind in `_meta.kind`: `auto_review` and `full_access` skip ACP
 * permission requests, and the kind wins over the id in both directions.
 */
const kindMode = (id: string, metaKind: string | null) => ({ id, name: id, metaKind });

describe('mode kind — the adapter states its own safety class', () => {
  it('drops `auto` by id: claude 0.74.0 advertises it to every session', () => {
    const out = partitionModes([kindMode('default', 'standard'), kindMode('auto', 'auto_review')]);
    expect(out.offered.map((m) => m.id)).toEqual(['default']);
    expect(out.unverified).toEqual([]);
  });

  it('drops an unknown id whose kind is `auto_review`', () => {
    const out = partitionModes([kindMode('default', 'standard'), kindMode('brand-new', 'auto_review')]);
    expect(out.offered.map((m) => m.id)).toEqual(['default']);
  });

  it('drops an unknown id whose kind is `full_access`', () => {
    const out = partitionModes([kindMode('default', 'standard'), kindMode('brand-new', 'full_access')]);
    expect(out.offered.map((m) => m.id)).toEqual(['default']);
  });

  it('lets the kind override a measured-safe id — `read-only` claiming `auto_review` is not safe', () => {
    const out = partitionModes([kindMode('read-only', 'auto_review')]);
    expect(out.offered).toEqual([]);
  });

  it('keeps `default` with a `standard` kind safe — the kind agrees with the id', () => {
    const out = partitionModes([kindMode('default', 'standard')]);
    expect(out.offered.map((m) => m.id)).toEqual(['default']);
    expect(out.unverified).toEqual([]);
  });

  it('marks a measured-safe id unverified when its kind is one nobody measured', () => {
    const out = partitionModes([kindMode('default', 'turbo')]);
    expect(out.offered.map((m) => m.id)).toEqual(['default']);
    expect(out.unverified).toEqual(['default']);
  });

  it('falls back to the id alone when the adapter states no kind', () => {
    // codex-acp 1.6.2, the pinned launch snapshot, attaches no `_meta` at all.
    const out = partitionModes([kindMode('read-only', null), kindMode('agent', null)]);
    expect(out.offered.map((m) => m.id)).toEqual(['read-only']);
    expect(out.unverified).toEqual([]);
  });
});

/**
 * Pins the claude adapter mode list from `buildAvailableModes()`; `bypassPermissions` is
 * appended only when the adapter's `ALLOW_BYPASS` is set, so both shapes are pinned.
 */
describe('measured adapter — claude-agent-acp 0.74.0', () => {
  const CLAUDE_ACP_0_74_0_MODES = [
    { id: 'default', name: 'Manual', metaKind: 'standard' },
    { id: 'acceptEdits', name: 'Accept edits', metaKind: 'standard' },
    { id: 'plan', name: 'Plan', metaKind: 'plan' },
    { id: 'auto', name: 'Auto', metaKind: 'auto_review' },
  ];
  const WITH_BYPASS = [
    ...CLAUDE_ACP_0_74_0_MODES,
    { id: 'bypassPermissions', name: 'Bypass permissions', metaKind: 'full_access' },
  ];

  it('offers only the two that still ask — Auto is not one of them', () => {
    const out = partitionModes(CLAUDE_ACP_0_74_0_MODES);
    expect(out.offered.map((m) => m.id)).toEqual(['default', 'plan']);
    expect(out.unverified).toEqual([]);
  });

  it('is unchanged by the bypass build — the extra mode is hidden too', () => {
    expect(partitionModes(WITH_BYPASS).offered.map((m) => m.id)).toEqual(['default', 'plan']);
  });

  /* This one comes first: if the adapter ever ships only safe modes the checks above measure nothing. */
  it('really does carry something to hide — otherwise the checks above idle', () => {
    expect(CLAUDE_ACP_0_74_0_MODES).toHaveLength(4);
    expect(partitionModes(CLAUDE_ACP_0_74_0_MODES).offered).toHaveLength(2);
  });
});

/**
 * Pins `codex-acp` 1.9.0 modes: same ids, but `read-only` now sends `workspaceWrite` and
 * `agent` gained `auto_review`. `runtime-gate.ts` and the launch pin keep that adapter out,
 * not the mode filter.
 */
describe('measured adapter — codex-acp 1.9.0', () => {
  const CODEX_ACP_1_9_0_MODES = [
    { id: 'read-only', name: 'Ask for approval', metaKind: 'standard' },
    { id: 'agent', name: 'Approve for me', metaKind: 'auto_review' },
    { id: 'agent-full-access', name: 'Full access', metaKind: 'full_access' },
  ];

  it('offers read-only alone, now for two independent reasons', () => {
    const out = partitionModes(CODEX_ACP_1_9_0_MODES);
    expect(out.offered.map((m) => m.id)).toEqual(['read-only']);
    expect(out.unverified).toEqual([]);
  });
});
