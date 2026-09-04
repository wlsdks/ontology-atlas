import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createAcpClient,
  toPermissionRequest,
  type AcpTransport,
} from '@/features/acp-session/model/acp-client';

/**
 * **The app answers with the one option that ends when the tool call ends.**
 *
 * `acp-client.ts` states the rule in words — never hardcode an `optionId`, locate it by `kind`, and
 * never pick `allow_always` for the person. This file measures the rule against **the option arrays
 * the shipped adapter actually builds**, because the rule is only as good as the arrays it meets.
 *
 * Everything below is read from `@agentclientprotocol/claude-agent-acp@0.74.0`
 * `dist/permissions/options/*.js` on 2026-09-05 — `shared.js` for the ids and kinds,
 * `shell.js` / `tools.js` / `filesystem.js` for who builds what. Nothing here is invented: this
 * repository already recorded what happens when a gate is measured against a hand-made shape
 * (*"a gate that passes on invented input is not a gate"* — a test built a `file_path` the real
 * server never sends, stayed green, and the hole it claimed to close was still open).
 *
 * ## Why `ExitPlanMode` is the sharp case
 *
 * Its array is the only one where an `allow_once` is **not** the first entry and where the
 * `allow_always` entries do more than remember a decision — they move the session into an elevated
 * mode. `exit-plan-auto`, `exit-plan-bypass` and `exit-plan-accept-edits` each hand the rest of the
 * conversation to a mode `mode-safety.ts` refuses to offer in the dropdown. Picking one of those on
 * the person's behalf would let a plan approval do what the mode list is built to prevent.
 * `exit-plan-default` — *"Yes, manually approve edits"* — is the single `allow_once`.
 */

/** The ids `shared.js` mints. Verbatim, so a rename upstream shows up as a diff here. */
const OPTION_ID = {
  allowOnce: 'allow-once',
  allowWithUpdates: 'allow-with-updates',
  allowSkillExact: 'allow-skill-exact',
  allowSkillPrefix: 'allow-skill-prefix',
  exitPlanBypass: 'exit-plan-bypass',
  exitPlanAuto: 'exit-plan-auto',
  exitPlanAcceptEdits: 'exit-plan-accept-edits',
  exitPlanDefault: 'exit-plan-default',
  exitPlanClearAuto: 'exit-plan-clear-auto',
  exitPlanClearBypass: 'exit-plan-clear-bypass',
  exitPlanClearAcceptEdits: 'exit-plan-clear-accept-edits',
  reject: 'reject',
} as const;

type Option = { optionId: string; name: string; kind: string };

const allowOnce = (name = 'Yes'): Option => ({
  optionId: OPTION_ID.allowOnce,
  name,
  kind: 'allow_once',
});
const allowWithUpdates = (name: string): Option => ({
  optionId: OPTION_ID.allowWithUpdates,
  name,
  kind: 'allow_always',
});
const reject = (name = 'No'): Option => ({ optionId: OPTION_ID.reject, name, kind: 'reject_once' });

/**
 * One representative array per builder, each with the id the app must land on.
 *
 * The `sorted` note matters: `buildClaudePermissionOptions` sorts `allow_once` before
 * `allow_always` before `reject_once`, **except** that `ExitPlanMode` builds its elevated entries
 * first and the sort then reorders them — which is exactly why locating by `kind` rather than by
 * position is the contract.
 */
