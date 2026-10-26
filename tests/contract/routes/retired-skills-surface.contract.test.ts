import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import ko from "../../../messages/ko.json";
import { DESTINATION_IDS } from "@/shared/config/destinations";
import { resolveActiveNavDestination } from "@/shared/lib/navigation/nav-destination";

/**
 * `/skills` is retired. Real Agent Skills, the docs library copy-parity check and the CLI
 * `agent-files` are separate capabilities; this prevents the standalone Skills surface from coming
 * back.
 */
describe("retired Skills product surface", () => {
  it("keeps the primary destination set exact and Skills-free", () => {
    expect(DESTINATION_IDS).toEqual([
      "map",
      "architecture",
      // Library now contains Sources, Wiki, and the former Docs ontology workbench.
      "library",
      // Automations owns schedule management; Map and Library remain execution contexts.
      "automations",
      "insights",
      "projects",
      "agents",
      // MCP reopened the seven-cap decision (91) but did not reinstate the retired surface, and the two
      // assertions below still say so.
      "changes",
      "git",
    ]);
    expect(resolveActiveNavDestination("/skills")).toBeNull();
    expect(resolveActiveNavDestination("/ko/skills/")).toBeNull();
    expect(resolveActiveNavDestination("/agents")).toBe("agents");
    expect(resolveActiveNavDestination("/architecture")).toBe("architecture");
    expect(resolveActiveNavDestination("/git")).toBe("git");
    expect(resolveActiveNavDestination("/mcp")).toBe("mcp");
    expect(resolveActiveNavDestination("/library")).toBe("library");
    expect(resolveActiveNavDestination("/ko/library/")).toBe("library");
    expect(resolveActiveNavDestination("/automations")).toBe("automations");
    // `/docs` remains a route alias, and highlights the one destination it now enters.
    expect(resolveActiveNavDestination("/docs")).toBe("library");
  });

  it("removes UI-only copy while preserving real agent and skill diagnostics", () => {
    for (const messages of [ko, en] as const) {
      expect(messages).not.toHaveProperty("agentSkills");
      expect(messages.navRail).not.toHaveProperty("skills");
      expect(messages.navRail).not.toHaveProperty("studio");
      expect(messages.searchWidgets.shortcuts.rows).not.toHaveProperty("goTo_skills");
      expect(messages.searchWidgets.shortcuts.rows).not.toHaveProperty("goTo_studio");

      expect(messages).toHaveProperty("agents");
      expect(messages).toHaveProperty("skillParity");
      expect(messages.navRail).toHaveProperty("agents");
      expect(messages.agentFiles.drift).toHaveProperty("skill-copy-diverged");
    }
  });
});
