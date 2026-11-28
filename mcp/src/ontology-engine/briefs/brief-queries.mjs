import {
  agentToolCall,
  buildAgentBriefHandoffPrompt,
  buildAgentBusinessOntologyLens,
} from './agent-responses.mjs';
import { normalizeLimit } from '../query-operation/query-primitives.mjs';

export function createBriefQueries({
  agentWorkflowGuide,
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
    const relationDecisionGuide = [
      {
        decision: 'skip_existing',
        severity: 'info',
        meaning: 'Exact edge already exists; do not call add_relations for the same edge.',
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
      writeGuardrails: [
        {
          id: 'preflight_relation',
          goal: 'Before add_relations, prove the target edge is not duplicated, inverted, or already explained by an existing path.',
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
        'Run relation_check before add_relations to confirm matchingEdges, inverseEdges, and schema pattern. For a new depends_on, require approvalGate.writeAllowed=false until observable ability, rationale, explicit human approval, and why are present; do not expect proposedAction args.',
        'For match_nodes, report totalMatches/limited plus followUp details, then run the followUp calls before treating scan rows as evidence.',
        'Follow relationDecisionGuide: skip_existing blocks duplicate writes; safe_to_add is schema-only; review_inverse and review_new_schema require explicit justification before writing.',
        'Run find_backlinks before rename_concept or merge_concepts so backlink rewrites are intentional.',
        'Run health, cycles, growth_plan, maintenance_plan, and validate_vault after code changes or vault writes before handing the graph to another agent.',
        'Use add_concepts/add_relations/patch_concept/merge_concepts only after the intended ontology change is clear.',
        'Treat Definition/Includes lists as bounded positive claims, not exhaustive inventories. Never say only/all/every/exactly unless the full node body explicitly states completeness and cites a source-backed product boundary; otherwise say "the vault names/models these items" and preserve Excludes/Uncertainty limits.',
        'When a source body says bounded packet, static packet, bounded excerpt, or selected evidence, preserve it in the same atomic claim as a measurement qualifier; never detach only/one/none/unmeasured/absent from it.',
        'Structural readiness is not semantic qualification: inspect projectSource.currentness, meaningAssessment.status and competency question witnesses before claiming a project is ontology-ready.',
        'The nested project-source receipt is the last measured snapshot; the outer projectSource.currentness is the current graph comparison. Treat ontology_changed, stale, unavailable, or review_required as unresolved.',
        'Ordinary synchronization must not call delete_concept, merge_concepts, rename_concept, absorb_document, or a git commit of the vault. These require an explicit human request plus dry-run or preflight review and conflict guards.',
        'Never finalize project meaning or repair competency answers without the owner reading them: finalize_project_meaning needs expected_mtime, a passing validate_vault and a complete compile.',
        'After code changes introduce or rename a domain, capability, element, or relation, sync the vault before finishing.',
      ],
      relationDecisionGuide,
      docs: {
        workflowGuide: agentWorkflowGuide,
      },
    };
    brief.handoffPrompt = buildAgentBriefHandoffPrompt(brief);
    return brief;
  }

  return { workspaceBrief, agentBrief };
}
