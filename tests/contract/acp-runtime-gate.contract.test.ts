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
 * | config isolation | works | **only the approval policy is ignored** |
 * | session mode | has no "read only" | **`read-only` works** |
 *
 * With codex, putting `approval_policy = "untrusted"` in an isolated `CODEX_HOME`
 * still produced **a file outside the vault after zero permission requests**. The
 * `model` value in the same folder was applied, so the config *is* read — only the
 * approval policy is overridden by the session mode. Switching to `read-only`
 * gave **1 permission request, no file created, and MCP tools still working**.
 *
 * So the danger is **the two sides diverging**: the screen says this tool will ask
 * while the session does not set that mode, or the mode is set and the screen does
 * not say so. The user can detect neither — no error is raised.
 */

const ROOT = join(import.meta.dirname, '..', '..');

describe('관문 — 말하는 것과 거는 것이 같아야 한다', () => {
  it('세션 모드로 거는 실행기는 화면에서도 「물어봐 준다」로 센다', () => {
    for (const runtimeId of Object.keys(GATED_SESSION_MODE)) {
      expect(
        isGuardedRuntime(runtimeId, false),
        `${runtimeId}: 모드를 거는데 화면은 관문이 없다고 말한다`,
      ).toBe(true);
    }
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
    // Judging on `isolated` alone, as before, drops codex even though it has a
    // checkpoint.
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

  it('codex 는 실측한 그 모드로 건다', () => {
    // If this value changes it must be re-measured — other modes failed to establish
    // the checkpoint (measured).
    expect(GATED_SESSION_MODE['codex-acp']).toBe('read-only');
  });
});
