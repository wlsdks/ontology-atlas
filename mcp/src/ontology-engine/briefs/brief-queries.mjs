import {
  agentToolCall,
  buildAgentBriefHandoffPrompt,
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
    const healthResult = health({ limit, types: options.types });
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
    const workspace = workspaceBrief({ limit, types: options.types });
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
    const entrypoints = overviewResult.hubs.slice(0, limit).map((node) => ({
      uid: node.uid,
      slug: node.slug,
      title: node.title,
      kind: node.kind,
      degree: node.degree,
      inDegree: node.inDegree,
      outDegree: node.outDegree,
    }));

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
      docs: {
        workflowGuide: agentWorkflowGuide,
      },
    };
    brief.handoffPrompt = buildAgentBriefHandoffPrompt(brief);
    return brief;
  }

  return { workspaceBrief, agentBrief };
}
