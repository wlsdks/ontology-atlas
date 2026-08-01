import { describe, expect, it } from 'vitest';
import { diffVaultManifest, planVaultDiffToasts } from './diff-manifest';

describe('diffVaultManifest', () => {
  it('첫 mount 와 동일 → added/modified 모두 빈 배열', () => {
    const prev = new Map<string, number | null>([
      ['capabilities/foo', 1000],
      ['domains/bar', 2000],
    ]);
    const current = new Map(prev);
    expect(diffVaultManifest(prev, current)).toEqual({
      added: [],
      modified: [],
    });
  });

  it('prev 에 없는 slug → added', () => {
    const prev = new Map<string, number | null>([['capabilities/foo', 1000]]);
    const current = new Map<string, number | null>([
      ['capabilities/foo', 1000],
      ['capabilities/baz', 3000],
    ]);
    const result = diffVaultManifest(prev, current);
    expect(result.added).toEqual(['capabilities/baz']);
    expect(result.modified).toEqual([]);
  });

  it('mtime 증가 → modified', () => {
    const prev = new Map<string, number | null>([
      ['capabilities/foo', 1000],
    ]);
    const current = new Map<string, number | null>([
      ['capabilities/foo', 1500],
    ]);
    const result = diffVaultManifest(prev, current);
    expect(result.added).toEqual([]);
    expect(result.modified).toEqual(['capabilities/foo']);
  });

  it('mtime 감소 / 동일 → modified 아님 (단조 증가만 인지)', () => {
    const prev = new Map<string, number | null>([
      ['capabilities/foo', 2000],
      ['capabilities/bar', 1000],
    ]);
    const current = new Map<string, number | null>([
      ['capabilities/foo', 2000], // 동일
      ['capabilities/bar', 500], // 감소 (외부 git pull 등)
    ]);
    expect(diffVaultManifest(prev, current).modified).toEqual([]);
  });

  it('prev mtime null → modified 비교 skip (static manifest)', () => {
    const prev = new Map<string, number | null>([
      ['capabilities/foo', null],
    ]);
    const current = new Map<string, number | null>([
      ['capabilities/foo', 5000],
    ]);
    expect(diffVaultManifest(prev, current).modified).toEqual([]);
  });

  it('current mtime null → modified 비교 skip', () => {
    const prev = new Map<string, number | null>([
      ['capabilities/foo', 1000],
    ]);
    const current = new Map<string, number | null>([
      ['capabilities/foo', null],
    ]);
    expect(diffVaultManifest(prev, current).modified).toEqual([]);
  });

  it('added + modified 동시 — 분리해서 반환', () => {
    const prev = new Map<string, number | null>([
      ['capabilities/foo', 1000],
      ['capabilities/bar', 2000],
    ]);
    const current = new Map<string, number | null>([
      ['capabilities/foo', 1500], // modified
      ['capabilities/bar', 2000], // 그대로
      ['capabilities/baz', 3000], // added
      ['domains/qux', 4000], // added
    ]);
    const result = diffVaultManifest(prev, current);
    expect(result.added.sort()).toEqual([
      'capabilities/baz',
      'domains/qux',
    ]);
    expect(result.modified).toEqual(['capabilities/foo']);
  });

  it('removed slug 는 의도적으로 무시', () => {
    const prev = new Map<string, number | null>([
      ['capabilities/foo', 1000],
      ['capabilities/bar', 2000],
    ]);
    const current = new Map<string, number | null>([
      ['capabilities/foo', 1000],
    ]);
    const result = diffVaultManifest(prev, current);
    expect(result.added).toEqual([]);
    expect(result.modified).toEqual([]);
  });

  it('빈 prev (첫 polling 후 두 번째) → 모든 current 는 already-known, added 0', () => {
    // 실제 사용처는 첫 mount baseline 후 호출. 빈 prev 는 이론 케이스지만
    // 모든 slug 가 added 로 분류되는지 명세 — caller 가 baseline 보호.
    const prev = new Map<string, number | null>();
    const current = new Map<string, number | null>([
      ['capabilities/foo', 1000],
    ]);
    expect(diffVaultManifest(prev, current).added).toEqual([
      'capabilities/foo',
    ]);
  });
});

describe('planVaultDiffToasts', () => {
  it('변화가 없으면 toast 계획도 비어 있다', () => {
    expect(planVaultDiffToasts({ added: [], modified: [] })).toEqual([]);
  });

  // N10 — 문구는 더 이상 여기서 완성 문자열로 만들지 않는다(영문 하드코딩
  // "Added: <slug>" ko 리터럴 새는 것 방지). kind/slug/count 만 반환하고,
  // 실제 로케일 문구 조립은 `VaultDiffToaster` 가 `useTranslations` 로 한다.
  it('added 와 modified 를 kind/slug + variant 구조로 변환한다', () => {
    expect(
      planVaultDiffToasts({
        added: ['capabilities/new'],
        modified: ['domains/existing'],
      }),
    ).toEqual([
      { kind: 'added', slug: 'capabilities/new', variant: 'info' },
      { kind: 'edited', slug: 'domains/existing', variant: 'success' },
    ]);
  });

  /**
   * **부채꼴은 폐기됐다** (2026-08-01). 종전엔 앞 3개를 슬러그로 내고 나머지를
   * `+N개 더` 라는 별도 토스트로 냈는데, 토스트는 각자 만료하므로 앞의 것이
   * 먼저 사라지면 **참조 대상을 잃은 숫자만 남았다** — 소유자가 화면에서 그
   * 상태를 잡았다(「+4개 더」 한 장). 34개 쓰기면 잔해가 「+31개 더」다.
   */
  it('preview 를 넘으면 한 장으로 접고, 합계가 아니라 세 갈래로 센다', () => {
    expect(
      planVaultDiffToasts({ added: ['a', 'b'], modified: ['c', 'd'] }, 3),
    ).toEqual([
      { kind: 'digest', counts: { added: 2, modified: 2, removed: 0 }, variant: 'info' },
    ]);
  });

  it('삭제가 섞이면 개수가 작아도 다이제스트로 간다 — 지워진 슬러그는 열 수 없다', () => {
    expect(planVaultDiffToasts({ added: ['a'], modified: [], removed: 1 }, 3)).toEqual([
      { kind: 'digest', counts: { added: 1, modified: 0, removed: 1 }, variant: 'info' },
    ]);
  });

  it('삭제만 있어도 보고한다 — 종전엔 이 버스트가 통째로 침묵했다', () => {
    expect(planVaultDiffToasts({ added: [], modified: [], removed: 3 })).toEqual([
      { kind: 'digest', counts: { added: 0, modified: 0, removed: 3 }, variant: 'info' },
    ]);
  });

  it('preview limit 0 이면 한 건이라도 다이제스트로 접는다', () => {
    expect(planVaultDiffToasts({ added: ['a'], modified: ['b'] }, 0)).toEqual([
      { kind: 'digest', counts: { added: 1, modified: 1, removed: 0 }, variant: 'info' },
    ]);
  });
});
