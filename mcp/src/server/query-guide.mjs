/**
 * The `query` guide of `connection_info({guide})`: every `query_ontology`
 * operation with the arguments it needs, and the rules a call is held to. The
 * tool description names only the operations an agent starts with; the rest is
 * here, so tools/list does not carry it on every connection.
 */

import { QUERY_ONTOLOGY_OPERATIONS } from '../ontology-engine.mjs';

export const QUERY_GUIDE_EN = `## query_ontology

Operations: ${QUERY_ONTOLOGY_OPERATIONS.join(', ')}.

Required arguments:
- \`slug\`: neighbors, reachability, pattern_walk, impact, blast_radius, subgraph, lineage, node_profile.
- \`from\` and \`to\`: path, explain_relation, relation_check (with \`type\`).
- \`pattern\` (relation keys in order): pattern_walk.
- \`targetOperation\`: query_plan.
- \`recordId\`: analysis_record.
- \`project\`: project_scope, project_map, agent_brief; omit it when the vault has one project.

Filters and limits:
- match_nodes: \`kind\`, \`domain\`, \`hasIncoming\`, \`hasOutgoing\`, \`sort\` (degree, inDegree, outDegree, slug), \`limit\`. Nodes with no incoming relation are \`hasIncoming:false\`; the most connected nodes are \`sort:"degree"\`.
- neighbors: \`direction\`, \`types\`, \`includeExternal\`, \`includeUnresolved\` (dangling refs).
- reachability, impact, blast_radius, subgraph, lineage: \`depth\` (default 3, 2, 2, 2, 20). path, explain_relation, cycles: \`maxHops\` (default 5, 5, 8). cycles also takes \`searchBudget\` (default 5000).
- containment_tree: \`includeOrphans\`. project_map: \`itemLimit\` per domain (default 20).
- maintenance_plan: \`phases\`, \`severities\`, \`kinds\`, \`executableOnly\`, and \`afterActionId\` to resume after the id in \`cursor.nextAfterActionId\` while \`cursor.hasMore\`.
- health, workspace_brief and agent_brief take only \`limit\`.

Rules:
- impact and blast_radius follow declared \`depends_on\` only; use reachability or subgraph for structure, and treat blast_radius risk as unknown until relation-level source receipts exist.
- A \`depends_on\` that relation_check finds missing is schema-only: its \`proposedAction\` is null and its \`approvalGate\` writes nothing until the agent explains the observable ability and the owner approves.
- \`cycles\` with \`truncatedByBudget\` reports lower bounds: zero cycles then does NOT mean acyclic.
- analysis_record returns a saved record, not an approved fact.
- Retired: all_paths (use path), centrality (match_nodes sort), builder_context (get_concepts, neighbors), match_edges (neighbors), domain_profile (node_profile), domain_matrix (overview), topological_order (cycles, impact), meaning_repair_review (validate_vault), analysis_history, agent_brief detail:"compact" and task.`;
