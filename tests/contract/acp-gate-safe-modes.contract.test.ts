import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
 *
 * ## What changed on 2026-09-05
 *
 * Two things, both read out of the shipped distributions rather than guessed.
 *
 * ① `auto` is now on the hidden side. It was let through here because it *sounded* like a
 * classifier that still asks. `claude-agent-acp` 0.74.0 advertises it to **every** session
 * (*"Auto" / "Claude handles permission decisions"*) and its own source records that a mode-level
 * auto-approval never reaches the ACP client as `session/request_permission` — so Atlas would draw
 * no card at all. That is the one criterion above, failed.
 *
 * ② The adapters now state a mode's class in `_meta.kind`, and the class does not travel on the
 * name: `claude-agent-acp` calls the self-approving mode `auto` and `codex-acp` calls it `agent`.
 * `mode-safety.ts` therefore reads the kind and lets it outrank the id in both directions, which
 * only works while `readSessionChoices` actually carries `_meta` through — pinned below.
 */

function choice(id: string, name = id, metaKind: string | null = null): AcpChoice {
  return { id, name, description: null, metaKind, meta: metaKind ? { kind: metaKind } : null };
}

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
    // `auto` joined the hidden side on 2026-09-05 — see the block at the top of this file.
    expect(kept).not.toContain('auto');
    // What fails safe, and what is useful, stays.
    expect(kept).toEqual(['default', 'plan', 'dontAsk']);
  });

  it('claude-agent-acp 0.74.0 이 실제로 짓는 목록을 그대로 넣어 본다', () => {
    /*
     * Read from `dist/session-mode.js` `buildAvailableModes()` on 2026-09-05. `bypassPermissions`
     * is appended only under `ALLOW_BYPASS`, and `dontAsk` is gone from the built list entirely.
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
     * ⚠️ The previous expectation was `['read-only', 'agent']` — **this file was
     * pinning the hole** (review 2026-08-16). `agent` only sounds like a normal mode,
     * and this repository's own measurement is recorded in `src-tauri/src/acp.rs`:
     * launching codex in that default mode produced *"files written outside the working
     * folder with 0 permission requests"*. It fails the criterion above exactly.
     *
     * The mode filter therefore leaves only `read-only`, but this does **not** make
     * Codex eligible for in-app chat. Installed acceptance later proved an Atlas MCP
     * write can bypass that mode; `runtime-gate.ts` owns the separate runtime boundary.
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
     * The kind rule is only worth anything while the parser carries `_meta` from the wire to the
     * verdict. Feeding a raw session response with an id on the measured-safe list and a kind that
     * contradicts it pins both halves at once: drop the parse and this goes green-for-nothing.
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
 * **The transcription is pinned to the version it was transcribed from.**
 *
 * Every array in this file was read by hand out of a shipped tarball. That is the only way to get
 * the real shape, and it is also how a fixture quietly becomes a fiction: the registry gets bumped,
 * the adapter changes what it builds, and these arrays keep passing while describing a version
 * nobody runs any more. This repository has the failure on record already, in the words the
 * permission tests use: *a gate that passes on invented input is not a gate*. A stale transcription
 * is invented input that used to be real.
 *
 * So the version is asserted against `src-tauri/src/acp-registry.json`, the committed snapshot the
 * app actually launches from. A bump turns this red, and the person doing the bump has to open the
 * new tarball and re-transcribe rather than discover the drift in an installed session.
 */
const TRANSCRIBED_FROM = {
  claude: '@agentclientprotocol/claude-agent-acp@0.74.0',
  /** The pinned launch, whose mode list carries no `_meta` at all. */
  codexLaunch: '@agentclientprotocol/codex-acp@1.6.2',
  /** The reviewed-but-not-launched upstream, whose kinds the tables above transcribe. */
  codexReviewed: '@agentclientprotocol/codex-acp@1.9.0',
};

const REPO_ROOT = join(import.meta.dirname, '..', '..');

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

  it('reads the codex modes from the pinned launch, not from whatever is newest', () => {
    expect(registryLaunchPackage('codex-acp')).toBe(TRANSCRIBED_FROM.codexLaunch);
  });

  it('reads the codex kinds from the reviewed upstream the pin was measured against', () => {
    /*
     * `RUNTIME_LAUNCH_PINS` is not exported, and that file is the authority on which upstream was
     * reviewed, so the identity is read out of its source the way `acp-runtime-gate.contract.test.ts`
     * reads the session-start code. Reviewing a newer upstream without re-reading its `AgentMode`
     * table is the drift this catches.
     */
    const source = readFileSync(join(REPO_ROOT, 'scripts/build-acp-registry.mjs'), 'utf8');
    expect(source).toContain(`reviewedUpstreamPackage: '${TRANSCRIBED_FROM.codexReviewed}'`);
  });
});