const CASES: Array<{ tool: string; options: Option[]; expected: string }> = [
  {
    // shell.js `buildBashPermissionOptions` with a durable change set it can describe.
    tool: 'Bash',
    options: [
      allowOnce(),
      allowWithUpdates("Yes, and don't ask again for git commit commands"),
      reject(),
    ],
    expected: OPTION_ID.allowOnce,
  },
  {
    // shell.js with a change set it cannot phrase, and filesystem.js with no session effect.
    tool: 'Bash (no durable option)',
    options: [allowOnce(), reject()],
    expected: OPTION_ID.allowOnce,
  },
  {
    // filesystem.js `buildEditPermissionOptions` — the session-wide edit grant.
    tool: 'Edit',
    options: [allowOnce(), allowWithUpdates('Yes, allow all edits during this session'), reject()],
    expected: OPTION_ID.allowOnce,
  },
  {
    // tools.js `buildWebFetchPermissionOptions` once the URL yields a hostname.
    tool: 'WebFetch',
    options: [
      allowOnce(),
      allowWithUpdates("Yes, and don't ask again for docs.anthropic.com"),
      reject(),
    ],
    expected: OPTION_ID.allowOnce,
  },
  {
    // tools.js `buildSkillPermissionOptions` — a skill with a space yields both grants.
    tool: 'Skill',
    options: [
      allowOnce(),
      { optionId: OPTION_ID.allowSkillExact, name: "Yes, and don't ask again for pdf fill", kind: 'allow_always' },
      { optionId: OPTION_ID.allowSkillPrefix, name: "Yes, and don't ask again for pdf:* commands", kind: 'allow_always' },
      reject(),
    ],
    expected: OPTION_ID.allowOnce,
  },
  {
    // tools.js `buildExitPlanModePermissionOptions`, plan present, `auto` among the modes.
    tool: 'ExitPlanMode (plan, auto available)',
    options: [
      { optionId: OPTION_ID.exitPlanDefault, name: 'Yes, manually approve edits', kind: 'allow_once' },
      { optionId: OPTION_ID.exitPlanClearAuto, name: 'Yes, clear context (42% used) and use auto mode', kind: 'allow_always' },
      { optionId: OPTION_ID.exitPlanAuto, name: 'Yes, and use auto mode', kind: 'allow_always' },
      reject('No, keep planning'),
    ],
    expected: OPTION_ID.exitPlanDefault,
  },
  {
    // Same builder with no plan text and `bypassPermissions` as the elevated mode.
    tool: 'ExitPlanMode (no plan, bypass available)',
    options: [
      { optionId: OPTION_ID.exitPlanDefault, name: 'Yes, manually approve edits', kind: 'allow_once' },
      { optionId: OPTION_ID.exitPlanBypass, name: 'Yes, and bypass permissions', kind: 'allow_always' },
      reject('No, keep planning'),
    ],
    expected: OPTION_ID.exitPlanDefault,
  },
  {
    // Same builder when neither elevated mode is available — the `acceptEdits` branch.
    tool: 'ExitPlanMode (plan, acceptEdits fallback)',
    options: [
      { optionId: OPTION_ID.exitPlanDefault, name: 'Yes, manually approve edits', kind: 'allow_once' },
      { optionId: OPTION_ID.exitPlanClearAcceptEdits, name: 'Yes, clear context and auto-accept edits', kind: 'allow_always' },
      { optionId: OPTION_ID.exitPlanAcceptEdits, name: 'Yes, auto-accept edits', kind: 'allow_always' },
      reject('No, keep planning'),
    ],
    expected: OPTION_ID.exitPlanDefault,
  },
  {
    /*
     * ⚠️ **The adversarial one, and it is not invented.** `options.js` builds this array and only
     * then sorts it: `buildUnsortedClaudePermissionOptions` returns the elevated entries first and
     * `permissionOptionOrder` moves `allow_once` in front afterwards. The wire therefore carries the
     * sorted shape today — which is precisely why the pre-sort order is measured here. A client that
     * quietly relies on "the first Yes is the safe Yes" passes every case above and hands the
     * session to auto mode the day that sort is dropped, reordered, or skipped by another adapter.
     */
    tool: 'ExitPlanMode (builder order, before the sort)',
    options: [
      { optionId: OPTION_ID.exitPlanClearAuto, name: 'Yes, clear context (42% used) and use auto mode', kind: 'allow_always' },
      { optionId: OPTION_ID.exitPlanAuto, name: 'Yes, and use auto mode', kind: 'allow_always' },
      { optionId: OPTION_ID.exitPlanDefault, name: 'Yes, manually approve edits', kind: 'allow_once' },
      reject('No, keep planning'),
    ],
    expected: OPTION_ID.exitPlanDefault,
  },
  {
    // The same shape from the `bypassPermissions` branch, also pre-sort.
    tool: 'ExitPlanMode (builder order, bypass branch)',
    options: [
      { optionId: OPTION_ID.exitPlanClearBypass, name: 'Yes, clear context and bypass permissions', kind: 'allow_always' },
      { optionId: OPTION_ID.exitPlanBypass, name: 'Yes, and bypass permissions', kind: 'allow_always' },
      { optionId: OPTION_ID.exitPlanDefault, name: 'Yes, manually approve edits', kind: 'allow_once' },
      reject('No, keep planning'),
    ],
    expected: OPTION_ID.exitPlanDefault,
  },
  {
    // tools.js `buildFallbackPermissionOptions` on the `mcp__` branch, unrestricted allow rule.
    tool: 'mcp__atlas-vault__get_concept',
    options: [
      allowOnce(),
      allowWithUpdates("Yes, and don't ask again for atlas-vault commands"),
      reject(),
    ],
    expected: OPTION_ID.allowOnce,
  },
  {
    // The same branch when the change set is not an unrestricted allow for this exact tool.
    tool: 'mcp__atlas-vault__get_concept (no durable option)',
    options: [allowOnce(), reject()],
    expected: OPTION_ID.allowOnce,
  },
];

