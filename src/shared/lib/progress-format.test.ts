import { describe, expect, it } from 'vitest';

import { formatDownloadProgress } from './progress-format';

/**
 * **Never pretend to know progress you do not know.**
 *
 * The function moved down to `shared/lib` once this rule had two consumers (app
 * updates and agent-tool installation). The test moves with it — where a spec
 * has no check, the next consumer writes its own copy.
 */
describe('formatDownloadProgress', () => {
  it('총량을 모르면 퍼센트를 지어내지 않는다', () => {
    expect(formatDownloadProgress(1_000, null)).toBeNull();
    // Putting a division by zero on screen draws an arithmetic accident, not progress.
    expect(formatDownloadProgress(1_000, 0)).toBeNull();
    expect(formatDownloadProgress(1_000, -1)).toBeNull();
  });

  it('정수 퍼센트로, 0~100 안에서만 말한다', () => {
    expect(formatDownloadProgress(0, 200)).toBe('0%');
    expect(formatDownloadProgress(50, 200)).toBe('25%');
    expect(formatDownloadProgress(200, 200)).toBe('100%');
    // Never draw 101%, even when the server under-reports Content-Length.
    expect(formatDownloadProgress(400, 200)).toBe('100%');
    expect(formatDownloadProgress(-5, 200)).toBe('0%');
  });

  it('Node 배포물 크기 같은 실제 값에서도 자릿수가 안 흔들린다', () => {
    // Measured: node-v24.18.0-darwin-arm64.tar.gz is 52,087,559B.
    expect(formatDownloadProgress(26_043_779, 52_087_559)).toBe('50%');
  });
});
