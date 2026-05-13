import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { compileOntology } from './ontology-compiler.mjs';
import { queryCompiledOntology } from './ontology-engine.mjs';

function doc(slug, frontmatter = {}) {
  return {
    slug,
    frontmatter,
    body: '',
    mtime: 1,
  };
}

function artifact() {
  return compileOntology(
    [
      doc('domains/auth', { slug: 'auth-domain', kind: 'domain', title: 'Auth' }),
      doc('capabilities/login', {
        kind: 'capability',
        title: 'Login',
        domain: 'auth',
        depends_on: ['auth-domain'],
        elements: ['src/auth/login.ts'],
      }),
      doc('capabilities/session', {
        kind: 'capability',
        title: 'Session',
        depends_on: ['capabilities/login'],
      }),
    ],
    { includeIndexes: true },
  );
}

describe('queryCompiledOntology', () => {
  it('returns deterministic neighbors with alias resolution', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'neighbors',
      slug: 'auth-domain',
      direction: 'incoming',
      types: ['dependencies'],
    });

    assert.equal(result.center, 'domains/auth');
    assert.deepEqual(result.nodes.map((node) => node.slug), ['capabilities/login']);
    assert.deepEqual(
      result.edges.map((edge) => ({
        direction: edge.direction,
        from: edge.from,
        to: edge.to,
        via: edge.via,
      })),
      [
        {
          direction: 'incoming',
          from: 'capabilities/login',
          to: 'domains/auth',
          via: 'dependencies',
        },
      ],
    );
  });

  it('finds graph paths over resolved compiled edges', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'path',
      from: 'capabilities/session',
      to: 'auth-domain',
      maxHops: 3,
    });

    assert.equal(result.found, true);
    assert.equal(result.hopCount, 2);
    assert.deepEqual(result.hops, [
      'capabilities/session',
      'capabilities/login',
      'domains/auth',
    ]);
    assert.deepEqual(result.edges.map((edge) => edge.via), ['dependencies', 'dependencies']);
  });

  it('returns incoming change impact by default', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'impact',
      slug: 'domains/auth',
      depth: 2,
    });

    assert.equal(result.center, 'domains/auth');
    assert.equal(result.direction, 'incoming');
    assert.deepEqual(
      result.nodes.map((row) => ({ slug: row.slug, distance: row.distance })),
      [
        { slug: 'capabilities/login', distance: 1 },
        { slug: 'capabilities/session', distance: 2 },
      ],
    );
  });

  it('summarizes blast radius by kind, domain, and cross-domain edges', () => {
    const graph = compileOntology(
      [
        doc('domains/auth', { slug: 'auth-domain', kind: 'domain', title: 'Auth' }),
        doc('domains/billing', { kind: 'domain', title: 'Billing' }),
        doc('capabilities/invoice', {
          kind: 'capability',
          title: 'Invoice',
          domain: 'domains/billing',
        }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          domain: 'auth-domain',
          depends_on: ['capabilities/invoice'],
        }),
        doc('capabilities/session', {
          kind: 'capability',
          title: 'Session',
          domain: 'auth-domain',
          depends_on: ['capabilities/login'],
        }),
      ],
      { includeIndexes: true },
    );
    const result = queryCompiledOntology(graph, {
      operation: 'blast_radius',
      slug: 'capabilities/invoice',
      direction: 'incoming',
      depth: 2,
    });

    assert.equal(result.operation, 'blast_radius');
    assert.equal(result.center, 'capabilities/invoice');
    assert.equal(result.risk, 'medium');
    assert.deepEqual(result.summary, {
      affectedNodes: 2,
      affectedEdges: 2,
      affectedKinds: 1,
      affectedDomains: 1,
      crossDomainEdges: 1,
    });
    assert.deepEqual(result.byKind, { capability: 2 });
    assert.deepEqual(result.byDomain, { 'domains/auth': 2 });
    assert.deepEqual(
      result.nodes.rows.map((row) => ({
        slug: row.slug,
        distance: row.distance,
        domain: row.domain,
      })),
      [
        { slug: 'capabilities/login', distance: 1, domain: 'domains/auth' },
        { slug: 'capabilities/session', distance: 2, domain: 'domains/auth' },
      ],
    );
    assert.deepEqual(
      result.edges.rows.map((edge) => ({
        from: edge.from,
        to: edge.to,
        fromDomain: edge.fromDomain,
        toDomain: edge.toDomain,
        crossDomain: edge.crossDomain,
      })),
      [
        {
          from: 'capabilities/login',
          to: 'capabilities/invoice',
          fromDomain: 'domains/auth',
          toDomain: 'domains/billing',
          crossDomain: true,
        },
        {
          from: 'capabilities/session',
          to: 'capabilities/login',
          fromDomain: 'domains/auth',
          toDomain: 'domains/auth',
          crossDomain: false,
        },
      ],
    );
  });

  it('returns a bounded resolved subgraph around a seed', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'subgraph',
      slug: 'auth-domain',
      depth: 2,
      direction: 'incoming',
    });

    assert.equal(result.seed, 'domains/auth');
    assert.equal(result.totalNodes, 3);
    assert.deepEqual(
      result.nodes.map((row) => ({ slug: row.slug, distance: row.distance })),
      [
        { slug: 'domains/auth', distance: 0 },
        { slug: 'capabilities/login', distance: 1 },
        { slug: 'capabilities/session', distance: 2 },
      ],
    );
    assert.deepEqual(result.edges.map((edge) => edge.via), [
      'dependencies',
      'domain',
      'dependencies',
    ]);

    const limited = queryCompiledOntology(artifact(), {
      operation: 'subgraph',
      slug: 'auth-domain',
      depth: 2,
      direction: 'incoming',
      limit: 2,
    });
    assert.equal(limited.totalNodes, 2);
    assert.equal(limited.limited, true);
  });

  it('returns graph overview aggregates for dashboard-style use', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'overview',
      limit: 2,
    });

    assert.equal(result.graph.nodes, 3);
    assert.equal(result.graph.resolvedEdges, 3);
    assert.equal(result.graph.externalEdges, 1);
    assert.match(result.graph.graphHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(result.byKind, { capability: 2, domain: 1 });
    assert.deepEqual(result.byDomain, { auth: 1 });
    assert.deepEqual(result.byRelation, {
      dependencies: 2,
      domain: 1,
      elements: 1,
    });
    assert.deepEqual(result.hubs.map((hub) => hub.slug), [
      'capabilities/login',
      'domains/auth',
    ]);
  });

  it('returns relation schema patterns by node kind', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'schema',
    });

    assert.equal(result.operation, 'schema');
    assert.equal(result.totalPatterns, 4);
    assert.deepEqual(
      result.patterns.map(({ fromKind, relation, toKind, count, resolved, external }) => ({
        fromKind,
        relation,
        toKind,
        count,
        resolved,
        external,
      })),
      [
        {
          fromKind: 'capability',
          relation: 'dependencies',
          toKind: 'capability',
          count: 1,
          resolved: 1,
          external: 0,
        },
        {
          fromKind: 'capability',
          relation: 'dependencies',
          toKind: 'domain',
          count: 1,
          resolved: 1,
          external: 0,
        },
        {
          fromKind: 'capability',
          relation: 'domain',
          toKind: 'domain',
          count: 1,
          resolved: 1,
          external: 0,
        },
        {
          fromKind: 'capability',
          relation: 'elements',
          toKind: 'external',
          count: 1,
          resolved: 0,
          external: 1,
        },
      ],
    );
  });

  it('returns graph facets for filter and dashboard use', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'facets',
      limit: 2,
    });

    assert.equal(result.operation, 'facets');
    assert.deepEqual(result.graph, {
      nodes: 3,
      edges: 4,
      resolvedEdges: 3,
      externalEdges: 1,
      unresolvedEdges: 0,
    });
    assert.deepEqual(result.nodes.byKind, { capability: 2, domain: 1 });
    assert.deepEqual(result.nodes.byDomain, { auth: 1 });
    assert.deepEqual(result.nodes.byDegreeBucket, {
      '0': 0,
      '1': 1,
      '2-4': 2,
      '5-9': 0,
      '10+': 0,
    });
    assert.deepEqual(result.nodes.topByDegree.map((node) => node.slug), [
      'capabilities/login',
      'domains/auth',
    ]);
    assert.deepEqual(result.edges.byRelation, {
      dependencies: 2,
      domain: 1,
      elements: 1,
    });
    assert.deepEqual(result.edges.byResolution, {
      resolved: 3,
      external: 1,
      unresolved: 0,
    });
    assert.deepEqual(
      result.edges.topPatterns.map(({ fromKind, relation, toKind, count }) => ({
        fromKind,
        relation,
        toKind,
        count,
      })),
      [
        {
          fromKind: 'capability',
          relation: 'dependencies',
          toKind: 'capability',
          count: 1,
        },
        {
          fromKind: 'capability',
          relation: 'dependencies',
          toKind: 'domain',
          count: 1,
        },
      ],
    );
  });

  it('checks a proposed relation against existing edges and schema patterns', () => {
    const existing = queryCompiledOntology(artifact(), {
      operation: 'relation_check',
      from: 'capabilities/login',
      to: 'auth-domain',
      type: 'depends_on',
    });
    assert.equal(existing.relation, 'dependencies');
    assert.equal(existing.exists, true);
    assert.equal(existing.verdict, 'already_exists');
    assert.equal(existing.schemaPattern.count, 1);
    assert.equal(existing.matchingEdges.length, 1);

    const schemaMatch = queryCompiledOntology(artifact(), {
      operation: 'relation_check',
      from: 'capabilities/session',
      to: 'auth-domain',
      type: 'depends_on',
    });
    assert.equal(schemaMatch.exists, false);
    assert.equal(schemaMatch.verdict, 'matches_existing_schema');
    assert.equal(schemaMatch.schemaPattern.toKind, 'domain');

    const newPattern = queryCompiledOntology(artifact(), {
      operation: 'relation_check',
      from: 'domains/auth',
      to: 'capabilities/session',
      type: 'relates',
    });
    assert.equal(newPattern.exists, false);
    assert.equal(newPattern.verdict, 'new_schema_pattern');
    assert.equal(newPattern.schemaPattern, null);
  });

  it('matches compiled nodes by graph-derived attributes', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'match_nodes',
      kind: 'capability',
      minInDegree: 1,
      sort: 'inDegree',
    });

    assert.equal(result.operation, 'match_nodes');
    assert.deepEqual(result.filters, {
      kind: 'capability',
      domain: null,
      slugContains: null,
      minDegree: null,
      maxDegree: null,
      minInDegree: 1,
      minOutDegree: null,
      hasIncoming: null,
      hasOutgoing: null,
      sort: 'inDegree',
    });
    assert.equal(result.totalMatches, 1);
    assert.deepEqual(
      result.nodes.map((node) => ({
        slug: node.slug,
        degree: node.degree,
        inDegree: node.inDegree,
        outDegree: node.outDegree,
      })),
      [
        {
          slug: 'capabilities/login',
          degree: 4,
          inDegree: 1,
          outDegree: 3,
        },
      ],
    );

    const outbound = queryCompiledOntology(artifact(), {
      operation: 'match_nodes',
      kind: 'capability',
      hasOutgoing: true,
      limit: 1,
    });
    assert.equal(outbound.totalMatches, 2);
    assert.equal(outbound.limited, true);
    assert.deepEqual(outbound.nodes.map((node) => node.slug), ['capabilities/login']);

    const slugSearch = queryCompiledOntology(artifact(), {
      operation: 'match_nodes',
      slugContains: 'AUTH',
      sort: 'slug',
    });
    assert.deepEqual(slugSearch.nodes.map((node) => node.slug), ['domains/auth']);
  });

  it('matches compiled edges by graph pattern filters', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'match_edges',
      fromKind: 'capability',
      type: 'depends_on',
      toKind: 'domain',
    });

    assert.equal(result.operation, 'match_edges');
    assert.deepEqual(result.filters, {
      from: null,
      to: null,
      fromKind: 'capability',
      toKind: 'domain',
      types: ['dependencies'],
      includeExternal: false,
      includeUnresolved: false,
    });
    assert.equal(result.totalMatches, 1);
    assert.deepEqual(
      result.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        via: edge.via,
        fromKind: edge.fromNode.kind,
        toKind: edge.toKind,
      })),
      [
        {
          from: 'capabilities/login',
          to: 'domains/auth',
          via: 'dependencies',
          fromKind: 'capability',
          toKind: 'domain',
        },
      ],
    );

    const external = queryCompiledOntology(artifact(), {
      operation: 'match_edges',
      from: 'capabilities/login',
      toKind: 'external',
      includeExternal: true,
    });
    assert.equal(external.totalMatches, 1);
    assert.deepEqual(external.edges.map((edge) => edge.to), ['src/auth/login.ts']);
    assert.equal(external.edges[0].toNode, null);

    const limited = queryCompiledOntology(artifact(), {
      operation: 'match_edges',
      fromKind: 'capability',
      limit: 2,
    });
    assert.equal(limited.totalMatches, 3);
    assert.equal(limited.limited, true);
    assert.equal(limited.edges.length, 2);
  });

  it('returns a compiled node profile for detail views', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'node_profile',
      slug: 'capabilities/login',
    });

    assert.equal(result.operation, 'node_profile');
    assert.equal(result.center, 'capabilities/login');
    assert.equal(result.node.kind, 'capability');
    assert.deepEqual(result.degree, { in: 1, out: 3, total: 4 });
    assert.equal(result.edges.incoming.total, 1);
    assert.deepEqual(result.edges.incoming.byRelation, { dependencies: 1 });
    assert.deepEqual(
      result.edges.incoming.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        via: edge.via,
        other: edge.otherNode.slug,
      })),
      [
        {
          from: 'capabilities/session',
          to: 'capabilities/login',
          via: 'dependencies',
          other: 'capabilities/session',
        },
      ],
    );
    assert.equal(result.edges.outgoing.total, 3);
    assert.deepEqual(result.edges.outgoing.byRelation, {
      dependencies: 1,
      domain: 1,
      elements: 1,
    });
    assert.equal(result.edges.outgoing.edges.find((edge) => edge.external).otherKind, 'external');
    assert.deepEqual(
      result.containment.parents.map((row) => ({ slug: row.slug, via: row.via })),
      [{ slug: 'domains/auth', via: 'domain' }],
    );
    assert.deepEqual(result.containment.children, []);
    assert.deepEqual(result.lineage.ancestors.nodes.map((row) => row.slug), ['domains/auth']);
    assert.deepEqual(result.lineage.descendants.nodes, []);

    const limited = queryCompiledOntology(artifact(), {
      operation: 'node_profile',
      slug: 'capabilities/login',
      limit: 1,
    });
    assert.equal(limited.edges.outgoing.total, 3);
    assert.equal(limited.edges.outgoing.limited, true);
    assert.equal(limited.edges.outgoing.edges.length, 1);
  });

  it('returns deterministic connected components over resolved graph edges', () => {
    const disconnected = compileOntology(
      [
        doc('domains/auth', { slug: 'auth-domain', kind: 'domain', title: 'Auth' }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          domain: 'auth-domain',
        }),
        doc('domains/billing', { kind: 'domain', title: 'Billing' }),
        doc('capabilities/payments', {
          kind: 'capability',
          title: 'Payments',
          domain: 'billing',
        }),
        doc('capabilities/orphan', { kind: 'capability', title: 'Orphan' }),
      ],
      { includeIndexes: true },
    );

    const result = queryCompiledOntology(disconnected, {
      operation: 'components',
      limit: 2,
      nodeLimit: 1,
    });

    assert.equal(result.operation, 'components');
    assert.equal(result.totalComponents, 3);
    assert.equal(result.largestSize, 2);
    assert.equal(result.singletonCount, 1);
    assert.equal(result.limited, true);
    assert.deepEqual(
      result.components.map((component) => ({
        size: component.size,
        kinds: component.kinds,
        nodeLimited: component.nodeLimited,
        firstNode: component.nodes[0].slug,
      })),
      [
        {
          size: 2,
          kinds: { capability: 1, domain: 1 },
          nodeLimited: true,
          firstNode: 'capabilities/login',
        },
        {
          size: 2,
          kinds: { capability: 1, domain: 1 },
          nodeLimited: true,
          firstNode: 'capabilities/payments',
        },
      ],
    );
  });

  it('returns containment lineage across parent arrays and inline domain refs', () => {
    const contained = compileOntology(
      [
        doc('project', {
          kind: 'project',
          title: 'Project',
          domains: ['auth-domain'],
        }),
        doc('domains/auth', {
          slug: 'auth-domain',
          kind: 'domain',
          title: 'Auth',
          capabilities: ['capabilities/login'],
        }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          domain: 'auth-domain',
          elements: ['elements/token'],
        }),
        doc('capabilities/session', {
          kind: 'capability',
          title: 'Session',
          domain: 'auth-domain',
        }),
        doc('elements/token', {
          kind: 'element',
          title: 'Token',
        }),
      ],
      { includeIndexes: true },
    );

    const result = queryCompiledOntology(contained, {
      operation: 'lineage',
      slug: 'capabilities/login',
    });

    assert.equal(result.operation, 'lineage');
    assert.equal(result.center, 'capabilities/login');
    assert.deepEqual(
      result.ancestors.nodes.map((row) => ({ slug: row.slug, distance: row.distance, via: row.via })),
      [
        { slug: 'domains/auth', distance: 1, via: 'domain' },
        { slug: 'project', distance: 2, via: 'domains' },
      ],
    );
    assert.deepEqual(
      result.descendants.nodes.map((row) => ({
        slug: row.slug,
        distance: row.distance,
        via: row.via,
      })),
      [{ slug: 'elements/token', distance: 1, via: 'elements' }],
    );

    const domain = queryCompiledOntology(contained, {
      operation: 'lineage',
      slug: 'auth-domain',
      depth: 1,
    });

    assert.deepEqual(domain.ancestors.nodes.map((row) => row.slug), ['project']);
    assert.deepEqual(domain.descendants.nodes.map((row) => row.slug), [
      'capabilities/login',
      'capabilities/session',
    ]);
  });

  it('returns a project-first containment tree', () => {
    const contained = compileOntology(
      [
        doc('project', {
          kind: 'project',
          title: 'Project',
          domains: ['auth-domain'],
        }),
        doc('domains/auth', {
          slug: 'auth-domain',
          kind: 'domain',
          title: 'Auth',
          capabilities: ['capabilities/login'],
        }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          domain: 'auth-domain',
          elements: ['elements/token'],
        }),
        doc('capabilities/session', {
          kind: 'capability',
          title: 'Session',
          domain: 'auth-domain',
        }),
        doc('elements/token', {
          kind: 'element',
          title: 'Token',
        }),
      ],
      { includeIndexes: true },
    );

    const result = queryCompiledOntology(contained, {
      operation: 'containment_tree',
    });

    assert.equal(result.operation, 'containment_tree');
    assert.equal(result.root, null);
    assert.equal(result.totalRoots, 1);
    assert.equal(result.emittedNodes, 5);
    assert.equal(result.limited, false);
    assert.deepEqual(result.cycles, []);
    assert.deepEqual(
      result.roots.map((root) => ({
        slug: root.slug,
        children: root.children.map((child) => ({
          slug: child.slug,
          via: child.via,
          children: child.children.map((grandchild) => ({
            slug: grandchild.slug,
            via: grandchild.via,
            children: grandchild.children.map((leaf) => ({
              slug: leaf.slug,
              via: leaf.via,
            })),
          })),
        })),
      })),
      [
        {
          slug: 'project',
          children: [
            {
              slug: 'domains/auth',
              via: 'domains',
              children: [
                {
                  slug: 'capabilities/login',
                  via: 'capabilities',
                  children: [{ slug: 'elements/token', via: 'elements' }],
                },
                {
                  slug: 'capabilities/session',
                  via: 'domain',
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    );

    const subtree = queryCompiledOntology(contained, {
      operation: 'containment_tree',
      slug: 'auth-domain',
      depth: 1,
    });
    assert.equal(subtree.root, 'domains/auth');
    assert.equal(subtree.emittedNodes, 3);
    assert.deepEqual(subtree.roots[0].children.map((child) => child.slug), [
      'capabilities/login',
      'capabilities/session',
    ]);

    const limited = queryCompiledOntology(contained, {
      operation: 'containment_tree',
      limit: 2,
    });
    assert.equal(limited.limited, true);
    assert.equal(limited.emittedNodes, 2);
  });

  it('returns a project-scoped graph slice', () => {
    const contained = compileOntology(
      [
        doc('project', {
          kind: 'project',
          title: 'Project',
          domains: ['auth-domain'],
        }),
        doc('domains/auth', {
          slug: 'auth-domain',
          kind: 'domain',
          title: 'Auth',
          capabilities: ['capabilities/login'],
        }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          domain: 'auth-domain',
          elements: ['elements/token'],
        }),
        doc('capabilities/session', {
          kind: 'capability',
          title: 'Session',
          domain: 'auth-domain',
          depends_on: ['capabilities/login'],
        }),
        doc('elements/token', {
          kind: 'element',
          title: 'Token',
        }),
      ],
      { includeIndexes: true },
    );

    const result = queryCompiledOntology(contained, {
      operation: 'project_scope',
    });

    assert.equal(result.operation, 'project_scope');
    assert.equal(result.project, 'project');
    assert.deepEqual(result.summary, {
      nodes: 5,
      internalEdges: 6,
      boundaryEdges: 0,
      externalEdges: 0,
      unresolvedEdges: 0,
    });
    assert.deepEqual(result.byKind, {
      capability: 2,
      domain: 1,
      element: 1,
      project: 1,
    });
    assert.deepEqual(result.nodes.rows.map((node) => node.slug), [
      'capabilities/login',
      'capabilities/session',
      'domains/auth',
      'elements/token',
      'project',
    ]);
    assert.deepEqual(result.edges.internal.byRelation, {
      capabilities: 1,
      dependencies: 1,
      domain: 2,
      domains: 1,
      elements: 1,
    });
    assert.equal(result.edges.internal.edges.every((edge) => edge.toScope === 'internal'), true);

    const limited = queryCompiledOntology(contained, {
      operation: 'project_scope',
      limit: 2,
    });
    assert.equal(limited.nodes.total, 5);
    assert.equal(limited.nodes.limited, true);
    assert.equal(limited.edges.internal.limited, true);
  });

  it('returns a domain-by-domain project map', () => {
    const mapped = compileOntology(
      [
        doc('project', {
          kind: 'project',
          title: 'Project',
          domains: ['domains/auth', 'domains/billing'],
        }),
        doc('domains/auth', {
          kind: 'domain',
          title: 'Auth',
          capabilities: ['capabilities/login'],
        }),
        doc('domains/billing', {
          kind: 'domain',
          title: 'Billing',
          capabilities: ['capabilities/invoice'],
        }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          domain: 'domains/auth',
          elements: ['elements/token', 'src/auth/session.ts'],
        }),
        doc('capabilities/session', {
          kind: 'capability',
          title: 'Session',
          domain: 'domains/auth',
          depends_on: ['capabilities/login'],
        }),
        doc('capabilities/invoice', {
          kind: 'capability',
          title: 'Invoice',
          domain: 'domains/billing',
        }),
        doc('elements/token', {
          kind: 'element',
          title: 'Token',
        }),
        doc('capabilities/orphan', {
          kind: 'capability',
          title: 'Orphan',
        }),
      ],
      { includeIndexes: true },
    );

    const result = queryCompiledOntology(mapped, {
      operation: 'project_map',
      itemLimit: 1,
    });

    assert.equal(result.operation, 'project_map');
    assert.equal(result.project, 'project');
    assert.deepEqual(result.summary, {
      nodes: 7,
      domains: 2,
      capabilities: 3,
      elements: 1,
      unassignedNodes: 0,
      internalEdges: 9,
      boundaryEdges: 0,
      externalEdges: 1,
      unresolvedEdges: 0,
    });
    assert.deepEqual(result.domains.map((domain) => domain.slug), [
      'domains/auth',
      'domains/billing',
    ]);
    assert.deepEqual(result.domains[0].summary, {
      nodes: 4,
      capabilities: 2,
      elements: 1,
      internalEdges: 5,
      boundaryEdges: 0,
      externalEdges: 1,
      unresolvedEdges: 0,
    });
    assert.equal(result.domains[0].capabilities.total, 2);
    assert.equal(result.domains[0].capabilities.limited, true);
    assert.deepEqual(result.domains[0].capabilities.nodes.map((node) => node.slug), [
      'capabilities/login',
    ]);
    assert.deepEqual(result.domains[0].elements.nodes.map((node) => node.slug), [
      'elements/token',
    ]);
    assert.equal(result.domains[1].summary.capabilities, 1);
    assert.equal(result.unassigned.total, 0);
    assert.equal(result.hotspots[0].slug, 'capabilities/login');
  });

  it('returns a domain profile with boundary and external references', () => {
    const profiled = compileOntology(
      [
        doc('project', {
          kind: 'project',
          title: 'Project',
          domains: ['domains/auth'],
        }),
        doc('domains/auth', {
          kind: 'domain',
          title: 'Auth',
        }),
        doc('domains/billing', {
          kind: 'domain',
          title: 'Billing',
        }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          domain: 'domains/auth',
          depends_on: ['capabilities/invoice'],
          elements: ['elements/token', 'src/auth/login.ts'],
        }),
        doc('capabilities/session', {
          kind: 'capability',
          title: 'Session',
          domain: 'domains/auth',
          depends_on: ['capabilities/login'],
        }),
        doc('capabilities/invoice', {
          kind: 'capability',
          title: 'Invoice',
          domain: 'domains/billing',
        }),
        doc('elements/token', {
          kind: 'element',
          title: 'Token',
        }),
      ],
      { includeIndexes: true },
    );

    const result = queryCompiledOntology(profiled, {
      operation: 'domain_profile',
      slug: 'domains/auth',
    });

    assert.equal(result.operation, 'domain_profile');
    assert.equal(result.domain, 'domains/auth');
    assert.deepEqual(result.parents.projects.map((project) => project.slug), ['project']);
    assert.deepEqual(result.summary, {
      nodes: 4,
      capabilities: 2,
      elements: 1,
      internalEdges: 4,
      boundaryEdges: 1,
      externalEdges: 1,
      unresolvedEdges: 0,
    });
    assert.deepEqual(result.capabilities.nodes.map((node) => node.slug), [
      'capabilities/login',
      'capabilities/session',
    ]);
    assert.deepEqual(result.elements.nodes.map((node) => node.slug), ['elements/token']);
    assert.deepEqual(result.edges.boundary.edges.map((edge) => `${edge.from}->${edge.to}:${edge.toScope}`), [
      'capabilities/login->capabilities/invoice:boundary',
    ]);
    assert.deepEqual(result.edges.external.edges.map((edge) => `${edge.from}->${edge.to}:${edge.toScope}`), [
      'capabilities/login->src/auth/login.ts:external',
    ]);
  });

  it('returns a domain-to-domain dependency matrix', () => {
    const matrix = compileOntology(
      [
        doc('project', {
          kind: 'project',
          title: 'Project',
          domains: ['domains/auth', 'domains/billing'],
        }),
        doc('domains/auth', {
          kind: 'domain',
          title: 'Auth',
        }),
        doc('domains/billing', {
          kind: 'domain',
          title: 'Billing',
        }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          domain: 'domains/auth',
          depends_on: ['capabilities/invoice'],
          elements: ['elements/token', 'src/auth/login.ts'],
        }),
        doc('capabilities/session', {
          kind: 'capability',
          title: 'Session',
          domain: 'domains/auth',
          depends_on: ['capabilities/login'],
        }),
        doc('capabilities/invoice', {
          kind: 'capability',
          title: 'Invoice',
          domain: 'domains/billing',
        }),
        doc('elements/token', {
          kind: 'element',
          title: 'Token',
        }),
      ],
      { includeIndexes: true },
    );

    const result = queryCompiledOntology(matrix, {
      operation: 'domain_matrix',
      project: 'project',
    });

    assert.equal(result.operation, 'domain_matrix');
    assert.equal(result.project, 'project');
    assert.deepEqual(result.summary, {
      domains: 2,
      nodes: 7,
      assignedNodes: 6,
      unassignedNodes: 1,
      crossDomainEdges: 1,
      selfDomainEdges: 5,
      externalEdges: 1,
      unresolvedEdges: 0,
    });
    assert.deepEqual(
      result.domains.map((domain) => ({
        slug: domain.slug,
        nodes: domain.nodes,
        outgoing: domain.outgoing,
        incoming: domain.incoming,
        selfEdges: domain.selfEdges,
        externalEdges: domain.externalEdges,
      })),
      [
        {
          slug: 'domains/auth',
          nodes: 4,
          outgoing: 1,
          incoming: 0,
          selfEdges: 4,
          externalEdges: 1,
        },
        {
          slug: 'domains/billing',
          nodes: 2,
          outgoing: 0,
          incoming: 1,
          selfEdges: 1,
          externalEdges: 0,
        },
      ],
    );
    assert.deepEqual(
      result.connections.rows.map((row) => ({
        from: row.from,
        to: row.to,
        count: row.count,
        byRelation: row.byRelation,
      })),
      [
        {
          from: 'domains/auth',
          to: 'domains/billing',
          count: 1,
          byRelation: { dependencies: 1 },
        },
      ],
    );
  });

  it('detects directed dependency cycles deterministically', () => {
    const cyclic = compileOntology(
      [
        doc('capabilities/a', {
          kind: 'capability',
          title: 'A',
          depends_on: ['capabilities/b'],
        }),
        doc('capabilities/b', {
          kind: 'capability',
          title: 'B',
          depends_on: ['capabilities/c'],
        }),
        doc('capabilities/c', {
          kind: 'capability',
          title: 'C',
          depends_on: ['capabilities/a'],
        }),
        doc('capabilities/d', {
          kind: 'capability',
          title: 'D',
          depends_on: ['capabilities/e'],
        }),
        doc('capabilities/e', {
          kind: 'capability',
          title: 'E',
        }),
      ],
      { includeIndexes: true },
    );

    const result = queryCompiledOntology(cyclic, {
      operation: 'cycles',
    });

    assert.equal(result.operation, 'cycles');
    assert.deepEqual(result.relationTypes, ['dependencies']);
    assert.equal(result.totalCycles, 1);
    assert.equal(result.limited, false);
    assert.deepEqual(result.cycles[0].nodes, [
      'capabilities/a',
      'capabilities/b',
      'capabilities/c',
      'capabilities/a',
    ]);
    assert.deepEqual(result.cycles[0].edges.map((edge) => edge.via), [
      'dependencies',
      'dependencies',
      'dependencies',
    ]);

    const shortDepth = queryCompiledOntology(cyclic, {
      operation: 'cycles',
      maxHops: 2,
    });
    assert.equal(shortDepth.totalCycles, 0);
  });

  it('returns prerequisite-first topological order for dependency edges', () => {
    const ordered = compileOntology(
      [
        doc('capabilities/app', {
          kind: 'capability',
          title: 'App',
          depends_on: ['capabilities/auth', 'capabilities/ui'],
        }),
        doc('capabilities/auth', {
          kind: 'capability',
          title: 'Auth',
          depends_on: ['capabilities/storage'],
        }),
        doc('capabilities/storage', {
          kind: 'capability',
          title: 'Storage',
        }),
        doc('capabilities/ui', {
          kind: 'capability',
          title: 'UI',
        }),
        doc('capabilities/unrelated', {
          kind: 'capability',
          title: 'Unrelated',
        }),
      ],
      { includeIndexes: true },
    );

    const result = queryCompiledOntology(ordered, {
      operation: 'topological_order',
    });

    assert.equal(result.operation, 'topological_order');
    assert.equal(result.acyclic, true);
    assert.equal(result.totalNodes, 4);
    assert.equal(result.selectedEdges, 3);
    assert.deepEqual(
      result.layers.map((layer) => ({
        rank: layer.rank,
        nodes: layer.nodes.map((node) => node.slug),
      })),
      [
        { rank: 0, nodes: ['capabilities/storage', 'capabilities/ui'] },
        { rank: 1, nodes: ['capabilities/auth'] },
        { rank: 2, nodes: ['capabilities/app'] },
      ],
    );
    assert.deepEqual(result.order.map((row) => row.slug), [
      'capabilities/storage',
      'capabilities/ui',
      'capabilities/auth',
      'capabilities/app',
    ]);

    const withIsolated = queryCompiledOntology(ordered, {
      operation: 'topological_order',
      includeIsolated: true,
      limit: 2,
    });
    assert.equal(withIsolated.totalNodes, 5);
    assert.equal(withIsolated.limited, true);
    assert.deepEqual(withIsolated.order.map((row) => row.slug), [
      'capabilities/storage',
      'capabilities/ui',
    ]);

    const cyclic = queryCompiledOntology(
      compileOntology(
        [
          doc('capabilities/a', { kind: 'capability', title: 'A', depends_on: ['capabilities/b'] }),
          doc('capabilities/b', { kind: 'capability', title: 'B', depends_on: ['capabilities/a'] }),
        ],
        { includeIndexes: true },
      ),
      { operation: 'topological_order' },
    );
    assert.equal(cyclic.acyclic, false);
    assert.deepEqual(cyclic.blocked.map((row) => row.slug), [
      'capabilities/a',
      'capabilities/b',
    ]);
  });

  it('recommends missing parent-to-child domain containment relations', () => {
    const graph = compileOntology(
      [
        doc('domains/auth', {
          slug: 'auth-domain',
          kind: 'domain',
          title: 'Auth',
          capabilities: ['capabilities/session'],
        }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          domain: 'auth-domain',
        }),
        doc('capabilities/session', {
          kind: 'capability',
          title: 'Session',
          domain: 'auth-domain',
        }),
        doc('elements/token', {
          kind: 'element',
          title: 'Token',
          domain: 'auth-domain',
        }),
        doc('elements/claims', {
          kind: 'element',
          title: 'Claims',
          domain: 'auth-domain',
        }),
      ],
      { includeIndexes: true },
    );

    const result = queryCompiledOntology(graph, {
      operation: 'recommend_relations',
    });

    assert.equal(result.operation, 'recommend_relations');
    assert.equal(result.mode, 'domain_containment');
    assert.equal(result.totalRecommendations, 3);
    assert.deepEqual(
      result.recommendations.map((row) => ({
        kind: row.kind,
        from: row.from,
        to: row.to,
        relation: row.relation,
        action: row.proposedAction.args,
      })),
      [
        {
          kind: 'missing_domain_containment',
          from: 'domains/auth',
          to: 'capabilities/login',
          relation: 'capabilities',
          action: {
            from: 'domains/auth',
            to: 'capabilities/login',
            type: 'capabilities',
          },
        },
        {
          kind: 'missing_domain_containment',
          from: 'domains/auth',
          to: 'elements/claims',
          relation: 'elements',
          action: {
            from: 'domains/auth',
            to: 'elements/claims',
            type: 'elements',
          },
        },
        {
          kind: 'missing_domain_containment',
          from: 'domains/auth',
          to: 'elements/token',
          relation: 'elements',
          action: {
            from: 'domains/auth',
            to: 'elements/token',
            type: 'elements',
          },
        },
      ],
    );

    const onlyCapabilities = queryCompiledOntology(graph, {
      operation: 'recommend_relations',
      kind: 'capability',
      limit: 1,
    });
    assert.equal(onlyCapabilities.totalRecommendations, 1);
    assert.equal(onlyCapabilities.limited, false);
    assert.deepEqual(onlyCapabilities.recommendations.map((row) => row.to), [
      'capabilities/login',
    ]);
  });

  it('returns a side-effect-free ontology growth plan', () => {
    const graph = compileOntology(
      [
        doc('domains/auth', {
          slug: 'auth-domain',
          kind: 'domain',
          title: 'Auth',
        }),
        doc('domains/empty', {
          kind: 'domain',
          title: 'Empty',
        }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          domain: 'auth-domain',
          dependencies: ['capabilities/missing'],
          elements: ['src/auth/login.ts'],
        }),
        doc('capabilities/orphan', {
          kind: 'capability',
          title: 'Orphan',
        }),
      ],
      { includeIndexes: true },
    );

    const result = queryCompiledOntology(graph, {
      operation: 'growth_plan',
      limit: 10,
    });

    assert.equal(result.operation, 'growth_plan');
    assert.deepEqual(result.summary, {
      relationRecommendations: 1,
      externalElementRefs: 1,
      danglingReferences: 1,
      unassignedNodes: 1,
      emptyDomains: 1,
      totalActions: 3,
    });
    assert.deepEqual(
      result.relationRecommendations.recommendations.map((row) => row.proposedAction.args),
      [
        {
          from: 'domains/auth',
          to: 'capabilities/login',
          type: 'capabilities',
        },
      ],
    );
    assert.deepEqual(result.externalElementRefs.rows.map((row) => row.proposedAction.args), [
      {
        slug: 'elements/src/auth/login',
        kind: 'element',
        title: 'Login',
      },
    ]);
    assert.deepEqual(result.danglingReferences.rows.map((row) => row.proposedAction.args), [
      {
        slug: 'capabilities/missing',
        kind: 'capability',
        title: 'Missing',
      },
    ]);
    assert.deepEqual(result.unassignedNodes.rows.map((row) => row.slug), ['capabilities/orphan']);
    assert.deepEqual(result.emptyDomains.rows.map((row) => row.slug), ['domains/empty']);
  });

  it('returns a one-shot workspace brief for first-contact agent orientation', () => {
    const graph = compileOntology(
      [
        doc('project', {
          kind: 'project',
          title: 'Project',
          domains: ['domains/auth'],
        }),
        doc('domains/auth', {
          kind: 'domain',
          title: 'Auth',
        }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          domain: 'domains/auth',
          elements: ['src/auth/login.ts'],
        }),
      ],
      { includeIndexes: true },
    );

    const result = queryCompiledOntology(graph, {
      operation: 'workspace_brief',
      limit: 5,
    });

    assert.equal(result.operation, 'workspace_brief');
    assert.equal(result.status, 'needs_attention');
    assert.equal(result.summary.nodes, 3);
    assert.equal(result.summary.projects, 1);
    assert.equal(result.summary.domains, 1);
    assert.equal(result.summary.capabilities, 1);
    assert.equal(result.summary.externalEdges, 1);
    assert.equal(result.summary.growthActions, 2);
    assert.deepEqual(result.projects.maps.map((project) => project.project), ['project']);
    assert.deepEqual(result.projects.maps[0].domains.map((domain) => domain.slug), ['domains/auth']);
    assert.deepEqual(result.growth, {
      relationRecommendations: 1,
      externalElementRefs: 1,
      danglingReferences: 0,
      unassignedNodes: 0,
      emptyDomains: 0,
      totalActions: 2,
    });
    assert.deepEqual(result.nextActions.map((action) => action.kind), [
      'health_check',
      'add_missing_relations',
      'materialize_external_elements',
    ]);
  });

  it('returns a one-shot health dashboard for clean ontology graphs', () => {
    const clean = compileOntology(
      [
        doc('domains/auth', {
          slug: 'auth-domain',
          kind: 'domain',
          title: 'Auth',
          capabilities: ['capabilities/login', 'capabilities/session'],
        }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          domain: 'auth-domain',
        }),
        doc('capabilities/session', {
          kind: 'capability',
          title: 'Session',
          domain: 'auth-domain',
          depends_on: ['capabilities/login'],
        }),
      ],
      { includeIndexes: true },
    );

    const result = queryCompiledOntology(clean, {
      operation: 'health',
    });

    assert.equal(result.operation, 'health');
    assert.equal(result.status, 'healthy');
    assert.equal(result.summary.nodes, 3);
    assert.equal(result.summary.components, 1);
    assert.equal(result.summary.dependencyCycles, 0);
    assert.equal(result.summary.relationRecommendations, 0);
    assert.equal(result.summary.dependencyOrderAcyclic, true);
    assert.deepEqual(
      result.checks.map((check) => ({ id: check.id, status: check.status, count: check.count })),
      [
        { id: 'compile_issues', status: 'pass', count: 0 },
        { id: 'unresolved_edges', status: 'pass', count: 0 },
        { id: 'dependency_cycles', status: 'pass', count: 0 },
        { id: 'relation_recommendations', status: 'pass', count: 0 },
        { id: 'components', status: 'pass', count: 1 },
      ],
    );
  });

  it('marks graph health as needing attention when integrity checks fail', () => {
    const degraded = compileOntology(
      [
        doc('domains/auth', {
          slug: 'auth-domain',
          kind: 'domain',
          title: 'Auth',
        }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          domain: 'auth-domain',
          depends_on: ['capabilities/session', 'capabilities/missing'],
        }),
        doc('capabilities/session', {
          kind: 'capability',
          title: 'Session',
          domain: 'auth-domain',
          depends_on: ['capabilities/login'],
        }),
      ],
      { includeIndexes: true },
    );

    const result = queryCompiledOntology(degraded, {
      operation: 'health',
    });

    assert.equal(result.status, 'needs_attention');
    assert.equal(result.summary.unresolvedEdges, 1);
    assert.equal(result.summary.dependencyCycles, 1);
    assert.equal(result.summary.relationRecommendations, 2);
    assert.equal(result.summary.dependencyOrderAcyclic, false);
    assert.equal(result.checks.find((check) => check.id === 'unresolved_edges').status, 'warn');
    assert.equal(result.checks.find((check) => check.id === 'dependency_cycles').status, 'fail');
    assert.equal(
      result.checks.find((check) => check.id === 'relation_recommendations').status,
      'warn',
    );
    assert.deepEqual(result.dependencyOrder.blocked.map((row) => row.slug), [
      'capabilities/login',
      'capabilities/session',
    ]);
  });
});
