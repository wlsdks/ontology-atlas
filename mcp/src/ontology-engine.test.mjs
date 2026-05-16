import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { compileOntology } from './ontology-compiler.mjs';
import { queryCompiledOntology } from './ontology-engine.mjs';

function doc(slug, frontmatter = {}, mtime = 1) {
  return {
    slug,
    frontmatter,
    body: '',
    mtime,
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

  it('reports neighbors total and limited from the unsliced edge set', () => {
    const graph = compileOntology(
      [
        doc('domains/auth', { slug: 'auth-domain', kind: 'domain', title: 'Auth' }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          domain: 'auth-domain',
          dependencies: ['auth-domain'],
        }),
        doc('capabilities/session', {
          kind: 'capability',
          title: 'Session',
          dependencies: ['auth-domain'],
        }),
      ],
      { includeIndexes: true },
    );

    const exact = queryCompiledOntology(graph, {
      operation: 'neighbors',
      slug: 'auth-domain',
      direction: 'incoming',
      types: ['dependencies'],
      limit: 2,
    });
    assert.equal(exact.total, 2);
    assert.equal(exact.edges.length, 2);
    assert.equal(exact.limited, false);

    const truncated = queryCompiledOntology(graph, {
      operation: 'neighbors',
      slug: 'auth-domain',
      direction: 'incoming',
      types: ['dependencies'],
      limit: 1,
    });
    assert.equal(truncated.total, 2);
    assert.equal(truncated.edges.length, 1);
    assert.equal(truncated.limited, true);
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

  it('returns all bounded simple paths between two nodes', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'all_paths',
      from: 'capabilities/session',
      to: 'auth-domain',
      maxHops: 3,
    });

    assert.equal(result.operation, 'all_paths');
    assert.equal(result.found, true);
    assert.equal(result.totalPaths, 2);
    assert.equal(result.shortestHopCount, 2);
    assert.deepEqual(result.byLength, { 2: 2 });
    assert.deepEqual(
      result.paths.map((row) => ({
        hops: row.hops,
        relations: row.edges.map((edge) => edge.via),
      })),
      [
        {
          hops: ['capabilities/session', 'capabilities/login', 'domains/auth'],
          relations: ['dependencies', 'dependencies'],
        },
        {
          hops: ['capabilities/session', 'capabilities/login', 'domains/auth'],
          relations: ['dependencies', 'domain'],
        },
      ],
    );

    const branchingGraph = compileOntology(
      [
        doc('a', { kind: 'capability', title: 'A', relates: ['b', 'c', 'e', 'f'] }),
        doc('b', { kind: 'capability', title: 'B', relates: ['d'] }),
        doc('c', { kind: 'capability', title: 'C', relates: ['d'] }),
        doc('e', { kind: 'capability', title: 'E', relates: ['d'] }),
        doc('f', { kind: 'capability', title: 'F', relates: ['d'] }),
        doc('d', { kind: 'capability', title: 'D' }),
      ],
      { includeIndexes: true },
    );
    const exactLimit = queryCompiledOntology(branchingGraph, {
      operation: 'all_paths',
      from: 'a',
      to: 'd',
      maxHops: 2,
      limit: 4,
    });
    assert.equal(exactLimit.totalPaths, 4);
    assert.equal(exactLimit.limited, false);
    assert.equal(exactLimit.paths.length, 4);

    const truncated = queryCompiledOntology(branchingGraph, {
      operation: 'all_paths',
      from: 'a',
      to: 'd',
      maxHops: 2,
      limit: 2,
    });
    assert.equal(truncated.totalPaths, 4);
    assert.equal(truncated.limited, true);
    assert.equal(truncated.paths.length, 2);
  });

  it('plans bounded graph queries before execution', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'query_plan',
      targetOperation: 'path',
      from: 'capabilities/session',
      to: 'auth-domain',
      maxHops: 3,
      types: ['depends_on'],
    });

    assert.equal(result.operation, 'query_plan');
    assert.equal(result.targetOperation, 'path');
    assert.equal(result.sideEffect, false);
    assert.deepEqual(result.normalized, {
      targetOperation: 'path',
      types: ['dependencies'],
      limit: 100,
      from: 'capabilities/session',
      to: 'domains/auth',
      direction: 'undirected',
      maxHops: 3,
    });
    assert.deepEqual(result.indexesUsed, ['aliasToSlug', 'edge.type filter', 'in', 'out']);
    assert.equal(result.estimate.strategy, 'bounded_bfs');
    assert.equal(result.estimate.edgeScans, 4);
    assert.equal(result.estimate.reachableWithinDepth, 2);
    assert.equal(result.estimate.costClass, 'low');
    assert.deepEqual(result.estimate.frontierByDepth, [
      { distance: 1, frontierNodes: 1, candidateEdges: 1, newNodes: 1 },
      { distance: 2, frontierNodes: 1, candidateEdges: 2, newNodes: 1 },
      { distance: 3, frontierNodes: 1, candidateEdges: 1, newNodes: 0 },
    ]);

    const allPathsPlan = queryCompiledOntology(artifact(), {
      operation: 'query_plan',
      targetOperation: 'all_paths',
      from: 'capabilities/session',
      to: 'auth-domain',
      maxHops: 3,
    });
    assert.equal(allPathsPlan.normalized.limit, 25);

    const projectMapPlan = queryCompiledOntology(artifact(), {
      operation: 'query_plan',
      targetOperation: 'project_map',
      limit: 5,
    });
    assert.equal(projectMapPlan.operation, 'query_plan');
    assert.equal(projectMapPlan.targetOperation, 'project_map');
    assert.equal(projectMapPlan.estimate.strategy, 'aggregate_scan');
    assert.deepEqual(projectMapPlan.indexesUsed, ['compiled_artifact']);
  });

  it('ranks graph centrality for core nodes and bridges', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'centrality',
      types: ['depends_on'],
      limit: 3,
    });

    assert.equal(result.operation, 'centrality');
    assert.deepEqual(result.parameters, {
      types: ['dependencies'],
      iterations: 20,
      limit: 3,
    });
    assert.equal(result.graph.nodes, 3);
    assert.equal(result.graph.resolvedEdges, 2);
    assert.deepEqual(result.rankings.pageRank.map((row) => row.slug), [
      'domains/auth',
      'capabilities/login',
      'capabilities/session',
    ]);
    assert.equal(result.rankings.pageRank[0].pageRank, 0.474412);
    assert.deepEqual(result.rankings.bridges.map((row) => [row.slug, row.bridgeScore]), [
      ['capabilities/login', 1],
      ['domains/auth', 0],
      ['capabilities/session', 0],
    ]);
    assert.deepEqual(result.rankings.hubs.map((row) => row.slug), [
      'capabilities/login',
      'capabilities/session',
      'domains/auth',
    ]);
  });

  it('detects deterministic ontology communities', () => {
    const result = queryCompiledOntology(
      compileOntology(
        [
          doc('domains/auth', {
            kind: 'domain',
            title: 'Auth',
            capabilities: ['capabilities/login'],
          }),
          doc('capabilities/login', {
            kind: 'capability',
            title: 'Login',
            depends_on: ['domains/auth'],
          }),
          doc('domains/billing', {
            kind: 'domain',
            title: 'Billing',
            capabilities: ['capabilities/charge'],
          }),
          doc('capabilities/charge', {
            kind: 'capability',
            title: 'Charge',
            depends_on: ['domains/billing'],
          }),
          doc('capabilities/standalone', {
            kind: 'capability',
            title: 'Standalone',
          }),
        ],
        { includeIndexes: true },
      ),
      {
        operation: 'communities',
        types: ['depends_on', 'capabilities'],
        limit: 10,
      },
    );

    assert.equal(result.operation, 'communities');
    assert.deepEqual(result.summary, {
      communities: 3,
      largestSize: 2,
      singletonCount: 1,
      crossCommunityEdges: 0,
    });
    assert.deepEqual(
      result.communities.map((community) => ({
        size: community.size,
        nodes: community.nodes.map((node) => node.slug),
      })),
      [
        { size: 2, nodes: ['capabilities/charge', 'domains/billing'] },
        { size: 2, nodes: ['capabilities/login', 'domains/auth'] },
        { size: 1, nodes: ['capabilities/standalone'] },
      ],
    );
  });

  it('finds similar nodes for an add candidate before writing', () => {
    const result = queryCompiledOntology(
      compileOntology(
        [
          doc('domains/auth', { kind: 'domain', title: 'Auth' }),
          doc('capabilities/login', {
            kind: 'capability',
            title: 'Login Flow',
            domain: 'domains/auth',
          }),
          doc('capabilities/login-page', {
            kind: 'capability',
            title: 'Login Page',
            domain: 'domains/auth',
          }),
          doc('capabilities/billing', {
            kind: 'capability',
            title: 'Billing Charge',
          }),
        ],
        { includeIndexes: true },
      ),
      {
        operation: 'similar_nodes',
        candidateSlug: 'capabilities/login-flow',
        title: 'Login Flow',
        kind: 'capability',
        domain: 'domains/auth',
      },
    );

    assert.equal(result.operation, 'similar_nodes');
    assert.deepEqual(result.source, {
      mode: 'candidate',
      slug: 'capabilities/login-flow',
      kind: 'capability',
      title: 'Login Flow',
      domain: 'domains/auth',
    });
    assert.deepEqual(result.matches.map((row) => row.node.slug), [
      'capabilities/login',
      'capabilities/login-page',
      'capabilities/billing',
    ]);
    assert.equal(result.matches[0].score, 0.783333);
    assert.equal(result.matches[0].signals.title, 0.35);
    assert.equal(result.matches[0].signals.domain, 0.1);
  });

  it('returns an ordered maintenance plan after graph changes', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'maintenance_plan',
      limit: 10,
    });

    assert.equal(result.operation, 'maintenance_plan');
    assert.equal(result.sideEffect, false);
    assert.deepEqual(result.summary, {
      totalActions: 3,
      filteredActions: 3,
      remainingActions: 3,
      executableActions: 2,
      reviewActions: 1,
      compileIssues: 0,
      dependencyCycles: 0,
      canonicalizationActions: 0,
      danglingReferences: 0,
      relationRecommendations: 1,
      externalElementRefs: 1,
      externalElementRefsIgnored: 0,
      unassignedNodes: 1,
      emptyDomains: 0,
    });
    assert.deepEqual(result.byPhase, { link: 1, materialize: 1, review: 1 });
    assert.deepEqual(result.bySeverity, { info: 2, warn: 1 });
    assert.deepEqual(result.byKind, {
      add_missing_relation: 1,
      materialize_external_element: 1,
      unassigned_node: 1,
    });
    assert.equal(result.cursor.afterActionId, null);
    assert.equal(result.cursor.found, true);
    assert.equal(result.cursor.startIndex, 0);
    assert.equal(result.cursor.nextAfterActionId, result.actions[2].id);
    assert.equal(result.cursor.hasMore, false);
    assert.deepEqual(result.actions.map((action) => action.kind), [
      'add_missing_relation',
      'materialize_external_element',
      'unassigned_node',
    ]);
    assert.equal(result.nextExecutableAction.kind, 'add_missing_relation');
    assert.equal(result.nextReviewAction.kind, 'unassigned_node');
    assert.match(result.actions[0].id, /^maint_[a-f0-9]{8}$/);
    assert.equal(result.actions[0].executable, true);
    assert.equal(result.actions[2].executable, false);
    assert.deepEqual(result.actions[0].proposedAction, {
      tool: 'add_relation',
      args: {
        from: 'domains/auth',
        to: 'capabilities/login',
        type: 'capabilities',
      },
    });
  });

  it('filters maintenance actions for executable agent work queues', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'maintenance_plan',
      executableOnly: true,
      phases: ['link'],
      severities: ['warn'],
      limit: 10,
    });

    assert.deepEqual(result.filters, {
      executableOnly: true,
      phases: ['link'],
      severities: ['warn'],
      kinds: [],
    });
    assert.equal(result.summary.totalActions, 3);
    assert.equal(result.summary.filteredActions, 1);
    assert.equal(result.summary.remainingActions, 1);
    assert.deepEqual(result.byPhase, { link: 1 });
    assert.deepEqual(result.bySeverity, { warn: 1 });
    assert.deepEqual(result.byKind, { add_missing_relation: 1 });
    assert.deepEqual(result.actions.map((action) => action.kind), ['add_missing_relation']);
    assert.equal(result.actions[0].executable, true);
    assert.equal(result.nextExecutableAction.kind, 'add_missing_relation');
    assert.equal(result.nextReviewAction, null);
  });

  it('rejects invalid maintenance filters instead of dropping them', () => {
    assert.throws(
      () => queryCompiledOntology(artifact(), {
        operation: 'maintenance_plan',
        phases: ['repair', null],
      }),
      /phases must be an array of strings/,
    );
    assert.throws(
      () => queryCompiledOntology(artifact(), {
        operation: 'maintenance_plan',
        severities: ['warn', ' '],
      }),
      /severities items must be non-empty strings/,
    );
    assert.throws(
      () => queryCompiledOntology(artifact(), {
        operation: 'maintenance_plan',
        kinds: [' canonicalize_graph_arrays'],
      }),
      /kinds items must not have leading or trailing whitespace/,
    );
    assert.throws(
      () => queryCompiledOntology(artifact(), {
        operation: 'maintenance_plan',
        phases: ['repair\0'],
      }),
      /phases items must not contain a null byte/,
    );
  });

  it('plans executable canonicalization for dirty graph arrays', () => {
    const result = queryCompiledOntology(
      compileOntology(
        [
          doc('domains/auth', { slug: 'auth-domain', kind: 'domain', title: 'Auth' }),
          doc('capabilities/login', {
            kind: 'capability',
            title: 'Login',
            dependencies: ['zeta', 'domains/auth', 'zeta'],
            relates: ['capabilities/session', 'capabilities/session'],
          }, 123),
          doc('capabilities/session', {
            kind: 'capability',
            title: 'Session',
          }),
        ],
        { includeIndexes: true },
      ),
      {
        operation: 'maintenance_plan',
        executableOnly: true,
        phases: ['repair'],
        kinds: ['canonicalize_graph_arrays'],
        limit: 10,
      },
    );

    const action = result.actions.find((row) => row.kind === 'canonicalize_graph_arrays');
    assert.ok(action);
    assert.deepEqual(result.filters.kinds, ['canonicalize_graph_arrays']);
    assert.deepEqual(result.actions.map((row) => row.kind), ['canonicalize_graph_arrays']);
    assert.equal(result.summary.canonicalizationActions, 1);
    assert.equal(action.executable, true);
    assert.deepEqual(action.proposedAction, {
      tool: 'patch_concept',
      args: {
        slug: 'capabilities/login',
        frontmatter: {
          dependencies: ['domains/auth', 'zeta'],
          relates: ['capabilities/session'],
        },
        expected_mtime: 123,
      },
    });
  });

  it('resumes maintenance actions after a stable action id', () => {
    const first = queryCompiledOntology(artifact(), {
      operation: 'maintenance_plan',
      limit: 1,
    });

    assert.equal(first.actions.length, 1);
    assert.equal(first.cursor.hasMore, true);
    assert.equal(first.cursor.nextAfterActionId, first.actions[0].id);

    const second = queryCompiledOntology(artifact(), {
      operation: 'maintenance_plan',
      afterActionId: first.cursor.nextAfterActionId,
      limit: 10,
    });

    assert.deepEqual(second.actions.map((action) => action.kind), [
      'materialize_external_element',
      'unassigned_node',
    ]);
    assert.equal(second.cursor.afterActionId, first.cursor.nextAfterActionId);
    assert.equal(second.cursor.found, true);
    assert.equal(second.cursor.startIndex, 1);
    assert.equal(second.cursor.hasMore, false);
    assert.equal(second.summary.filteredActions, 3);
    assert.equal(second.summary.remainingActions, 2);
    assert.equal(second.nextExecutableAction.kind, 'materialize_external_element');
    assert.equal(second.nextReviewAction.kind, 'unassigned_node');

    const missing = queryCompiledOntology(artifact(), {
      operation: 'maintenance_plan',
      afterActionId: 'maint_missing',
      limit: 10,
    });

    assert.equal(missing.cursor.found, false);
    assert.equal(missing.cursor.startIndex, null);
    assert.equal(missing.summary.filteredActions, 3);
    assert.equal(missing.summary.remainingActions, 0);
    assert.deepEqual(missing.actions, []);
    assert.deepEqual(missing.byPhase, {});
    assert.deepEqual(missing.bySeverity, {});
    assert.deepEqual(missing.byKind, {});
    assert.equal(missing.nextExecutableAction, null);
    assert.equal(missing.nextReviewAction, null);
  });

  it('explains how two nodes relate through direct edges, paths, and shared neighbors', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'explain_relation',
      from: 'capabilities/session',
      to: 'auth-domain',
      maxHops: 3,
    });

    assert.equal(result.operation, 'explain_relation');
    assert.equal(result.from, 'capabilities/session');
    assert.equal(result.to, 'domains/auth');
    assert.equal(result.verdict, 'path');
    assert.deepEqual(result.domains, {
      from: null,
      to: 'domains/auth',
      sameDomain: false,
    });
    assert.equal(result.direct.total, 0);
    assert.deepEqual(result.shortestPath.hops, [
      'capabilities/session',
      'capabilities/login',
      'domains/auth',
    ]);
    assert.equal(result.shortestPath.hopCount, 2);
    assert.deepEqual(result.commonNeighbors.rows.map((row) => row.slug), [
      'capabilities/login',
    ]);
    assert.deepEqual(
      result.commonNeighbors.rows[0].fromEdges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        direction: edge.direction,
      })),
      [{ from: 'capabilities/session', to: 'capabilities/login', direction: 'outgoing' }],
    );
  });

  it('returns transitive reachability layers and shortest paths from a start node', () => {
    const result = queryCompiledOntology(artifact(), {
      operation: 'reachability',
      slug: 'capabilities/session',
      depth: 3,
      types: ['dependencies'],
    });

    assert.equal(result.operation, 'reachability');
    assert.equal(result.start, 'capabilities/session');
    assert.equal(result.direction, 'outgoing');
    assert.deepEqual(result.summary, {
      reachableNodes: 2,
      traversedEdges: 2,
      layers: 2,
      terminalNodes: 1,
    });
    assert.deepEqual(result.byKind, { capability: 1, domain: 1 });
    assert.deepEqual(result.byRelation, { dependencies: 2 });
    assert.deepEqual(
      result.layers.map((layer) => ({
        distance: layer.distance,
        nodes: layer.nodes.map((node) => node.slug),
      })),
      [
        { distance: 1, nodes: ['capabilities/login'] },
        { distance: 2, nodes: ['domains/auth'] },
      ],
    );
    assert.deepEqual(
      result.paths.rows.map((row) => ({ slug: row.slug, path: row.path })),
      [
        {
          slug: 'capabilities/login',
          path: ['capabilities/session', 'capabilities/login'],
        },
        {
          slug: 'domains/auth',
          path: ['capabilities/session', 'capabilities/login', 'domains/auth'],
        },
      ],
    );
    assert.deepEqual(result.terminalNodes.map((node) => node.slug), ['domains/auth']);

    const exactLimit = queryCompiledOntology(artifact(), {
      operation: 'reachability',
      slug: 'capabilities/session',
      depth: 3,
      types: ['dependencies'],
      limit: 2,
    });
    assert.equal(exactLimit.paths.total, 2);
    assert.equal(exactLimit.paths.limited, false);

    const truncated = queryCompiledOntology(artifact(), {
      operation: 'reachability',
      slug: 'capabilities/session',
      depth: 3,
      types: ['dependencies'],
      limit: 1,
    });
    assert.equal(truncated.paths.total, 2);
    assert.equal(truncated.paths.limited, true);
    assert.deepEqual(
      truncated.paths.rows.map((row) => row.slug),
      ['capabilities/login'],
    );
  });

  it('walks an explicit relation pattern from a start node', () => {
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
          capabilities: ['capabilities/login'],
        }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          elements: ['elements/login-form'],
        }),
        doc('elements/login-form', {
          kind: 'element',
          title: 'Login Form',
        }),
      ],
      { includeIndexes: true },
    );
    const result = queryCompiledOntology(graph, {
      operation: 'pattern_walk',
      slug: 'project',
      pattern: ['domains', 'capabilities', 'elements'],
    });

    assert.equal(result.operation, 'pattern_walk');
    assert.equal(result.start, 'project');
    assert.deepEqual(result.pattern, ['domains', 'capabilities', 'elements']);
    assert.deepEqual(result.summary, {
      steps: 3,
      matchedPaths: 1,
      endNodes: 1,
      traversedEdges: 3,
    });
    assert.deepEqual(
      result.layers.map((layer) => ({
        relation: layer.relation,
        nodes: layer.nodes.map((node) => node.slug),
      })),
      [
        { relation: 'domains', nodes: ['domains/auth'] },
        { relation: 'capabilities', nodes: ['capabilities/login'] },
        { relation: 'elements', nodes: ['elements/login-form'] },
      ],
    );
    assert.deepEqual(result.paths.rows[0].path, [
      'project',
      'domains/auth',
      'capabilities/login',
      'elements/login-form',
    ]);

    const branchingGraph = compileOntology(
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
        doc('capabilities/login', { kind: 'capability', title: 'Login' }),
        doc('capabilities/invoice', { kind: 'capability', title: 'Invoice' }),
      ],
      { includeIndexes: true },
    );

    const exactLimit = queryCompiledOntology(branchingGraph, {
      operation: 'pattern_walk',
      slug: 'project',
      pattern: ['domains', 'capabilities'],
      limit: 2,
    });
    assert.equal(exactLimit.paths.total, 2);
    assert.equal(exactLimit.paths.limited, false);
    assert.deepEqual(
      exactLimit.paths.rows.map((row) => row.end),
      ['capabilities/login', 'capabilities/invoice'],
    );

    const truncated = queryCompiledOntology(branchingGraph, {
      operation: 'pattern_walk',
      slug: 'project',
      pattern: ['domains', 'capabilities'],
      limit: 1,
    });
    assert.equal(truncated.paths.total, 2);
    assert.equal(truncated.paths.limited, true);
    assert.equal(truncated.paths.rows.length, 1);
    assert.deepEqual(
      truncated.paths.rows.map((row) => row.end),
      ['capabilities/login'],
    );
  });

  it('rejects invalid pattern_walk pattern items instead of dropping them', () => {
    assert.throws(
      () => queryCompiledOntology(artifact(), {
        operation: 'pattern_walk',
        slug: 'capabilities/login',
        pattern: ['dependencies', null],
      }),
      /pattern must be an array of strings/,
    );
    assert.throws(
      () => queryCompiledOntology(artifact(), {
        operation: 'pattern_walk',
        slug: 'capabilities/login',
        pattern: ['dependencies', ' '],
      }),
      /pattern items must be non-empty strings/,
    );
    assert.throws(
      () => queryCompiledOntology(artifact(), {
        operation: 'pattern_walk',
        slug: 'capabilities/login',
        pattern: [' dependencies'],
      }),
      /pattern items must not have leading or trailing whitespace/,
    );
    assert.throws(
      () => queryCompiledOntology(artifact(), {
        operation: 'pattern_walk',
        slug: 'capabilities/login',
        pattern: ['dependencies\0'],
      }),
      /pattern items must not contain a null byte/,
    );
  });

  it('rejects invalid relation type filters instead of dropping them', () => {
    assert.throws(
      () => queryCompiledOntology(artifact(), {
        operation: 'neighbors',
        slug: 'capabilities/login',
        types: ['dependencies', null],
      }),
      /types must be an array of strings/,
    );
    assert.throws(
      () => queryCompiledOntology(artifact(), {
        operation: 'neighbors',
        slug: 'capabilities/login',
        types: ['dependencies', ' '],
      }),
      /types items must be non-empty strings/,
    );
    assert.throws(
      () => queryCompiledOntology(artifact(), {
        operation: 'neighbors',
        slug: 'capabilities/login',
        types: [' dependencies'],
      }),
      /types items must not have leading or trailing whitespace/,
    );
    assert.throws(
      () => queryCompiledOntology(artifact(), {
        operation: 'neighbors',
        slug: 'capabilities/login',
        types: ['dependencies\0'],
      }),
      /types items must not contain a null byte/,
    );
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

    const exactLimit = queryCompiledOntology(artifact(), {
      operation: 'impact',
      slug: 'domains/auth',
      depth: 2,
      limit: 2,
    });
    assert.equal(exactLimit.total, 2);
    assert.equal(exactLimit.limited, false);

    const truncated = queryCompiledOntology(artifact(), {
      operation: 'impact',
      slug: 'domains/auth',
      depth: 2,
      limit: 1,
    });
    assert.equal(truncated.total, 2);
    assert.equal(truncated.limited, true);
    assert.deepEqual(
      truncated.nodes.map((row) => row.slug),
      ['capabilities/login'],
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

    const exactLimit = queryCompiledOntology(graph, {
      operation: 'blast_radius',
      slug: 'capabilities/invoice',
      direction: 'incoming',
      depth: 2,
      limit: 2,
    });
    assert.equal(exactLimit.nodes.total, 2);
    assert.equal(exactLimit.nodes.limited, false);

    const truncated = queryCompiledOntology(graph, {
      operation: 'blast_radius',
      slug: 'capabilities/invoice',
      direction: 'incoming',
      depth: 2,
      limit: 1,
    });
    assert.equal(truncated.nodes.total, 2);
    assert.equal(truncated.nodes.limited, true);
    assert.deepEqual(
      truncated.nodes.rows.map((row) => row.slug),
      ['capabilities/login'],
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
    assert.equal(limited.totalNodes, 3);
    assert.equal(limited.limited, true);
    assert.deepEqual(
      limited.nodes.map((row) => row.slug),
      ['domains/auth', 'capabilities/login'],
    );

    const exactLimit = queryCompiledOntology(artifact(), {
      operation: 'subgraph',
      slug: 'auth-domain',
      depth: 2,
      direction: 'incoming',
      limit: 3,
    });
    assert.equal(exactLimit.totalNodes, 3);
    assert.equal(exactLimit.limited, false);
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

  it('rejects invalid match_nodes degree filters instead of coercing them', () => {
    assert.throws(
      () => queryCompiledOntology(artifact(), { operation: 'match_nodes', minDegree: -1 }),
      /minDegree must be a non-negative integer/,
    );
    assert.throws(
      () => queryCompiledOntology(artifact(), { operation: 'match_nodes', maxDegree: 1.5 }),
      /maxDegree must be a non-negative integer/,
    );
    assert.throws(
      () => queryCompiledOntology(artifact(), { operation: 'match_nodes', minInDegree: '1' }),
      /minInDegree must be a non-negative integer/,
    );
    assert.throws(
      () => queryCompiledOntology(artifact(), { operation: 'match_nodes', minOutDegree: 1.5 }),
      /minOutDegree must be a non-negative integer/,
    );
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
      externalElementRefsIgnored: 0,
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

  it('omotIgnorePatterns 가 매치되는 external element ref 를 materialize 추천에서 제외 + ignored 카운트 노출', () => {
    const graph = compileOntology(
      [
        doc('project', { kind: 'project', title: 'P', domains: ['domains/x'] }),
        doc('domains/x', {
          kind: 'domain',
          title: 'X',
          capabilities: ['capabilities/foo'],
        }),
        doc('capabilities/foo', {
          kind: 'capability',
          title: 'Foo',
          domain: 'x',
          // 두 external element ref (둘 다 path-like — `.` 가 있어 external 로 인식).
          // src/** 매치 1 + 매치 안 됨 1.
          elements: ['src/foo.ts', 'external/lib.ts'],
        }),
      ],
      { includeIndexes: true },
    );

    const without = queryCompiledOntology(graph, { operation: 'growth_plan', limit: 10 });
    // ignore 없을 때 둘 다 candidate
    assert.equal(without.summary.externalElementRefs, 2);
    assert.equal(without.summary.externalElementRefsIgnored, 0);

    const withIgnore = queryCompiledOntology(
      graph,
      { operation: 'growth_plan', limit: 10 },
      { omotIgnorePatterns: ['src/**'] },
    );
    // 'src/foo.ts' 는 매치, 'external/lib.ts' 는 안 매치
    assert.equal(withIgnore.summary.externalElementRefs, 1);
    assert.equal(withIgnore.summary.externalElementRefsIgnored, 1);
    assert.equal(withIgnore.externalElementRefs.rows[0].ref, 'external/lib.ts');
    assert.equal(withIgnore.externalElementRefs.ignored, 1);
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
      externalElementRefsIgnored: 0,
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

  it('does not surface vault README singleton components as health next actions', () => {
    const withReadme = compileOntology(
      [
        doc('README', {
          kind: 'vault-readme',
          title: 'README',
        }),
        doc('domains/auth', {
          kind: 'domain',
          title: 'Auth',
          capabilities: ['capabilities/login'],
        }),
        doc('capabilities/login', {
          kind: 'capability',
          title: 'Login',
          domain: 'domains/auth',
        }),
      ],
      { includeIndexes: true },
    );

    const health = queryCompiledOntology(withReadme, {
      operation: 'health',
    });
    assert.equal(health.status, 'healthy');
    assert.equal(health.summary.components, 2);
    assert.equal(health.summary.actionableComponents, 1);
    assert.equal(health.summary.ignoredComponents, 1);
    assert.deepEqual(
      health.checks.find((check) => check.id === 'components'),
      {
        id: 'components',
        status: 'pass',
        count: 1,
        message: 'The actionable ontology graph is connected; 1 root/reference component(s) were ignored.',
      },
    );

    const brief = queryCompiledOntology(withReadme, {
      operation: 'workspace_brief',
      limit: 5,
    });
    assert.equal(brief.status, 'healthy');
    assert.equal(
      brief.nextActions.some(
        (action) => action.kind === 'health_check' && action.id === 'components',
      ),
      false,
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
