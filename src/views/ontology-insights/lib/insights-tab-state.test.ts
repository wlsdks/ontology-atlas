import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSIGHTS_TAB,
  buildInsightsTabHref,
  parseInsightsTab,
} from "./insights-tab-state";

describe("parseInsightsTab", () => {
  it("defaults to overview when the param is missing", () => {
    expect(parseInsightsTab(null)).toBe("overview");
    expect(parseInsightsTab(undefined)).toBe("overview");
    expect(parseInsightsTab("")).toBe("overview");
  });

  it("accepts the three known tabs", () => {
    expect(parseInsightsTab("overview")).toBe("overview");
    expect(parseInsightsTab("relations")).toBe("relations");
    expect(parseInsightsTab("freshness")).toBe("freshness");
  });

  it("falls back to the default tab for unknown values (old reader-intent tabs included)", () => {
    expect(parseInsightsTab("proof")).toBe(DEFAULT_INSIGHTS_TAB);
    expect(parseInsightsTab("collaboration")).toBe(DEFAULT_INSIGHTS_TAB);
    expect(parseInsightsTab("nonsense")).toBe(DEFAULT_INSIGHTS_TAB);
  });
});

describe("buildInsightsTabHref", () => {
  it("omits the query string for the default tab", () => {
    expect(buildInsightsTabHref("overview")).toBe("/ontology/insights/");
  });

  it("appends ?tab= for non-default tabs", () => {
    expect(buildInsightsTabHref("relations")).toBe("/ontology/insights/?tab=relations");
    expect(buildInsightsTabHref("freshness")).toBe("/ontology/insights/?tab=freshness");
  });
});
