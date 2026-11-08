import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  GATED_SESSION_MODE,
  isGuardedRuntime,
} from '@/features/acp-session/model/runtime-wiring/runtime-gate';

import { readAcpRust } from '../../helpers/read-acp-rust';

/**
 * The screen and the session must agree on whether a checkpoint exists. Claude asks via isolated
 * config; Codex needs the forced `read-only` mode plus a server-owned typed checkpoint for Atlas MCP
 * writes.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..');

describe('the gate: what is said and what is applied must match', () => {
  it('forces read-only mode only on the verified Codex adapter', () => {
    expect(GATED_SESSION_MODE).toEqual({ 'codex-acp': 'read-only' });
  });

  it('a runner with settings isolation also counts as "will ask"', () => {
    expect(isGuardedRuntime('claude-acp', true)).toBe(true);
  });

  it('a runner that is neither says it has no gate, never pretending there is one', () => {
    expect(isGuardedRuntime('gemini', false)).toBe(false);
    expect(isGuardedRuntime('cursor', false)).toBe(false);
  });

  it('the code that opens a session **really uses that table**', () => {
    /*
     * Checking only the table leaves a silent hole on the day nothing reads it. This
     * also checks that the session-start code calls that constant and records a
     * failure — failing silently produces a screen that claims a checkpoint that is
     * not there.
     */
    const src = readFileSync(
      join(ROOT, 'src/features/acp-session/model/use-acp-session.ts'),
      'utf8',
    );
    expect(src).toContain('GATED_SESSION_MODE');
    expect(src).toMatch(/setMode\(/);
    expect(src, 'it must not be silent when applying the mode fails').toMatch(/gate-mode-failed/);
  });

  it('a runner that promised settings isolation does not start a process after a preparation failure', () => {
    const src = readFileSync(join(ROOT, 'src-tauri/src/acp_session/mod.rs'), 'utf8');
    expect(src).toMatch(/prepare_runtime_isolation\([\s\S]*?\)\?/);
    expect(src, 'a branch remains that swallows the isolation failure and starts a non-isolated process').not.toContain(
      'isolation_failure',
    );
  });

  it('session start and the login check use the same parent-environment blocking function', () => {
    const lib = readFileSync(join(ROOT, 'src-tauri/src/acp_session/mod.rs'), 'utf8');
    const acp = readAcpRust(ROOT);
    const start = lib.slice(lib.indexOf('fn acp_start('), lib.indexOf('fn acp_permission_verdict('));
    // The login probe spawns from its own function; slice that function or the gate measures a wrapper
    // that starts no process.
    const probe = acp.slice(
      acp.indexOf('fn run_login_probe('),
      acp.indexOf('pub(crate) fn real_probe()'),
    );
    expect(probe, 'could not find where the login check starts the process').toContain('command.spawn()');

    expect(start, 'if only the real session inherits the parent environment as is, the login verdict and the run diverge').toContain(
      'apply_runtime_environment',
    );
    expect(probe, 'if only the login check inherits the parent environment as is, the ready verdict diverges from the real session').toContain(
      'apply_runtime_environment',
    );
  });

  it('the screen decides **with that function**, never rebuilding its own criterion', () => {
    const src = readFileSync(
      join(ROOT, 'src/widgets/app-settings-menu/ui/AcpRuntimeSettings.tsx'),
      'utf8',
    );
    expect(src).toContain('isGuardedRuntime');
    // The shared predicate remains the only screen-side eligibility boundary.
    expect(
      /\.filter\(\(r\) => r\.isolated\)/.test(src),
      'counting by `isolated` alone drops a runner that applies the session mode',
    ).toBe(false);
  });

  it('the applied mode is **also reflected on screen**, so the current state is never told wrongly', () => {
    /*
     * The value `session/new` returns predates the mode being applied, so the dropdown must show the
     * gated mode; users judge safety by that screen.
     */
    const src = readFileSync(
      join(ROOT, 'src/features/acp-session/model/use-acp-session.ts'),
      'utf8',
    );
    expect(
      /currentModeId: gatedMode/.test(src),
      'if the mode is applied but not reflected on screen, the dropdown keeps showing the value from before',
    ).toBe(true);
  });

  it('codex opens only when the verified read-only mode and the server write gate are both present', () => {
    expect(GATED_SESSION_MODE['codex-acp']).toBe('read-only');
    expect(isGuardedRuntime('codex-acp', false)).toBe(true);

    const registry = JSON.parse(
      readFileSync(join(ROOT, 'src-tauri/src/acp-registry.json'), 'utf8'),
    ) as { agents: Array<{ id: string; launch?: { package?: string } }> };
    // v2.6.0 src/AgentMode.ts: readOnly, on-request, no network; INITIAL_AGENT_MODE still applies.
    // The separate workspace-write mode is excluded by mode-safety.ts; MCP keeps its own gate.
    expect(registry.agents.find((agent) => agent.id === 'codex-acp')?.launch?.package).toBe(
      '@agentclientprotocol/codex-acp@2.6.0',
    );
    expect(readFileSync(join(ROOT, 'mcp/src/server/write-consent.mjs'), 'utf8')).toContain(
      'codex_approval_kind',
    );
  });
});
