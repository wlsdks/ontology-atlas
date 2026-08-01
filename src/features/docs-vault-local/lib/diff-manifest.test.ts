import { describe, expect, it } from 'vitest';
import {
  diffVaultManifest,
  planVaultDiffToasts,
  toVaultDiffNode,
  type VaultDiffNode,
} from './diff-manifest';

/** 테스트용 축약 — 이름만 주고 종류는 선택. */
function node(name: string, kind?: string, slug = `capabilities/${name}`): VaultDiffNode {
  return { slug, kind, name };
}

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

/**
 * **슬러그는 화면에 나가지 않는다** (2026-08-01 소유자 지시). 이 describe 가
 * 그 계약이다 — 되돌리면 여기서 걸린다.
 */
describe('toVaultDiffNode', () => {
  it('display_<locale> 이 있으면 그 이름을 쓴다 — 폴더 경로도 슬러그도 아니다', () => {
    const result = toVaultDiffNode(
      {
        slug: 'capabilities/payment-authorization',
        title: 'Payment authorization',
        frontmatter: {
          kind: 'capability',
          display_ko: '결제 승인',
          display_en: 'Payment authorization',
        },
      },
      'ko',
    );
    expect(result).toEqual({
      slug: 'capabilities/payment-authorization',
      kind: 'capability',
      name: '결제 승인',
    });
    expect(result.name).not.toContain('/');
    expect(result.name).not.toContain('payment-authorization');
  });

  it('display_<locale> 이 없으면 title — 그래도 슬러그는 안 쓴다', () => {
    expect(
      toVaultDiffNode(
        {
          slug: 'domains/refunds',
          title: '환불',
          frontmatter: { kind: 'domain' },
        },
        'ko',
      ).name,
    ).toBe('환불');
  });

  it('최후 수단이라도 폴더 경로는 붙지 않는다 — 슬러그의 마지막 조각만', () => {
    // title 도 display_* 도 없는 손편집 .md. 이름을 지어낼 수는 없지만
    // `capabilities/` 라는 개발자 폴더 이름은 어떤 경우에도 화면에 안 나간다.
    const result = toVaultDiffNode({ slug: 'capabilities/orphan' }, 'ko');
    expect(result.name).toBe('orphan');
    expect(result.name).not.toContain('/');
  });

  it('frontmatter 에 kind 가 없으면 undefined — 지어내지 않는다', () => {
    expect(toVaultDiffNode({ slug: 'notes/memo', title: '메모' }, 'ko').kind).toBeUndefined();
    expect(
      toVaultDiffNode({ slug: 'notes/memo', title: '메모', frontmatter: { kind: '  ' } }, 'ko').kind,
    ).toBeUndefined();
  });
});

describe('planVaultDiffToasts', () => {
  it('변화가 없으면 toast 계획도 비어 있다', () => {
    expect(planVaultDiffToasts({ added: [], modified: [] })).toEqual([]);
  });

  // N10 — 문구는 더 이상 여기서 완성 문자열로 만들지 않는다(영문 하드코딩
  // "Added: <slug>" ko 리터럴 새는 것 방지). 구조만 반환하고,
  // 실제 로케일 문구 조립은 `VaultDiffToaster` 가 `useTranslations` 로 한다.
  it('added 와 modified 를 노드 + variant 구조로 변환한다', () => {
    const added = node('new', 'capability');
    const modified = node('existing', 'domain', 'domains/existing');
    expect(planVaultDiffToasts({ added: [added], modified: [modified] })).toEqual([
      { kind: 'added', node: added, variant: 'info' },
      { kind: 'edited', node: modified, variant: 'success' },
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
      planVaultDiffToasts(
        {
          added: [node('a', 'capability'), node('b', 'capability')],
          modified: [node('c', 'domain'), node('d', 'domain')],
        },
        3,
      ),
    ).toEqual([
      {
        kind: 'digest',
        counts: {
          added: { total: 2, byKind: [{ kind: 'capability', count: 2 }] },
          modified: { total: 2, byKind: [{ kind: 'domain', count: 2 }] },
          removed: 0,
        },
        variant: 'info',
      },
    ]);
  });

  /**
   * 「15개 추가」보다 「역량 3 · 요소 12 추가」가 낫다 — 다이제스트가 개수만
   * 말하면 사용자는 무엇이 늘었는지 모른 채 숫자만 본다.
   */
  it('다이제스트는 종류별로 센다 — 많은 순, 동수면 이름 순', () => {
    const [digest] = planVaultDiffToasts(
      {
        added: [
          node('e1', 'element'),
          node('c1', 'capability'),
          node('e2', 'element'),
          node('c2', 'capability'),
          node('e3', 'element'),
          node('d1', 'domain'),
        ],
        modified: [],
      },
      3,
    );
    expect(digest.counts?.added).toEqual({
      total: 6,
      byKind: [
        { kind: 'element', count: 3 },
        { kind: 'capability', count: 2 },
        { kind: 'domain', count: 1 },
      ],
    });
  });

  it('kind 를 못 얻은 몫은 지어내지 않고 마지막 한 행으로 모은다', () => {
    const [digest] = planVaultDiffToasts(
      {
        added: [node('a', 'capability'), node('b'), node('c'), node('d', 'capability')],
        modified: [],
      },
      3,
    );
    expect(digest.counts?.added).toEqual({
      total: 4,
      byKind: [{ kind: 'capability', count: 2 }, { count: 2 }],
    });
  });

  it('삭제가 섞이면 개수가 작아도 다이제스트로 간다 — 지워진 문서는 이름을 읽을 곳이 없다', () => {
    expect(
      planVaultDiffToasts({ added: [node('a', 'capability')], modified: [], removed: 1 }, 3),
    ).toEqual([
      {
        kind: 'digest',
        counts: {
          added: { total: 1, byKind: [{ kind: 'capability', count: 1 }] },
          modified: { total: 0, byKind: [] },
          removed: 1,
        },
        variant: 'info',
      },
    ]);
  });

  it('삭제만 있어도 보고한다 — 종전엔 이 버스트가 통째로 침묵했다', () => {
    expect(planVaultDiffToasts({ added: [], modified: [], removed: 3 })).toEqual([
      {
        kind: 'digest',
        counts: {
          added: { total: 0, byKind: [] },
          modified: { total: 0, byKind: [] },
          removed: 3,
        },
        variant: 'info',
      },
    ]);
  });

  it('preview limit 0 이면 한 건이라도 다이제스트로 접는다', () => {
    const plan = planVaultDiffToasts(
      { added: [node('a', 'capability')], modified: [node('b', 'domain')] },
      0,
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].kind).toBe('digest');
  });
});