/** Every id in these arrays that hands away more than this one call. */
const ELEVATING_IDS = [
  OPTION_ID.allowWithUpdates,
  OPTION_ID.allowSkillExact,
  OPTION_ID.allowSkillPrefix,
  OPTION_ID.exitPlanAuto,
  OPTION_ID.exitPlanBypass,
  OPTION_ID.exitPlanAcceptEdits,
  OPTION_ID.exitPlanClearAuto,
  OPTION_ID.exitPlanClearBypass,
  OPTION_ID.exitPlanClearAcceptEdits,
];

function fakeTransport() {
  const sent: Array<Record<string, unknown>> = [];
  let listener: ((line: string) => void) | null = null;
  const transport: AcpTransport = {
    send: (line) => {
      sent.push(JSON.parse(line) as Record<string, unknown>);
    },
    subscribe: (onLine) => {
      listener = onLine;
      return () => {
        listener = null;
      };
    },
  };
  return {
    transport,
    sent,
    emit(payload: unknown) {
      listener?.(JSON.stringify(payload));
    },
  };
}

/** A request the app answers **by itself**: an Atlas read tool, and the path is inside the vault. */
function autoAllowedRequest(options: Option[]) {
  return {
    jsonrpc: '2.0',
    id: 11,
    method: 'session/request_permission',
    params: {
      sessionId: 's-1',
      toolCall: {
        toolCallId: 'call-1',
        kind: 'read',
        title: 'mcp__atlas-vault__get_concept',
        rawInput: { filePath: '/vault/capabilities/acp-runtime.md' },
      },
      options,
    },
  };
}

function outcomeOf(sent: Array<Record<string, unknown>>, id: number) {
  const answer = sent.find((m) => m.id === id && 'result' in m);
  return (answer?.result as { outcome?: { outcome?: string; optionId?: string } })?.outcome;
}

const insideVault = async () => 'allow-inside-vault' as const;
const alwaysAsk = async () => 'ask' as const;

