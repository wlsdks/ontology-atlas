import { describe, expect, it } from 'vitest';

import { buildOntologyChangeSet } from './ontology-change-set';

describe('buildOntologyChangeSet', () => {
  it('keeps every relation in a batch as a reviewable item', () => {
    const changeSet = buildOntologyChangeSet('mcp__atlas-vault__add_relations', {
      relations: [
        {
          from: 'capabilities/acp-runtime',
          to: 'capabilities/reviewed-ontology-writing',
          type: 'relates',
          why: '대화와 검토가 같은 작업 흐름이다.',
        },
        {
          from: 'domains/graph-modeling',
          to: 'capabilities/reviewed-ontology-writing',
          type: 'contains',
          why: '검토 쓰기는 그래프 모델링의 역량이다.',
        },
      ],
    });

    expect(changeSet.items).toHaveLength(2);
    expect(changeSet.items.map((item) => item.relation)).toEqual([
      {
        from: 'capabilities/acp-runtime',
        to: 'capabilities/reviewed-ontology-writing',
        type: 'relates',
        why: '대화와 검토가 같은 작업 흐름이다.',
      },
      {
        from: 'domains/graph-modeling',
        to: 'capabilities/reviewed-ontology-writing',
        type: 'contains',
        why: '검토 쓰기는 그래프 모델링의 역량이다.',
      },
    ]);
    expect(changeSet.exact).toBe(true);
  });

  it('keeps every concept and its own fields in a batch', () => {
    const changeSet = buildOntologyChangeSet('add_concepts', {
      concepts: [
        { slug: 'capabilities/one', kind: 'capability', title: 'One' },
        { slug: 'elements/two', kind: 'element', title: 'Two', path: 'src/two.ts' },
      ],
    });

    expect(changeSet.items.map((item) => item.target)).toEqual([
      'capabilities/one',
      'elements/two',
    ]);
    expect(changeSet.items[1].fields).toEqual([
      { key: 'kind', after: 'element' },
      { key: 'title', after: 'Two' },
      { key: 'path', after: 'src/two.ts' },
    ]);
  });
});
