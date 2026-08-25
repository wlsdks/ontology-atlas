import { describe, expect, it } from 'vitest';

import { permissionLocality } from './permission-locality';

/**
 * Measured in the installed app, 2026-08-25: right after pressing 「make a map from my code」, the
 * card warned that the agent wanted to touch something **outside this folder** — which was the
 * person's own project, the thing they had just asked for. Since maps live inside projects, that
 * warning now fires on the intended path, and a warning that cries wolf teaches people to click
 * through it.
 */
describe('권한 요청의 위치 — 내 프로젝트 안인가, 전혀 다른 곳인가', () => {
  const VAULT = '/Users/dana/my-product/atlas';

  it('내 프로젝트 안의 코드는 「밖」이 아니라 「내 프로젝트」다', () => {
    expect(permissionLocality(VAULT, '/Users/dana/my-product/src/orders.ts')).toBe('inside-project');
    expect(permissionLocality(VAULT, '/Users/dana/my-product')).toBe('inside-project');
  });

  it('정말 다른 곳은 그대로 「밖」이다 — 경고가 필요한 쪽', () => {
    expect(permissionLocality(VAULT, '/Users/dana/.ssh/id_rsa')).toBe('elsewhere');
    expect(permissionLocality(VAULT, '/etc/hosts')).toBe('elsewhere');
  });

  it('이름이 비슷한 이웃은 안이 아니다', () => {
    expect(permissionLocality(VAULT, '/Users/dana/my-product-archive/x.ts')).toBe('elsewhere');
  });

  it('프로젝트 안에 있는 금고가 아니면 예전 읽기가 유일하게 참이다', () => {
    expect(permissionLocality('/Users/dana/notes', '/Users/dana/notes/../x')).toBe('elsewhere');
    expect(permissionLocality(null, '/anything')).toBe('elsewhere');
    expect(permissionLocality(VAULT, null)).toBe('elsewhere');
  });
});
