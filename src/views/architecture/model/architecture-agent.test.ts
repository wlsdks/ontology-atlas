import { describe, expect, it } from 'vitest';

import type { AcpRuntimeStatus } from '@/shared/lib/tauri-acp';
import {
  resolveArchitectureAgentRoute,
  selectArchitectureAgentRuntimes,
} from './architecture-agent';

function runtime(over: Partial<AcpRuntimeStatus> = {}): AcpRuntimeStatus {
  return {
    id: 'claude-acp',
    label: 'Claude Code',
    description: 'Guarded ACP runtime',
    website: null,
    license: null,
    verified: true,
    icon: null,
    brandInk: null,
    launchKind: 'binary',
    state: 'ready',
    cliPath: '/bin/claude',
    adapterPath: '/bin/claude-acp',
    adapterPackage: null,
    isolated: true,
    ...over,
  };
}

describe('Architecture guarded ACP admission', () => {
  it('admits only verified, ready runtimes with a measured write checkpoint', () => {
    expect(
      selectArchitectureAgentRuntimes([
        runtime(),
        runtime({ id: 'unverified', verified: false }),
        runtime({ id: 'login', state: 'login-needed' }),
        runtime({ id: 'unguarded', isolated: false }),
      ]),
    ).toEqual([{ id: 'claude-acp', label: 'Claude Code' }]);
  });

  /*
   * Owner report, 2026-09-05: under a load average around 10 the sign-in probe failed and both
   * runtimes left the picker, while `claude auth status` and `codex login status` exited 0 from a
   * shell moments later. A failed check is not a measured refusal, and shutting the door on it
   * strands someone whose tool works.
   */
  it('keeps a runtime whose sign-in check failed, and still refuses a measured sign-out', () => {
    expect(
      selectArchitectureAgentRuntimes([
        runtime({ id: 'claude-acp', state: 'login-unknown' }),
        runtime({ id: 'codex-acp', label: 'Codex', state: 'login-needed', isolated: false }),
      ]),
    ).toEqual([{ id: 'claude-acp', label: 'Claude Code' }]);
  });

  it('degrades a browser to clipboard and holds an incomplete desktop probe', () => {
    expect(
      resolveArchitectureAgentRoute({
        bridgeAvailable: false,
        runtimeCheckComplete: true,
        serverCheckComplete: true,
        runtime: null,
        vaultRoot: null,
        serverReady: false,
      }),
    ).toBe('clipboard');
    expect(
      resolveArchitectureAgentRoute({
        bridgeAvailable: true,
        runtimeCheckComplete: false,
        serverCheckComplete: false,
        runtime: null,
        vaultRoot: null,
        serverReady: false,
      }),
    ).toBe('checking');
  });

  it('opens in-tab chat only when runtime, vault, and MCP launch are all ready', () => {
    const admitted = { id: 'claude-acp', label: 'Claude Code' };
    expect(
      resolveArchitectureAgentRoute({
        bridgeAvailable: true,
        runtimeCheckComplete: true,
        serverCheckComplete: true,
        runtime: admitted,
        vaultRoot: '/repo/atlas',
        serverReady: true,
      }),
    ).toBe('agent');
    expect(
      resolveArchitectureAgentRoute({
        bridgeAvailable: true,
        runtimeCheckComplete: true,
        serverCheckComplete: true,
        runtime: admitted,
        vaultRoot: '/repo/atlas',
        serverReady: false,
      }),
    ).toBe('clipboard');
  });

  it('waits for the bundled server probe, then degrades instead of spinning forever', () => {
    const admitted = { id: 'claude-acp', label: 'Claude Code' };
    expect(
      resolveArchitectureAgentRoute({
        bridgeAvailable: true,
        runtimeCheckComplete: true,
        serverCheckComplete: false,
        runtime: admitted,
        vaultRoot: '/repo/atlas',
        serverReady: false,
      }),
    ).toBe('checking');
    expect(
      resolveArchitectureAgentRoute({
        bridgeAvailable: true,
        runtimeCheckComplete: true,
        serverCheckComplete: true,
        runtime: admitted,
        vaultRoot: '/repo/atlas',
        serverReady: false,
      }),
    ).toBe('clipboard');
  });
});
