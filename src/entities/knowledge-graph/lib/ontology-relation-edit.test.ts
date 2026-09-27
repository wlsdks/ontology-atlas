import { describe, expect, it } from 'vitest';

import {
  buildOntologyRelationEditPlan,
  buildOntologyRelationRemovalPlan,
} from './ontology-relation-edit';

describe('contextual relation edit plan', () => {
  it('plans a new relation and its why in one frontmatter write', () => {
    const plan = buildOntologyRelationEditPlan({
      sourceSlug: 'capabilities/contextual-editing',
      targetSlug: 'capabilities/mcp-server',
      fromRelation: null,
      toRelation: 'dependsOn',
      why: 'ACP 쓰기 검토가 MCP 도구 요청을 받는다.',
      frontmatter: { dependencies: ['capabilities/docs-vault-local'] },
    });

    expect(plan.updates).toEqual({
      dependencies: ['capabilities/docs-vault-local', 'capabilities/mcp-server'],
      relation_notes: {
        'capabilities/mcp-server': 'ACP 쓰기 검토가 MCP 도구 요청을 받는다.',
      },
    });
    expect(plan.changeSet.relation).toEqual({
      from: 'capabilities/contextual-editing',
      type: 'depends_on',
      to: 'capabilities/mcp-server',
      why: 'ACP 쓰기 검토가 MCP 도구 요청을 받는다.',
    });
  });

  it('moves a retyped relation to the new array exactly once', () => {
    const frontmatter = {
      relates: ['mcp-server', 'capabilities/other'],
      dependencies: ['capabilities/docs-vault-local'],
      relation_notes: { 'mcp-server': '기존 이유' },
    };
    const plan = buildOntologyRelationEditPlan({
      sourceSlug: 'capabilities/contextual-editing',
      targetSlug: 'capabilities/mcp-server',
      fromRelation: 'relates',
      toRelation: 'dependsOn',
      why: '새 이유',
      frontmatter,
    });

    expect(plan.updates.relates).toEqual(['capabilities/other']);
    expect(plan.updates.dependencies).toEqual([
      'capabilities/docs-vault-local',
      'capabilities/mcp-server',
    ]);
    expect(frontmatter.relates).toEqual(['mcp-server', 'capabilities/other']);
  });

  it('drops the old relation and reason when the target changes', () => {
    const plan = buildOntologyRelationEditPlan({
      sourceSlug: 'capabilities/contextual-editing',
      targetSlug: 'capabilities/new-target',
      fromRelation: 'dependsOn',
      fromTargetSlug: 'capabilities/old-target',
      toRelation: 'dependsOn',
      why: '새 대상이 검토를 맡는다.',
      frontmatter: {
        dependencies: ['capabilities/old-target', 'capabilities/keep'],
        relation_notes: {
          'capabilities/old-target': '예전 이유',
          'capabilities/keep': '남길 이유',
        },
      },
    });

    expect(plan.updates.dependencies).toEqual([
      'capabilities/keep',
      'capabilities/new-target',
    ]);
    expect(plan.updates.relation_notes).toEqual({
      'capabilities/keep': '남길 이유',
      'capabilities/new-target': '새 대상이 검토를 맡는다.',
    });
  });

  it('keeps a ref in another folder with the same tail', () => {
    // Bug sweep 2026-09-01: the slugified-tail fallback matched
    // capabilities/search against elements/search, so removing one relation
    // silently lost a second, different one.
    const plan = buildOntologyRelationRemovalPlan({
      sourceSlug: 'capabilities/contextual-editing',
      targetSlug: 'elements/search',
      relation: 'dependsOn',
      frontmatter: {
        dependencies: ['elements/search', 'capabilities/search'],
      },
    });
    expect(plan.updates).toEqual({
      dependencies: ['capabilities/search'],
    });
  });

  it('removes the reason of the last link in the same write', () => {
    const plan = buildOntologyRelationRemovalPlan({
      sourceSlug: 'capabilities/contextual-editing',
      targetSlug: 'capabilities/old-target',
      relation: 'dependsOn',
      frontmatter: {
        dependencies: ['capabilities/old-target', 'capabilities/keep'],
        relation_notes: {
          'capabilities/old-target': '없앨 이유',
          'capabilities/keep': '남길 이유',
        },
      },
    });

    expect(plan.updates).toEqual({
      dependencies: ['capabilities/keep'],
      relation_notes: { 'capabilities/keep': '남길 이유' },
    });
    expect(plan.changeSet).toMatchObject({
      operation: 'remove',
      destructive: true,
      relation: {
        from: 'capabilities/contextual-editing',
        type: 'depends_on',
        to: 'capabilities/old-target',
      },
    });
  });
});

