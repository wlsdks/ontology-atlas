import { describe, expect, it } from 'vitest';

import { formatDownloadProgress } from './progress-format';

/**
 * **모르는 진행을 아는 척하지 않는다.**
 *
 * 이 규율의 소비처가 둘이 되면서(앱 갱신 · 에이전트 도구 설치) 함수가
 * `shared/lib` 로 내려왔다. 검사도 같이 내려온다 — 규격이 있는 곳에 검사가
 * 없으면 다음 소비처가 자기 사본을 만든다.
 */
describe('formatDownloadProgress', () => {
  it('총량을 모르면 퍼센트를 지어내지 않는다', () => {
    expect(formatDownloadProgress(1_000, null)).toBeNull();
    // 0 으로 나눈 값을 화면에 올리면 진행률이 아니라 나눗셈 사고가 그려진다.
    expect(formatDownloadProgress(1_000, 0)).toBeNull();
    expect(formatDownloadProgress(1_000, -1)).toBeNull();
  });

  it('정수 퍼센트로, 0~100 안에서만 말한다', () => {
    expect(formatDownloadProgress(0, 200)).toBe('0%');
    expect(formatDownloadProgress(50, 200)).toBe('25%');
    expect(formatDownloadProgress(200, 200)).toBe('100%');
    // 서버가 Content-Length 를 낮게 준 경우에도 101% 를 그리지 않는다.
    expect(formatDownloadProgress(400, 200)).toBe('100%');
    expect(formatDownloadProgress(-5, 200)).toBe('0%');
  });

  it('Node 배포물 크기 같은 실제 값에서도 자릿수가 안 흔들린다', () => {
    // 실측: node-v24.18.0-darwin-arm64.tar.gz 는 52,087,559B.
    expect(formatDownloadProgress(26_043_779, 52_087_559)).toBe('50%');
  });
});
