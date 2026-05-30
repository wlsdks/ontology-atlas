import { describe, expect, it } from 'vitest';
import Graph from 'graphology';
import { resolveOwnerDomainLabel } from './owner-domain';

type N = { ontologyTopKind?: string; label?: string };

function graphWith(): Graph<N> {
  const g = new Graph<N>();
  g.addNode('domains/auth', { ontologyTopKind: 'domain', label: 'Auth' });
  g.addNode('capabilities/login', { ontologyTopKind: 'capability', label: 'Login' });
  g.addNode('elements/jwt', { ontologyTopKind: 'element', label: 'JWT' });
  // domain contains capability; capability contains element.
  g.addEdge('domains/auth', 'capabilities/login');
  g.addEdge('capabilities/login', 'elements/jwt');
  return g;
}

describe('resolveOwnerDomainLabel', () => {
  it('returns the owning domain label from an incoming domain-kind neighbor', () => {
    expect(resolveOwnerDomainLabel(graphWith(), 'capabilities/login')).toBe('Auth');
  });

  it('returns null for a domain node (no domain owns it)', () => {
    expect(resolveOwnerDomainLabel(graphWith(), 'domains/auth')).toBeNull();
  });

  it('returns null for a domain node even with a domain in-neighbor (inter-domain coupling)', () => {
    const g = graphWith();
    g.addNode('domains/platform', { ontologyTopKind: 'domain', label: 'Platform' });
    // platform → auth (inter-domain edge) — auth 는 여전히 domain 이라 owner 없음.
    g.addEdge('domains/platform', 'domains/auth');
    expect(resolveOwnerDomainLabel(g, 'domains/auth')).toBeNull();
  });

  it('returns null when the only incoming neighbor is not a domain (element via capability)', () => {
    // elements/jwt 의 in-neighbor 는 capability(domain 아님) → null.
    expect(resolveOwnerDomainLabel(graphWith(), 'elements/jwt')).toBeNull();
  });

  it('returns null for an unknown node', () => {
    expect(resolveOwnerDomainLabel(graphWith(), 'nope')).toBeNull();
  });
});
