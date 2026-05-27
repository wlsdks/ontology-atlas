import { formatAgentPostChangeSyncPacket } from "@/shared/lib/ontology-tree";

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
      `1. query_ontology({"operation":"node_profile","slug":"${selected}","depth":2,"limit":12})`,
      `2. query_ontology({"operation":"blast_radius","slug":"${selected}","depth":2,"direction":"incoming","limit":12})`,
      '3. query_ontology({"operation":"health","limit":5})',
    );
  } else {
    lines.push(
      '1. query_ontology({"operation":"workspace_brief","limit":5})',
      '2. query_ontology({"operation":"match_nodes","kind":"capability","minDegree":1,"sort":"degree","limit":10})',
      '3. query_ontology({"operation":"match_edges","limit":10})',
      '4. query_ontology({"operation":"health","limit":5})',
    );
  }

  lines.push("", "CLI fallbacks:");
  if (selected) {
    lines.push(
      `1. oh-my-ontology node ${selected} [vault] --limit 12`,
      `2. oh-my-ontology blast-radius ${selected} [vault] --depth 2 --direction incoming --limit 12`,
      "3. oh-my-ontology health [vault] --limit 5",
    );
  } else {
    lines.push(
      "1. oh-my-ontology workspace-brief [vault] --limit 5",
      "2. oh-my-ontology match-nodes [vault] --kind capability --min-degree 1 --sort degree --limit 10",
      "3. oh-my-ontology match-edges [vault] --limit 10",
      "4. oh-my-ontology health [vault] --limit 5",
    );
  }

  lines.push(
    "",
    "Evidence rule: scan rows are candidates, not proof. Follow a selected node with node_profile and blast_radius before editing frontmatter.",
    "",
    "Post-change sync gate:",
    formatAgentPostChangeSyncPacket(),
  );
  return lines.join("\n");
}
