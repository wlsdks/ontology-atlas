import {
  agentToolCall,
  buildAgentBriefHandoffPrompt,
  buildAgentBusinessOntologyLens,
  uniqueCliCommands,
} from './agent-responses.mjs';
import { normalizeLimit } from './query-primitives.mjs';

export function createBriefQueries({
  cliPrefix,
  agentWorkflowGuide,
  agentModeComparison,
  graphScanProofChecklist,
  nodeBySlug,
  nodes,
  edges,
  growthPlan,
  health,
  overview,
  projectMap,
  projectRootSlugs,
  resolve,
  workspaceNextActions,
}) {
  function workspaceBrief(options = {}) {
    const limit = normalizeLimit(options.limit, 10);
    const overviewResult = overview({ limit });
    const healthResult = health({
      limit,
      componentLimit: options.componentLimit ?? limit,
      cycleLimit: options.cycleLimit ?? limit,
      recommendationLimit: options.recommendationLimit ?? limit,
      orderLimit: options.orderLimit ?? limit,
      nodeLimit: options.nodeLimit ?? limit,
      dependencyTypes: options.dependencyTypes,
      componentTypes: options.componentTypes ?? options.types,
    });
    const growthResult = growthPlan({ limit });
    const projectRoots = projectRootSlugs();
    const projectMaps = projectRoots.slice(0, limit).map((project) => {
      const map = projectMap(project, { limit, itemLimit: Math.min(limit, 20) });
      return {
        project,
        node: map.node,
        summary: map.summary,
        domains: map.domains.map((domain) => ({
          slug: domain.slug,
          node: domain.node,
          summary: domain.summary,
        })),
        unassigned: map.unassigned,
      };
    });
    const nextActions = workspaceNextActions(healthResult, growthResult, limit);

    return {
      operation: 'workspace_brief',
      status: healthResult.status,
      summary: {
        graphHash: overviewResult.graph.graphHash,
        maxMtime: overviewResult.graph.maxMtime,
        nodes: overviewResult.graph.nodes,
        edges: overviewResult.graph.edges,
        projects: projectRoots.length,
        domains: overviewResult.byKind.domain || 0,
        capabilities: overviewResult.byKind.capability || 0,
        elements: overviewResult.byKind.element || 0,
        externalEdges: overviewResult.graph.externalEdges,
        unresolvedEdges: overviewResult.graph.unresolvedEdges,
        issues: overviewResult.graph.issues,
        growthActions: growthResult.summary.totalActions,
      },
      health: {
        status: healthResult.status,
        checks: healthResult.checks,
      },
      growth: growthResult.summary,
      projects: {
        total: projectRoots.length,
        limited: projectRoots.length > limit,
        maps: projectMaps,
      },
      hotspots: overviewResult.hubs,
      nextActions,
    };
  }

  function agentBrief(options = {}) {
    const limit = normalizeLimit(options.limit, 5);
    const workspace = workspaceBrief({
      limit,
      componentLimit: options.componentLimit ?? limit,
      cycleLimit: options.cycleLimit ?? limit,
      recommendationLimit: options.recommendationLimit ?? limit,
      orderLimit: options.orderLimit ?? limit,
      nodeLimit: options.nodeLimit ?? limit,
      dependencyTypes: options.dependencyTypes,
      componentTypes: options.componentTypes ?? options.types,
    });
    const overviewResult = overview({ limit });
    const topEntrypoint = overviewResult.hubs[0] ?? nodes.find((node) => ['domain', 'capability', 'element'].includes(node.kind));
    const secondEntrypoint = overviewResult.hubs.find((node) => node.slug !== topEntrypoint?.slug);
    const projectSlug = options.project
      ? resolve(options.project, 'project')
      : projectRootSlugs()[0] ?? '<project-slug>';
    if (options.project && nodeBySlug.get(projectSlug)?.kind !== 'project') {
      throw new Error(`project must resolve to a project node. Received: "${options.project}".`);
    }
    const meaningfulNodes = nodes.filter((node) => ['domain', 'capability', 'element'].includes(node.kind)).length;
    const relationCount = edges.length;
    const shaped = meaningfulNodes >= 3;
    const linked = relationCount >= Math.max(1, meaningfulNodes - 1);
    const clean = workspace.status === 'healthy';
    const score =
      (shaped ? 30 : 0) +
      (linked ? 25 : 0) +
      (clean ? 25 : 0) +
      (overviewResult.hubs.length > 0 ? 20 : 0);
    const readinessStatus = !shaped ? 'needs_shape' : !linked || !clean ? 'needs_attention' : 'ready';
    const impactSlug = topEntrypoint?.slug ?? '<slug>';
    const graphDbPathTargetSlug =
      edges.find(
        (edge) =>
          edge.from === impactSlug
          && ['dependencies', 'depends_on', 'relates'].includes(edge.via)
          && edge.to !== impactSlug,
      )?.to ??
      edges.find(
        (edge) =>
          edge.to === impactSlug
          && ['dependencies', 'depends_on', 'relates'].includes(edge.via)
          && edge.from !== impactSlug,
      )?.from;
    const pathTargetSlug = graphDbPathTargetSlug ?? secondEntrypoint?.slug ?? '<other-slug>';
    const relationPreflightCall = agentToolCall('query_ontology', {
      operation: 'relation_check',
      from: impactSlug,
      to: pathTargetSlug,
      type: 'depends_on',
    });
    const pathPreflightCall = agentToolCall('query_ontology', {
      operation: 'path',
      from: impactSlug,
      to: pathTargetSlug,
      maxHops: 5,
    });
    const backlinkPreflightCall = agentToolCall('find_backlinks', { slug: impactSlug });
    const nodeProfilePreflightCall = agentToolCall('query_ontology', {
      operation: 'node_profile',
      slug: impactSlug,
      depth: 1,
      limit: Math.max(5, limit),
    });
    const healthGateCall = agentToolCall('query_ontology', { operation: 'health', limit });
    const validateVaultGateCall = agentToolCall('validate_vault', {});
    const traversalBudget = {
      maxHops: 1,
      limit: 10,
      searchBudget: 1000,
      types: ['depends_on', 'relates', 'domain', 'capabilities', 'contains'],
    };
    const traversalPlanCall = agentToolCall('query_ontology', {
      operation: 'query_plan',
      targetOperation: 'all_paths',
      from: impactSlug,
      to: pathTargetSlug,
      ...traversalBudget,
    });
    const traversalAllPathsCall = agentToolCall('query_ontology', {
      operation: 'all_paths',
      from: impactSlug,
      to: pathTargetSlug,
      ...traversalBudget,
    });
    const graphDbQueryPack = [
      {
        id: 'graph_facets',
        intent: 'MATCH graph RETURN kind/domain/degree/relation facets LIMIT 10',
        goal: 'Read kind, domain, degree, relation, and schema-pattern buckets before choosing a narrower graph query.',
        calls: [
          agentToolCall('query_ontology', {
            operation: 'facets',
            limit: 10,
          }),
          agentToolCall('query_ontology', {
            operation: 'schema',
            limit: 20,
          }),
        ],
      },
      {
        id: 'node_scan',
        intent: 'MATCH (n:capability) WHERE degree(n) >= 2 RETURN n ORDER BY degree(n) DESC LIMIT 10',
        goal: 'Find high-degree capability nodes as onboarding or refactor starting points.',
        calls: [
          agentToolCall('query_ontology', {
            operation: 'query_plan',
            targetOperation: 'match_nodes',
            kind: 'capability',
            minDegree: 2,
            sort: 'degree',
            limit: 10,
          }),
          agentToolCall('query_ontology', {
            operation: 'match_nodes',
            kind: 'capability',
            minDegree: 2,
            sort: 'degree',
            limit: 10,
          }),
        ],
      },
      {
        id: 'edge_scan',
        intent: 'MATCH ()-[r:depends_on]->() RETURN r LIMIT 20',
        goal: 'Scan dependency edges before treating coupling rows as proof.',
        calls: [
          agentToolCall('query_ontology', {
            operation: 'query_plan',
            targetOperation: 'match_edges',
            types: ['depends_on'],
            limit: 20,
          }),
          agentToolCall('query_ontology', { operation: 'match_edges', types: ['depends_on'], limit: 20 }),
        ],
      },
      {
        id: 'domain_coupling',
        intent: 'MATCH (domain)-[depends_on|relates]->(domain) RETURN coupling_matrix LIMIT 6',
        goal: 'Compare domain coupling and centrality before making boundary claims.',
        calls: [
          agentToolCall('query_ontology', { operation: 'domain_matrix', types: ['depends_on', 'relates'], limit: 6 }),
          agentToolCall('query_ontology', {
            operation: 'query_plan',
            targetOperation: 'centrality',
            types: ['depends_on', 'relates'],
            limit: 10,
          }),
          agentToolCall('query_ontology', { operation: 'centrality', types: ['depends_on', 'relates'], limit: 10 }),
        ],
      },
      {
        id: 'path_evidence',
        intent: 'MATCH p=(from)-[:depends_on|relates*..3]-(to) RETURN p LIMIT 10',
        goal: 'Collect bounded path evidence and relation explanation before writing or refactoring.',
        calls: [
          agentToolCall('query_ontology', {
            operation: 'query_plan',
            targetOperation: 'all_paths',
            from: impactSlug,
            to: pathTargetSlug,
            maxHops: 3,
            types: ['depends_on', 'relates'],
            searchBudget: 1000,
            limit: 10,
          }),
          agentToolCall('query_ontology', {
            operation: 'all_paths',
            from: impactSlug,
            to: pathTargetSlug,
            maxHops: 3,
            types: ['depends_on', 'relates'],
            searchBudget: 1000,
            limit: 10,
          }),
          agentToolCall('query_ontology', {
            operation: 'explain_relation',
            from: impactSlug,
            to: pathTargetSlug,
            direction: 'undirected',
            maxHops: 5,
            types: ['depends_on', 'relates'],
            limit: 10,
          }),
        ],
      },
      {
        id: 'business_questions',
        intent: 'MATCH business questions TO outcomes, domain boundaries, capability claims, and implementation evidence',
        goal: 'Answer the business ontology lens questions with executable graph evidence instead of treating paths or APIs as the ontology root.',
        calls: [
          agentToolCall('query_ontology', {
            operation: 'facets',
          }),
          agentToolCall('query_ontology', {
            operation: 'query_plan',
            targetOperation: 'match_nodes',
            kind: 'domain',
            sort: 'degree',
            limit: 10,
          }),
          agentToolCall('query_ontology', {
            operation: 'match_nodes',
            kind: 'domain',
            sort: 'degree',
            limit: 10,
          }),
          agentToolCall('query_ontology', { operation: 'domain_matrix', types: ['depends_on', 'relates'], limit: 6 }),
          agentToolCall('query_ontology', {
            operation: 'query_plan',
            targetOperation: 'match_nodes',
            kind: 'capability',
            sort: 'degree',
            limit: 10,
          }),
          agentToolCall('query_ontology', {
            operation: 'match_nodes',
            kind: 'capability',
            sort: 'degree',
            limit: 10,
          }),
          agentToolCall('query_ontology', {
            operation: 'query_plan',
            targetOperation: 'match_edges',
            fromKind: 'capability',
            toKind: 'element',
            types: ['elements', 'depends_on', 'relates'],
            limit: 20,
          }),
          agentToolCall('query_ontology', {
            operation: 'match_edges',
            fromKind: 'capability',
            toKind: 'element',
            types: ['elements', 'depends_on', 'relates'],
            limit: 20,
          }),
        ],
      },
    ];
    const containmentCrossCheckCalls = [
      agentToolCall('query_ontology', {
        operation: 'pattern_walk',
        slug: projectSlug,
        pattern: ['domains', 'capabilities'],
        direction: 'outgoing',
        limit: 20,
      }),
      agentToolCall('query_ontology', { operation: 'project_map', project: projectSlug, limit: 10, itemLimit: 20 }),
    ];
    const traversalStrategy = [
      {
        id: 'plan_before_enumeration',
        priority: 'first',
        goal: 'Estimate traversal cost before enumerating paths.',
        useWhen: 'The question needs more than one shortest route or may touch high-degree hubs.',
        evidence: ['query_plan.execution.nextStep', 'query_plan.execution.suggestedQuery', 'query_plan.execution.saferQuery when present'],
        stopWhen: ['execution.nextStep is narrow or review and the saferQuery still lacks maxHops/types/searchBudget bounds.'],
        calls: [traversalPlanCall],
      },
      {
        id: 'bounded_path_evidence',
        priority: 'evidence',
        goal: 'Enumerate bounded alternatives without turning traversal into an unbounded graph scan.',
        useWhen: 'A write, refactor, or architecture answer depends on whether multiple paths explain the relation.',
        evidence: ['all_paths.evidence.status', 'all_paths.evidence.reason', 'all_paths.evidence.pathsComplete', 'all_paths.totalPathsExact'],
        stopWhen: ['evidence.status is partial, evidence.pathsComplete is false, or totalPathsExact is false; follow evidence.suggestedQuery or evidence.saferQuery before writing.'],
        calls: [traversalAllPathsCall],
      },
      {
        id: 'containment_cross_check',
        priority: 'confirm',
        goal: 'Cross-check path evidence against project/domain containment instead of trusting edge proximity alone.',
        useWhen: 'The answer changes ownership, domain boundaries, or add_relation direction.',
        evidence: ['pattern_walk rows for project -> domains -> capabilities', 'project_map domain placement and boundary edges'],
        stopWhen: ['pattern_walk and project_map disagree on project/domain placement.'],
        calls: containmentCrossCheckCalls,
      },
    ];
    const relationDecisionGuide = [
      {
        decision: 'skip_existing',
        severity: 'info',
        meaning: 'Exact edge already exists; do not call add_relation for the same edge.',
      },
      {
        decision: 'review_inverse',
        severity: 'warn',
        meaning: 'Reverse edge exists; inspect direction and explain before writing.',
      },
      {
        decision: 'safe_to_add',
        severity: 'info',
        meaning: 'Schema pattern is familiar, not semantically approved; depends_on still requires observable ability, rationale, explicit human approval, and why.',
      },
      {
        decision: 'review_new_schema',
        severity: 'warn',
        meaning: 'This creates a new schema pattern; explain why the relation type belongs before writing.',
      },
    ];
    const resultContracts = [
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
        policy: 'Treat match_nodes rows as scan candidates, not evidence; run the followUp node_profile, incoming/outgoing match_edges, and blast_radius calls before using a node row for onboarding or refactor decisions.',
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
        policy: 'Treat match_edges rows as scan candidates, not proof; run the followUp explain_relation, path, and relation_check calls before using an edge row as write, refactor, or coupling evidence.',
      },
    ];
    const entrypoints = overviewResult.hubs.slice(0, limit).map((node) => ({
      uid: node.uid,
      slug: node.slug,
      title: node.title,
      kind: node.kind,
      degree: node.degree,
      inDegree: node.inDegree,
      outDegree: node.outDegree,
    }));
    const businessOntologyLens = buildAgentBusinessOntologyLens(entrypoints);

    const brief = {
      operation: 'agent_brief',
      sideEffect: false,
      projectUid: nodeBySlug.get(projectSlug)?.uid,
      projectSlug,
      status: workspace.status,
      readiness: {
        status: readinessStatus,
        score,
        meaningfulNodes,
        relationCount,
        projects: workspace.summary.projects,
        domains: workspace.summary.domains,
        capabilities: workspace.summary.capabilities,
        elements: workspace.summary.elements,
        unresolvedEdges: workspace.summary.unresolvedEdges,
        externalEdges: workspace.summary.externalEdges,
        growthActions: workspace.summary.growthActions,
        healthChecks: workspace.health.checks.length,
      },
      graph: workspace.summary,
      health: workspace.health,
      nextActions: workspace.nextActions,
      businessOntologyLens,
      entrypoints,
      firstCalls: [
        agentToolCall('query_ontology', { operation: 'workspace_brief', limit }),
        agentToolCall('query_ontology', { operation: 'health', limit }),
        agentToolCall('query_ontology', {
          operation: 'query_plan',
          targetOperation: 'blast_radius',
          slug: impactSlug,
          depth: 2,
        }),
        agentToolCall('query_ontology', {
          operation: 'node_profile',
          slug: impactSlug,
          depth: 2,
          limit: Math.max(5, limit),
        }),
        relationPreflightCall,
      ],
      graphDbQueryPack,
      traversalStrategy,
      playbooks: [
        {
          id: 'refactor_impact',
          goal: 'Before changing a node or module, estimate dependency blast radius and cite affected slugs.',
          evidence: [
            'Target node profile, incoming blast radius groups, and the highest-risk affected slugs.',
            'Whether an existing path already explains the proposed relation.',
            'The relation_check recommendation.decision before any add_relation.',
          ],
          stopWhen: [
            'health reports failing checks or actionable nextActions.',
            'relation_check returns skip_existing, review_inverse, or review_new_schema.',
            'blast radius crosses domains that are outside the requested change.',
          ],
          calls: [
            agentToolCall('query_ontology', { operation: 'workspace_brief', limit }),
            agentToolCall('query_ontology', {
              operation: 'query_plan',
              targetOperation: 'blast_radius',
              slug: impactSlug,
              depth: 2,
            }),
            agentToolCall('query_ontology', { operation: 'node_profile', slug: impactSlug, depth: 2, limit: 12 }),
            agentToolCall('query_ontology', { operation: 'blast_radius', slug: impactSlug, depth: 2, direction: 'incoming' }),
            pathPreflightCall,
            relationPreflightCall,
          ],
        },
        {
          id: 'onboarding_map',
          goal: 'Build a compact project/domain map before editing an unfamiliar vault.',
          evidence: [
            'Workspace status, project/domain map, and the main high-degree entrypoints.',
            'Domain coupling rows that explain where codebase knowledge clusters.',
            'Graph DB-style node scan results that surface high-degree capability starting points.',
            'One concrete hub profile to anchor the first mental model.',
          ],
          stopWhen: [
            'workspace_brief reports unresolved graph health issues.',
            'query_plan(match_nodes) asks for a narrower kind/domain/limit before scanning.',
            'node_profile cannot resolve the selected high-degree entrypoint.',
          ],
          calls: [
            agentToolCall('query_ontology', { operation: 'workspace_brief', limit }),
            agentToolCall('query_ontology', { operation: 'domain_matrix', limit: 10 }),
            agentToolCall('query_ontology', {
              operation: 'query_plan',
              targetOperation: 'match_nodes',
              kind: 'capability',
              minDegree: 2,
              sort: 'degree',
              limit: 10,
            }),
            agentToolCall('query_ontology', {
              operation: 'match_nodes',
              kind: 'capability',
              minDegree: 2,
              sort: 'degree',
              limit: 10,
            }),
            agentToolCall('query_ontology', { operation: 'node_profile', slug: impactSlug, depth: 2, limit: 12 }),
          ],
        },
        {
          id: 'coupling_audit',
          goal: 'Find high-coupling nodes and relation patterns before a modularity review.',
          evidence: [
            'Domain-to-domain coupling hot spots.',
            'Central nodes and dependency edges that create boundary pressure.',
            'Any cycles, disconnected components, or health failures that weaken the audit.',
          ],
          stopWhen: [
            'health fails or reports dependency cycles.',
            'centrality and match_edges point to conflicting boundary conclusions.',
          ],
          calls: [
            agentToolCall('query_ontology', { operation: 'health', limit }),
            agentToolCall('query_ontology', { operation: 'domain_matrix', limit: 10 }),
            agentToolCall('query_ontology', {
              operation: 'query_plan',
              targetOperation: 'centrality',
              types: ['depends_on', 'relates'],
              limit: 10,
            }),
            agentToolCall('query_ontology', { operation: 'centrality', types: ['depends_on', 'relates'], limit: 10 }),
            agentToolCall('query_ontology', {
              operation: 'query_plan',
              targetOperation: 'match_edges',
              types: ['depends_on'],
              limit: 20,
            }),
            agentToolCall('query_ontology', { operation: 'match_edges', types: ['depends_on'], limit: 20 }),
          ],
        },
        {
          id: 'graph_traversal',
          goal: 'Use graph-database-style traversal evidence when one shortest path is not enough.',
          evidence: [
            'Schema patterns that make the traversal legal and meaningful.',
            'Bounded all_paths alternatives with the edges that distinguish them.',
            'Pattern-walk containment evidence and the project_map domain placement.',
          ],
          stopWhen: [
            'query_plan marks all_paths as high cost for the requested bounds.',
            'all_paths returns too many plausible paths to justify a single edge without narrowing types or hops.',
            'pattern_walk and project_map disagree on project/domain containment.',
          ],
          calls: [
            agentToolCall('query_ontology', { operation: 'schema', limit: 20 }),
            traversalPlanCall,
            traversalAllPathsCall,
            ...containmentCrossCheckCalls,
          ],
        },
      ],
      writeGuardrails: [
        {
          id: 'preflight_relation',
          goal: 'Before add_relation, prove the target edge is not duplicated, inverted, or already explained by an existing path.',
          calls: [
            relationPreflightCall,
            pathPreflightCall,
          ],
        },
        {
          id: 'preflight_rename',
          goal: 'Before rename_concept or merge_concepts, inspect backlinks and local node context for the slug being rewritten.',
          calls: [
            backlinkPreflightCall,
            nodeProfilePreflightCall,
          ],
        },
        {
          id: 'post_change_sync',
          goal: 'After code changes or vault writes, gate the shared graph before handing work back to another agent.',
          calls: [
            healthGateCall,
            agentToolCall('query_ontology', { operation: 'cycles', maxHops: 8 }),
            agentToolCall('query_ontology', { operation: 'growth_plan', limit: 20 }),
            agentToolCall('query_ontology', { operation: 'maintenance_plan', limit: 20 }),
            validateVaultGateCall,
          ],
        },
      ],
      writePolicy: [
        'Use uid as the permanent node identity and slug as its current human-readable address; graph relations and graph-operation inputs remain slug-based.',
        'Run read tools first and cite returned slugs/edges before editing.',
        'Run relation_check before add_relation to confirm matchingEdges, inverseEdges, and schema pattern. For a new depends_on, require approvalGate.writeAllowed=false until observable ability, rationale, explicit human approval, and why are present; do not expect proposedAction args.',
        'For all_paths, report limit/searchBudget/expandedStates/exhaustive/truncatedByBudget/totalPathsExact plus evidence.status/evidence.reason/evidence.pathsComplete and treat incomplete paths as partial evidence.',
        'For match_nodes and match_edges, report totalMatches/limited plus followUp details, then run the followUp calls before treating scan rows as evidence.',
        'Follow relationDecisionGuide: skip_existing blocks duplicate writes; safe_to_add is schema-only; review_inverse and review_new_schema require explicit justification before writing.',
        'Run find_backlinks before rename_concept or merge_concepts so backlink rewrites are intentional.',
        'Run health, cycles, growth_plan, maintenance_plan, and validate_vault after code changes or vault writes before handing the graph to another agent.',
        'Use add_concept/add_relation/patch_concept/merge_concepts only after the intended ontology change is clear.',
        'Treat Definition/Includes lists as bounded positive claims, not exhaustive inventories. Never say only/all/every/exactly unless the full node body explicitly states completeness and cites a source-backed product boundary; otherwise say "the vault names/models these items" and preserve Excludes/Uncertainty limits.',
        'When a source body says bounded packet, static packet, bounded excerpt, or selected evidence, preserve it in the same atomic claim as a measurement qualifier; never detach only/one/none/unmeasured/absent from it.',
        'Structural readiness is not semantic qualification: inspect projectSource.currentness, meaningAssessment.status, competency question witnesses, and meaningRepair before claiming a project is ontology-ready.',
        'The nested project-source receipt is the last measured snapshot; the outer projectSource.currentness is the current graph comparison. Treat ontology_changed, stale, unavailable, or review_required as unresolved.',
        'Ordinary synchronization must not call delete_concept, merge_concepts, rename_concept, absorb_document, or git_snapshot. These require an explicit human request plus dry-run or preflight review and conflict guards.',
        'Never finalize project meaning or repair competency answers automatically. Require independent qualification, explicit human approval, the returned writePlan, expected_mtime, validation, compile, and post-write health checks.',
        'After code changes introduce or rename a domain, capability, element, or relation, sync the vault before finishing.',
      ],
      resultContracts,
      relationDecisionGuide,
      docs: {
        workflowGuide: agentWorkflowGuide,
        modeComparison: agentModeComparison,
        graphScanProofChecklist: graphScanProofChecklist,
      },
    };
    brief.cliFallbackCommands = uniqueCliCommands([
      ...brief.firstCalls,
      ...brief.graphDbQueryPack.flatMap((item) => item.calls),
      ...brief.playbooks.flatMap((playbook) => playbook.calls),
      ...brief.traversalStrategy.flatMap((strategy) => strategy.calls),
      ...brief.writeGuardrails.flatMap((guardrail) => guardrail.calls),
    ], cliPrefix);
    brief.handoffPrompt = buildAgentBriefHandoffPrompt(brief, cliPrefix);
    return brief;
  }

  return { workspaceBrief, agentBrief };
}
