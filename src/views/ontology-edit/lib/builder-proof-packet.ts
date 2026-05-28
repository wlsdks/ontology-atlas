import {
  AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND,
  formatAgentPostChangeSyncPacket,
} from "@/shared/lib/ontology-tree";

function mcpCall(payload: Record<string, unknown>): string {
  return `query_ontology(${JSON.stringify(payload)})`;
}

function shellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function formatBuilderProofPacket(selectedProofNodeId?: string | null): string {
  const selected = typeof selectedProofNodeId === "string" && selectedProofNodeId.length > 0
    ? selectedProofNodeId
    : null;
  const lines = [
    "# Builder graph proof",
    "",
    "- Surface: /ontology/edit",
    `- Scope: ${selected ? `selected node ${selected}` : "builder graph overview"}`,
    "",
    "Setup gate:",
    `0. ${AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND}`,
    "1. oh-my-ontology agent-brief [vault] --graph-db-pack",
    "",
    "MCP checks:",
  ];

  if (selected) {
    const target = "<target-slug>";
    const relationType = "<relation-type>";
    lines.push(
      `1. ${mcpCall({ operation: "node_profile", slug: selected, depth: 2, limit: 12 })}`,
      `2. ${mcpCall({ operation: "blast_radius", slug: selected, depth: 2, direction: "incoming", limit: 12 })}`,
      `3. ${mcpCall({ operation: "query_plan", targetOperation: "match_edges", from: selected, limit: 10 })}`,
      `4. ${mcpCall({ operation: "match_edges", from: selected, limit: 10 })}`,
      `5. ${mcpCall({ operation: "query_plan", targetOperation: "match_edges", to: selected, limit: 10 })}`,
      `6. ${mcpCall({ operation: "match_edges", to: selected, limit: 10 })}`,
      `7. ${mcpCall({ operation: "query_plan", targetOperation: "match_edges", fromKind: "capability", toKind: "element", type: "elements", limit: 10 })}`,
      `8. ${mcpCall({ operation: "match_edges", fromKind: "capability", toKind: "element", type: "elements", limit: 10 })}`,
      `9. ${mcpCall({ operation: "query_plan", targetOperation: "all_paths", from: selected, to: target, maxHops: 4, searchBudget: 1000, limit: 10 })}`,
      `10. ${mcpCall({ operation: "all_paths", from: selected, to: target, maxHops: 4, searchBudget: 1000, limit: 10 })}`,
      `11. ${mcpCall({ operation: "relation_check", from: selected, to: target, type: relationType })}`,
      `12. ${mcpCall({ operation: "health", limit: 5 })}`,
    );
  } else {
    lines.push(
      `1. ${mcpCall({ operation: "workspace_brief", limit: 5 })}`,
      `2. ${mcpCall({ operation: "query_plan", targetOperation: "match_nodes", kind: "capability", minDegree: 1, sort: "degree", limit: 10 })}`,
      `3. ${mcpCall({ operation: "match_nodes", kind: "capability", minDegree: 1, sort: "degree", limit: 10 })}`,
      `4. ${mcpCall({ operation: "query_plan", targetOperation: "match_edges", limit: 10 })}`,
      `5. ${mcpCall({ operation: "match_edges", limit: 10 })}`,
      `6. ${mcpCall({ operation: "query_plan", targetOperation: "match_edges", fromKind: "capability", toKind: "element", type: "elements", limit: 10 })}`,
      `7. ${mcpCall({ operation: "match_edges", fromKind: "capability", toKind: "element", type: "elements", limit: 10 })}`,
      `8. ${mcpCall({ operation: "facets", limit: 10 })}`,
      `9. ${mcpCall({ operation: "schema", limit: 10 })}`,
      `10. ${mcpCall({ operation: "health", limit: 5 })}`,
    );
  }

  lines.push("", "CLI fallbacks:");
  if (selected) {
    const slug = shellArg(selected);
    const target = shellArg("<target-slug>");
    const relationType = shellArg("<relation-type>");
    lines.push(
      `1. oh-my-ontology node ${slug} [vault] --limit 12`,
      `2. oh-my-ontology blast-radius ${slug} [vault] --depth 2 --direction incoming --limit 12`,
      `3. oh-my-ontology match-edges [vault] --plan --from ${slug} --limit 10`,
      `4. oh-my-ontology match-edges [vault] --from ${slug} --limit 10`,
      `5. oh-my-ontology match-edges [vault] --plan --to ${slug} --limit 10`,
      `6. oh-my-ontology match-edges [vault] --to ${slug} --limit 10`,
      "7. oh-my-ontology match-edges [vault] --plan --from-kind capability --to-kind element --type elements --limit 10",
      "8. oh-my-ontology match-edges [vault] --from-kind capability --to-kind element --type elements --limit 10",
      `9. oh-my-ontology all-paths ${slug} ${target} [vault] --plan --max-hops 4 --limit 10 --search-budget 1000`,
      `10. oh-my-ontology all-paths ${slug} ${target} [vault] --max-hops 4 --limit 10 --search-budget 1000`,
      `11. oh-my-ontology relation-check ${slug} ${target} ${relationType} [vault]`,
      "12. oh-my-ontology health [vault] --limit 5",
    );
  } else {
    lines.push(
      "1. oh-my-ontology workspace-brief [vault] --limit 5",
      "2. oh-my-ontology match-nodes [vault] --plan --kind capability --min-degree 1 --sort degree --limit 10",
      "3. oh-my-ontology match-nodes [vault] --kind capability --min-degree 1 --sort degree --limit 10",
      "4. oh-my-ontology match-edges [vault] --plan --limit 10",
      "5. oh-my-ontology match-edges [vault] --limit 10",
      "6. oh-my-ontology match-edges [vault] --plan --from-kind capability --to-kind element --type elements --limit 10",
      "7. oh-my-ontology match-edges [vault] --from-kind capability --to-kind element --type elements --limit 10",
      "8. oh-my-ontology facets [vault] --limit 10",
      "9. oh-my-ontology schema [vault] --limit 10",
      "10. oh-my-ontology health [vault] --limit 5",
    );
  }

  lines.push(
    "",
    "Evidence checklist:",
    "1. Run the setup gate first and use the graph DB pack when you need the whole scan queue.",
    "2. Report totalMatches, limited, and returned row count for every match_nodes or match_edges scan.",
    "3. For frontmatter-key scans, report relationType and via so stored keys like elements/dependencies are not mistaken for generic contains/relates edges.",
    "4. Treat scan rows as candidates until a node_profile, blast_radius, path, explain, or relation_check follow-up confirms the specific claim.",
    "5. For path evidence, report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, and evidence.pathsComplete before using it as write evidence.",
    "6. After a frontmatter change, run the post-change sync gate below before claiming the ontology is healthy.",
    "",
    "Post-change sync gate:",
    formatAgentPostChangeSyncPacket(),
  );
  return lines.join("\n");
}

