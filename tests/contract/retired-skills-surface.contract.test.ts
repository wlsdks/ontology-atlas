import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import ko from "../../messages/ko.json";
import { DESTINATION_IDS } from "@/shared/config/destinations";
import { resolveActiveNavDestination } from "@/shared/lib/nav-destination";

const ROOT = process.cwd();

/**
 * `/skills` was retired entirely by owner decision on 2026-08-21.
 *
 * Real Agent Skills, the docs library's copy-parity check, and the CLI `agent-files`
 * are separate. This contract preserves those capabilities while preventing the
 * standalone Skills product surface from coming back.
 */
describe("retired Skills product surface", () => {
  it("keeps the primary destination set exact and Skills-free", () => {
    expect(DESTINATION_IDS).toEqual([
      "map",
      "docs",
      "insights",
      "projects",
      "agents",
      "git",
    ]);
    expect(resolveActiveNavDestination("/skills")).toBeNull();
    expect(resolveActiveNavDestination("/ko/skills/")).toBeNull();
    expect(resolveActiveNavDestination("/agents")).toBe("agents");
  });

  it("removes the route and all three product implementation layers", () => {
    const retiredPaths = [
      "app/[locale]/skills/page.tsx",
      "src/entities/agent-skill",
      "src/features/agent-skills-local",
      "src/views/agent-skills",
    ];
    expect(retiredPaths.length, "퇴역 경계를 하나도 검사하지 않으면 이 시험은 공회전한다").toBeGreaterThan(3);
    for (const path of retiredPaths) {
      expect(existsSync(resolve(ROOT, path)), `${path} 가 다시 생겼다`).toBe(false);
    }
  });

  it("removes UI-only copy while preserving real agent and skill diagnostics", () => {
    for (const messages of [ko, en] as const) {
      expect(messages).not.toHaveProperty("agentSkills");
      expect(messages.navRail).not.toHaveProperty("skills");
      expect(messages.navRail).not.toHaveProperty("studio");
      expect(messages.guidedTour.steps).not.toHaveProperty("skillsWhat");
      expect(messages.guidedTour.steps).not.toHaveProperty("skillsOpen");
      expect(messages.searchWidgets.shortcuts.rows).not.toHaveProperty("goTo_skills");
      expect(messages.guidedTour.steps).not.toHaveProperty("studioWhat");
      expect(messages.guidedTour.steps).not.toHaveProperty("studioCard");
      expect(messages.searchWidgets.shortcuts.rows).not.toHaveProperty("goTo_studio");

      expect(messages).toHaveProperty("agents");
      expect(messages).toHaveProperty("skillParity");
      expect(messages.navRail).toHaveProperty("agents");
      expect(messages.agentFiles.drift).toHaveProperty("skill-copy-diverged");
    }
  });
});