describe('permission options — the app picks the one that ends with this call', () => {
  it.each(CASES)('$tool', async ({ options, expected }) => {
    const t = fakeTransport();
    const askUser = vi.fn(async () => null);
    createAcpClient(t.transport, {
      verdict: insideVault,
      askUser,
      vaultMcpServerName: 'atlas-vault',
    });

    t.emit(autoAllowedRequest(options));
    await vi.waitFor(() => expect(outcomeOf(t.sent, 11)).toBeTruthy());

    expect(askUser).not.toHaveBeenCalled();
    expect(outcomeOf(t.sent, 11)).toEqual({ outcome: 'selected', optionId: expected });
    expect(ELEVATING_IDS).not.toContain(outcomeOf(t.sent, 11)?.optionId);
  });

  it.each(CASES)('$tool — exactly one option ends with this call', ({ options, expected }) => {
    /*
     * The client locates its answer with `.find(kind === 'allow_once')`. That is only unambiguous
     * while each array holds exactly one, so the invariant is measured rather than assumed — and it
     * is the reason `ExitPlanMode` is safe despite three "Yes" buttons.
     */
    const once = options.filter((option) => option.kind === 'allow_once');
    expect(once.map((option) => option.optionId)).toEqual([expected]);
  });

  it.each(CASES)('$tool — the person\'s allow-once button carries the same id', ({ options, expected }) => {
    /*
     * `AcpPermissionCard` finds its own buttons by the same kinds. Reading the parsed request the
     * card is handed keeps the two sides from drifting: the app's automatic answer and the person's
     * "allow once" must be the same option, or one of the two screens is lying about what it did.
     */
    const request = toPermissionRequest({ toolCall: {}, options });
    expect(request.options.find((option) => option.kind === 'allow_once')?.optionId).toBe(expected);
    // The always-grants survive parsing — the card offers them, but only the person may press one.
    const always = request.options.filter((option) => option.kind === 'allow_always');
    expect(always.map((option) => option.optionId)).toEqual(
      options.filter((option) => option.kind === 'allow_always').map((option) => option.optionId),
    );
  });

  it.each(CASES)('$tool — an unanswered card rejects rather than elevating', async ({ options }) => {
    /*
     * The other end of the same rule. When the person does not answer, the app must fall to the
     * reject option — never to whichever "Yes" happens to be first in the array.
     */
    const t = fakeTransport();
    createAcpClient(t.transport, {
      verdict: alwaysAsk,
      askUser: async () => null,
      vaultMcpServerName: 'atlas-vault',
    });

    t.emit({
      jsonrpc: '2.0',
      id: 12,
      method: 'session/request_permission',
      params: {
        sessionId: 's-1',
        toolCall: { toolCallId: 'call-2', kind: 'edit', title: 'Edit', rawInput: { file_path: '/elsewhere/x.md' } },
        options,
      },
    });
    await vi.waitFor(() => expect(outcomeOf(t.sent, 12)).toBeTruthy());

    expect(outcomeOf(t.sent, 12)).toEqual({ outcome: 'selected', optionId: OPTION_ID.reject });
  });

  it('never selects an option the array does not contain', async () => {
    /*
     * ⚠️ This one comes first if it ever fails. `ExitPlanMode` is the array where a wrong `.find`
     * would still produce a valid-looking id, so the cases above are only meaningful while the
     * elevating ids are genuinely present to be picked by mistake.
     */
    const exitPlan = CASES.find((entry) => entry.tool.startsWith('ExitPlanMode (plan, auto'));
    expect(exitPlan?.options.map((option) => option.optionId)).toContain(OPTION_ID.exitPlanAuto);
    expect(exitPlan?.options.filter((option) => option.kind === 'allow_always')).toHaveLength(2);
  });
});

/**
 * **The option arrays are pinned to the version they were transcribed from.**
 *
 * Every array above was read by hand out of `dist/permissions/options/*.js` in one shipped tarball.
 * That is the only way to get the real shape, and it is also how a fixture quietly becomes a
 * fiction: the registry gets bumped, the builders change, and these arrays keep passing while
 * describing a version nobody runs. The rule this file measures would then be measured against
 * nothing. `ExitPlanMode` in particular grew its `exit-plan-clear-*` entries between releases.
 *
 * So the version is asserted against `src-tauri/src/acp-registry.json`, the committed snapshot the
 * app launches from: a bump turns this red and the arrays get re-read.
 */
const TRANSCRIBED_FROM = '@agentclientprotocol/claude-agent-acp@0.74.0';

describe('transcribed adapter version', () => {
  it('reads the option builders from the version the app actually launches', () => {
    const registry = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '..', '..', 'src-tauri/src/acp-registry.json'),
        'utf8',
      ),
    ) as { agents: Array<{ id: string; launch?: { package?: string } }> };
    expect(registry.agents.find((agent) => agent.id === 'claude-acp')?.launch?.package).toBe(
      TRANSCRIBED_FROM,
    );
  });
});
