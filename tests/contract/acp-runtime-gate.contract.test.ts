import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  GATED_SESSION_MODE,
  isGuardedRuntime,
} from '@/features/acp-session/model/runtime-gate';

/**
 * **화면이 「물어봐 준다」고 말하는 실행기에는 실제로 관문이 걸려야 한다.**
 *
 * ## 왜 이 게이트가 있나 (2026-08-16 실측)
 *
 * 관문을 세우는 방식이 도구마다 다르다는 것이 재 보고 나서야 드러났다:
 *
 * | | Claude | Codex |
 * |---|---|---|
 * | 설정 격리 | 먹힌다 | **승인 정책만 무시된다** |
 * | 세션 모드 | 「읽기 전용」이 없다 | **`read-only` 가 먹힌다** |
 *
 * codex 는 격리한 `CODEX_HOME` 에 `approval_policy = "untrusted"` 를 넣어도
 * **권한 요청 0회에 볼트 밖 파일이 그대로 생겼다.** 같은 폴더의 `model` 값은
 * 반영됐으니 설정을 읽기는 하는 것이고, 승인 정책만 세션 모드가 덮어쓴다.
 * `read-only` 로 바꾸니 **권한 요청 1회 · 파일 안 생김 · MCP 도구는 그대로 동작**.
 *
 * 그래서 위험은 **두 곳이 갈라지는 것**이다: 화면은 「이 도구는 물어봐 준다」고
 * 말하는데 세션은 그 모드를 안 걸거나, 반대로 모드는 거는데 화면이 말 안 하거나.
 * 둘 다 사용자가 알 방법이 없다 — 아무 에러도 안 난다.
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
     * 표만 검사하면 아무도 그것을 안 읽는 날 조용히 뚫린다. 세션 시작 코드가
     * 그 상수를 부르고, 실패하면 기록을 남기는지까지 본다 — 조용히 실패하면
     * 관문이 없는 채로 「있다」고 말하는 화면이 된다.
     */
    const src = readFileSync(
      join(ROOT, 'src/features/acp-session/model/use-acp-session.ts'),
      'utf8',
    );
    expect(src).toContain('GATED_SESSION_MODE');
    expect(src).toMatch(/setMode\(/);
    expect(src, '모드 걸기가 실패해도 조용하면 안 된다').toMatch(/gate-mode-failed/);
  });

  it('화면이 **그 함수로** 판정한다 — 자기만의 기준을 다시 만들지 않는다', () => {
    const src = readFileSync(
      join(ROOT, 'src/widgets/app-settings-menu/ui/AcpRuntimeSettings.tsx'),
      'utf8',
    );
    expect(src).toContain('isGuardedRuntime');
    // 종전처럼 `isolated` 만 보고 판정하면 codex 가 관문이 있는데도 빠진다.
    expect(
      /\.filter\(\(r\) => r\.isolated\)/.test(src),
      '`isolated` 만 보고 세면 세션 모드로 거는 실행기가 빠진다',
    ).toBe(false);
  });

  it('건 모드를 **화면에도 반영한다** — 지금 상태를 틀리게 말하지 않는다', () => {
    /*
     * 2026-08-16 실물 확인에서 잡힌 결함: 세션은 `read-only` 로 걸렸는데
     * 드롭다운은 `Agent` 라고 적혀 있었다. `session/new` 가 준 값은 **모드를
     * 걸기 전**의 것이라 그대로 두면 낡는다.
     *
     * 하필 그 값이 「폴더 밖을 물어보나」를 정하는 값이라, 가장 틀리면 안 되는
     * 자리다. 사용자는 화면을 보고 안전하다고 믿거나 반대로 의심한다.
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
    // 값이 바뀌면 다시 재야 한다 — 다른 모드는 관문을 세우지 못했다(실측).
    expect(GATED_SESSION_MODE['codex-acp']).toBe('read-only');
  });
});
