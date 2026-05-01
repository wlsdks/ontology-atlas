import { describe, expect, it } from 'vitest';
import { deriveOntologyFromVault } from './derive-ontology-from-vault';
import type { VaultDoc, VaultManifest } from '../model/types';

function makeDoc(partial: Partial<VaultDoc> & { slug: string }): VaultDoc {
  return {
    slug: partial.slug,
    path: partial.path ?? `${partial.slug}.md`,
    title: partial.title ?? partial.slug,
    description: partial.description,
    tags: partial.tags ?? [],
    frontmatter: partial.frontmatter ?? {},
    headings: partial.headings ?? [],
    excerpt: partial.excerpt ?? '',
    wordCount: partial.wordCount ?? 0,
    updatedAt: partial.updatedAt ?? '2026-04-01T00:00:00.000Z',
    mode: partial.mode ?? 'engineer',
    linksOut: partial.linksOut ?? [],
  };
}

function makeManifest(docs: VaultDoc[]): VaultManifest {
  return {
    version: '2026-04-23',
    generatedAt: new Date().toISOString(),
    docs,
    backlinksDetail: {},
    tags: {},
    tree: { name: 'root', path: '', type: 'dir' },
  };
}

describe('deriveOntologyFromVault', () => {
  it('frontmatter 가 빈 vault → 빈 결과 + warning', () => {
    const result = deriveOntologyFromVault(makeManifest([]));
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('frontmatter');
  });

  it('kind + capabilities → doc node + capability nodes + contains edges', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'projects/checkout',
          title: '결제 시스템',
          frontmatter: {
            kind: 'project',
            capabilities: ['결제 처리', '환불'],
          },
        }),
      ]),
    );
    expect(result.nodes.find((n) => n.id === 'project:checkout')?.title).toBe('결제 시스템');
    expect(result.nodes.find((n) => n.id === 'capability:결제-처리')).toBeDefined();
    expect(result.nodes.find((n) => n.id === 'capability:환불')).toBeDefined();
    const containsEdges = result.edges.filter((e) => e.type === 'contains');
    expect(containsEdges).toHaveLength(2);
    expect(containsEdges.every((e) => e.from === 'project:checkout')).toBe(true);
  });

  it('domain + elements + relates 모두 분기', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'specs/payment',
          frontmatter: {
            kind: 'workflow',
            title: '결제 흐름',
            domain: 'payments',
            elements: ['gateway', 'queue'],
            relates: ['legacy-checkout'],
          },
        }),
      ]),
    );
    expect(result.nodes.find((n) => n.kind === 'domain')?.title).toBe('payments');
    expect(result.nodes.find((n) => n.id === 'element:gateway')).toBeDefined();
    expect(result.nodes.find((n) => n.id === 'element:queue')).toBeDefined();
    expect(result.nodes.find((n) => n.id === 'unknown:legacy-checkout')?.kind).toBe('unknown');
    const relatedEdges = result.edges.filter((e) => e.type === 'related_to');
    expect(relatedEdges).toHaveLength(1);
  });

  it('dependencies → depends_on 같은 kind 에', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'projects/auth-service',
          frontmatter: {
            kind: 'project',
            dependencies: ['user-store', 'session-store'],
          },
        }),
      ]),
    );
    const depEdges = result.edges.filter((e) => e.type === 'depends_on');
    expect(depEdges).toHaveLength(2);
    expect(depEdges.find((e) => e.to === 'project:user-store')).toBeDefined();
  });

  it('kind 없는 doc 은 무시', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'random/note',
          frontmatter: { capabilities: ['orphan'] },
        }),
      ]),
    );
    expect(result.nodes).toHaveLength(0);
  });

  it('동일 capability 가 여러 doc 에 등장 → 단일 node 로 dedup', () => {
    const result = deriveOntologyFromVault(
      makeManifest([
        makeDoc({
          slug: 'projects/a',
          frontmatter: { kind: 'project', capabilities: ['shared-cap'] },
        }),
        makeDoc({
          slug: 'projects/b',
          frontmatter: { kind: 'project', capabilities: ['shared-cap'] },
        }),
      ]),
    );
    const capNodes = result.nodes.filter((n) => n.kind === 'capability');
    expect(capNodes).toHaveLength(1);
    const containsEdges = result.edges.filter((e) => e.type === 'contains');
    // 두 project 모두 같은 cap 을 가리킴 — edge 는 2개.
    expect(containsEdges).toHaveLength(2);
  });
});
