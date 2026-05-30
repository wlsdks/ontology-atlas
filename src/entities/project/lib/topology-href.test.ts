import { describe, expect, it } from "vitest";
import { getTopologyFocusHref, getTopologyProjectHref } from "./topology-href";

describe("getTopologyProjectHref", () => {
  it("/topology/?p=<slug> 형식으로 반환 — R3 dual-surface 후 / 가 아닌 /topology/ 로 보낸다", () => {
    expect(getTopologyProjectHref("foo")).toBe("/topology/?p=foo");
  });

  it("slug 의 특수 문자는 encodeURIComponent 로 escape", () => {
    expect(getTopologyProjectHref("foo bar")).toBe("/topology/?p=foo%20bar");
    expect(getTopologyProjectHref("a/b")).toBe("/topology/?p=a%2Fb");
    expect(getTopologyProjectHref("한글")).toBe(
      `/topology/?p=${encodeURIComponent("한글")}`,
    );
  });

  it("빈 slug 도 그대로 — caller 가 비어있는 slug 전달 안 하는 게 contract", () => {
    expect(getTopologyProjectHref("")).toBe("/topology/?p=");
  });
});

describe("getTopologyFocusHref", () => {
  it("/topology/?mode=focus&p=<slug> — ontology 노드를 focus(드로어)로 연다", () => {
    expect(getTopologyFocusHref("capabilities/mcp-server")).toBe(
      `/topology/?mode=focus&p=${encodeURIComponent("capabilities/mcp-server")}`,
    );
  });

  it("slug 의 / 등 특수 문자는 encodeURIComponent 로 escape", () => {
    expect(getTopologyFocusHref("domains/views")).toBe(
      "/topology/?mode=focus&p=domains%2Fviews",
    );
  });
});
