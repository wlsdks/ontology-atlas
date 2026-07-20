import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSIGHTS_TAB,
  buildInsightsTabHref,
  parseInsightsTab,
} from "./insights-tab-state";

describe("parseInsightsTab", () => {
  it("defaults to do-next when the param is missing", () => {
    expect(parseInsightsTab(null)).toBe("do-next");
    expect(parseInsightsTab(undefined)).toBe("do-next");
    expect(parseInsightsTab("")).toBe("do-next");
  });

  it("accepts the three known tabs", () => {
    expect(parseInsightsTab("do-next")).toBe("do-next");
    expect(parseInsightsTab("structure")).toBe("structure");
    expect(parseInsightsTab("freshness")).toBe("freshness");
  });

  it("S5 재편 전 공유 링크 호환 — overview/relations 는 구조 탭으로", () => {
    expect(parseInsightsTab("overview")).toBe("structure");
    expect(parseInsightsTab("relations")).toBe("structure");
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
    expect(buildInsightsTabHref("structure")).toBe("/ontology/insights/?tab=structure");
    expect(buildInsightsTabHref("freshness")).toBe("/ontology/insights/?tab=freshness");
  });
});
