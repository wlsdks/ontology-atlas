import { describe, expect, it } from "vitest";
import { resolveDeeplinkMissDecision } from "./deeplink-miss-notice";

describe("resolveDeeplinkMissDecision", () => {
  it("does nothing when there is no deep link", () => {
    expect(
      resolveDeeplinkMissDecision({
        selectedSlug: null,
        hasOntologyMatch: false,
        hasProjectMatch: false,
        projectsLoaded: true,
        sourceReady: true,
      }),
    ).toEqual({ action: "none" });
  });

  it("does nothing when the slug resolves to an ontology node", () => {
    expect(
      resolveDeeplinkMissDecision({
        selectedSlug: "capability:mcp-server",
        hasOntologyMatch: true,
        hasProjectMatch: false,
        projectsLoaded: true,
        sourceReady: true,
      }),
    ).toEqual({ action: "none" });
  });

  it("does nothing when a bare slug resolves to a project", () => {
    expect(
      resolveDeeplinkMissDecision({
        selectedSlug: "ontology-atlas",
        hasOntologyMatch: false,
        hasProjectMatch: true,
        projectsLoaded: true,
        sourceReady: true,
      }),
    ).toEqual({ action: "none" });
  });

  it("notifies immediately for an unresolved kind-prefixed slug, even before the project list loads", () => {
    // A kind-prefixed value can never be a project slug, so there is nothing to wait for.
    expect(
      resolveDeeplinkMissDecision({
        selectedSlug: "element:does-not-exist",
        hasOntologyMatch: false,
        hasProjectMatch: false,
        projectsLoaded: false,
        sourceReady: true,
      }),
    ).toEqual({ action: "notify-now" });
  });

  it("notifies immediately for an unresolved bare slug once the project list has loaded", () => {
    expect(
      resolveDeeplinkMissDecision({
        selectedSlug: "project",
        hasOntologyMatch: false,
        hasProjectMatch: false,
        projectsLoaded: true,
        sourceReady: true,
      }),
    ).toEqual({ action: "notify-now" });
  });

  it("waits (rather than staying silent forever) for an unresolved bare slug while the project list is still loading", () => {
    // A bare miss must resolve to a bounded wait, never a silent no-op, even if projects never
    // load.
    expect(
      resolveDeeplinkMissDecision({
        selectedSlug: "project",
        hasOntologyMatch: false,
        hasProjectMatch: false,
        projectsLoaded: false,
        sourceReady: true,
      }),
    ).toEqual({ action: "notify-after-grace" });
  });

  it("does not diagnose a local ontology miss before persisted source restoration settles", () => {
    expect(
      resolveDeeplinkMissDecision({
        selectedSlug: "capability:local-only-node",
        hasOntologyMatch: false,
        hasProjectMatch: false,
        projectsLoaded: true,
        sourceReady: false,
      }),
    ).toEqual({ action: "none" });
  });
});
