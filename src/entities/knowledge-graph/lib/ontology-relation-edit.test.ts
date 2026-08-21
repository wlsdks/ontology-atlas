import { describe, expect, it } from 'vitest';

import {
  buildOntologyRelationEditPlan,
  buildOntologyRelationRemovalPlan,
} from './ontology-relation-edit';

describe('contextual relation edit plan', () => {
  it('새 관계와 why를 같은 frontmatter write로 계획한다', () => {
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

  it('기존 관계 타입을 바꾸면 원래 배열에서 빼고 새 배열에 한 번만 더한다', () => {
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

  it('기존 관계의 대상을 바꾸면 원래 관계와 이유를 남기지 않는다', () => {
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

  it('관계를 끊으면 마지막 연결의 이유도 같은 쓰기에서 걷는다', () => {
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
