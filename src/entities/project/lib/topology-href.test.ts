import { describe, expect, it } from "vitest";
import { buildTopologyFocusHref, buildTopologyProjectHref, buildTopologyProjectNodeHref } from "./topology-href";

describe("buildTopologyProjectHref", () => {
  it("builds /topology/?p=<slug>", () => {
    expect(buildTopologyProjectHref("foo")).toBe("/topology/?p=foo");
  });

  it("escapes special characters in the slug", () => {
    expect(buildTopologyProjectHref("foo bar")).toBe("/topology/?p=foo%20bar");
    expect(buildTopologyProjectHref("a/b")).toBe("/topology/?p=a%2Fb");
    expect(buildTopologyProjectHref("한글")).toBe(
      `/topology/?p=${encodeURIComponent("한글")}`,
    );
  });

  it("keeps an empty slug", () => {
    expect(buildTopologyProjectHref("")).toBe("/topology/?p=");
  });
});

describe("buildTopologyProjectNodeHref", () => {
  it("addresses the project's own node — the id a click on it selects — so the inspector opens", () => {
    expect(buildTopologyProjectNodeHref("ontology-atlas")).toBe("/topology/?p=project%3Aontology-atlas");
    expect(new URLSearchParams(buildTopologyProjectNodeHref("ontology-atlas").split("?")[1]).get("p")).toBe(
      "project:ontology-atlas",
    );
  });

  it("escapes the slug inside the node id", () => {
    expect(buildTopologyProjectNodeHref("a b")).toBe(`/topology/?p=${encodeURIComponent("project:a b")}`);
  });
});

describe("buildTopologyFocusHref", () => {
  it("builds /topology/?mode=focus&p=<slug>", () => {
    expect(buildTopologyFocusHref("capabilities/mcp-server")).toBe(
      `/topology/?mode=focus&p=${encodeURIComponent("capabilities/mcp-server")}`,
    );
  });

  it("escapes a slash and other special characters in the slug", () => {
    expect(buildTopologyFocusHref("domains/views")).toBe(
      "/topology/?mode=focus&p=domains%2Fviews",
    );
  });
});