/**
 * Owner inspection, 2026-09-26: removing the only `relates` entry of `capabilities/wiki-pages`
 * from the map's edge panel left `relates: []` behind, and removing a relation that carried the
 * only reason left `relation_notes: {  }`. `null` is how `applyFrontmatterUpdates` deletes a key,
 * so an emptied list or map has to be planned as `null` — the review keeps showing what the list
 * held and that nothing is left.
 */
describe('an emptied relation key is deleted, not written empty', () => {
  it('deletes the key when the last entry of a list is removed', () => {
    const plan = buildOntologyRelationRemovalPlan({
      sourceSlug: 'capabilities/wiki-pages',
      targetSlug: 'capabilities/library-workspace',
      relation: 'relates',
      frontmatter: { relates: ['capabilities/library-workspace'] },
    });

    expect(plan.updates).toEqual({ relates: null });
    expect(plan.changeSet.fields).toEqual([
      { key: 'relates', before: ['capabilities/library-workspace'], after: [] },
    ]);
  });

  it('deletes relation_notes with the last reason it held', () => {
    const plan = buildOntologyRelationRemovalPlan({
      sourceSlug: 'capabilities/wiki-pages',
      targetSlug: 'elements/frontmatter-parser',
      relation: 'dependsOn',
      frontmatter: {
        dependencies: ['elements/frontmatter-parser'],
        relation_notes: { 'elements/frontmatter-parser': 'wiki-schema.mjs imports parser.mjs.' },
      },
    });

    expect(plan.updates).toEqual({ dependencies: null, relation_notes: null });
  });

  it('deletes each of the four keys this editor writes', () => {
    for (const [relation, key] of [
      ['isA', 'broader'],
      ['dependsOn', 'dependencies'],
      ['contains', 'contains'],
      ['relates', 'relates'],
    ] as const) {
      const plan = buildOntologyRelationRemovalPlan({
        sourceSlug: 'capabilities/a',
        targetSlug: 'capabilities/b',
        relation,
        frontmatter: { [key]: ['capabilities/b'] },
      });
      expect(plan.updates, relation).toEqual({ [key]: null });
    }
  });

  it('deletes the old key when changing the type of its only relation', () => {
    const plan = buildOntologyRelationEditPlan({
      sourceSlug: 'capabilities/wiki-pages',
      targetSlug: 'capabilities/library-workspace',
      fromRelation: 'relates',
      toRelation: 'dependsOn',
      why: 'The page contract is read by the library workspace.',
      frontmatter: { relates: ['capabilities/library-workspace'] },
    });

    expect(plan.updates.relates).toBeNull();
    expect(plan.updates.dependencies).toEqual(['capabilities/library-workspace']);
  });

  it('deletes relation_notes when retargeting drops the only reason and no new one is given', () => {
    const plan = buildOntologyRelationEditPlan({
      sourceSlug: 'capabilities/a',
      targetSlug: 'capabilities/new-target',
      fromRelation: 'relates',
      fromTargetSlug: 'capabilities/old-target',
      toRelation: 'relates',
      why: '',
      frontmatter: {
        relates: ['capabilities/old-target'],
        relation_notes: { 'capabilities/old-target': 'The old reason.' },
      },
    });

    expect(plan.updates).toEqual({ relates: ['capabilities/new-target'], relation_notes: null });
  });

  it('keeps writing a list that still has entries', () => {
    const plan = buildOntologyRelationRemovalPlan({
      sourceSlug: 'capabilities/a',
      targetSlug: 'capabilities/b',
      relation: 'relates',
      frontmatter: { relates: ['capabilities/b', 'capabilities/c'] },
    });

    expect(plan.updates).toEqual({ relates: ['capabilities/c'] });
  });
});
