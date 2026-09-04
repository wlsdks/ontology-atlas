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
 * How it was measured (2026-09-03, the installed app and pinned distribution): a `codex-acp` 1.6.2
 * session offers three modes. Its distribution maps `read-only` to the real `readOnly` sandbox and
 * the other two to writable sandboxes. The installed read-only path asked before a direct write,
 * while the previously measured writable path created a file with no card. The writable ids stay
 * hidden; their friendly names are not evidence of a boundary.
 *
 * So this adapter is offered **read only**. The uncomfortable conclusion is frozen into a test to
 * stop the next person seeing "writing does not work" and quietly opening `agent` — opening it
 * requires **measuring again and editing this block**.
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
 * **The id is not the whole verdict any more — the adapter now states a kind.**
 *
 * Read from the shipped distributions (2026-09-05):
 *
 * - `@agentclientprotocol/claude-agent-acp@0.74.0` `dist/session-mode.js` attaches
 *   `_meta.kind` to every mode it builds: `standard` (`default`, `acceptEdits`), `plan`,
 *   `auto_review` (`auto`), and `full_access` (`bypassPermissions`, only with `ALLOW_BYPASS`).
 * - `@agentclientprotocol/codex-acp@1.9.0` `dist/index.js` does the same on its three modes:
 *   `read-only` is `standard`, `agent` is `auto_review`, `agent-full-access` is `full_access`.
 *
 * `auto_review` means the adapter approves on the person's behalf, and its own source records that
 * such an approval **never becomes an ACP permission request** — so Atlas would draw no card at all.
 * `full_access` says the same thing without the euphemism. Both are the gate-removing class, and the
 * class travels on the kind, not on the name: `codex-acp` calls the first one `agent` and
 * `claude-agent-acp` calls it `auto`, and the next adapter will call it something else again.
 *
 * So the kind **wins over the id in both directions**: an id nobody has measured is dropped when its
 * kind says gate-removing, and an id on the measured-safe list is dropped for the same reason.
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
    // Unknown is unverified, never safe — the 2026-08-17 stance, now on the kind axis too.
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
 * The measured mode list of the claude adapter, pinned the way the codex one above is.
 *
 * Read from `@agentclientprotocol/claude-agent-acp@0.74.0` `dist/session-mode.js`
 * `buildAvailableModes()` on 2026-09-05. `bypassPermissions` is appended only when the adapter's
 * `ALLOW_BYPASS` is set, so both shapes are pinned. `dontAsk` — the strict mode this repository
 * used to offer because it fails toward a refusal — **no longer exists** in the built list.
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
 * `codex-acp` 1.9.0, read on 2026-09-05. It is **not** the pinned launch snapshot (1.6.2 is), but its
 * modes are pinned here because the id set did not change while the meaning did: the same
 * `read-only` id now sends `workspaceWrite`, and `agent` gained the `auto_review` kind. The mode
 * filter is not what keeps that adapter out — `runtime-gate.ts` and the launch pin are.
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
