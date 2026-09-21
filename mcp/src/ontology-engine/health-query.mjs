import { normalizeLimit, normalizeTypes } from './query-primitives.mjs';

export function createHealthQuery({
  artifact,
  healthIgnoredComponentKinds,
  componentGroupOnlyHasKinds,
  components,
  connectedComponentGroups,
  cycles,
  healthCheck,
  overview,
  recommendRelations,
  topologicalOrder,
}) {
  function health(options = {}) {
    const limit = normalizeLimit(options.limit, 10);
    const overviewResult = overview({ limit });
    const componentTypeSet = normalizeTypes(options.componentTypes ?? options.types, options.componentTypes !== undefined ? 'componentTypes' : 'types');
    const componentResult = components({
      limit: normalizeLimit(options.componentLimit, 5, 'componentLimit'),
      nodeLimit: normalizeLimit(options.nodeLimit, 10, 'nodeLimit'),
      types: options.componentTypes ?? options.types,
    });
    const allComponentGroups = connectedComponentGroups(componentTypeSet);
    const actionableComponentGroups = allComponentGroups.filter(
      (group) => !componentGroupOnlyHasKinds(group, healthIgnoredComponentKinds),
    );
    const actionableComponentCount = actionableComponentGroups.length;
    const ignoredComponentCount = allComponentGroups.length - actionableComponentCount;
    const cycleResult = cycles({
      limit: normalizeLimit(options.cycleLimit, 5, 'cycleLimit'),
      maxHops: options.maxHops ?? options.depth,
      types: options.dependencyTypes ?? ['dependencies'],
      typeName: options.dependencyTypes !== undefined ? 'dependencyTypes' : 'types',
    });
    const recommendationResult = recommendRelations({
      limit: normalizeLimit(options.recommendationLimit, 20, 'recommendationLimit'),
    });
    const orderResult = topologicalOrder({
      limit: normalizeLimit(options.orderLimit, 20, 'orderLimit'),
      types: options.dependencyTypes ?? ['dependencies'],
      typeName: options.dependencyTypes !== undefined ? 'dependencyTypes' : 'types',
    });
    const issueCount = Array.isArray(artifact?.issues) ? artifact.issues.length : 0;
    const graph = overviewResult.graph;
    const checks = [
      // Ask first whether there is anything to count. Without this, the `pass` of
      // the checks below proves nothing — with zero nodes there are zero cycles,
      // zero unresolved edges, and zero disconnected components, so **everything
      // passes and it reports healthy** (measured 2026-08-16: a folder that was
      // not a vault came back healthy with exit 0). This is the only place a person
      // who pointed at the wrong folder can find that out.
      healthCheck({
        id: 'vault_present',
        status: graph.nodes === 0 ? 'fail' : 'pass',
        count: graph.nodes,
        message:
          graph.nodes === 0
            ? 'This folder has no ontology nodes, so every other check below passed with nothing to count. Either the path is not a vault, or the vault is empty: check the folder you passed, or scaffold one with the CLI `init` command.'
            : 'The folder contains ontology nodes.',
      }),
      healthCheck({
        id: 'compile_issues',
        status: issueCount === 0 ? 'pass' : 'warn',
        count: issueCount,
        message:
          issueCount === 0
            ? 'Compiled ontology artifact has no compiler issues.'
            : 'Compiled ontology artifact has compiler issues; inspect compile_ontology.issues.',
      }),
      healthCheck({
        id: 'unresolved_edges',
        status: graph.unresolvedEdges === 0 ? 'pass' : 'warn',
        count: graph.unresolvedEdges,
        message:
          graph.unresolvedEdges === 0
            ? 'Every internal edge resolves to a known ontology node.'
            : 'Some internal edges do not resolve to a known ontology node.',
      }),
      healthCheck({
        id: 'dependency_cycles',
        status: cycleResult.totalCycles === 0 ? 'pass' : 'fail',
        count: cycleResult.totalCycles,
        message:
          cycleResult.totalCycles === 0
            ? 'No directed dependency cycles were detected.'
            : 'Directed dependency cycles block a clean prerequisite-first graph order.',
      }),
      healthCheck({
        id: 'relation_recommendations',
        status: recommendationResult.totalRecommendations === 0 ? 'pass' : 'warn',
        count: recommendationResult.totalRecommendations,
        message:
          recommendationResult.totalRecommendations === 0
            ? 'No safe domain-containment relation suggestions are pending.'
            : 'Safe domain-containment relation suggestions are available.',
      }),
      healthCheck({
        id: 'components',
        status: actionableComponentCount <= 1 ? 'pass' : 'info',
        count: actionableComponentCount,
        message:
          actionableComponentCount <= 1
            ? ignoredComponentCount > 0
              ? `${componentHealthConnectedSubject(options, true)} is connected; ${ignoredComponentCount} root/reference component(s) were ignored.`
              : `${componentHealthSubject(options)} is connected.`
            : `${componentHealthSubject(options)} has disconnected actionable islands.`,
      }),
    ];
    const status = checks.some((check) => check.status === 'fail' || check.status === 'warn')
      ? 'needs_attention'
      : 'healthy';

    return {
      operation: 'health',
      status,
      graphHash: graph.graphHash,
      maxMtime: graph.maxMtime,
      relationCensus: {
        compilerDeclarations: {
          count: graph.edges,
          reportedAt: ['summary.edges', 'compiledSummary.edges'],
          unit: 'compiled_frontmatter_relation_declarations',
          identity: ['declaring_document', 'relation_key', 'target_reference'],
          logicalRelationDeduplicated: false,
          reciprocalDeclarationsMayDescribeOneLogicalRelation: true,
        },
        canonicalMapCensus: {
          countAvailable: false,
          count: null,
          unit: 'deduplicated_normalized_typed_edges',
          scope: 'loaded_app_ontology',
          filterSensitive: false,
          reason:
            'The MCP process does not run the app derivation or know its loaded UI state, so use the app census for this numeric count.',
        },
      },
      summary: {
        nodes: graph.nodes,
        edges: graph.edges,
        resolvedEdges: graph.resolvedEdges,
        externalEdges: graph.externalEdges,
        unresolvedEdges: graph.unresolvedEdges,
        issues: graph.issues,
        ambiguousAliases: graph.ambiguousAliases,
        components: componentResult.totalComponents,
        actionableComponents: actionableComponentCount,
        ignoredComponents: ignoredComponentCount,
        largestComponentSize: componentResult.largestSize,
        singletonComponents: componentResult.singletonCount,
        dependencyCycles: cycleResult.totalCycles,
        relationRecommendations: recommendationResult.totalRecommendations,
        dependencyOrderAcyclic: orderResult.acyclic,
      },
      checks,
      components: {
        totalComponents: componentResult.totalComponents,
        actionableComponents: actionableComponentCount,
        ignoredComponents: ignoredComponentCount,
        largestSize: componentResult.largestSize,
        singletonCount: componentResult.singletonCount,
        limited: componentResult.limited,
        components: componentResult.components,
      },
      dependencyCycles: {
        totalCycles: cycleResult.totalCycles,
        limited: cycleResult.limited,
        cycles: cycleResult.cycles,
      },
      relationRecommendations: {
        totalRecommendations: recommendationResult.totalRecommendations,
        limited: recommendationResult.limited,
        recommendations: recommendationResult.recommendations,
      },
      dependencyOrder: {
        acyclic: orderResult.acyclic,
        totalNodes: orderResult.totalNodes,
        orderedCount: orderResult.orderedCount,
        blocked: orderResult.blocked,
      },
    };
  }

  function componentHealthSubject(options = {}) {
    return options.componentTypes !== undefined || options.types !== undefined
      ? 'The scoped ontology graph'
      : 'The resolved ontology graph';
  }

  function componentHealthConnectedSubject(options = {}, ignored = false) {
    if (options.componentTypes !== undefined || options.types !== undefined) return 'The scoped ontology graph';
    return ignored ? 'The actionable ontology graph' : 'The resolved ontology graph';
  }

  return health;
}
