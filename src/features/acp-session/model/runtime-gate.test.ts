import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { McpServerLaunch } from '@/shared/config';

import { GATED_SESSION_MODE, isGuardedRuntime, runtimeOwnsWriteGate } from './runtime-gate';
import { vaultMcpServers } from './vault-mcp-server';

const LAUNCH = {
  kind: 'app-bundled',
  command: '/Applications/Atlas.app/ontology-atlas-mcp',
  args: [],
} as const satisfies McpServerLaunch;
const VAULT = '/Users/someone/vault';

function envOf(servers: ReturnType<typeof vaultMcpServers>) {
  return Object.fromEntries((servers[0]?.env ?? []).map((e) => [e.name, e.value]));
}

/**
 * The rule these tests hold: **one session, one checkpoint, held by whoever can
 * actually hold it.** A runtime whose own isolated configuration produces the
 * permission request keeps the gate; every other runtime — including one nobody has
 * measured yet — gets the server-side gate instead, because the measured failure was
 * an Atlas MCP write reaching disk with no request at all.
 */
describe('who holds the write checkpoint', () => {
  it('hands the gate to a runtime whose own config already asks', () => {
    expect(runtimeOwnsWriteGate('claude-acp')).toBe(true);
  });

  it('keeps the gate on the server for a runtime whose config does not ask', () => {
    // Measured 2026-08-24: Codex `read-only` blocked direct file writes while an
    // Atlas MCP write went through with no permission request.
    expect(runtimeOwnsWriteGate('codex-acp')).toBe(false);
  });

  it('defaults an unmeasured runtime to the server gate, not to trust', () => {
    expect(runtimeOwnsWriteGate('some-new-agent')).toBe(false);
    expect(runtimeOwnsWriteGate(null)).toBe(false);
    expect(runtimeOwnsWriteGate(undefined)).toBe(false);
  });

  it('does not double-prompt the runtime that already asks', () => {
    const env = envOf(vaultMcpServers(LAUNCH, VAULT, null, { ownsWriteGate: true }));
    expect(env.OATLAS_VAULT).toBe(VAULT);
    expect(env.OATLAS_WRITE_CONSENT).toBeUndefined();
  });

  it('turns the server gate on for everyone else', () => {
    const env = envOf(vaultMcpServers(LAUNCH, VAULT, null, { ownsWriteGate: false }));
    expect(env.OATLAS_WRITE_CONSENT).toBe('on');
  });

  it('turns the server gate on when the caller says nothing', () => {
    const env = envOf(vaultMcpServers(LAUNCH, VAULT));
    expect(env.OATLAS_WRITE_CONSENT).toBe('on');
  });

  /**
   * ⚠️ **Isolation and gate ownership are not the same claim**, and conflating them is
   * how 2026-08-24 happened. Rust's `ISOLATION` says only "the app can control this
   * runtime's config directory". Owning the gate is the stronger claim that the
   * resulting configuration actually produces a permission request *for MCP writes* —
   * measured true for Claude, measured **false** for Codex, whose isolated
   * `CODEX_HOME` was read (the `model` value applied) while the approval policy was
   * overridden and an Atlas write landed unasked.
   *
   * So the invariant is one-directional: a runtime may be isolated without owning the
   * gate, but it must never own the gate without being isolated — that would hand the
   * checkpoint to a configuration the app cannot control.
   */
  it('never claims gate ownership for a runtime the app does not isolate', () => {
    const rust = readFileSync(join(process.cwd(), 'src-tauri/src/acp.rs'), 'utf8');
    const block = rust.slice(rust.indexOf('ISOLATION: &[IsolationSpec]'));
    const isolated = [...block.slice(0, block.indexOf('];')).matchAll(/id:\s*"([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(isolated.length, 'the Rust isolation table must not be empty').toBeGreaterThan(0);
    for (const id of [...isolated, 'codex-acp', 'amp-acp', 'unknown-agent']) {
      if (runtimeOwnsWriteGate(id)) {
        expect(isolated, `${id} owns the gate but Rust does not isolate it`).toContain(id);
      }
    }
  });

  it('still reports a guarded runtime the same way', () => {
    expect(isGuardedRuntime('claude-acp', true)).toBe(true);
    expect(isGuardedRuntime('anything', false)).toBe(false);
  });

  it('forces Codex onto the adapter version whose read-only mode is an actual read-only sandbox', () => {
    expect(GATED_SESSION_MODE).toEqual({ 'codex-acp': 'read-only' });
  });
});
