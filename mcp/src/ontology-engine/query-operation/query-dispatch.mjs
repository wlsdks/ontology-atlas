import { formatAllowedValueError } from '../../suggestions.mjs';

export function dispatchOntologyQuery(queries, query = {}, allowedOperations = []) {
  const operation = query.operation;

  if (operation === 'neighbors') {
    return queries.neighbors(query.slug, query);
  }
  if (operation === 'path') {
    return queries.path(query.from, query.to, query);
  }
  if (operation === 'query_plan') {
    return queries.queryPlan(query);
  }
  if (operation === 'communities') {
    return queries.communities(query);
  }
  if (operation === 'similar_nodes') {
    return queries.similarNodes(query);
  }
  if (operation === 'explain_relation') {
    return queries.explainRelation(query.from, query.to, query);
  }
  if (operation === 'reachability') {
    return queries.reachability(query.slug, query);
  }
  if (operation === 'pattern_walk') {
    return queries.patternWalk(query.slug, query);
  }
  if (operation === 'impact') {
    return queries.impact(query.slug, query);
  }
  if (operation === 'blast_radius') {
    return queries.blastRadius(query.slug, query);
  }
  if (operation === 'subgraph') {
    return queries.subgraph(query.slug, query);
  }
  if (operation === 'overview') {
    return queries.overview(query);
  }
  if (operation === 'schema') {
    return queries.schema(query);
  }
  if (operation === 'facets') {
    return queries.facets(query);
  }
  if (operation === 'match_nodes') {
    return queries.matchNodes(query);
  }
  if (operation === 'node_profile') {
    return queries.nodeProfile(query.slug, query);
  }
  if (operation === 'project_scope') {
    return queries.projectScope(query.slug ?? query.project, query);
  }
  if (operation === 'project_map') {
    return queries.projectMap(query.slug ?? query.project, query);
  }
  if (operation === 'relation_check') {
    return queries.relationCheck(query);
  }
  if (operation === 'components') {
    return queries.components(query);
  }
  if (operation === 'lineage') {
    return queries.lineage(query.slug, query);
  }
  if (operation === 'containment_tree') {
    return queries.containmentTree(query.slug, query);
  }
  if (operation === 'cycles') {
    return queries.cycles(query);
  }
  if (operation === 'recommend_relations') {
    return queries.recommendRelations(query);
  }
  if (operation === 'growth_plan') {
    return queries.growthPlan(query);
  }
  if (operation === 'maintenance_plan') {
    return queries.maintenancePlan(query);
  }
  if (operation === 'agent_brief') {
    return queries.agentBrief(query);
  }
  if (operation === 'workspace_brief') {
    return queries.workspaceBrief(query);
  }
  if (operation === 'health') {
    return queries.health(query);
  }

  throw new Error(formatAllowedValueError('operation', operation, allowedOperations));
}
