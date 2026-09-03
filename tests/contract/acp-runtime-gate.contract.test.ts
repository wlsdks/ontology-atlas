import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  GATED_SESSION_MODE,
  isGuardedRuntime,
} from '@/features/acp-session/model/runtime-gate';

/**
 * **A runtime the screen says will ask must actually have a checkpoint in place.**
 *
 * **Why this gate exists (measured 2026-08-16).** Only after measuring did it
 * emerge that each tool establishes the checkpoint differently:
 *
 * | | Claude | Codex |
 * |---|---|---|
 * | config isolation | works | provides credentials/sandbox floor; approval policy is overridden |
 * | session mode | has no "read only" | exact 1.6.2 `read-only` gates direct files |
 * | Atlas MCP writes | isolated config asks | server-owned typed checkpoint asks |
 *
 * With codex, putting `approval_policy = "untrusted"` in an isolated `CODEX_HOME`
 * still produced **a file outside the vault after zero permission requests**. Switching to
 * `read-only` blocked that direct-file path, but installed-app acceptance on 2026-08-24 proved
 * that a self-registered Atlas `add_relation` still executed with **zero**
 * `session/request_permission` requests and changed the vault immediately. Installed acceptance on
 * 2026-09-03 then found 1.8.0 mapping that mode to `workspaceWrite`; the exact 1.6.2 pin, forced
 * mode, and server-owned checkpoint passed reject, allow-once, and fresh-request probes together.
 *
 * So the danger is **the two sides diverging**: the screen says this tool will ask
 * while the session does not set that mode, or the mode is set and the screen does
 * not say so. The user can detect neither — no error is raised.
 */

const ROOT = join(import.meta.dirname, '..', '..');

describe('관문 — 말하는 것과 거는 것이 같아야 한다', () => {
  it('검증된 Codex 어댑터에만 읽기 전용 모드를 강제한다', () => {
    expect(GATED_SESSION_MODE).toEqual({ 'codex-acp': 'read-only' });
  });

  it('설정 격리가 되는 실행기도 「물어봐 준다」로 센다', () => {
    expect(isGuardedRuntime('claude-acp', true)).toBe(true);
  });

  it('둘 다 아닌 실행기는 관문이 없다고 말한다 — 없는 것을 있는 척하지 않는다', () => {
    expect(isGuardedRuntime('gemini', false)).toBe(false);
    expect(isGuardedRuntime('cursor', false)).toBe(false);
  });

  it('세션을 여는 코드가 **그 표를 실제로 쓴다**', () => {
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
    expect(src, '모드 걸기가 실패해도 조용하면 안 된다').toMatch(/gate-mode-failed/);
  });

  it('설정 격리를 약속한 실행기는 준비 실패 뒤에 프로세스를 띄우지 않는다', () => {
    const src = readFileSync(join(ROOT, 'src-tauri/src/lib.rs'), 'utf8');
    expect(src).toMatch(/prepare_runtime_isolation\([\s\S]*?\)\?/);
    expect(src, '격리 실패를 삼키고 비격리 프로세스를 띄우는 갈래가 남아 있다').not.toContain(
      'isolation_failure',
    );
  });

  it('세션 시작과 로그인 확인은 같은 부모 환경 차단 함수를 쓴다', () => {
    const lib = readFileSync(join(ROOT, 'src-tauri/src/lib.rs'), 'utf8');
    const acp = readFileSync(join(ROOT, 'src-tauri/src/acp.rs'), 'utf8');
    const start = lib.slice(lib.indexOf('fn acp_start('), lib.indexOf('fn acp_permission_verdict('));
    const probe = acp.slice(
      acp.indexOf('pub(crate) fn real_probe()'),
      acp.indexOf('const LOGIN_PROBE_TIMEOUT'),
    );

    expect(start, '실제 세션만 부모 환경을 그대로 받으면 로그인 판정과 실행이 갈라진다').toContain(
      'apply_runtime_environment',
    );
    expect(probe, '로그인 확인만 부모 환경을 그대로 받으면 준비됨 판정이 실제 세션과 갈라진다').toContain(
      'apply_runtime_environment',
    );
  });

  it('화면이 **그 함수로** 판정한다 — 자기만의 기준을 다시 만들지 않는다', () => {
    const src = readFileSync(
      join(ROOT, 'src/widgets/app-settings-menu/ui/AcpRuntimeSettings.tsx'),
      'utf8',
    );
    expect(src).toContain('isGuardedRuntime');
    // The shared predicate remains the only screen-side eligibility boundary.
    expect(
      /\.filter\(\(r\) => r\.isolated\)/.test(src),
      '`isolated` 만 보고 세면 세션 모드로 거는 실행기가 빠진다',
    ).toBe(false);
  });

  it('건 모드를 **화면에도 반영한다** — 지금 상태를 틀리게 말하지 않는다', () => {
    /*
     * Defect caught in live verification on 2026-08-16: the session was set to
     * `read-only` while the dropdown read `Agent`. The value `session/new` returns is
     * from **before** the mode is applied, so leaving it as-is goes stale.
     *
     * That value happens to be the one deciding whether the agent asks before leaving
     * the folder, which makes it the worst place to be wrong — the user trusts or
     * distrusts safety based on that screen.
     */
    const src = readFileSync(
      join(ROOT, 'src/features/acp-session/model/use-acp-session.ts'),
      'utf8',
    );
    expect(
      /currentModeId: gatedMode/.test(src),
      '모드를 걸고 화면에 반영하지 않으면 드롭다운이 걸기 전 값을 계속 보여 준다',
    ).toBe(true);
  });

  it('codex 는 검증된 읽기 전용 모드와 서버 쓰기 관문이 함께 있을 때만 열린다', () => {
    expect(GATED_SESSION_MODE['codex-acp']).toBe('read-only');
    expect(isGuardedRuntime('codex-acp', false)).toBe(true);

    const registry = JSON.parse(
      readFileSync(join(ROOT, 'src-tauri/src/acp-registry.json'), 'utf8'),
    ) as { agents: Array<{ id: string; launch?: { package?: string } }> };
    expect(registry.agents.find((agent) => agent.id === 'codex-acp')?.launch?.package).toBe(
      '@agentclientprotocol/codex-acp@1.6.2',
    );
    expect(readFileSync(join(ROOT, 'mcp/src/write-consent.mjs'), 'utf8')).toContain(
      'codex_approval_kind',
    );
  });
});
