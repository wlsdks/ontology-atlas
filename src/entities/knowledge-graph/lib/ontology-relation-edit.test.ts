import { describe, expect, it } from 'vitest';

import {
  buildOntologyRelationEditPlan,
  buildOntologyRelationRemovalPlan,
  eligibleRelationTargets,
  relationFrontmatterKey,
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
    // Removing one relation must not lose a different ref with the same tail.
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

/** An emptied list or map is planned as `null`, which deletes the key, never written empty. */
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

/** The hand editor writes what `add_relation` writes for the same relation between the same kinds. */
describe('the key a relation is written under', () => {
  it.each([
    ['dependsOn', 'domain', 'domain', 'dependencies'],
    ['dependsOn', 'element', 'capability', 'dependencies'],
    ['relates', 'capability', 'element', 'relates'],
    ['isA', 'capability', 'capability', 'broader'],
    ['contains', 'project', 'domain', 'domains'],
    ['contains', 'domain', 'capability', 'capabilities'],
    ['contains', 'capability', 'element', 'elements'],
    ['contains', 'element', 'element', 'contains'],
  ] as const)('%s from a %s to a %s is %s', (relation, sourceKind, targetKind, key) => {
    expect(relationFrontmatterKey(relation, sourceKind, targetKind)).toBe(key);
  });

  it('writes containment under the typed list and keeps the scaffold list when it empties', () => {
    const added = buildOntologyRelationEditPlan({
      sourceSlug: 'domains/billing',
      targetSlug: 'capabilities/refund',
      targetKind: 'capability',
      fromRelation: null,
      toRelation: 'contains',
      why: '',
      frontmatter: { kind: 'domain', capabilities: ['capabilities/payment'] },
    });
    expect(added.updates).toEqual({ capabilities: ['capabilities/payment', 'capabilities/refund'] });

    const removed = buildOntologyRelationRemovalPlan({
      sourceSlug: 'domains/billing',
      targetSlug: 'capabilities/refund',
      targetKind: 'capability',
      relation: 'contains',
      frontmatter: { kind: 'domain', capabilities: ['capabilities/refund'] },
    });
    expect(removed.updates).toEqual({ capabilities: [] });
  });

  it('folds a depends_on list into dependencies only when that relation is written', () => {
    const plan = buildOntologyRelationEditPlan({
      sourceSlug: 'capabilities/checkout',
      targetSlug: 'capabilities/auth',
      targetKind: 'capability',
      fromRelation: null,
      toRelation: 'dependsOn',
      why: 'Checkout stops when sign-in changes its session.',
      frontmatter: { kind: 'capability', depends_on: ['capabilities/tax'], relates: ['capabilities/x'] },
    });
    expect(plan.updates).toEqual({
      dependencies: ['capabilities/auth', 'capabilities/tax'],
      depends_on: null,
      relation_notes: { 'capabilities/auth': 'Checkout stops when sign-in changes its session.' },
    });
  });

  it('removes a relation stored under the depends_on spelling', () => {
    const plan = buildOntologyRelationRemovalPlan({
      sourceSlug: 'capabilities/checkout',
      targetSlug: 'capabilities/tax',
      relation: 'dependsOn',
      frontmatter: { kind: 'capability', depends_on: ['capabilities/tax'] },
    });
    expect(plan.updates).toEqual({ depends_on: null });
  });
});

describe('eligible relation targets', () => {
  const candidates = [
    { id: 'domain:billing', slug: 'domains/billing', kind: 'domain', names: ['청구', 'Billing'] },
    { id: 'capability:refund', slug: 'capabilities/refund', kind: 'capability', names: ['환불', 'Refund'] },
    { id: 'capability:pay', slug: 'capabilities/pay', kind: 'capability', names: ['결제', 'Payment'] },
    { id: 'element:ledger', slug: 'elements/ledger', kind: 'element', names: ['원장', 'Ledger'] },
  ];
  const source = { id: 'capability:pay', kind: 'capability' };

  it('finds a target by its name in either language and never the source itself', () => {
    expect(eligibleRelationTargets(source, candidates, 'dependsOn', 'refund').map((c) => c.id)).toEqual([
      'capability:refund',
    ]);
    expect(eligibleRelationTargets(source, candidates, 'dependsOn', '환불').map((c) => c.id)).toEqual([
      'capability:refund',
    ]);
    expect(eligibleRelationTargets(source, candidates, 'dependsOn', '').map((c) => c.id)).not.toContain(
      'capability:pay',
    );
  });

  it('offers only kinds the relation type can join', () => {
    expect(eligibleRelationTargets(source, candidates, 'contains', '').map((c) => c.id)).toEqual(['element:ledger']);
    expect(eligibleRelationTargets(source, candidates, 'isA', '').map((c) => c.id)).toEqual(['capability:refund']);
  });
});
