import { describe, expect, it } from 'vitest';
import {
  diffVaultManifest,
  planVaultDiffToasts,
  toVaultDiffNode,
  type VaultDiffNode,
} from './diff-manifest';

/** Test shorthand — name required, kind optional. */
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
      ['capabilities/foo', 2000], // unchanged
      ['capabilities/bar', 500], // decreased (an external git pull and the like)
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
      ['capabilities/bar', 2000], // unchanged
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
    // Real callers invoke this after the first-mount baseline. An empty prev is a theoretical case,
    // but it specifies that every slug is classified as added — the caller protects the baseline.
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
 * **A slug never reaches the screen** (owner instruction, 2026-08-01). This describe *is* that
 * contract — reverting it is caught here.
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
    // A hand-written `.md` with neither title nor display_*. A name cannot be invented, but the
    // developer folder name `capabilities/` never reaches the screen under any circumstance.
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

  // The text is no longer finished into a string here (which is what leaked a hardcoded English
  // "Added: <slug>" into Korean). Only the structure is returned, and `VaultDiffToaster` assembles
  // the localized text with `useTranslations`.
  it('added 와 modified 를 노드 + variant 구조로 변환한다', () => {
    const added = node('new', 'capability');
    const modified = node('existing', 'domain', 'domains/existing');
    expect(planVaultDiffToasts({ added: [added], modified: [modified] })).toEqual([
      { kind: 'added', node: added, variant: 'info' },
      { kind: 'edited', node: modified, variant: 'success' },
    ]);
  });

  /**
   * **The fan-out was dropped** (2026-08-01). It used to emit the first three as slugs and the rest
   * as a separate `+N more` toast, but toasts expire independently, so when the earlier ones went
   * first **only a number with nothing to refer to remained** — the owner caught that state on screen
   * (a lone "+4 more"). For a 34-file write the residue reads "+31 more".
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
   * "3 capabilities · 12 elements added" beats "15 added" — a digest that states only a count leaves
   * the user looking at a number without knowing what grew.
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
