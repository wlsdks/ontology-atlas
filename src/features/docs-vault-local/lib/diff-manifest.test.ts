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

  it('preview limit 안에서는 added 를 먼저 보여주고 남은 칸에 modified 를 보여준다', () => {
    expect(
      planVaultDiffToasts(
        {
          added: ['a', 'b'],
          modified: ['c', 'd'],
        },
        3,
      ),
    ).toEqual([
      { kind: 'added', slug: 'a', variant: 'info' },
      { kind: 'added', slug: 'b', variant: 'info' },
      { kind: 'edited', slug: 'c', variant: 'success' },
      { kind: 'overflow', count: 1, variant: 'info' },
    ]);
  });

  it('added 만으로 preview 가 차면 modified 는 overflow 로만 집계한다', () => {
    expect(
      planVaultDiffToasts(
        {
          added: ['a', 'b', 'c', 'd'],
          modified: ['e'],
        },
        3,
      ),
    ).toEqual([
      { kind: 'added', slug: 'a', variant: 'info' },
      { kind: 'added', slug: 'b', variant: 'info' },
      { kind: 'added', slug: 'c', variant: 'info' },
      { kind: 'overflow', count: 2, variant: 'info' },
    ]);
  });

  it('preview limit 0 은 개별 항목 없이 전체 overflow 만 보여준다', () => {
    expect(
      planVaultDiffToasts(
        {
          added: ['a'],
          modified: ['b'],
        },
        0,
      ),
    ).toEqual([{ kind: 'overflow', count: 2, variant: 'info' }]);
  });
});
