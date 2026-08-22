import { describe, expect, it } from 'vitest';

import {
  keepGateSafeModes,
  readSessionChoices,
  type AcpChoice,
} from '@/features/acp-session/model/acp-client';

/**
 * **Modes that remove the checkpoint are never offered on screen.**
 *
 * ## Why this gate exists
 *
 * In the runner list this app **promises in words** that Atlas will ask on the
 * user's behalf when something outside the folder is touched. Exactly one mechanism
 * keeps that promise: `session/request_permission` reaching us.
 *
 * But the mode lists adapters advertise include modes that stop that request being
 * sent at all (measured 2026-08-16):
 *
 * - claude: `bypassPermissions` — *"Bypass all permission checks"*
 * - claude: `acceptEdits` — *"Auto-accept file edit operations"*
 * - codex: `agent-full-access`
 *
 * Putting those straight into a dropdown means **one user choice voids our
 * promise** — and then it is a default, not a promise.
 *
 * ⚠️ This does not block strict modes. `dontAsk` **refuses** anything not
 * pre-approved, so it fails safe and is allowed through. The one criterion is
 * **"does it let things through without asking".**
 */

function choice(id: string, name = id): AcpChoice {
  return { id, name, description: null };
}

describe('작업 방식 목록 — 관문을 없애는 것은 안 내놓는다', () => {
  it('실측에서 실제로 온 claude 모드 목록을 그대로 넣어 본다', () => {
    const measured = [
      choice('auto', 'Auto'),
      choice('default', 'Manual'),
      choice('acceptEdits', 'Accept Edits'),
      choice('plan', 'Plan Mode'),
      choice('dontAsk', "Don't Ask"),
      choice('bypassPermissions', 'Bypass Permissions'),
    ];
    const kept = keepGateSafeModes(measured).map((m) => m.id);

    expect(kept).not.toContain('bypassPermissions');
    expect(kept).not.toContain('acceptEdits');
    // What fails safe, and what is useful, stays.
    expect(kept).toEqual(['auto', 'default', 'plan', 'dontAsk']);
  });

  it('실측에서 실제로 온 codex 모드 목록을 그대로 넣어 본다', () => {
    const kept = keepGateSafeModes([
      choice('read-only', 'Read Only'),
      choice('agent', 'Agent'),
      choice('agent-full-access', 'Agent (full access)'),
    ]).map((m) => m.id);
    /*
     * ⚠️ The previous expectation was `['read-only', 'agent']` — **this file was
     * pinning the hole** (review 2026-08-16). `agent` only sounds like a normal mode,
     * and this repository's own measurement is recorded in `src-tauri/src/acp.rs`:
     * launching codex in that default mode produced *"files written outside the working
     * folder with 0 permission requests"*. It fails the criterion above exactly.
     *
     * So codex is left with `read-only` alone. The vault tools we inject still run in
     * that mode, so filling the map is not blocked.
     */
    expect(kept).toEqual(['read-only']);
  });

  it('세션 응답을 읽는 경로가 **반드시** 이 필터를 지난다', () => {
    /*
     * Testing the filter function alone leaves a silent hole the day a consumer stops
     * calling it, so a real response shape is fed in and the result inspected.
     */
    const choices = readSessionChoices({
      modes: {
        currentModeId: 'auto',
        availableModes: [
          { id: 'auto', name: 'Auto' },
          { id: 'bypassPermissions', name: 'Bypass Permissions' },
        ],
      },
      models: {
        currentModelId: 'gpt-5.6-sol[xhigh]',
        availableModels: [{ modelId: 'gpt-5.6-sol[xhigh]', name: 'GPT-5.6-Sol (xhigh)' }],
      },
    });

    expect(choices.modes.map((m) => m.id)).toEqual(['auto']);
    // Models are unrelated to safety and pass through untouched — the filter is not over-reaching.
    expect(choices.models.map((m) => m.id)).toEqual(['gpt-5.6-sol[xhigh]']);
    expect(choices.currentModelId).toBe('gpt-5.6-sol[xhigh]');
  });

  it('안 내놓는 어댑터는 빈 목록이다 — 없는 것을 있는 척하지 않는다', () => {
    // claude advertises no models at all (measured: `session/set_model` is not a method it has).
    const choices = readSessionChoices({ modes: { currentModeId: 'default', availableModes: [] } });
    expect(choices.models).toEqual([]);
    expect(choices.currentModelId).toBeNull();
  });

  it('모양이 깨진 줄은 버린다', () => {
    const choices = readSessionChoices({
      models: { availableModels: [{ name: '이름만 있고 id 가 없다' }, 'not-an-object', null] },
    });
    expect(choices.models).toEqual([]);
  });
});
