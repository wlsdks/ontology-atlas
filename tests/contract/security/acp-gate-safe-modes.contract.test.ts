import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  keepGateSafeModes,
  readSessionChoices,
  type AcpChoice,
} from '@/features/acp-session/model/acp-client';

/**
 * Modes that let tool use through without `session/request_permission` are never offered; `dontAsk`
 * refuses unapproved actions so it fails safe. `mode-safety.ts` lets `_meta.kind` outrank the id,
 * which needs `readSessionChoices` to carry `_meta` through.
 */

function choice(id: string, name = id, metaKind: string | null = null): AcpChoice {
  return { id, name, description: null, metaKind, meta: metaKind ? { kind: metaKind } : null };
}

describe('current adapter mode transcription', () => {
  it.each([false, true])('keeps only approval-required Codex modes with AIR metadata %s', (air) => {
    // v2.2.2 src/AgentMode.ts: all() and toSessionMode(); kinds are sent only to AIR.
    const modes = [
      choice('read-only', 'Read-only', air ? 'standard' : null),
      choice('workspace-write', 'Workspace access', air ? 'standard' : null),
      choice('agent', 'Auto review', air ? 'auto_review' : null),
      choice('agent-full-access', 'Full access', air ? 'full_access' : null),
    ];
    expect(keepGateSafeModes(modes).map((mode) => mode.id)).toEqual(['read-only']);
  });

  it('keeps the manual and plan modes in the current non-AIR Claude list', () => {
    // v0.89.1 src/session-mode.ts: buildAvailableModes(true), without AIR-only kinds.
    const modes = [
      choice('default', 'Manual'),
      choice('acceptEdits', 'Accept edits'),
      choice('plan', 'Plan'),
      choice('auto', 'Auto'),
      choice('bypassPermissions', 'Bypass permissions'),
    ];
    expect(keepGateSafeModes(modes).map((mode) => mode.id)).toEqual(['default', 'plan']);
  });
});

describe('작업 방식 목록 — 관문을 없애는 것은 안 내놓는다', () => {
  it('실측에서 실제로 온 claude 모드 목록을 그대로 넣어 본다', () => {
    // The 0.69-era list, kept because a person resuming an older adapter still meets it.
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
    expect(kept).not.toContain('auto');
    // What fails safe, and what is useful, stays.
    expect(kept).toEqual(['default', 'plan', 'dontAsk']);
  });

  it('claude-agent-acp 0.77.0 이 실제로 짓는 목록을 그대로 넣어 본다', () => {
    /*
     * From `dist/session-mode.js` `buildAvailableModes(allowBypass)`: `bypassPermissions` is appended
     * only when allowed, and `dontAsk` is absent from the built list.
     */
    const kept = keepGateSafeModes([
      choice('default', 'Manual', 'standard'),
      choice('acceptEdits', 'Accept edits', 'standard'),
      choice('plan', 'Plan', 'plan'),
      choice('auto', 'Auto', 'auto_review'),
      choice('bypassPermissions', 'Bypass permissions', 'full_access'),
    ]).map((m) => m.id);
    expect(kept).toEqual(['default', 'plan']);
  });

  it('실측에서 실제로 온 codex 모드 목록을 그대로 넣어 본다', () => {
    const kept = keepGateSafeModes([
      choice('read-only', 'Read Only'),
      choice('agent', 'Agent'),
      choice('agent-full-access', 'Agent (full access)'),
    ]).map((m) => m.id);
    /*
     * `agent` mode wrote files outside the folder with 0 permission requests (`docs/DECISIONS.md`), so
     * only `read-only` remains. `runtime-gate.ts` owns the separate runtime boundary for Atlas MCP
     * writes.
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
        currentModeId: 'default',
        availableModes: [
          { id: 'default', name: 'Manual' },
          { id: 'auto', name: 'Auto' },
          { id: 'bypassPermissions', name: 'Bypass Permissions' },
        ],
      },
      models: {
        currentModelId: 'gpt-5.6-sol[xhigh]',
        availableModels: [{ modelId: 'gpt-5.6-sol[xhigh]', name: 'GPT-5.6-Sol (xhigh)' }],
      },
    });

    expect(choices.modes.map((m) => m.id)).toEqual(['default']);
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

  it('`_meta` 가 필터까지 실제로 도착한다 — 종류가 이름을 이긴다', () => {
    /*
     * A session response with a safe-list id and a contradicting kind pins that `_meta` reaches the
     * filter.
     */
    const choices = readSessionChoices({
      modes: {
        currentModeId: 'read-only',
        availableModes: [
          { id: 'read-only', name: 'Ask for approval', _meta: { kind: 'auto_review' } },
          { id: 'plan', name: 'Plan', _meta: { kind: 'plan' } },
        ],
      },
    });

    expect(choices.modes.map((m) => m.id)).toEqual(['plan']);
    // The raw block survives the trip, so the next field the adapter adds is already on hand.
    expect(choices.modes[0]?.meta).toEqual({ kind: 'plan' });
  });

  it('모양이 깨진 줄은 버린다', () => {
    const choices = readSessionChoices({
      models: { availableModels: [{ name: '이름만 있고 id 가 없다' }, 'not-an-object', null] },
    });
    expect(choices.models).toEqual([]);
  });
});

/**
 * Arrays are transcribed from the exact adapter release; asserting the version against
 * `src-tauri/src/acp-registry.json` turns a bump red so the arrays are re-transcribed.
 */
const TRANSCRIBED_FROM = {
  /**
   * 0.89.1: `buildAvailableModes` still builds the same five ids, but `_meta.kind` is
   * now sent only to the adapter's own AIR client, so Atlas receives no kind and `mode-safety.ts`
   * judges by id alone; every gate-removing id is on its measured list.
   */
  claude: '@agentclientprotocol/claude-agent-acp@0.89.1',
  /**
   * 2.2.2 src/AgentMode.ts restores readOnly and adds workspace-write; Atlas excludes the
   * latter because its workspaceWrite sandbox permits edits before an approval request.
   */
  codexLaunch: '@agentclientprotocol/codex-acp@2.2.2',
};

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

function registryLaunchPackage(id: string): string | null {
  const registry = JSON.parse(
    readFileSync(join(REPO_ROOT, 'src-tauri/src/acp-registry.json'), 'utf8'),
  ) as { agents: Array<{ id: string; launch?: { package?: string } }> };
  return registry.agents.find((agent) => agent.id === id)?.launch?.package ?? null;
}

describe('transcribed adapter versions', () => {
  it('reads the claude modes from the version the app actually launches', () => {
    expect(registryLaunchPackage('claude-acp')).toBe(TRANSCRIBED_FROM.claude);
  });

  it('reads the codex modes from the version the app actually launches', () => {
    expect(registryLaunchPackage('codex-acp')).toBe(TRANSCRIBED_FROM.codexLaunch);
  });

  it('launches with no compatibility pin, and the table says who overturned it', () => {
    /*
     * `RUNTIME_LAUNCH_PINS` is not exported, so the fact is read out of its source the way
     * `acp-runtime-gate.contract.test.ts` reads the session-start code. A pin quietly returning
     * without a record, or the record's citation quietly leaving, is the drift this catches.
     */
    const source = readFileSync(join(REPO_ROOT, 'scripts/registry-snapshots/build-acp-registry.mjs'), 'utf8');
    expect(source).not.toContain('reviewedUpstreamPackage:');
    expect(source).toContain('docs/DECISIONS.md');
  });
});
