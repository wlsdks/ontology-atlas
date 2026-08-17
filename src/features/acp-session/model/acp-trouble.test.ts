import { describe, expect, it } from 'vitest';

import { isDiagnosticStderr, readAcpTrouble } from './acp-trouble';

/**
 * 실측 문자열로만 검사한다 — 지어낸 오류로 맞춰 놓으면 진짜 오류가 왔을 때
 * 못 알아본다.
 */
describe('오류 옮기기 — 아는 것만 옮기고 모르면 원문을 접어 둔다', () => {
  it('로그인이 풀린 것을 알아본다 (2026-08-16 실측 그대로)', () => {
    const raw =
      '{"code":-32603,"message":"Internal error: Failed to authenticate: OAuth session expired and could not be refreshed","data":{"errorKind":"authentication_failed"}}';
    expect(readAcpTrouble(raw).kind).toBe('auth');
    // 원문은 버리지 않는다 — 접어 두었다가 「자세히」에서 보여 준다.
    expect(readAcpTrouble(raw).detail).toContain('authentication_failed');
  });

  it('다른 도구의 다른 문장도 같은 갈래로 읽는다', () => {
    expect(readAcpTrouble('Authentication required').kind).toBe('auth');
    expect(readAcpTrouble('Error: unauthorized (401)').kind).toBe('auth');
  });

  it('우리가 건 상한에 걸린 것', () => {
    expect(readAcpTrouble('acp-timeout: initialize').kind).toBe('timeout');
  });

  it('띄우지도 못한 것', () => {
    expect(readAcpTrouble('spawn npx ENOENT').kind).toBe('launch');
    expect(readAcpTrouble('cli-missing:claude').kind).toBe('launch');
  });

  it('밖으로 못 나간 것', () => {
    expect(readAcpTrouble('FetchError: getaddrinfo ENOTFOUND api.example').kind).toBe('network');
  });

  it('못 알아본 것은 **지어내지 않는다**', () => {
    const raw = 'Error: something we have never seen';
    expect(readAcpTrouble(raw)).toEqual({ kind: 'unknown', detail: raw });
  });

  it('인증 문제에 다른 낱말이 섞여 와도 인증으로 읽는다 — 할 일이 그쪽이다', () => {
    expect(readAcpTrouble('network error: oauth token refresh failed').kind).toBe('auth');
  });
});

describe('진단 줄 고르기 — 늘 나오는 것은 진단이 아니다', () => {
  it('npm 경고는 담지 않는다 (소유자가 화면에서 처음 본 그것)', () => {
    expect(
      isDiagnosticStderr(
        'npm warn Unknown env config "_jsr-registry". This will stop working in the next major version of npm.',
      ),
    ).toBe(false);
    expect(isDiagnosticStderr('npm notice New minor version available')).toBe(false);
  });

  it('설치 진행률·빈 줄도 담지 않는다', () => {
    expect(isDiagnosticStderr('')).toBe(false);
    expect(isDiagnosticStderr('   ')).toBe(false);
    expect(isDiagnosticStderr('... 42%')).toBe(false);
  });

  it('진짜 단서는 담는다', () => {
    expect(isDiagnosticStderr('Authentication required')).toBe(true);
    expect(isDiagnosticStderr('Error: Cannot find module @agentclientprotocol/x')).toBe(true);
  });
});
