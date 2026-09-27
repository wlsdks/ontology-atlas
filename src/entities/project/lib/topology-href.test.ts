import { describe, expect, it } from "vitest";
import { getTopologyFocusHref, getTopologyProjectHref, getTopologyProjectNodeHref } from "./topology-href";

describe("getTopologyProjectHref", () => {
  it("builds /topology/?p=<slug>", () => {
    expect(getTopologyProjectHref("foo")).toBe("/topology/?p=foo");
  });

  it("escapes special characters in the slug", () => {
    expect(getTopologyProjectHref("foo bar")).toBe("/topology/?p=foo%20bar");
    expect(getTopologyProjectHref("a/b")).toBe("/topology/?p=a%2Fb");
    expect(getTopologyProjectHref("한글")).toBe(
      `/topology/?p=${encodeURIComponent("한글")}`,
    );
  });

  it("keeps an empty slug", () => {
    expect(getTopologyProjectHref("")).toBe("/topology/?p=");
  });
});

describe("getTopologyProjectNodeHref", () => {
  it("addresses the project's own node — the id a click on it selects — so the inspector opens", () => {
    expect(getTopologyProjectNodeHref("ontology-atlas")).toBe("/topology/?p=project%3Aontology-atlas");
    expect(new URLSearchParams(getTopologyProjectNodeHref("ontology-atlas").split("?")[1]).get("p")).toBe(
      "project:ontology-atlas",
    );
  });

  it("escapes the slug inside the node id", () => {
    expect(getTopologyProjectNodeHref("a b")).toBe(`/topology/?p=${encodeURIComponent("project:a b")}`);
  });
});

describe("getTopologyFocusHref", () => {
  it("builds /topology/?mode=focus&p=<slug>", () => {
    expect(getTopologyFocusHref("capabilities/mcp-server")).toBe(
      `/topology/?mode=focus&p=${encodeURIComponent("capabilities/mcp-server")}`,
    );
  });

  it("escapes a slash and other special characters in the slug", () => {
    expect(getTopologyFocusHref("domains/views")).toBe(
      "/topology/?mode=focus&p=domains%2Fviews",
    );
  });
});
