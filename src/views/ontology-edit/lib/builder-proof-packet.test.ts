import { describe, expect, it } from "vitest";
import { formatBuilderProofPacket } from "./builder-proof-packet";

describe("formatBuilderProofPacket", () => {
  it("formats an overview proof packet when no node is selected", () => {
    const packet = formatBuilderProofPacket();

    expect(packet).toContain("# Builder graph proof");
    expect(packet).toContain("query_ontology({\"operation\":\"workspace_brief\"");
    expect(packet).toContain("oh-my-ontology match-nodes [vault]");
    expect(packet).toContain("scan rows are candidates, not proof");
    expect(packet).toContain("# Post-change ontology sync gate");
  });

  it("formats a focused proof packet for the selected graph node", () => {
    const packet = formatBuilderProofPacket("capability:mcp-server");

    expect(packet).toContain("- Scope: selected node capability:mcp-server");
    expect(packet).toContain(
      'query_ontology({"operation":"node_profile","slug":"capability:mcp-server"',
    );
    expect(packet).toContain(
      "oh-my-ontology blast-radius capability:mcp-server [vault]",
    );
    expect(packet).toContain("# Post-change ontology sync gate");
  });
});
