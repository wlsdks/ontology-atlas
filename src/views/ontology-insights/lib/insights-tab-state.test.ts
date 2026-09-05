import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSIGHTS_TAB,
  INSIGHTS_TABS,
  buildInsightsTabHref,
  parseInsightsTab,
} from "./insights-tab-state";

describe("parseInsightsTab", () => {
  it("defaults to do-next when the param is missing", () => {
    expect(parseInsightsTab(null)).toBe("do-next");
    expect(parseInsightsTab(undefined)).toBe("do-next");
    expect(parseInsightsTab("")).toBe("do-next");
  });

  it("accepts every question tab", () => {
    expect(INSIGHTS_TABS).toEqual([
      "do-next",
      "unmatched",
      "composition",
      "connections",
      "boundaries",
      "freshness",
      // Written by an agent rather than computed from the graph — the one tab
      // whose question ("what is this product and how does it move") is prose.
      "flow",
    ]);
    for (const tab of INSIGHTS_TABS) {
      expect(parseInsightsTab(tab)).toBe(tab);
    }
  });

  it("구 개요/관계 링크 호환 — 각각 구성/연결로", () => {
    expect(parseInsightsTab("overview")).toBe("composition");
    expect(parseInsightsTab("relations")).toBe("connections");
  });

  it("구 구조 탭 링크 호환 — 3분할의 첫 질문인 구성으로", () => {
    expect(parseInsightsTab("structure")).toBe("composition");
  });

  it("falls back to the default tab for unknown values (old reader-intent tabs included)", () => {
    expect(parseInsightsTab("proof")).toBe(DEFAULT_INSIGHTS_TAB);
    expect(parseInsightsTab("collaboration")).toBe(DEFAULT_INSIGHTS_TAB);
    expect(parseInsightsTab("nonsense")).toBe(DEFAULT_INSIGHTS_TAB);
  });
});

describe("buildInsightsTabHref", () => {
  it("omits the query string for the default tab", () => {
    expect(buildInsightsTabHref("do-next")).toBe("/ontology/insights/");
  });

  it("appends ?tab= for non-default tabs", () => {
    expect(buildInsightsTabHref("composition")).toBe("/ontology/insights/?tab=composition");
    expect(buildInsightsTabHref("connections")).toBe("/ontology/insights/?tab=connections");
    expect(buildInsightsTabHref("boundaries")).toBe("/ontology/insights/?tab=boundaries");
    expect(buildInsightsTabHref("freshness")).toBe("/ontology/insights/?tab=freshness");
  });

  it("preserves the current locale pathname for native history updates", () => {
    expect(buildInsightsTabHref("composition", "/ko/ontology/insights/")).toBe(
      "/ko/ontology/insights/?tab=composition",
    );
    expect(buildInsightsTabHref("do-next", "/en/ontology/insights/")).toBe(
      "/en/ontology/insights/",
    );
  });
});
