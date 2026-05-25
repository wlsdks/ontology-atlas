import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertAllPathsShape,
  assertBacklinksShape,
  assertAgentBriefShape,
  assertBlastRadiusShape,
  assertCentralityShape,
  assertCyclesShape,
  assertDomainMatrixShape,
  assertExplainRelationShape,
  assertGrowthPlanShape,
  assertHealthShape,
  assertMaintenancePlanShape,
  assertMatchEdgesShape,
  assertMatchNodesShape,
  assertNodeProfileShape,
  assertOrphansShape,
  assertOverviewShape,
  assertPathShape,
  assertQueryConceptsShape,
  assertQueryOperation,
  assertQueryPlanShape,
  assertReachabilityShape,
  assertRelationCheckShape,
  assertSimilarNodesShape,
  assertWorkspaceBriefShape,
  allPathsResultExitCode,
  agentBriefExitCode,
  compileBlockingCounts,
  compileResultExitCode,
  cyclesResultExitCode,
  healthResultExitCode,
  pathResultExitCode,
  workspaceBriefExitCode,
} from './query-result-contract.mjs';

describe('query-result-contract', () => {
  it('returns the result when the operation matches', () => {
    const result = { operation: 'health', status: 'healthy' };

    assert.equal(assertQueryOperation(result, 'health'), result);
  });

  it('rejects non-object responses', () => {
    assert.throws(
      () => assertQueryOperation(null, 'health'),
      /health query returned a non-object response/,
    );
    assert.throws(
      () => assertQueryOperation([], 'health'),
      /health query returned a non-object response/,
    );
  });

  it('rejects unexpected operations', () => {
    assert.throws(
      () => assertQueryOperation({ operation: 'workspace_brief' }, 'health'),
      /health query returned unexpected operation: workspace_brief/,
    );
  });

  it('validates all_paths completeness payloads and exit status', () => {
    const valid = {
      operation: 'all_paths',
      from: 'capabilities/session',
      to: 'domains/auth',
      found: true,
      direction: 'undirected',
      maxHops: 3,
      limit: 10,
      searchBudget: 1000,
      expandedStates: 3,
      exhaustive: true,
      truncatedByBudget: false,
      totalPaths: 1,
      totalPathsExact: true,
      limited: false,
      shortestHopCount: 2,
      byLength: { 2: 1 },
      evidence: {
        status: 'complete',
        reason: 'complete',
        totalPathsExact: true,
        pathsComplete: true,
        nextStep: 'use',
        recommendation: 'Safe to treat paths and totalPaths as complete for the requested bounds.',
        suggestedQuery: { operation: 'all_paths', from: 'capabilities/session', to: 'domains/auth' },
      },
      paths: [
        {
          hopCount: 2,
          hops: ['capabilities/session', 'capabilities/login', 'domains/auth'],
          nodes: [
            { slug: 'capabilities/session', kind: 'capability', title: 'Session' },
            { slug: 'capabilities/login', kind: 'capability', title: 'Login' },
            { slug: 'domains/auth', kind: 'domain', title: 'Auth' },
          ],
          edges: [
            { from: 'capabilities/session', to: 'capabilities/login', via: 'dependencies' },
            { from: 'capabilities/login', to: 'domains/auth', via: 'domain' },
          ],
          byRelation: { dependencies: 1, domain: 1 },
        },
      ],
    };

    assert.equal(assertAllPathsShape(valid), valid);
    assert.equal(allPathsResultExitCode(valid), 0);
    assert.equal(allPathsResultExitCode({ ...valid, found: false, totalPaths: 0, shortestHopCount: null, byLength: {}, paths: [] }), 1);
    assert.throws(
      () => assertAllPathsShape({ ...valid, expandedStates: 1001 }),
      /all_paths expandedStates must not exceed searchBudget/,
    );
    assert.throws(
      () => assertAllPathsShape({
        ...valid,
        paths: [{ ...valid.paths[0], edges: [] }],
      }),
      /all_paths paths\[0\]\.edges length must match hops length/,
    );
    assert.throws(
      () => assertAllPathsShape({
        ...valid,
        evidence: { ...valid.evidence, status: 'complete', pathsComplete: false },
      }),
      /all_paths evidence has an invalid completeness shape/,
    );
  });

  it('validates query_plan execution advice payloads', () => {
    const valid = {
      operation: 'query_plan',
      targetOperation: 'all_paths',
      sideEffect: false,
      graph: { nodes: 3, edges: 2, resolvedEdges: 2, graphHash: 'abc123' },
      normalized: {
        targetOperation: 'all_paths',
        from: 'capabilities/start',
        to: 'capabilities/target',
        direction: 'undirected',
        maxHops: 4,
        limit: 100,
        searchBudget: 5000,
        types: null,
      },
      indexesUsed: ['aliasToSlug', 'in', 'out'],
      estimate: {
        strategy: 'bounded_path_enumeration',
        edgeScans: 20,
        reachableWithinDepth: 10,
        potentialPathUpperBound: 100,
        resultUpperBound: 100,
        costClass: 'high',
        frontierByDepth: [
          { distance: 1, frontierNodes: 1, candidateEdges: 20, newNodes: 20 },
        ],
      },
      warnings: ['all_paths may be truncated by limit; reduce maxHops or add relation types.'],
      execution: {
        shouldRun: false,
        nextStep: 'narrow',
        recommendation: 'Narrow the query before running it.',
        suggestedQuery: { operation: 'all_paths', from: 'capabilities/start', to: 'capabilities/target' },
        saferQuery: { operation: 'all_paths', from: 'capabilities/start', to: 'capabilities/target', maxHops: 3 },
      },
    };

    assert.equal(assertQueryPlanShape(valid, 'all_paths'), valid);
    assert.throws(
      () => assertQueryPlanShape({ ...valid, targetOperation: 'path' }, 'all_paths'),
      /query_plan targetOperation must be all_paths/,
    );
    assert.throws(
      () => assertQueryPlanShape({ ...valid, execution: { ...valid.execution, shouldRun: true, nextStep: 'narrow' } }, 'all_paths'),
      /query_plan execution has an invalid advice shape/,
    );
    assert.throws(
      () => assertQueryPlanShape({ ...valid, estimate: { ...valid.estimate, costClass: 'huge' } }, 'all_paths'),
      /query_plan estimate\.costClass must be low, medium, or high/,
    );
  });

  it('validates match_nodes payloads', () => {
    const valid = {
      operation: 'match_nodes',
      filters: {
        kind: 'capability',
        domain: null,
        slugContains: null,
        minDegree: 1,
        maxDegree: null,
        minInDegree: null,
        minOutDegree: null,
        hasIncoming: null,
        hasOutgoing: null,
        sort: 'degree',
      },
      totalMatches: 1,
      limited: false,
      followUp: {
        focusSlug: 'capabilities/login',
        reason: 'match_nodes is a scan; inspect this node before editing.',
        calls: [
          {
            id: 'profile_focus',
            label: 'Profile the first matched node before editing.',
            tool: 'query_ontology',
            arguments: {
              operation: 'node_profile',
              slug: 'capabilities/login',
              limit: 12,
            },
          },
        ],
        cliFallbackCommands: ['oh-my-ontology node capabilities/login [vault] --limit 12'],
      },
      nodes: [
        {
          slug: 'capabilities/login',
          kind: 'capability',
          title: 'Login',
          domain: 'domains/auth',
          inDegree: 2,
          outDegree: 1,
          degree: 3,
        },
      ],
    };

    assert.equal(assertMatchNodesShape(valid), valid);
    assert.throws(
      () => assertMatchNodesShape({ ...valid, totalMatches: '1' }),
      /match_nodes totalMatches must be a non-negative integer/,
    );
    assert.throws(
      () => assertMatchNodesShape({
        ...valid,
        nodes: [{ ...valid.nodes[0], degree: -1 }],
      }),
      /match_nodes nodes\[0\] has an invalid node row shape/,
    );
    assert.throws(
      () => assertMatchNodesShape({
        ...valid,
        followUp: {
          ...valid.followUp,
          cliFallbackCommands: ['node cli/src/index.mjs node capabilities/login'],
        },
      }),
      /match_nodes followUp must contain/,
    );
  });

  it('validates match_edges payloads', () => {
    const valid = {
      operation: 'match_edges',
      filters: {
        from: null,
        to: null,
        fromKind: 'capability',
        toKind: 'external',
        types: ['depends_on'],
        includeExternal: true,
        includeUnresolved: false,
      },
      totalMatches: 1,
      limited: false,
      followUp: {
        focusEdge: {
          from: 'capabilities/login',
          to: 'capabilities/session',
          via: 'relates',
        },
        reason: 'match_edges is a scan; inspect this edge before editing.',
        calls: [
          {
            id: 'explain_relation',
            label: 'Explain why the first matched edge exists.',
            tool: 'query_ontology',
            arguments: {
              operation: 'explain_relation',
              from: 'capabilities/login',
              to: 'capabilities/session',
            },
          },
        ],
        cliFallbackCommands: [
          'oh-my-ontology explain capabilities/login capabilities/session [vault]',
        ],
      },
      edges: [
        {
          id: 'capabilities/login|depends_on|src/auth.ts',
          from: 'capabilities/login',
          to: 'src/auth.ts',
          via: 'depends_on',
          ref: 'src/auth.ts',
          resolved: false,
          external: true,
          fromNode: {
            slug: 'capabilities/login',
            kind: 'capability',
            title: 'Login',
          },
          toNode: null,
          toKind: 'external',
        },
      ],
    };

    assert.equal(assertMatchEdgesShape(valid), valid);
    assert.throws(
      () => assertMatchEdgesShape({ ...valid, limited: 'false' }),
      /match_edges limited must be a boolean/,
    );
    assert.throws(
      () => assertMatchEdgesShape({
        ...valid,
        edges: [{ ...valid.edges[0], fromNode: { slug: 'capabilities/login', kind: 'capability' } }],
      }),
      /match_edges edges\[0\] has an invalid edge row shape/,
    );
    assert.throws(
      () => assertMatchEdgesShape({
        ...valid,
        followUp: {
          ...valid.followUp,
          focusEdge: { from: 'capabilities/login', via: 'relates' },
        },
      }),
      /match_edges followUp must contain/,
    );
  });

  it('validates explain_relation evidence payloads', () => {
    const valid = {
      operation: 'explain_relation',
      from: 'capabilities/login',
      to: 'capabilities/session',
      fromNode: { slug: 'capabilities/login', kind: 'capability', title: 'Login' },
      toNode: { slug: 'capabilities/session', kind: 'capability', title: 'Session' },
      verdict: 'direct',
      domains: { from: 'domains/auth', to: 'domains/auth', sameDomain: true },
      direct: {
        total: 1,
        edges: [
          {
            from: 'capabilities/login',
            to: 'capabilities/session',
            via: 'relates',
            direction: 'outgoing',
            fromNode: { slug: 'capabilities/login', kind: 'capability', title: 'Login' },
            toNode: { slug: 'capabilities/session', kind: 'capability', title: 'Session' },
          },
        ],
      },
      shortestPath: {
        found: true,
        direction: 'undirected',
        maxHops: 5,
        hopCount: 1,
        hops: ['capabilities/login', 'capabilities/session'],
        nodes: [
          { slug: 'capabilities/login', kind: 'capability', title: 'Login' },
          { slug: 'capabilities/session', kind: 'capability', title: 'Session' },
        ],
        edges: [
          { from: 'capabilities/login', to: 'capabilities/session', via: 'relates' },
        ],
      },
      commonNeighbors: {
        total: 1,
        limited: false,
        rows: [
          {
            slug: 'domains/auth',
            node: { slug: 'domains/auth', kind: 'domain', title: 'Auth' },
            fromEdges: [{ from: 'capabilities/login', to: 'domains/auth', via: 'domain', direction: 'outgoing' }],
            toEdges: [{ from: 'capabilities/session', to: 'domains/auth', via: 'domain', direction: 'outgoing' }],
          },
        ],
      },
    };

    assert.equal(assertExplainRelationShape(valid), valid);
    assert.throws(
      () => assertExplainRelationShape({ ...valid, verdict: 'maybe' }),
      /explain_relation verdict must be one of/,
    );
    assert.throws(
      () => assertExplainRelationShape({
        ...valid,
        shortestPath: { ...valid.shortestPath, edges: [] },
      }),
      /explain_relation shortestPath has an invalid path shape/,
    );
    assert.throws(
      () => assertExplainRelationShape({
        ...valid,
        commonNeighbors: { ...valid.commonNeighbors, rows: [{ ...valid.commonNeighbors.rows[0], node: { slug: 'other', kind: 'domain', title: 'Other' } }] },
      }),
      /explain_relation commonNeighbors\.rows\[0\] has an invalid common-neighbor shape/,
    );
  });

  it('validates reachability payloads', () => {
    const edge = {
      from: 'capabilities/login',
      to: 'domains/auth',
      via: 'domain',
      traversedFrom: 'capabilities/login',
      traversedTo: 'domains/auth',
    };
    const valid = {
      operation: 'reachability',
      start: 'capabilities/login',
      node: { slug: 'capabilities/login', kind: 'capability', title: 'Login' },
      direction: 'outgoing',
      depth: 3,
      summary: {
        reachableNodes: 1,
        traversedEdges: 1,
        layers: 1,
        terminalNodes: 1,
      },
      byKind: { domain: 1 },
      byRelation: { domain: 1 },
      layers: [
        {
          distance: 1,
          total: 1,
          nodes: [{ slug: 'domains/auth', kind: 'domain', title: 'Auth' }],
        },
      ],
      paths: {
        total: 1,
        limited: false,
        rows: [
          {
            slug: 'domains/auth',
            distance: 1,
            path: ['capabilities/login', 'domains/auth'],
            edges: [edge],
            node: { slug: 'domains/auth', kind: 'domain', title: 'Auth' },
          },
        ],
      },
      terminalNodes: [{ slug: 'domains/auth', kind: 'domain', title: 'Auth' }],
      edges: { total: 1, limited: false, rows: [edge] },
    };

    assert.equal(assertReachabilityShape(valid), valid);
    assert.throws(
      () => assertReachabilityShape({ ...valid, direction: 'sideways' }),
      /reachability direction must be one of: incoming, outgoing, both/,
    );
    assert.throws(
      () => assertReachabilityShape({ ...valid, summary: { ...valid.summary, reachableNodes: '1' } }),
      /reachability summary\.reachableNodes must be a non-negative integer/,
    );
    assert.throws(
      () => assertReachabilityShape({ ...valid, paths: { total: 1, limited: false, rows: [{ ...valid.paths.rows[0], path: ['domains/auth'] }] } }),
      /reachability paths must be a page with valid path rows/,
    );
  });

  it('validates domain_matrix payloads', () => {
    const valid = {
      operation: 'domain_matrix',
      project: 'project',
      summary: {
        domains: 2,
        nodes: 4,
        assignedNodes: 4,
        unassignedNodes: 0,
        crossDomainEdges: 1,
        selfDomainEdges: 2,
        externalEdges: 1,
        unresolvedEdges: 0,
      },
      domains: [
        {
          slug: 'domains/auth',
          node: { slug: 'domains/auth', kind: 'domain', title: 'Auth' },
          nodes: 2,
          outgoing: 1,
          incoming: 0,
          selfEdges: 1,
          externalEdges: 1,
          unresolvedEdges: 0,
        },
        {
          slug: 'domains/billing',
          node: { slug: 'domains/billing', kind: 'domain', title: 'Billing' },
          nodes: 2,
          outgoing: 0,
          incoming: 1,
          selfEdges: 1,
          externalEdges: 0,
          unresolvedEdges: 0,
        },
      ],
      connections: {
        total: 1,
        limited: false,
        rows: [
          {
            from: 'domains/auth',
            to: 'domains/billing',
            count: 1,
            byRelation: { depends_on: 1 },
            fromNode: { slug: 'domains/auth', kind: 'domain', title: 'Auth' },
            toNode: { slug: 'domains/billing', kind: 'domain', title: 'Billing' },
            examples: [
              {
                from: 'capabilities/login',
                to: 'capabilities/invoice',
                via: 'depends_on',
                resolved: true,
                external: false,
              },
            ],
          },
        ],
      },
    };

    assert.equal(assertDomainMatrixShape(valid), valid);
    assert.throws(
      () => assertDomainMatrixShape({ ...valid, summary: { ...valid.summary, nodes: 5 } }),
      /domain_matrix assignedNodes \+ unassignedNodes must equal nodes/,
    );
    assert.throws(
      () => assertDomainMatrixShape({
        ...valid,
        domains: [{ ...valid.domains[0], node: { ...valid.domains[0].node, slug: 'domains/other' } }],
      }),
      /domain_matrix domains\[0\] has an invalid domain row shape/,
    );
    assert.throws(
      () => assertDomainMatrixShape({
        ...valid,
        connections: {
          ...valid.connections,
          rows: [{ ...valid.connections.rows[0], byRelation: { depends_on: 2 } }],
        },
      }),
      /domain_matrix connections must be a page with valid connection rows/,
    );
  });

  it('validates agent_brief handoff payloads and exit status', () => {
    const valid = {
      operation: 'agent_brief',
      sideEffect: false,
      status: 'healthy',
      readiness: {
        status: 'ready',
        score: 100,
        meaningfulNodes: 3,
        relationCount: 2,
        projects: 1,
        domains: 1,
        capabilities: 1,
        elements: 1,
        unresolvedEdges: 0,
        externalEdges: 0,
        growthActions: 0,
        healthChecks: 1,
      },
      graph: { nodes: 4, edges: 2 },
      docs: {
        workflowGuide: {
          path: 'docs/AGENT-GRAPH-WORKFLOW.md',
          title: 'Agent Graph Workflow',
          description: 'CLI-only use, MCP-connected use, graph DB differences, graph query packs, and verification checks.',
        },
        modeComparison: [
          {
            id: 'cli_only',
            label: 'CLI-only',
            when: 'No MCP client is connected or the user wants terminal-only inspection.',
            gives: 'validate, workspace-brief, graph scans, graph DB pack, and fallback timing over the same local vault.',
          },
          {
            id: 'mcp_connected',
            label: 'MCP-connected',
            when: 'Claude Code, Codex, Cursor, or another MCP client is registered and restarted.',
            gives: 'direct read/write tools, structured repair fields, result contracts, and write guardrails.',
          },
          {
            id: 'graph_db_pack',
            label: 'Graph DB pack',
            when: 'The user wants database-style graph exploration without running a database server.',
            gives: 'bounded query plans, node/edge scans, domain matrix, path evidence, and proof follow-ups.',
          },
          {
            id: 'setup_gate',
            label: 'Setup gate',
            when: 'Setup is unclear or the agent was opened from a separate codebase root.',
            gives: 'config repair commands, JSON readiness, performance timing, and restart guidance before edits.',
          },
        ],
        graphScanProofChecklist: [
          {
            id: 'report_scan_scope',
            label: 'Report scan scope',
            evidence: ['totalMatches', 'limited', 'row count'],
          },
          {
            id: 'prove_node_rows',
            label: 'Prove node rows',
            evidence: ['node_profile', 'blast_radius'],
          },
          {
            id: 'prove_edge_rows',
            label: 'Prove edge rows',
            evidence: ['explain_relation', 'path', 'relation_check'],
          },
          {
            id: 'prove_path_completeness',
            label: 'Prove path completeness',
            evidence: ['evidence.pathsComplete', 'totalPathsExact'],
          },
        ],
      },
      handoffPrompt: [
        'Use the oh-my-ontology MCP server as the shared codebase graph memory before editing.',
        'Run these first-contact MCP calls in order:',
        'CLI fallback commands when the MCP connector is unavailable:',
        'Graph DB query pack for local markdown graph scans:',
        'Investigation playbooks:',
        'Traversal strategy:',
        'Write guardrails:',
        'Result contracts:',
        'all_paths: report searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact.',
        'Run relation_check before add_relation.',
      ].join('\n'),
      cliFallbackCommands: [
        'oh-my-ontology workspace-brief [vault] --limit 5',
        'oh-my-ontology relation-check domains/auth capabilities/login contains [vault]',
        'oh-my-ontology all-paths domains/auth capabilities/login [vault] --plan --max-hops 3',
      ],
      health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] },
      nextActions: [],
      entrypoints: [
        {
          slug: 'domains/auth',
          title: 'Auth',
          kind: 'domain',
          degree: 2,
          inDegree: 1,
          outDegree: 1,
        },
      ],
      firstCalls: [
        { tool: 'query_ontology', arguments: { operation: 'workspace_brief', limit: 5 } },
        { tool: 'query_ontology', arguments: { operation: 'relation_check', from: 'domains/auth', to: 'capabilities/login', type: 'contains' } },
      ],
      graphDbQueryPack: [
        {
          id: 'graph_facets',
          intent: 'MATCH graph RETURN kind/domain/degree/relation facets LIMIT 10',
          goal: 'Read graph dashboard buckets.',
          calls: [
            { tool: 'query_ontology', arguments: { operation: 'facets', limit: 10 } },
            { tool: 'query_ontology', arguments: { operation: 'schema', limit: 20 } },
          ],
        },
        {
          id: 'node_scan',
          intent: 'MATCH (n:capability) WHERE degree(n) >= 2 RETURN n ORDER BY degree(n) DESC LIMIT 10',
          goal: 'Find high-degree nodes.',
          calls: [
            { tool: 'query_ontology', arguments: { operation: 'query_plan', targetOperation: 'match_nodes', kind: 'capability', minDegree: 2, limit: 10 } },
            { tool: 'query_ontology', arguments: { operation: 'match_nodes', kind: 'capability', minDegree: 2, limit: 10 } },
          ],
        },
        {
          id: 'edge_scan',
          intent: 'MATCH ()-[r:depends_on]->() RETURN r LIMIT 20',
          goal: 'Scan dependency edges.',
          calls: [
            { tool: 'query_ontology', arguments: { operation: 'query_plan', targetOperation: 'match_edges', types: ['depends_on'], limit: 20 } },
            { tool: 'query_ontology', arguments: { operation: 'match_edges', types: ['depends_on'], limit: 20 } },
          ],
        },
        {
          id: 'domain_coupling',
          intent: 'MATCH (domain)-[depends_on|relates]->(domain) RETURN coupling_matrix LIMIT 6',
          goal: 'Compare domain coupling.',
          calls: [
            { tool: 'query_ontology', arguments: { operation: 'domain_matrix', types: ['depends_on', 'relates'], limit: 6 } },
            { tool: 'query_ontology', arguments: { operation: 'query_plan', targetOperation: 'centrality', types: ['depends_on', 'relates'], limit: 10 } },
            { tool: 'query_ontology', arguments: { operation: 'centrality', types: ['depends_on', 'relates'], limit: 10 } },
          ],
        },
        {
          id: 'path_evidence',
          intent: 'MATCH p=(from)-[:depends_on|relates*..3]-(to) RETURN p LIMIT 10',
          goal: 'Collect bounded path evidence.',
          calls: [
            { tool: 'query_ontology', arguments: { operation: 'query_plan', targetOperation: 'all_paths', from: 'domains/auth', to: 'capabilities/login', maxHops: 3, searchBudget: 1000, limit: 10 } },
            { tool: 'query_ontology', arguments: { operation: 'all_paths', from: 'domains/auth', to: 'capabilities/login', maxHops: 3, searchBudget: 1000, limit: 10 } },
            { tool: 'query_ontology', arguments: { operation: 'explain_relation', from: 'domains/auth', to: 'capabilities/login', maxHops: 5, limit: 10 } },
          ],
        },
      ],
      playbooks: [
        {
          id: 'refactor_impact',
          goal: 'Estimate impact before edits.',
          evidence: ['Blast radius evidence.'],
          stopWhen: ['relation_check needs review.'],
          calls: [
            { tool: 'query_ontology', arguments: { operation: 'blast_radius', slug: 'domains/auth' } },
            { tool: 'query_ontology', arguments: { operation: 'relation_check', from: 'domains/auth', to: 'capabilities/login', type: 'contains' } },
          ],
        },
        {
          id: 'graph_traversal',
          goal: 'Gather traversal evidence.',
          evidence: ['Path alternatives.'],
          stopWhen: ['Traversal cost is high.'],
          calls: [
            { tool: 'query_ontology', arguments: { operation: 'schema', limit: 20 } },
            { tool: 'query_ontology', arguments: { operation: 'all_paths', from: 'domains/auth', to: 'capabilities/login', maxHops: 5 } },
            { tool: 'query_ontology', arguments: { operation: 'pattern_walk', slug: 'project/app', pattern: ['domains', 'capabilities'] } },
            { tool: 'query_ontology', arguments: { operation: 'project_map', project: 'project/app' } },
          ],
        },
        {
          id: 'onboarding_map',
          goal: 'Build first mental map.',
          evidence: ['Node scan evidence.'],
          stopWhen: ['query_plan(match_nodes) asks for narrowing.'],
          calls: [
            { tool: 'query_ontology', arguments: { operation: 'workspace_brief', limit: 5 } },
            { tool: 'query_ontology', arguments: { operation: 'domain_matrix', limit: 10 } },
            { tool: 'query_ontology', arguments: { operation: 'query_plan', targetOperation: 'match_nodes', kind: 'capability', minDegree: 2, limit: 10 } },
            { tool: 'query_ontology', arguments: { operation: 'match_nodes', kind: 'capability', minDegree: 2, limit: 10 } },
            { tool: 'query_ontology', arguments: { operation: 'node_profile', slug: 'domains/auth' } },
          ],
        },
        {
          id: 'coupling_audit',
          goal: 'Audit coupling before boundary edits.',
          evidence: ['Edge scan evidence.'],
          stopWhen: ['match_edges contradicts centrality.'],
          calls: [
            { tool: 'query_ontology', arguments: { operation: 'health', limit: 5 } },
            { tool: 'query_ontology', arguments: { operation: 'domain_matrix', limit: 10 } },
            { tool: 'query_ontology', arguments: { operation: 'query_plan', targetOperation: 'centrality', limit: 10 } },
            { tool: 'query_ontology', arguments: { operation: 'centrality', limit: 10 } },
            { tool: 'query_ontology', arguments: { operation: 'query_plan', targetOperation: 'match_edges', types: ['depends_on'], limit: 20 } },
            { tool: 'query_ontology', arguments: { operation: 'match_edges', types: ['depends_on'], limit: 20 } },
          ],
        },
      ],
      traversalStrategy: [
        {
          id: 'plan_before_enumeration',
          priority: 'first',
          goal: 'Estimate traversal cost.',
          useWhen: 'Traversal may be expensive.',
          evidence: ['query_plan.execution.nextStep', 'query_plan.execution.saferQuery'],
          stopWhen: ['execution.nextStep is narrow.'],
          calls: [
            { tool: 'query_ontology', arguments: { operation: 'query_plan', targetOperation: 'all_paths', from: 'domains/auth', to: 'capabilities/login' } },
          ],
        },
        {
          id: 'bounded_path_evidence',
          priority: 'evidence',
          goal: 'Enumerate bounded paths.',
          useWhen: 'Multiple path alternatives matter.',
          evidence: ['all_paths.evidence.pathsComplete', 'all_paths.totalPathsExact'],
          stopWhen: ['evidence.pathsComplete is false.'],
          calls: [
            { tool: 'query_ontology', arguments: { operation: 'all_paths', from: 'domains/auth', to: 'capabilities/login', maxHops: 3, searchBudget: 1000, limit: 10 } },
          ],
        },
        {
          id: 'containment_cross_check',
          priority: 'confirm',
          goal: 'Cross-check containment.',
          useWhen: 'Project/domain placement matters.',
          evidence: ['pattern_walk rows.', 'project_map placement.'],
          stopWhen: ['Containment disagrees.'],
          calls: [
            { tool: 'query_ontology', arguments: { operation: 'pattern_walk', slug: 'project/app', pattern: ['domains', 'capabilities'] } },
            { tool: 'query_ontology', arguments: { operation: 'project_map', project: 'project/app' } },
          ],
        },
      ],
      writeGuardrails: [
        {
          id: 'preflight_relation',
          goal: 'Before add_relation.',
          calls: [
            { tool: 'query_ontology', arguments: { operation: 'relation_check', from: 'domains/auth', to: 'capabilities/login', type: 'contains' } },
            { tool: 'query_ontology', arguments: { operation: 'path', from: 'domains/auth', to: 'capabilities/login' } },
          ],
        },
        {
          id: 'preflight_rename',
          goal: 'Before rename.',
          calls: [
            { tool: 'find_backlinks', arguments: { slug: 'domains/auth' } },
            { tool: 'query_ontology', arguments: { operation: 'node_profile', slug: 'domains/auth' } },
          ],
        },
        {
          id: 'post_change_sync',
          goal: 'After changes.',
          calls: [
            { tool: 'query_ontology', arguments: { operation: 'health' } },
            { tool: 'query_ontology', arguments: { operation: 'cycles', maxHops: 8 } },
            { tool: 'query_ontology', arguments: { operation: 'growth_plan', limit: 20 } },
            { tool: 'query_ontology', arguments: { operation: 'maintenance_plan', limit: 20 } },
            { tool: 'validate_vault', arguments: {} },
          ],
        },
      ],
      writePolicy: [
        'Run read tools first.',
        'Run relation_check before add_relation.',
        'For all_paths, report limit/searchBudget/expandedStates/exhaustive/truncatedByBudget/totalPathsExact plus evidence.status/evidence.reason/evidence.pathsComplete and treat incomplete paths as partial evidence.',
        'Run find_backlinks before rename_concept.',
      ],
      resultContracts: [
        {
          operation: 'all_paths',
          mustReport: [
            'limit',
            'searchBudget',
            'expandedStates',
            'exhaustive',
            'truncatedByBudget',
            'totalPathsExact',
            'evidence.status',
            'evidence.reason',
            'evidence.pathsComplete',
          ],
          partialWhen: ['exhaustive=false', 'truncatedByBudget=true', 'totalPathsExact=false', 'evidence.status=partial', 'evidence.pathsComplete=false'],
          policy: 'Treat paths as partial evidence unless evidence.pathsComplete is true; treat totalPaths as partial evidence unless totalPathsExact is true; follow evidence.suggestedQuery or narrow maxHops/types before using paths as write evidence.',
        },
        {
          operation: 'match_nodes',
          mustReport: [
            'totalMatches',
            'limited',
            'nodes.length',
            'followUp.focusSlug',
            'followUp.calls',
            'followUp.cliFallbackCommands',
          ],
          partialWhen: ['limited=true', 'nodes.length=0', 'followUp missing because no rows were returned'],
          policy: 'Treat match_nodes rows as scan candidates, not evidence; run the followUp node_profile and blast_radius calls before using a node row.',
        },
        {
          operation: 'match_edges',
          mustReport: [
            'totalMatches',
            'limited',
            'edges.length',
            'followUp.focusEdge',
            'followUp.calls',
            'followUp.cliFallbackCommands',
          ],
          partialWhen: ['limited=true', 'edges.length=0', 'followUp missing because the first row is external/unresolved or no rows were returned'],
          policy: 'Treat match_edges rows as scan candidates, not proof; run the followUp explain_relation, path, and relation_check calls before using an edge row.',
        },
      ],
      relationDecisionGuide: [
        { decision: 'skip_existing', severity: 'info', meaning: 'Do not add duplicate edge.' },
        { decision: 'review_inverse', severity: 'warn', meaning: 'Review reverse edge direction.' },
        { decision: 'safe_to_add', severity: 'info', meaning: 'Schema is familiar.' },
        { decision: 'review_new_schema', severity: 'warn', meaning: 'Explain new schema pattern.' },
      ],
    };

    assert.equal(assertAgentBriefShape(valid), valid);
    assert.equal(agentBriefExitCode(valid), 0);
    assert.equal(agentBriefExitCode({ ...valid, readiness: { ...valid.readiness, status: 'needs_attention' } }), 1);
    assert.throws(
      () => assertAgentBriefShape({ ...valid, handoffPrompt: 'missing useful handoff content' }),
      /agent_brief handoffPrompt must be a non-empty agent handoff string/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        docs: {
          ...valid.docs,
          graphScanProofChecklist: valid.docs.graphScanProofChecklist.filter(
            (row) => row.id !== 'prove_edge_rows',
          ),
        },
      }),
      /agent_brief docs must include workflowGuide and graphScanProofChecklist guidance/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        docs: {
          ...valid.docs,
          modeComparison: valid.docs.modeComparison.filter(
            (row) => row.id !== 'setup_gate',
          ),
        },
      }),
      /agent_brief docs must include workflowGuide and graphScanProofChecklist guidance/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, cliFallbackCommands: [] }),
      /agent_brief cliFallbackCommands must include non-empty oh-my-ontology CLI fallback commands/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, cliFallbackCommands: ['node cli/src/index.mjs health'] }),
      /agent_brief cliFallbackCommands must include non-empty oh-my-ontology CLI fallback commands/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, firstCalls: [{ tool: 'query_ontology', arguments: {} }] }),
      /firstCalls\[0\] has an invalid tool-call shape/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        firstCalls: valid.firstCalls.filter((call) => call.arguments.operation !== 'relation_check'),
      }),
      /agent_brief firstCalls must include relation_check preflight/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, graphDbQueryPack: valid.graphDbQueryPack.slice(1) }),
      /agent_brief graphDbQueryPack must include graph facets, node scan, edge scan, domain coupling, and path evidence query packs/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: [
          { ...valid.playbooks[0], calls: valid.playbooks[0].calls.filter((call) => call.arguments.operation !== 'relation_check') },
          valid.playbooks[1],
        ],
      }),
      /agent_brief refactor_impact playbook must include relation_check preflight/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: [{ ...valid.playbooks[0], evidence: [] }, valid.playbooks[1]],
      }),
      /agent_brief playbooks\[0\] has an invalid playbook shape/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: [{ ...valid.playbooks[0], stopWhen: [] }, valid.playbooks[1]],
      }),
      /agent_brief playbooks\[0\] has an invalid playbook shape/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.filter((playbook) => playbook.id !== 'onboarding_map'),
      }),
      /agent_brief playbooks must include onboarding_map/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.map((playbook) =>
          playbook.id === 'onboarding_map'
            ? { ...playbook, calls: playbook.calls.filter((call) => call.arguments.operation !== 'match_nodes') }
            : playbook,
        ),
      }),
      /agent_brief onboarding_map playbook must include match_nodes/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.map((playbook) =>
          playbook.id === 'onboarding_map'
            ? {
                ...playbook,
                calls: playbook.calls.map((call) =>
                  call.arguments.operation === 'query_plan'
                    ? { ...call, arguments: { ...call.arguments, targetOperation: 'centrality' } }
                    : call,
                ),
              }
            : playbook,
        ),
      }),
      /agent_brief onboarding_map playbook must include query_plan\(match_nodes\)/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.filter((playbook) => playbook.id !== 'coupling_audit'),
      }),
      /agent_brief playbooks must include coupling_audit/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.map((playbook) =>
          playbook.id === 'coupling_audit'
            ? { ...playbook, calls: playbook.calls.filter((call) => call.arguments.operation !== 'match_edges') }
            : playbook,
        ),
      }),
      /agent_brief coupling_audit playbook must include match_edges/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.map((playbook) =>
          playbook.id === 'coupling_audit'
            ? {
                ...playbook,
                calls: playbook.calls.filter(
                  (call) =>
                    call.arguments.operation !== 'query_plan'
                    || call.arguments.targetOperation !== 'match_edges',
                ),
              }
            : playbook,
        ),
      }),
      /agent_brief coupling_audit playbook must include query_plan\(match_edges\)/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.filter((playbook) => playbook.id !== 'graph_traversal'),
      }),
      /agent_brief playbooks must include graph_traversal/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        playbooks: valid.playbooks.map((playbook) =>
          playbook.id === 'graph_traversal'
            ? { ...playbook, calls: playbook.calls.filter((call) => call.arguments.operation !== 'all_paths') }
            : playbook,
        ),
      }),
      /agent_brief graph_traversal playbook must include all_paths/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, traversalStrategy: [] }),
      /agent_brief traversalStrategy must include plan, bounded path evidence, and containment cross-check guidance/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        traversalStrategy: valid.traversalStrategy.filter((strategy) => strategy.id !== 'bounded_path_evidence'),
      }),
      /agent_brief traversalStrategy must include plan, bounded path evidence, and containment cross-check guidance/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, writePolicy: ['Run read tools first.'] }),
      /agent_brief writePolicy must mention relation_check before add_relation/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, resultContracts: [] }),
      /agent_brief resultContracts must include all_paths completeness plus match_nodes\/match_edges followUp policies/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        resultContracts: [{ ...valid.resultContracts[0], mustReport: ['searchBudget'] }],
      }),
      /agent_brief resultContracts must include all_paths completeness plus match_nodes\/match_edges followUp policies/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        resultContracts: valid.resultContracts.filter((contract) => contract.operation !== 'match_edges'),
      }),
      /agent_brief resultContracts must include all_paths completeness plus match_nodes\/match_edges followUp policies/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        relationDecisionGuide: valid.relationDecisionGuide.filter((row) => row.decision !== 'review_inverse'),
      }),
      /agent_brief relationDecisionGuide must cover relation_check decision outcomes/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, writeGuardrails: [] }),
      /agent_brief writeGuardrails must be a non-empty array/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        writeGuardrails: valid.writeGuardrails.filter((guardrail) => guardrail.id !== 'preflight_rename'),
      }),
      /agent_brief writeGuardrails must include preflight_rename find_backlinks/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        writeGuardrails: valid.writeGuardrails.map((guardrail) =>
          guardrail.id === 'post_change_sync'
            ? {
                ...guardrail,
                calls: guardrail.calls.filter((call) => call.arguments?.operation !== 'maintenance_plan'),
              }
            : guardrail,
        ),
      }),
      /agent_brief writeGuardrails must include post_change_sync maintenance_plan/,
    );
    assert.throws(
      () => assertAgentBriefShape({
        ...valid,
        writeGuardrails: [{ id: 'post_change_sync', goal: 'After changes.', calls: [{ tool: 'validate_vault', arguments: { extra: true } }] }],
      }),
      /agent_brief writeGuardrails\[0\] has an invalid guardrail shape/,
    );
    assert.throws(
      () => assertAgentBriefShape({ ...valid, sideEffect: true }),
      /agent_brief sideEffect must be false/,
    );
  });

  it('rejects malformed maintenance_plan payloads before CLI output', () => {
    const valid = {
      operation: 'maintenance_plan',
      summary: {
        totalActions: 1,
        filteredActions: 1,
        remainingActions: 1,
        executableActions: 1,
        reviewActions: 0,
      },
      filters: {
        executableOnly: false,
        phases: [],
        severities: [],
        kinds: [],
      },
      cursor: {
        afterActionId: null,
        found: true,
        reason: null,
        startIndex: 0,
        nextAfterActionId: 'maint_1',
        hasMore: false,
      },
      byPhase: { repair: 1 },
      bySeverity: { warn: 1 },
      byKind: { canonicalize_graph_arrays: 1 },
      limited: false,
      nextExecutableAction: {
        id: 'maint_1',
        phase: 'repair',
        kind: 'canonicalize_graph_arrays',
        severity: 'warn',
        executable: true,
      },
      nextReviewAction: null,
      actions: [
        {
          id: 'maint_1',
          phase: 'repair',
          kind: 'canonicalize_graph_arrays',
          severity: 'warn',
          executable: true,
          score: 100,
          reason: 'Canonicalize graph arrays.',
          node: { slug: 'capabilities/foo' },
          proposedAction: {
            tool: 'patch_concept',
            args: { slug: 'capabilities/foo', frontmatter: { dependencies: [] } },
          },
        },
      ],
      compiledSummary: {
        nodes: 2,
        edges: 1,
        issues: 0,
      },
    };
    const withReview = {
      ...valid,
      summary: {
        totalActions: 2,
        filteredActions: 2,
        remainingActions: 2,
        executableActions: 1,
        reviewActions: 1,
      },
      cursor: { ...valid.cursor, nextAfterActionId: 'maint_review' },
      byPhase: { repair: 1, review: 1 },
      bySeverity: { warn: 1, info: 1 },
      byKind: { canonicalize_graph_arrays: 1, unassigned_node: 1 },
      nextReviewAction: {
        id: 'maint_review',
        phase: 'review',
        kind: 'unassigned_node',
        severity: 'info',
        executable: false,
      },
      actions: [
        valid.actions[0],
        {
          id: 'maint_review',
          phase: 'review',
          kind: 'unassigned_node',
          severity: 'info',
          executable: false,
          score: 10,
          reason: 'Review unassigned node.',
        },
      ],
    };

    assert.equal(assertMaintenancePlanShape(valid), valid);
    assert.equal(assertMaintenancePlanShape(withReview), withReview);
    assert.equal(
      assertMaintenancePlanShape({
        ...valid,
        summary: { ...valid.summary, totalActions: 0, filteredActions: 0, remainingActions: 0, executableActions: 0 },
        cursor: {
          afterActionId: null,
          found: true,
          reason: null,
          nextAfterActionId: null,
          hasMore: false,
        },
        byPhase: {},
        bySeverity: {},
        byKind: {},
        nextExecutableAction: null,
        actions: [],
      }).cursor.startIndex,
      undefined,
    );
    assert.equal(
      assertMaintenancePlanShape({
        ...valid,
        cursor: {
          ...valid.cursor,
          startIndex: null,
        },
      }).cursor.startIndex,
      null,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, summary: { ...valid.summary, remainingActions: -1 } }),
      /summary\.remainingActions must be a non-negative integer/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, summary: { ...valid.summary, executableActions: 0 } }),
      /summary executableActions \+ reviewActions must equal totalActions/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, summary: { ...valid.summary, filteredActions: 2 } }),
      /summary\.filteredActions must not exceed totalActions/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, summary: { ...valid.summary, remainingActions: 2 } }),
      /summary\.remainingActions must not exceed filteredActions/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, filters: null }),
      /filters must be an object/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, filters: { ...valid.filters, executableOnly: 'false' } }),
      /filters\.executableOnly must be a boolean/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, filters: { ...valid.filters, phases: ['repair', ''] } }),
      /filters\.phases must be an array of non-empty strings/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, cursor: { ...valid.cursor, hasMore: 'no' } }),
      /cursor\.hasMore must be a boolean/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, cursor: { ...valid.cursor, nextAfterActionId: 'maint_other' } }),
      /cursor\.nextAfterActionId must match the last returned action id/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, cursor: { ...valid.cursor, hasMore: true } }),
      /cursor\.hasMore must match remaining actions after the current page/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, actions: [{ ...valid.actions[0], score: '100' }] }),
      /actions\[0\]\.score must be a non-negative number/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, actions: [{ ...valid.actions[0], score: -1 }] }),
      /actions\[0\]\.score must be a non-negative number/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, actions: [{ ...valid.actions[0], reason: '' }] }),
      /actions\[0\]\.reason must be a non-empty string/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, actions: [{ ...valid.actions[0], proposedAction: null }] }),
      /executable action maint_1 must include proposedAction/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        actions: [{ ...valid.actions[0], proposedAction: { args: {} } }],
      }),
      /action maint_1 proposedAction\.tool must be a non-empty string/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        actions: [{ ...valid.actions[0], proposedAction: { tool: 'patch_concept' } }],
      }),
      /action maint_1 proposedAction\.args must be an object/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        actions: [{ ...valid.actions[0], proposedAction: { tool: 'add_relation', args: valid.actions[0].proposedAction.args } }],
      }),
      /action maint_1 proposedAction\.tool must be patch_concept/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        actions: [{
          ...valid.actions[0],
          proposedAction: { ...valid.actions[0].proposedAction, args: { slug: 'capabilities/bar' } },
        }],
      }),
      /action maint_1 proposedAction\.slug must match node summary/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        byKind: { add_missing_relation: 1 },
        actions: [{
          ...valid.actions[0],
          kind: 'add_missing_relation',
          node: undefined,
          nodes: { from: { slug: 'domains/auth' }, to: { slug: 'capabilities/login' } },
          proposedAction: { tool: 'patch_concept', args: { from: 'domains/auth', to: 'capabilities/login', type: 'capabilities' } },
        }],
        nextExecutableAction: { ...valid.nextExecutableAction, kind: 'add_missing_relation' },
      }),
      /action maint_1 proposedAction\.tool must be add_relation/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        byKind: { add_missing_relation: 1 },
        actions: [{
          ...valid.actions[0],
          kind: 'add_missing_relation',
          node: undefined,
          nodes: { from: { slug: 'domains/auth' }, to: { slug: 'capabilities/login' } },
          proposedAction: { tool: 'add_relation', args: { from: 'domains/auth', to: 'capabilities/other', type: 'capabilities' } },
        }],
        nextExecutableAction: { ...valid.nextExecutableAction, kind: 'add_missing_relation' },
      }),
      /action maint_1 proposedAction endpoints must match node summaries/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        byKind: { materialize_external_element: 1 },
        actions: [{
          ...valid.actions[0],
          kind: 'materialize_external_element',
          node: undefined,
          proposedAction: { tool: 'add_concept', args: { slug: 'elements/src/foo', kind: 'capability' } },
        }],
        nextExecutableAction: { ...valid.nextExecutableAction, kind: 'materialize_external_element' },
      }),
      /action maint_1 proposedAction\.kind must be element/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, summary: { ...valid.summary, remainingActions: 0 } }),
      /actions length must not exceed summary\.remainingActions/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, byPhase: { repair: -1 } }),
      /byPhase must be an object of non-negative integer counts/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, byPhase: { repair: 2 } }),
      /byPhase total must equal summary\.remainingActions/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, nextExecutableAction: {} }),
      /nextExecutableAction must be null or an action pointer with id, executable, phase, kind, and severity/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, nextExecutableAction: { id: 'maint_1' } }),
      /nextExecutableAction must be null or an action pointer with id, executable, phase, kind, and severity/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        nextExecutableAction: { ...valid.nextExecutableAction, id: 'maint_other' },
      }),
      /nextExecutableAction must match the first executable action on the page/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        nextExecutableAction: { ...valid.nextExecutableAction, phase: 'link' },
      }),
      /nextExecutableAction\.phase must match the first page action/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        nextExecutableAction: { ...valid.nextExecutableAction, kind: 'add_missing_relation' },
      }),
      /nextExecutableAction\.kind must match the first page action/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        nextExecutableAction: { ...valid.nextExecutableAction, severity: 'info' },
      }),
      /nextExecutableAction\.severity must match the first page action/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        nextExecutableAction: { ...valid.nextExecutableAction, executable: false },
      }),
      /nextExecutableAction\.executable must match the first page action/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...valid,
        nextReviewAction: {
          id: 'maint_review',
          phase: 'review',
          kind: 'unassigned_node',
          severity: 'info',
          executable: false,
        },
      }),
      /nextReviewAction must be null when the page has no review actions/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...withReview,
        nextReviewAction: { ...withReview.nextReviewAction, kind: 'empty_domain' },
      }),
      /nextReviewAction\.kind must match the first page action/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({
        ...withReview,
        nextReviewAction: { ...withReview.nextReviewAction, executable: true },
      }),
      /nextReviewAction\.executable must match the first page action/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, limited: 'no' }),
      /limited must be a boolean/,
    );
    assert.throws(
      () => assertMaintenancePlanShape({ ...valid, compiledSummary: { nodes: -1, edges: 1, issues: 0 } }),
      /compiledSummary\.nodes must be a non-negative integer when present/,
    );
  });

  it('rejects malformed growth_plan payloads before CLI output', () => {
    const valid = {
      operation: 'growth_plan',
      summary: {
        relationRecommendations: 1,
        externalElementRefs: 1,
        externalElementRefsIgnored: 2,
        danglingReferences: 0,
        unassignedNodes: 0,
        emptyDomains: 0,
        totalActions: 2,
      },
      relationRecommendations: {
        operation: 'recommend_relations',
        mode: 'domain_containment',
        totalRecommendations: 1,
        limited: false,
        recommendations: [
          {
            kind: 'missing_domain_containment',
            score: 0.7,
            from: 'project',
            to: 'domains/auth',
            relation: 'contains',
            reason: 'Missing containment relation.',
            proposedAction: { tool: 'add_relation', args: { from: 'project', to: 'domains/auth', type: 'contains' } },
          },
        ],
      },
      externalElementRefs: {
        total: 1,
        limited: false,
        ignored: 2,
        rows: [
          {
            kind: 'materialize_external_element',
            score: 0.8,
            from: 'capabilities/foo',
            ref: 'src/foo.ts',
            suggestedSlug: 'elements/src/foo',
            reason: 'Materialize external element.',
            proposedAction: { tool: 'add_concept', args: { slug: 'elements/src/foo', kind: 'element', title: 'Foo' } },
          },
        ],
      },
      danglingReferences: { total: 0, limited: false, rows: [] },
      unassignedNodes: { total: 0, limited: false, rows: [] },
      emptyDomains: { total: 0, limited: false, rows: [] },
      compiledSummary: { nodes: 2, edges: 1, issues: 0 },
    };

    assert.equal(assertGrowthPlanShape(valid), valid);
    assert.equal(
      assertGrowthPlanShape({
        ...valid,
        summary: { ...valid.summary, unassignedNodes: 1, emptyDomains: 1 },
        unassignedNodes: {
          total: 1,
          limited: false,
          rows: [{ kind: 'unassigned_node', score: 0.5, slug: 'capabilities/free', reason: 'Assign a domain.' }],
        },
        emptyDomains: {
          total: 1,
          limited: false,
          rows: [{ kind: 'empty_domain', score: 0.4, slug: 'domains/empty', reason: 'No contained nodes.' }],
        },
      }).summary.totalActions,
      2,
    );
    assert.throws(
      () => assertGrowthPlanShape({ ...valid, summary: { ...valid.summary, totalActions: 3 } }),
      /summary\.totalActions must equal the actionable candidate totals/,
    );
    assert.throws(
      () => assertGrowthPlanShape({
        ...valid,
        relationRecommendations: { ...valid.relationRecommendations, recommendations: [] },
      }),
      /relationRecommendations recommendations length must equal totalRecommendations when not limited/,
    );
    assert.throws(
      () => assertGrowthPlanShape({
        ...valid,
        externalElementRefs: { ...valid.externalElementRefs, ignored: 1 },
      }),
      /externalElementRefs\.ignored must equal summary\.externalElementRefsIgnored/,
    );
    assert.throws(
      () => assertGrowthPlanShape({
        ...valid,
        externalElementRefs: {
          ...valid.externalElementRefs,
          rows: [{ ...valid.externalElementRefs.rows[0], score: -1 }],
        },
      }),
      /externalElementRefs\.rows\[0\] has an invalid growth-candidate shape/,
    );
    assert.throws(
      () => assertGrowthPlanShape({
        ...valid,
        relationRecommendations: {
          ...valid.relationRecommendations,
          recommendations: [
            {
              ...valid.relationRecommendations.recommendations[0],
              proposedAction: { tool: 'add_concept', args: { from: 'project', to: 'domains/auth', type: 'contains' } },
            },
          ],
        },
      }),
      /relationRecommendations\.recommendations\[0\] proposedAction\.tool must be add_relation/,
    );
    assert.throws(
      () => assertGrowthPlanShape({
        ...valid,
        externalElementRefs: {
          ...valid.externalElementRefs,
          rows: [
            {
              ...valid.externalElementRefs.rows[0],
              proposedAction: { tool: 'add_concept', args: { slug: 'elements/other', kind: 'element', title: 'Foo' } },
            },
          ],
        },
      }),
      /externalElementRefs\.rows\[0\] proposedAction\.slug must match suggestedSlug/,
    );
  });

  it('rejects malformed health and workspace_brief payloads before CLI output', () => {
    const health = {
      operation: 'health',
      status: 'healthy',
      summary: { nodes: 1, edges: 0 },
      checks: [{ id: 'compile_issues', status: 'pass', count: 0 }],
    };
    const workspaceBrief = {
      operation: 'workspace_brief',
      status: 'healthy',
      summary: { nodes: 1, edges: 0 },
      nextActions: [{ id: 'cleanup', kind: 'cleanup', severity: 'warn' }],
      health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] },
      growth: { totalActions: 0 },
    };

    assert.equal(assertHealthShape(health), health);
    assert.equal(assertWorkspaceBriefShape(workspaceBrief), workspaceBrief);
    assert.throws(
      () => assertHealthShape({ ...health, checks: [{ id: 'compile_issues', status: 'pass' }] }),
      /health checks\[0\] has an invalid health-check shape/,
    );
    assert.throws(
      () => assertHealthShape({ ...health, summary: null }),
      /health summary must be an object/,
    );
    assert.throws(
      () => assertWorkspaceBriefShape({ ...workspaceBrief, nextActions: [{ kind: 'cleanup', severity: 'fatal' }] }),
      /workspace_brief nextActions\[0\] has an invalid next-action shape/,
    );
    assert.throws(
      () => assertWorkspaceBriefShape({ ...workspaceBrief, nextActions: [{ id: 'cleanup', severity: 'warn' }] }),
      /workspace_brief nextActions\[0\] has an invalid next-action shape/,
    );
    assert.throws(
      () => assertWorkspaceBriefShape({ ...workspaceBrief, health: { checks: [] } }),
      /workspace_brief health\.checks must be a non-empty array/,
    );
    assert.throws(
      () => assertWorkspaceBriefShape({ ...workspaceBrief, growth: [] }),
      /workspace_brief growth must be an object when present/,
    );
  });

  it('rejects malformed cycles and find_path payloads before CLI output', () => {
    const cycles = {
      operation: 'cycles',
      totalCycles: 1,
      cycles: [{ id: 'a>b>a', length: 2, nodes: ['a', 'b', 'a'], edges: [{ id: 'a->b' }, { id: 'b->a' }] }],
    };
    const path = {
      found: true,
      hopCount: 1,
      hops: ['a', 'b'],
      edges: [{ from: 'a', to: 'b', via: 'relates' }],
    };

    assert.equal(assertCyclesShape(cycles), cycles);
    assert.equal(
      assertCyclesShape({
        operation: 'cycles',
        cycles: [
          {
            nodes: ['a', 'b', 'a'],
            nodeSummaries: [
              { slug: 'a', kind: 'capability', title: 'A' },
              { slug: 'b', kind: 'capability', title: 'B' },
              { slug: 'a', kind: 'capability', title: 'A' },
            ],
          },
        ],
      }).cycles[0].nodeSummaries.length,
      3,
    );
    assert.equal(assertCyclesShape({ operation: 'cycles', cycles: [] }).totalCycles, undefined);
    assert.equal(assertCyclesShape({ operation: 'cycles', cycles: [{ slugs: ['a', 'b', 'a'] }] }).cycles[0].slugs.length, 3);
    assert.equal(assertPathShape(path), path);
    assert.deepEqual(assertPathShape({ found: false }), { found: false });
    assert.throws(
      () => assertCyclesShape({ operation: 'cycles', totalCycles: -1, cycles: [] }),
      /cycles query totalCycles must be a non-negative integer/,
    );
    assert.throws(
      () => assertCyclesShape({ operation: 'cycles', totalCycles: 1, cycles: [{ slugs: ['a'] }] }),
      /cycles query cycles\[0\] has an invalid cycle shape/,
    );
    assert.throws(
      () => assertCyclesShape({
        operation: 'cycles',
        cycles: [{ nodes: ['a', 'b', 'a'], nodeSummaries: [{ slug: 'a', kind: 'capability', title: 'A' }] }],
      }),
      /cycles query cycles\[0\] has an invalid cycle shape/,
    );
    assert.throws(
      () => assertCyclesShape({
        operation: 'cycles',
        cycles: [
          {
            nodes: ['a', 'b', 'a'],
            nodeSummaries: [
              { slug: 'a', kind: 'capability', title: 'A' },
              { slug: 'x', kind: 'capability', title: 'B' },
              { slug: 'a', kind: 'capability', title: 'A' },
            ],
          },
        ],
      }),
      /cycles query cycles\[0\] has an invalid cycle shape/,
    );
    assert.throws(
      () => assertPathShape({ found: true, hops: ['a', 'b'], edges: [] }),
      /find_path response edges length must match hops length/,
    );
    assert.throws(
      () => assertPathShape({ found: true, hopCount: 2, hops: ['a', 'b'], edges: [{ from: 'a', to: 'b', via: 'relates' }] }),
      /find_path response hopCount must match hops length/,
    );
    assert.throws(
      () => assertPathShape({ found: true, hops: ['a', 'b'], edges: [{ from: 'b', to: 'a', via: 'relates' }] }),
      /find_path response edges\[0\] has an invalid path-edge shape/,
    );
  });

  it('rejects malformed find_backlinks and find_orphans payloads before CLI output', () => {
    const backlinks = {
      target: 'capabilities/foo',
      total: 1,
      matches: [
        {
          slug: 'domains/auth',
          kind: 'domain',
          title: 'Auth',
          mtime: 1,
          matchedKeys: ['capabilities'],
        },
      ],
    };
    const orphans = {
      total: 1,
      orphans: [
        {
          slug: 'capabilities/foo',
          kind: 'capability',
          title: 'Foo',
          mtime: 1,
        },
      ],
    };

    assert.equal(assertBacklinksShape(backlinks), backlinks);
    assert.equal(assertBacklinksShape({ target: 'capabilities/foo', matches: [] }).total, undefined);
    assert.equal(assertOrphansShape(orphans), orphans);
    assert.equal(assertOrphansShape({ orphans: [] }).total, undefined);
    assert.throws(
      () => assertBacklinksShape({ target: '', total: 0, matches: [] }),
      /find_backlinks target must be a non-empty string/,
    );
    assert.throws(
      () => assertBacklinksShape({ target: 'capabilities/foo', total: -1, matches: [] }),
      /find_backlinks total must be a non-negative integer/,
    );
    assert.throws(
      () => assertBacklinksShape({ target: 'capabilities/foo', matches: [{ slug: 'domains/auth', kind: 'domain', title: 'Auth', matchedKeys: [''] }] }),
      /find_backlinks matches\[0\] has an invalid backlink shape/,
    );
    assert.throws(
      () => assertOrphansShape({ total: -1, orphans: [] }),
      /find_orphans total must be a non-negative integer/,
    );
    assert.throws(
      () => assertOrphansShape({ orphans: [{ slug: 'capabilities/foo', kind: 'capability' }] }),
      /find_orphans orphans\[0\] has an invalid orphan shape/,
    );
  });

  it('rejects malformed query_concepts payloads before CLI output', () => {
    const result = {
      filter: 'kind=capability',
      parsedAs: 'kind = capability',
      total: 1,
      limited: false,
      matches: [
        {
          slug: 'capabilities/foo',
          kind: 'capability',
          title: 'Foo',
          domain: 'auth',
          mtime: 1,
        },
      ],
    };

    assert.equal(assertQueryConceptsShape(result), result);
    assert.equal(assertQueryConceptsShape({ filter: 'kind=capability', matches: [] }).total, undefined);
    assert.throws(
      () => assertQueryConceptsShape({ filter: '', total: 0, matches: [] }),
      /query_concepts filter must be a non-empty string/,
    );
    assert.throws(
      () => assertQueryConceptsShape({ filter: 'kind=capability', parsedAs: '', total: 0, matches: [] }),
      /query_concepts parsedAs must be a non-empty string when present/,
    );
    assert.throws(
      () => assertQueryConceptsShape({ filter: 'kind=capability', total: -1, matches: [] }),
      /query_concepts total must be a non-negative integer/,
    );
    assert.throws(
      () => assertQueryConceptsShape({ filter: 'kind=capability', limited: 'no', matches: [] }),
      /query_concepts limited must be a boolean when present/,
    );
    assert.throws(
      () => assertQueryConceptsShape({ filter: 'kind=capability', matches: [{ slug: 'capabilities/foo', kind: 'capability' }] }),
      /query_concepts matches\[0\] has an invalid query-result shape/,
    );
  });

  it('rejects malformed node_profile and similar_nodes payloads before CLI output', () => {
    const nodeProfile = {
      operation: 'node_profile',
      center: 'capabilities/foo',
      node: { slug: 'capabilities/foo', kind: 'capability', title: 'Foo', inDegree: 1, outDegree: 1 },
      aliases: ['capabilities/foo', 'foo'],
      degree: { in: 1, out: 1, total: 2 },
      edges: {
        incoming: {
          total: 1,
          byRelation: { relates: 1 },
          limited: false,
          edges: [
            {
              from: 'capabilities/bar',
              to: 'capabilities/foo',
              via: 'relates',
              resolved: true,
              external: false,
              otherKind: 'capability',
              otherNode: { slug: 'capabilities/bar', kind: 'capability', title: 'Bar' },
            },
          ],
        },
        outgoing: { total: 0, byRelation: {}, limited: false, edges: [] },
      },
      lineage: {
        ancestors: {
          total: 1,
          limited: false,
          nodes: [{ slug: 'domains/auth', distance: 1, via: 'domain', node: { slug: 'domains/auth', kind: 'domain', title: 'Auth' } }],
        },
        descendants: { total: 0, limited: false, nodes: [] },
      },
    };
    const similarNodes = {
      operation: 'similar_nodes',
      totalMatches: 1,
      limited: false,
      matches: [
        {
          node: { slug: 'capabilities/foo', kind: 'capability', title: 'Foo' },
          score: 0.4,
          signals: { slug: 0.2, title: 0.2 },
          sharedNeighbors: ['domains/auth'],
        },
      ],
    };

    assert.equal(assertNodeProfileShape(nodeProfile), nodeProfile);
    assert.equal(assertSimilarNodesShape(similarNodes), similarNodes);
    assert.equal(assertSimilarNodesShape({ operation: 'similar_nodes', matches: [] }).totalMatches, undefined);
    assert.throws(
      () => assertNodeProfileShape({ ...nodeProfile, degree: { in: 1, out: 1 } }),
      /node_profile degree must contain non-negative in\/out\/total counts/,
    );
    assert.throws(
      () => assertNodeProfileShape({ ...nodeProfile, edges: { ...nodeProfile.edges, incoming: { total: 1, byRelation: {}, limited: false, edges: [{}] } } }),
      /node_profile edges\.incoming must be a valid edge group/,
    );
    assert.throws(
      () => assertNodeProfileShape({ ...nodeProfile, lineage: { ancestors: { total: 1, limited: false, nodes: [{ slug: 'domains/auth', distance: -1, node: { slug: 'domains/auth', kind: 'domain', title: 'Auth' } }] } } }),
      /node_profile lineage must contain valid ancestor\/descendant pages when present/,
    );
    assert.throws(
      () => assertSimilarNodesShape({ operation: 'similar_nodes', totalMatches: -1, matches: [] }),
      /similar_nodes totalMatches must be a non-negative integer/,
    );
    assert.throws(
      () => assertSimilarNodesShape({ operation: 'similar_nodes', matches: [{ node: { slug: 'capabilities/foo', kind: 'capability' }, score: 0.4, signals: {} }] }),
      /similar_nodes matches\[0\] has an invalid similar-node shape/,
    );
    assert.throws(
      () => assertSimilarNodesShape({ operation: 'similar_nodes', matches: [{ node: { slug: 'capabilities/foo', kind: 'capability', title: 'Foo' }, score: -1, signals: {} }] }),
      /similar_nodes matches\[0\] has an invalid similar-node shape/,
    );
  });

  it('rejects malformed overview, centrality, and blast_radius payloads before CLI output', () => {
    const overview = {
      operation: 'overview',
      graph: { nodes: 2, edges: 1, resolvedEdges: 1, externalEdges: 0, unresolvedEdges: 0, issues: 0 },
      byKind: { capability: 1, domain: 1 },
      byDomain: {},
      byRelation: { domain: 1 },
      hubs: [{ slug: 'domains/auth', kind: 'domain', title: 'Auth', inDegree: 1, outDegree: 1, degree: 2 }],
    };
    const centrality = {
      operation: 'centrality',
      rankings: {
        pageRank: [{ slug: 'domains/auth', kind: 'domain', title: 'Auth', inDegree: 1, outDegree: 1, degree: 2, pageRank: 0.5, bridgeScore: 1 }],
        bridges: [],
        authorities: [],
        hubs: [],
      },
    };
    const blastRadius = {
      operation: 'blast_radius',
      center: 'domains/auth',
      risk: 'low',
      summary: {
        affectedNodes: 1,
        affectedEdges: 0,
        affectedKinds: 1,
        affectedDomains: 1,
        crossDomainEdges: 0,
      },
      byKind: { domain: 1 },
      byDomain: { auth: 1 },
      nodes: {
        total: 1,
        limited: false,
        rows: [{ slug: 'domains/auth', distance: 0, node: { slug: 'domains/auth', kind: 'domain', title: 'Auth', inDegree: 1, outDegree: 1 } }],
      },
      edges: { total: 0, limited: false, rows: [] },
    };

    assert.equal(assertOverviewShape(overview), overview);
    assert.equal(assertCentralityShape(centrality), centrality);
    assert.equal(assertBlastRadiusShape(blastRadius), blastRadius);
    assert.throws(
      () => assertOverviewShape({ ...overview, graph: { ...overview.graph, nodes: '2' } }),
      /overview graph\.nodes must be a non-negative integer/,
    );
    assert.throws(
      () => assertOverviewShape({ ...overview, hubs: [{ ...overview.hubs[0], degree: -1 }] }),
      /overview hubs\[0\] has an invalid hub shape/,
    );
    assert.throws(
      () => assertCentralityShape({ ...centrality, rankings: { ...centrality.rankings, pageRank: [{}] } }),
      /centrality rankings\.pageRank\[0\] has an invalid ranking shape/,
    );
    assert.throws(
      () => assertBlastRadiusShape({ ...blastRadius, risk: 'unknown' }),
      /blast_radius risk must be one of: low, medium, high/,
    );
    assert.throws(
      () => assertBlastRadiusShape({ ...blastRadius, nodes: { total: 1, limited: false, rows: [{}] } }),
      /blast_radius nodes must be a page with valid node rows/,
    );
  });

  it('rejects malformed relation_check payloads before CLI output', () => {
    const missing = {
      operation: 'relation_check',
      from: 'capabilities/bar',
      to: 'domains/auth',
      relation: 'domain',
      fromKind: 'capability',
      toKind: 'domain',
      exists: false,
      verdict: 'matches_existing_schema',
      recommendation: {
        decision: 'safe_to_add',
        severity: 'info',
        reason: 'No exact or inverse edge found; capability --domain--> domain is an existing schema pattern.',
      },
      matchingEdges: [],
      inverseEdges: [],
      schemaPattern: {
        fromKind: 'capability',
        relation: 'domain',
        toKind: 'domain',
        count: 2,
        resolved: 2,
        external: 0,
        unresolved: 0,
        examples: [{ from: 'capabilities/foo', to: 'domains/auth', ref: 'capabilities/foo.domain' }],
      },
      nearbyPatterns: [
        {
          fromKind: 'capability',
          relation: 'relates',
          toKind: 'capability',
          count: 1,
          resolved: 1,
          external: 0,
          unresolved: 0,
          similarity: 1,
        },
      ],
      proposedAction: {
        tool: 'add_relation',
        args: { from: 'capabilities/bar', to: 'domains/auth', type: 'domain' },
      },
    };
    const existing = {
      ...missing,
      exists: true,
      verdict: 'already_exists',
      recommendation: {
        decision: 'skip_existing',
        severity: 'info',
        reason: 'Exact edge already exists; do not add another relation.',
      },
      matchingEdges: [{ from: 'capabilities/bar', to: 'domains/auth', via: 'domain', ref: 'capabilities/bar.domain' }],
      proposedAction: null,
    };

    assert.equal(assertRelationCheckShape(missing), missing);
    assert.equal(
      assertRelationCheckShape({
        ...missing,
        relation: 'dependencies',
        proposedAction: {
          tool: 'add_relation',
          args: { from: 'capabilities/bar', to: 'domains/auth', type: 'depends_on' },
        },
      }).proposedAction.args.type,
      'depends_on',
    );
    assert.equal(assertRelationCheckShape(existing), existing);
    assert.throws(
      () => assertRelationCheckShape({ ...missing, exists: 'false' }),
      /relation_check exists must be a boolean/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...missing, verdict: 'maybe' }),
      /relation_check verdict must be one of:/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...missing, recommendation: { decision: 'maybe', severity: 'info', reason: 'x' } }),
      /relation_check recommendation must include decision, severity, and reason/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...missing, recommendation: { decision: 'safe_to_add', severity: 'fail', reason: 'x' } }),
      /relation_check recommendation must include decision, severity, and reason/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...missing, inverseEdges: 'nope' }),
      /relation_check inverseEdges must be an array/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...missing, inverseEdges: [{ from: 'x' }] }),
      /relation_check inverseEdges\[0\] has an invalid edge shape/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...missing, proposedAction: null }),
      /relation_check missing edge must include add_relation proposedAction/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...existing, proposedAction: missing.proposedAction }),
      /relation_check existing edge must not include proposedAction/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...missing, nearbyPatterns: [{ ...missing.nearbyPatterns[0], similarity: -1 }] }),
      /relation_check nearbyPatterns\[0\] has an invalid schema-pattern shape/,
    );
  });

  it('blocks compile results with graph issues or unresolved edges', () => {
    assert.deepEqual(compileBlockingCounts({ summary: { issues: 0, unresolvedEdges: 0 } }), {
      issues: 0,
      unresolvedEdges: 0,
    });
    assert.equal(compileResultExitCode({ summary: { issues: 0, unresolvedEdges: 0 } }), 0);
    assert.equal(compileResultExitCode({ summary: { issues: 1, unresolvedEdges: 0 } }), 1);
    assert.equal(compileResultExitCode({ summary: { issues: 0, unresolvedEdges: 1 } }), 1);
    assert.equal(compileResultExitCode({ issueCount: 1, unresolvedEdgeCount: 1 }), 1);
    assert.equal(compileResultExitCode({}), 1);
    assert.equal(compileResultExitCode({ summary: { issues: 0 } }), 1);
    assert.equal(compileResultExitCode({ summary: { issues: -1, unresolvedEdges: 0 } }), 1);
    assert.equal(Number.isNaN(compileBlockingCounts({}).issues), true);
  });

  it('blocks graph query results that represent broken gates', () => {
    assert.equal(cyclesResultExitCode({ totalCycles: 0, cycles: [] }), 0);
    assert.equal(cyclesResultExitCode({ cycles: [] }), 0);
    assert.equal(cyclesResultExitCode({ cycles: [{ nodes: ['a', 'b', 'a'], edges: [{}, {}] }] }), 1);
    assert.equal(cyclesResultExitCode({ cycles: [{ slugs: ['a', 'b', 'a'] }] }), 1);
    assert.equal(cyclesResultExitCode({}), 1);
    assert.equal(cyclesResultExitCode({ totalCycles: -1, cycles: [] }), 1);
    assert.equal(cyclesResultExitCode({ totalCycles: 0, cycles: [null] }), 1);
    assert.equal(cyclesResultExitCode({ totalCycles: 0, cycles: [{ slugs: ['a'] }] }), 1);
    assert.equal(cyclesResultExitCode({ totalCycles: 0, cycles: [{ slugs: ['a', ''] }] }), 1);

    assert.equal(pathResultExitCode({ found: true, hopCount: 1, hops: ['a', 'b'], edges: [{ from: 'a', to: 'b', via: 'relates' }] }), 0);
    assert.equal(pathResultExitCode({ found: false }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: [] }), 1);
    assert.equal(pathResultExitCode({ found: true }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: [null] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', '  '], edges: [{ from: 'a', to: '  ', via: 'relates' }] }), 1);
    assert.equal(pathResultExitCode({ found: true, hopCount: 2, hops: ['a', 'b'] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [{}] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [{ from: 'b', to: 'a', via: 'relates' }] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [{ from: 'a', to: 'b' }] }), 1);
    assert.equal(pathResultExitCode({ found: true, hops: ['a', 'b'], edges: [{ from: 'a', to: 'b', via: '  ' }] }), 1);

    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] }), 0);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [] }), 1);
    assert.equal(healthResultExitCode({ status: 'pass', checks: [] }), 1);
    assert.equal(healthResultExitCode({ status: 'needs_attention' }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy' }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues', status: 'fail', count: 1 }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues' }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues', status: 'pass' }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues', status: 'pass', count: -1 }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ status: 'pass', count: 0 }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: '  ', status: 'pass', count: 0 }] }), 1);
    assert.equal(healthResultExitCode({ status: 'healthy', checks: [{ id: 'compile_issues', status: 'fial', count: 0 }] }), 1);

    assert.equal(
      workspaceBriefExitCode({
        status: 'needs_attention',
        nextActions: [{ id: 'cleanup', kind: 'cleanup', severity: 'warn' }],
        health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] },
      }),
      0,
    );
    assert.equal(
      workspaceBriefExitCode({ status: 'ok', nextActions: [], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } }),
      1,
    );
    assert.equal(
      workspaceBriefExitCode({
        status: 'healthy',
        nextActions: [{ id: 'cleanup', kind: 'cleanup', severity: 'fail' }],
        health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] },
      }),
      1,
    );
    assert.equal(workspaceBriefExitCode({ health: { checks: [{ id: 'compile_issues', status: 'fail', count: 1 }] } }), 1);
    assert.equal(workspaceBriefExitCode({ nextActions: [] }), 1);
    assert.equal(
      workspaceBriefExitCode({
        nextActions: [{ kind: 'cleanup', severity: 'fatal' }],
        health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] },
      }),
      1,
    );
    assert.equal(workspaceBriefExitCode({ nextActions: [{ severity: 'warn' }], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } }), 1);
    assert.equal(workspaceBriefExitCode({ nextActions: [{ kind: 'cleanup' }], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } }), 1);
    assert.equal(workspaceBriefExitCode({ status: 'healthy', nextActions: [{ id: 'cleanup', severity: 'warn' }], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } }), 1);
    assert.equal(workspaceBriefExitCode({ status: 'healthy', nextActions: [{ id: 'cleanup', kind: '  ', severity: 'warn' }], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } }), 1);
    assert.equal(workspaceBriefExitCode({ status: 'healthy', nextActions: [], health: { checks: [] } }), 1);
    assert.equal(
      workspaceBriefExitCode({ nextActions: [], health: { checks: [{ id: 'compile_issues' }] } }),
      1,
    );
    assert.equal(
      workspaceBriefExitCode({ nextActions: [], health: { checks: [{ id: 'compile_issues', status: 'warning' }] } }),
      1,
    );
  });
});
