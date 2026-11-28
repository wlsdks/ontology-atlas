/**
 * What an agent does when the server cannot be reached. There is no write path around MCP: the
 * Markdown is readable without it, and only the person can restore the connection.
 */
const MCP_UNAVAILABLE_GUIDANCE =
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
        operation: 'neighbors',
        slug,
        direction: 'outgoing',
        includeExternal: true,
        includeUnresolved: true,
        limit: 20,
      }),
    },
    {
      id: 'incoming_edges',
      label: 'Inspect incoming edges into the first match.',
      ...agentToolCall('query_ontology', {
        operation: 'neighbors',
        slug,
        direction: 'incoming',
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

function formatAgentToolCall(call) {
  return `${call.tool} ${JSON.stringify(call.arguments)}`;
}

export function buildAgentBriefHandoffPrompt(brief) {
  const firstCalls = brief.firstCalls
    .map((call, index) => `${index + 1}. ${formatAgentToolCall(call)}`)
    .join('\n');
  return [
    'Use the ontology-atlas MCP server as the shared codebase graph memory before editing.',
    'uid is the permanent identity of a node and slug its current address; graph relations and graph-operation inputs stay slug-based.',
    `Current readiness: ${brief.readiness.status} ${brief.readiness.score}/100; graph ${brief.graph.nodes ?? 0} nodes, ${brief.graph.edges ?? 0} edges; status ${brief.status}.`,
    'Semantic readiness is separate: before calling the ontology current, read projectSource.currentness, meaningAssessment.status and the competency witnesses.',
    `When the ontology-atlas MCP server is unavailable: ${MCP_UNAVAILABLE_GUIDANCE}`,
    '',
    'Run these first-contact MCP calls in order (`entrypoints` lists the nodes to start from):',
    firstCalls,
    '',
    'Treat Definition and Includes lists as bounded claims, not inventories: never say only, all, every or exactly unless the body cites a source-backed boundary, and keep a qualifier such as bounded packet or selected evidence inside the same claim.',
    'Run relation_check before add_relations and find_backlinks before rename_concept or merge_concepts; writeGuardrails lists the calls. connection_info({guide:"construction"}) has the kind and relation rules and connection_info({guide:"write_safety"}) the write gates.',
  ].join('\n');
}
