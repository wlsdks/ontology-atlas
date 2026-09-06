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

  /**
   * 2026-09-06: the card headed a write to a file **inside the opened folder** with "it wants to
   * touch something outside this folder", because locality was measured only against the project
   * above the vault. A folder that is not one of ours has no project above it, so every request in
   * it answered `elsewhere` — the folder named as outside itself.
   */
  it('연 폴더 안은 프로젝트가 위에 없어도 「안」이다', () => {
    expect(permissionLocality(VAULT, `${VAULT}/domains/order.md`)).toBe('inside-folder');
    expect(permissionLocality('/Users/dana/notes', '/Users/dana/notes/order.md')).toBe(
      'inside-folder',
    );
    expect(permissionLocality('/Users/dana/notes/', '/Users/dana/notes')).toBe('inside-folder');
  });

  it('폴더 이름이 접두사로 겹치는 이웃은 여전히 밖이다', () => {
    expect(permissionLocality('/Users/dana/notes', '/Users/dana/notes-old/x.md')).toBe('elsewhere');
  });

  it('풀 수 없는 경로는 경고를 유지한다 — 틀려도 안전한 방향', () => {
    expect(permissionLocality(VAULT, `${VAULT}/../../.ssh/id_rsa`)).toBe('elsewhere');
  });
});
