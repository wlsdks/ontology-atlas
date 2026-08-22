import { describe, expect, it } from 'vitest';

import { permissionScope } from './permission-scope';

/**
 * The card must state exactly **what "always allow" allows.**
 *
 * ## Why (2026-08-17)
 *
 * The card's third button **asserted** *"allow the entire folder containing the path above for this
 * whole conversation"*. But the adapter, not us, decides that scope, and it states it through
 * `_meta.permission.changes[].targets[]` — measured, that value was **a tool, not a folder**
 * (`{ type: 'tool', toolName: 'mcp__atlas-vault__add_concept' }`).
 *
 * Writing "allow the folder" while actually allowing a tool leaves the user believing **they granted
 * a permission they never gave, or the reverse.** That is the screen lying at the most expensive decision.
 *
 * So it **states only what the adapter declared.** Given nothing, it asserts nothing.
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
    // Without this case, deleting the "never swallow silently" rule would go unnoticed (with only
    // unknowns present the result is empty either way — verified with a probe). Swallowing lets
    // something alongside be allowed while the card says "only this tool".
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
