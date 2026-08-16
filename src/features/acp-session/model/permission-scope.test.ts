import { describe, expect, it } from 'vitest';

import { permissionScope } from './permission-scope';

/**
 * 「계속 허용」이 **무엇을 허용하는지** 카드가 정확히 말해야 한다.
 *
 * ## 왜 (2026-08-17)
 *
 * 카드의 셋째 버튼이 *"위 경로가 있는 폴더 전체를 이번 대화 내내 허용"* 이라고
 * **단정**하고 있었다. 그런데 그 범위를 정하는 것은 우리가 아니라 어댑터이고,
 * 어댑터는 `_meta.permission.changes[].targets[]` 로 그것을 말해 준다 —
 * 실측에서 그 값은 **폴더가 아니라 도구**였다
 * (`{ type: 'tool', toolName: 'mcp__atlas-vault__add_concept' }`).
 *
 * 폴더를 허용한다고 적어 놓고 실제로는 도구를 허용하면, 사용자는 **자기가 준
 * 적 없는 권한을 준 줄 알거나 그 반대로 안다.** 가장 값비싼 결정에서 화면이
 * 틀린 말을 하는 것이다.
 *
 * 그래서 **어댑터가 선언한 것만 말한다.** 아무것도 안 주면 아무것도 단정하지
 * 않는다.
 */

const withTargets = (targets: unknown[]) => [
  { optionId: 'reject', kind: 'reject_once' },
  { optionId: 'allow', kind: 'allow_once' },
  {
    optionId: 'always',
    kind: 'allow_always',
    _meta: { permission: { changes: [{ targets }] } },
  },
];

describe('계속 허용의 범위 — 어댑터가 말한 것만 말한다', () => {
  it('도구 단위 허용이면 그 도구 이름을 준다 (실측 모양)', () => {
    const scope = permissionScope(
      withTargets([{ type: 'tool', toolName: 'mcp__atlas-vault__add_concept' }]),
    );
    expect(scope.kind).toBe('tool');
    expect(scope.names).toEqual(['mcp__atlas-vault__add_concept']);
  });

  it('폴더 단위 허용이면 그 폴더를 준다', () => {
    const scope = permissionScope(
      withTargets([{ type: 'directory', path: '/Users/me/work' }]),
    );
    expect(scope.kind).toBe('directory');
    expect(scope.names).toEqual(['/Users/me/work']);
  });

  it('여러 개면 전부 준다 — 하나만 보여 주면 나머지는 몰래 허용된다', () => {
    const scope = permissionScope(
      withTargets([
        { type: 'tool', toolName: 'a' },
        { type: 'tool', toolName: 'b' },
      ]),
    );
    expect(scope.names).toEqual(['a', 'b']);
  });

  it('종류가 섞이면 **모른다고 한다** — 한 문장으로 정직하게 못 적는다', () => {
    const scope = permissionScope(
      withTargets([
        { type: 'tool', toolName: 'a' },
        { type: 'directory', path: '/x' },
      ]),
    );
    expect(scope.kind).toBe('unknown');
  });

  it('어댑터가 아무것도 안 주면 아무것도 단정하지 않는다', () => {
    expect(permissionScope(withTargets([])).kind).toBe('unknown');
    expect(
      permissionScope([{ optionId: 'always', kind: 'allow_always' }]).kind,
    ).toBe('unknown');
    expect(permissionScope([]).kind).toBe('unknown');
  });

  it('모르는 종류는 조용히 삼키지 않는다 — 모른다고 한다', () => {
    const scope = permissionScope(withTargets([{ type: 'something-new', id: 'x' }]));
    expect(scope.kind).toBe('unknown');
  });

  it('아는 것 **옆에** 모르는 것이 있어도 모른다고 한다', () => {
    // 이 사례가 없으면 「조용히 삼키지 않는다」 규칙을 지워도 아무도 모른다
    // (모르는 것만 있을 때는 어차피 빈손이라 결과가 같다 — 프로브로 확인함).
    // 삼키면 카드가 「이 도구만 허용」이라고 말하는 동안 그 옆의 것도 같이
    // 허용된다.
    const scope = permissionScope(
      withTargets([
        { type: 'tool', toolName: 'mcp__atlas-vault__add_concept' },
        { type: 'something-new', id: 'x' },
      ]),
    );
    expect(scope.kind).toBe('unknown');
  });

  it('「계속 허용」이 아닌 선택지의 `_meta` 는 안 본다', () => {
    const scope = permissionScope([
      {
        optionId: 'allow',
        kind: 'allow_once',
        _meta: { permission: { changes: [{ targets: [{ type: 'directory', path: '/x' }] }] } },
      },
    ]);
    expect(scope.kind).toBe('unknown');
  });

  it('모양이 깨져도 죽지 않는다 — 권한 카드가 안 뜨면 대화가 멈춘다', () => {
    expect(permissionScope(null as never).kind).toBe('unknown');
    expect(permissionScope([null, 'x', 7] as never).kind).toBe('unknown');
  });
});
