import { describe, expect, it } from "vitest";
import { translateOntologyDeeplinkToTopologyParam } from "./translate-ontology-deeplink";

describe("translateOntologyDeeplinkToTopologyParam", () => {
  it("passes canonical kind:slug ids through unchanged", () => {
    expect(translateOntologyDeeplinkToTopologyParam("capability:mcp-server")).toBe(
      "capability:mcp-server",
    );
  });

  it("passes bare slugs through unchanged", () => {
    expect(translateOntologyDeeplinkToTopologyParam("mcp-server")).toBe("mcp-server");
  });

  it("maps the vault plural-folder prefix form to canonical kind:slug", () => {
    expect(translateOntologyDeeplinkToTopologyParam("capabilities/mcp-server")).toBe(
      "capability:mcp-server",
    );
    expect(translateOntologyDeeplinkToTopologyParam("domains/onboarding-ux")).toBe(
      "domain:onboarding-ux",
    );
    expect(translateOntologyDeeplinkToTopologyParam("elements/agent-brief")).toBe(
      "element:agent-brief",
    );
  });

  it("strips a leading ontology/ prefix before mapping", () => {
    expect(
      translateOntologyDeeplinkToTopologyParam("ontology/capabilities/mcp-server"),
    ).toBe("capability:mcp-server");
  });

  it("leaves nested non-vault paths (evidence-style) unchanged", () => {
    expect(
      translateOntologyDeeplinkToTopologyParam("cli/src/commands/foo.mjs"),
    ).toBe("cli/src/commands/foo.mjs");
  });

  it("handles empty input without throwing", () => {
    expect(translateOntologyDeeplinkToTopologyParam("")).toBe("");
    expect(translateOntologyDeeplinkToTopologyParam("   ")).toBe("");
  });
});