export interface BuilderGuardPacketProposal {
  sourceSlug: string;
  targetSlug: string;
  inferredKey: string;
}

export function formatBuilderGuardPacket(proposal?: BuilderGuardPacketProposal | null): string {
  const source = proposal?.sourceSlug ?? "<source-slug>";
  const target = proposal?.targetSlug ?? "<target-slug>";
  const relationType = proposal?.inferredKey ?? "<relation-type>";
  const sourceArg = shellArg(source);
  const targetArg = shellArg(target);
  const relationTypeArg = shellArg(relationType);
  const lines = [
    "# Builder relation guard",
    "",
    "- Surface: /ontology/edit",
    `- Scope: ${
      proposal
        ? `${proposal.sourceSlug}.${proposal.inferredKey} -> ${proposal.targetSlug}`
        : "next canvas relation"
    }`,
    "- Boundary: source frontmatter only; target file remains unchanged",
    "- Loop: Source -> Draft -> Guard -> Proof",
    "",
    "MCP guard checks:",
    `1. ${mcpCall({ operation: "query_plan", targetOperation: "all_paths", from: source, to: target, maxHops: 4, searchBudget: 1000, limit: 10 })}`,
    `2. ${mcpCall({ operation: "all_paths", from: source, to: target, maxHops: 4, searchBudget: 1000, limit: 10 })}`,
    `3. ${mcpCall({ operation: "relation_check", from: source, to: target, type: relationType })}`,
    `4. ${mcpCall({ operation: "explain_relation", from: source, to: target, type: relationType })}`,
    "",
    "CLI guard fallbacks:",
    `1. oh-my-ontology all-paths ${sourceArg} ${targetArg} [vault] --plan --max-hops 4 --limit 10 --search-budget 1000`,
    `2. oh-my-ontology all-paths ${sourceArg} ${targetArg} [vault] --max-hops 4 --limit 10 --search-budget 1000`,
    `3. oh-my-ontology relation-check ${sourceArg} ${targetArg} ${relationTypeArg} [vault]`,
    `4. oh-my-ontology explain ${sourceArg} ${targetArg} [vault] --type ${relationTypeArg}`,
    "",
    "Guard checklist:",
    "1. Confirm the inferred key names the frontmatter meaning, not just canvas direction.",
    "2. Treat all_paths as partial evidence unless evidence.pathsComplete is true.",
    "3. Save only when relation_check says safe_to_add or the duplicate/review state is intentional.",
    "4. After saving, run the post-change sync gate before claiming the graph is healthy.",
    "",
    "Post-change sync gate:",
    formatAgentPostChangeSyncPacket(),
  ];

  return lines.join("\n");
}
