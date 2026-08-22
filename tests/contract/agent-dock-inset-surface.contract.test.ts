import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { AGENT_DOCK_INSET_SURFACE_CLASS } from "../../src/shared/ui/agent-dock-surface";

const home = readFileSync("src/views/home/ui/HomePage.tsx", "utf8");
const vaultAgent = readFileSync("src/widgets/vault-agent-panel/ui/VaultAgentPanel.tsx", "utf8");

describe("agent dock inset surface", () => {
  it("uses the existing panel material on all four visible edges", () => {
    expect(AGENT_DOCK_INSET_SURFACE_CLASS).toContain("inset-y-3");
    expect(AGENT_DOCK_INSET_SURFACE_CLASS).toContain("right-3");
    expect(AGENT_DOCK_INSET_SURFACE_CLASS).toContain(
      "rounded-[var(--topology-v2-panel-radius)]",
    );
    expect(AGENT_DOCK_INSET_SURFACE_CLASS).toContain(
      "border-[color:var(--topology-v2-panel-border)]",
    );
    expect(AGENT_DOCK_INSET_SURFACE_CLASS).toContain(
      "bg-[color:var(--color-panel)]",
    );
    expect(AGENT_DOCK_INSET_SURFACE_CLASS).toContain(
      "shadow-[var(--topology-v2-panel-shadow)]",
    );
  });

  it("applies the same surface to both agent implementations", () => {
    for (const source of [home, vaultAgent]) {
      expect(source).toContain("AGENT_DOCK_INSET_SURFACE_CLASS");
      expect(source).toContain('data-agent-dock-surface="inset"');
      expect(source).toContain("var(--chrome-inset)");
    }
  });

  it("mounts the ACP scaffold with the dock, and starts only after reflow settles", () => {
    expect(home).toContain("open={acpDockFrameOpen}");
    expect(home).toContain('motion="overlay"');
    expect(home).toContain("sessionEnabled={acpChatOpen}");
  });

  it("lets the map camera finish before ACP startup can occupy the main thread", () => {
    expect(home).toContain("ACP_SESSION_START_AFTER_REFLOW_MS");
    expect(home).toContain("scheduleAcpSessionStart");
    expect(home).toMatch(
      /window\.setTimeout\([\s\S]*setAcpChatOpen\(true\)[\s\S]*ACP_SESSION_START_AFTER_REFLOW_MS/,
    );
    expect(home).toContain("cancelAcpSessionStart");
  });

  it("publishes the real dock width before the delayed ACP session starts", () => {
    expect(home).toMatch(
      /style=\{[\s\S]*acpDockFrameOpen\s*\|\|\s*runtimeChatOpen[\s\S]*--agent-panel-width/,
    );
  });
});
