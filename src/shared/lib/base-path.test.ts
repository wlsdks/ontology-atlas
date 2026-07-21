import { describe, expect, it } from 'vitest';

import { withBasePath } from './base-path';

// NEXT_PUBLIC_BASE_PATH 는 빌드 타임 인라인이라 vitest 에서는 빈 문자열 —
// 루트 배포 계약(무프리픽스 pass-through)을 고정한다.
describe('withBasePath (root deploy)', () => {
  it('passes absolute paths through unchanged when no base path is set', () => {
    expect(withBasePath('/logo.png')).toBe('/logo.png');
    expect(withBasePath('/en/')).toBe('/en/');
  });

  it('passes relative paths through unchanged', () => {
    expect(withBasePath('docs-vault/a.md')).toBe('docs-vault/a.md');
  });
});
