import { publicRelationType } from '../query-operation/query-primitives.mjs';

/**
 * What an agent does when the server cannot be reached. There is no write path around MCP: the
 * Markdown is readable without it, and only the person can restore the connection.
 */
export const MCP_UNAVAILABLE_GUIDANCE =
  "read the vault's Markdown files directly, write nothing to the vault, and tell the person the Atlas connection is missing; the app's Connect a coding agent dialog restores it.";

export function agentToolCall(tool, args) {
  return { tool, arguments: args };
}

export function buildMatchNodesFollowUp(node) {
  if (!node?.slug) return null;
  const slug = node.slug;
  const calls = [
    {
      id: 'profile_focus',
      label: 'Profile the first matched node before editing.',
      ...agentToolCall('query_ontology', {
        operation: 'node_profile',
        slug,
        limit: 12,
      }),
    },
    {
      id: 'outgoing_edges',
      label: 'Inspect outgoing edges from the first match.',
      ...agentToolCall('query_ontology', {
        operation: 'match_edges',
        from: slug,
        includeExternal: true,
        includeUnresolved: true,
        limit: 20,
      }),
    },
    {
      id: 'incoming_edges',
      label: 'Inspect incoming edges into the first match.',
      ...agentToolCall('query_ontology', {
        operation: 'match_edges',
        to: slug,
        limit: 20,
      }),
    },
    {
      id: 'incoming_impact',
      label: 'Check incoming blast radius before changing this node.',
      ...agentToolCall('query_ontology', {
        operation: 'blast_radius',
        slug,
        depth: 2,
        direction: 'incoming',
      }),
    },
  ];

  return {
    focusSlug: slug,
    reason:
      'match_nodes is a scan; use these focused follow-up calls before treating a row as graph evidence.',
    calls,
  };
}

export function buildMatchEdgesFollowUp(edge) {
  if (!edge?.from || !edge?.to || edge.resolved === false || edge.external === true) return null;
  const relation = edge.via === 'dependencies' ? 'depends_on' : edge.via;
  const calls = [
    {
      id: 'explain_relation',
      label: 'Explain why the first matched edge exists.',
      ...agentToolCall('query_ontology', {
        operation: 'explain_relation',
        from: edge.from,
        to: edge.to,
        direction: 'undirected',
        types: [relation],
        maxHops: 5,
        limit: 10,
      }),
    },
    {
      id: 'path_evidence',
      label: 'Find a shortest path between the edge endpoints.',
      ...agentToolCall('query_ontology', {
        operation: 'path',
        from: edge.from,
        to: edge.to,
        maxHops: 5,
      }),
    },
    {
      id: 'relation_preflight',
      label: 'Preflight this relation before writing a duplicate or inverse edge.',
      ...agentToolCall('query_ontology', {
        operation: 'relation_check',
        from: edge.from,
        to: edge.to,
        type: relation,
      }),
    },
  ];

  return {
    focusEdge: {
      from: edge.from,
      to: edge.to,
      via: edge.via,
      relationType: publicRelationType(edge.via),
    },
    reason:
      'match_edges is a scan; explain and preflight the first edge before treating it as write or refactor evidence.',
    calls,
  };
}

function formatAgentToolCall(call) {
  return `${call.tool} ${JSON.stringify(call.arguments)}`;
}

