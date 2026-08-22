import { describe, expect, it } from 'vitest';
import { buildOntologyTree } from '@/shared/lib/ontology-tree';
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import type { VaultDoc } from '@/entities/docs-vault';
import { collectSubtreeNodeIds, selectRealmBlockDocs } from './collect-realm-block';

function makeNode(id: string, kind: string, title?: string): KnowledgeGraphNode {
  return {
    id,
    title: title ?? id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date('2026-04-27'),
    lastApprovedBy: 'system',
  };
}
function makeEdge(from: string, to: string): KnowledgeGraphEdge {
  return {
    id: `${from}-${to}`,
    from,
    to,
    type: 'contains',
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date('2026-04-27'),
    lastApprovedBy: 'system',
  };
}
function makeDoc(slug: string, frontmatter: Record<string, unknown>, title: string): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title,
    tags: [],
    frontmatter,
    headings: [],
    excerpt: '',
    wordCount: 0,
    updatedAt: '2026-07-23',
    linksOut: [],
  };
}

const nodes = [
  makeNode('project:atlas', 'project', 'Atlas'),
  makeNode('domain:views', 'domain', 'Views'),
  makeNode('capability:render', 'capability', 'Render'),
  makeNode('element:canvas', 'element', 'Canvas'),
];
const edges = [
  makeEdge('project:atlas', 'domain:views'),
  makeEdge('domain:views', 'capability:render'),
  makeEdge('capability:render', 'element:canvas'),
];
// realm = the domain:views subtree (the project root excluded).
const subtree = buildOntologyTree(nodes, edges).roots[0].children[0];
const UIDS = {
  project: '01890f3e-7b5d-4c0a-8f14-123456789abc',
  views: '11890f3e-7b5d-4c0a-8f14-123456789abc',
  render: '21890f3e-7b5d-4c0a-8f14-123456789abc',
  canvas: '31890f3e-7b5d-4c0a-8f14-123456789abc',
  outside: '41890f3e-7b5d-4c0a-8f14-123456789abc',
} as const;

describe('collectSubtreeNodeIds', () => {
  it('collects the realm root and every descendant id', () => {
    const ids = collectSubtreeNodeIds(subtree);
    expect([...ids].sort()).toEqual([
      'capability:render',
      'domain:views',
      'element:canvas',
    ]);
  });
});

describe('selectRealmBlockDocs', () => {
  const docs = [
    makeDoc('project', { uid: UIDS.project, kind: 'project', slug: 'atlas' }, 'Atlas'),
    makeDoc('domains/views', { uid: UIDS.views, kind: 'domain' }, 'Views'),
    makeDoc('capabilities/render', { uid: UIDS.render, kind: 'capability' }, 'Render'),
    makeDoc('elements/canvas', { uid: UIDS.canvas, kind: 'element' }, 'Canvas'),
    makeDoc('elements/outside', { uid: UIDS.outside, kind: 'element' }, 'Outside'),
    makeDoc('README', {}, 'Readme'), // no kind — a document outside the map
  ];

  it('maps subtree node ids back to the vault docs that own them (id = kind:lastSegment)', () => {
    const picked = selectRealmBlockDocs(collectSubtreeNodeIds(subtree), docs);
    expect(picked.map((d) => d.slug)).toEqual([
      'capabilities/render',
      'domains/views',
      'elements/canvas',
    ]);
    expect(picked.find((d) => d.slug === 'domains/views')).toEqual({
      uid: UIDS.views,
      slug: 'domains/views',
      kind: 'domain',
      title: 'Views',
    });
  });

  it('matches project docs by frontmatter slug (derive-ontology-from-vault parity)', () => {
    const picked = selectRealmBlockDocs(new Set(['project:atlas']), docs);
    expect(picked.map((d) => d.slug)).toEqual(['project']);
  });

  it('ignores docs outside the realm and docs without kind', () => {
    const picked = selectRealmBlockDocs(collectSubtreeNodeIds(subtree), docs);
    expect(picked.some((d) => d.slug === 'elements/outside')).toBe(false);
    expect(picked.some((d) => d.slug === 'README')).toBe(false);
  });
});
