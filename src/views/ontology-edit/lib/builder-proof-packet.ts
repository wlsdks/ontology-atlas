import { formatAgentPostChangeSyncPacket } from "@/shared/lib/ontology-tree";

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
    "MCP checks:",
  ];

  if (selected) {
    lines.push(
      `1. ${mcpCall({ operation: "node_profile", slug: selected, depth: 2, limit: 12 })}`,
      `2. ${mcpCall({ operation: "blast_radius", slug: selected, depth: 2, direction: "incoming", limit: 12 })}`,
      `3. ${mcpCall({ operation: "match_edges", from: selected, limit: 10 })}`,
      `4. ${mcpCall({ operation: "match_edges", to: selected, limit: 10 })}`,
      `5. ${mcpCall({ operation: "health", limit: 5 })}`,
    );
  } else {
    lines.push(
      `1. ${mcpCall({ operation: "workspace_brief", limit: 5 })}`,
      `2. ${mcpCall({ operation: "query_plan", targetOperation: "match_nodes", kind: "capability", minDegree: 1, sort: "degree", limit: 10 })}`,
      `3. ${mcpCall({ operation: "match_nodes", kind: "capability", minDegree: 1, sort: "degree", limit: 10 })}`,
      `4. ${mcpCall({ operation: "query_plan", targetOperation: "match_edges", limit: 10 })}`,
      `5. ${mcpCall({ operation: "match_edges", limit: 10 })}`,
      `6. ${mcpCall({ operation: "facets", limit: 10 })}`,
      `7. ${mcpCall({ operation: "schema", limit: 10 })}`,
      `8. ${mcpCall({ operation: "health", limit: 5 })}`,
    );
  }

  lines.push("", "CLI fallbacks:");
  if (selected) {
    const slug = shellArg(selected);
    lines.push(
      `1. oh-my-ontology node ${slug} [vault] --limit 12`,
      `2. oh-my-ontology blast-radius ${slug} [vault] --depth 2 --direction incoming --limit 12`,
      `3. oh-my-ontology match-edges [vault] --from ${slug} --limit 10`,
      `4. oh-my-ontology match-edges [vault] --to ${slug} --limit 10`,
      `5. oh-my-ontology all-paths ${slug} '[target-slug]' [vault] --plan --max-hops 4 --limit 10`,
      "6. oh-my-ontology health [vault] --limit 5",
    );
  } else {
    lines.push(
      "1. oh-my-ontology workspace-brief [vault] --limit 5",
      "2. oh-my-ontology match-nodes [vault] --kind capability --min-degree 1 --sort degree --limit 10",
      "3. oh-my-ontology match-edges [vault] --limit 10",
      "4. oh-my-ontology facets [vault] --limit 10",
      "5. oh-my-ontology schema [vault] --limit 10",
      "6. oh-my-ontology health [vault] --limit 5",
    );
  }

  lines.push(
    "",
    "Evidence checklist:",
    "1. Report totalMatches, limited, and returned row count for every match_nodes or match_edges scan.",
    "2. Treat scan rows as candidates until a node_profile, blast_radius, path, explain, or relation_check follow-up confirms the specific claim.",
    "3. For path evidence, report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, and evidence.pathsComplete before using it as write evidence.",
    "4. After a frontmatter change, run the post-change sync gate below before claiming the ontology is healthy.",
    "",
    "Post-change sync gate:",
    formatAgentPostChangeSyncPacket(),
  );
  return lines.join("\n");
}