export function buildAgentBriefHandoffPrompt(brief) {
  const firstCalls = brief.firstCalls
    .map((call, index) => `${index + 1}. ${formatAgentToolCall(call)}`)
    .join('\n');
  const playbooks = brief.playbooks
    .map((playbook) => {
      const calls = playbook.calls.map((call) => formatAgentToolCall(call)).join(' -> ');
      const evidence = playbook.evidence.map((item) => `   evidence: ${item}`).join('\n');
      const stopWhen = playbook.stopWhen.map((item) => `   stop if: ${item}`).join('\n');
      return `- ${playbook.id}: ${playbook.goal}\n  calls: ${calls}\n${evidence}\n${stopWhen}`;
    })
    .join('\n');
  const graphDbQueryPack = Array.isArray(brief.graphDbQueryPack)
    ? brief.graphDbQueryPack
        .map((item) => {
          const calls = item.calls.map((call) => formatAgentToolCall(call)).join(' -> ');
          return `- ${item.id}: ${item.intent}\n  goal: ${item.goal}\n  calls: ${calls}`;
        })
        .join('\n')
    : '';
  const guardrails = brief.writeGuardrails
    .map((guardrail) => {
      const calls = guardrail.calls.map((call) => formatAgentToolCall(call)).join(' -> ');
      return `- ${guardrail.id}: ${guardrail.goal}\n  calls: ${calls}`;
    })
    .join('\n');
  const traversalStrategy = Array.isArray(brief.traversalStrategy)
    ? brief.traversalStrategy
        .map((strategy) => {
          const calls = strategy.calls.map((call) => formatAgentToolCall(call)).join(' -> ');
          const evidence = strategy.evidence.map((item) => `   evidence: ${item}`).join('\n');
          const stopWhen = strategy.stopWhen.map((item) => `   stop if: ${item}`).join('\n');
          return `- ${strategy.id}: ${strategy.goal}\n  use when: ${strategy.useWhen}\n  calls: ${calls}\n${evidence}\n${stopWhen}`;
        })
        .join('\n')
    : '';
  const entrypoints = brief.entrypoints.length > 0
    ? brief.entrypoints.map((entrypoint) => `- ${entrypoint.uid} · ${entrypoint.slug} (${entrypoint.kind}, degree ${entrypoint.degree})`).join('\n')
    : '- <no concrete entrypoint; start with workspace_brief and health>';
  const businessOntologyLens = brief.businessOntologyLens ?? buildAgentBusinessOntologyLens(brief.entrypoints);
  const businessDomains = businessOntologyLens.businessDomains;
  const capabilityOutcomes = businessOntologyLens.capabilityOutcomes;
  const implementationEvidence = businessOntologyLens.implementationEvidence;
  const decisionQuestions = Array.isArray(businessOntologyLens.decisionQuestions)
    ? businessOntologyLens.decisionQuestions
    : [];
  return [
    'Use the ontology-atlas MCP server as the shared codebase graph memory before editing.',
    'Identity contract: uid is the permanent identity; slug is the current human-readable address. Keep graph relations, URLs, and graph-operation inputs slug-based.',
    `Current readiness: ${brief.readiness.status} ${brief.readiness.score}/100; graph ${brief.graph.nodes ?? 0} nodes, ${brief.graph.edges ?? 0} edges; status ${brief.status}.`,
    'Semantic readiness is a separate fail-closed contract. Before claiming the ontology is current or qualified, inspect projectSource.currentness/topGap, meaningAssessment.status and competency question witnesses, and meaningRepair. Structural readiness alone is not approval to write or finalize meaning.',
    'Feature guide: docs/AGENT-GRAPH-WORKFLOW.md explains MCP-connected use, graph DB differences, graph query packs, and verification checks.',
    `When the ontology-atlas MCP server is unavailable: ${MCP_UNAVAILABLE_GUIDANCE}`,
    '',
    'Business-to-code ontology lens:',
    '- Read the business outcome first, then business/product domains, capabilities, and implementation evidence.',
    `- business domains: ${businessDomains.length > 0 ? businessDomains.join(', ') : 'none in top entrypoints; run workspace_brief and domain_matrix before making business boundary claims'}`,
    `- capability outcomes: ${capabilityOutcomes.length > 0 ? capabilityOutcomes.join(', ') : 'none in top entrypoints; inspect project/domain containment before promoting source folders to capabilities'}`,
    `- implementation evidence: ${implementationEvidence.length > 0 ? `${implementationEvidence.join(', ')} proves or supports capability behavior` : 'attach source paths, APIs, routes, commands, or MCP tools only after domain/capability meaning is clear'}; do not treat paths, APIs, routes, or commands as the ontology root.`,
    ...(decisionQuestions.length > 0
      ? ['- business decision questions:', ...decisionQuestions.map((question) => `  - ${question}`)]
      : []),
    '',
    'Run these first-contact MCP calls in order:',
    firstCalls,
    '',
    'Suggested graph entrypoints:',
    entrypoints,
    '',
    'Graph DB query pack for local markdown graph scans:',
    graphDbQueryPack,
    '',
    'Kind classification contract before writing frontmatter:',
    '- Do not classify from the label alone. Treat kind as an evidence-backed role in the shared conceptualization.',
    '- classify from evidence in this order: project scope -> domain boundary -> capability behavior -> implementation element; use unknown only as a temporary review state.',
    '- project: top-level product or system scope root. Use sparingly; most repositories should have one project node.',
    '- domain: shared vocabulary boundary or product/business area that owns capabilities.',
    '- capability: user-visible behavior, workflow, or coherent system ability.',
    '- element: concrete implementation part such as UI component, API, CLI command, script, module, schema, or file-level unit.',
    '- unknown: temporary review signal; use similar_nodes and relation_check evidence before leaving it permanent.',
    '- High-confidence gate: write a new or changed kind only when another agent could repeat the same choice from the cited evidence; otherwise keep the node unknown/reviewed and ask for more evidence.',
    "- Decision questions: project asks 'is this the whole product/system scope?', domain asks 'does this own a vocabulary boundary?', capability asks 'what behavior or workflow does this enable?', element asks 'which concrete code artifact implements or supports it?'.",
    '- Common near-miss rule: if the evidence is only a file path, start as element; promote to capability only when behavior/workflow evidence exists, and promote to domain only when multiple capabilities share the boundary.',
    '- Containment spine: project contains domains, domains contain capabilities, and capabilities realize through elements; use depends_on/relates only after that ownership path is clear.',
    '- For capability and element nodes, set or verify domain before writing so browse/map/edit colors carry a meaningful ownership boundary.',
    '- Color contract: kind hue communicates ontology layer, while domain tint communicates ownership; a wrong color is evidence that kind/domain should be rechecked.',
    '- Before writing, report source path, symbol, route, command, or MCP tool evidence; then state why not the nearest adjacent kind.',
    '',
    'Investigation playbooks:',
    playbooks,
    '',
    'Traversal strategy:',
    traversalStrategy,
    '',
    'Write guardrails:',
    guardrails,
    '',
    'Relation decision policy:',
    ...brief.relationDecisionGuide.map((row) => `- ${row.decision}: ${row.meaning}`),
    '',
    'Result contracts:',
    ...brief.resultContracts.map((contract) => `- ${contract.operation}: report ${contract.mustReport.join(', ')}; ${contract.policy}`),
    '',
    'Write policy:',
    ...brief.writePolicy.map((line) => `- ${line}`),
  ].join('\n');
}

export function buildAgentBusinessOntologyLens(entrypoints = []) {
  return {
    policy: 'business-first',
    readOrder: ['outcome', 'domain', 'capability', 'element'],
    businessDomains: entrypoints
      .filter((entrypoint) => entrypoint.kind === 'domain')
      .map((entrypoint) => entrypoint.slug)
      .slice(0, 5),
    capabilityOutcomes: entrypoints
      .filter((entrypoint) => entrypoint.kind === 'capability')
      .map((entrypoint) => entrypoint.slug)
      .slice(0, 5),
    implementationEvidence: entrypoints
      .filter((entrypoint) => entrypoint.kind === 'element')
      .map((entrypoint) => entrypoint.slug)
      .slice(0, 5),
    decisionQuestions: [
      'What business outcome should this ontology explain or improve?',
      'Which business/product domain boundary does this code change?',
      'What capability claim can a planner, marketer, or leader discuss?',
      'Which implementation evidence proves or disproves that capability?',
    ],
    guidance: [
      'Read the business outcome first, then business/product domains, capabilities, and implementation evidence.',
      'Use implementation evidence to prove or support capability behavior.',
      'Do not treat paths, APIs, routes, or commands as the ontology root.',
    ],
  };
}
