import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSIGHTS_TAB,
  INSIGHTS_CORES,
  INSIGHTS_TABS,
  ONTOLOGY_TABS,
  buildInsightsTabHref,
  coreOfTab,
  parseInsightsTab,
  tabOfCore,
} from "./insights-tab-state";

describe("parseInsightsTab", () => {
  it("defaults to the brief when the param is missing", () => {
    expect(parseInsightsTab(null)).toBe("brief");
    expect(parseInsightsTab(undefined)).toBe("brief");
    expect(parseInsightsTab("")).toBe("brief");
  });

  it("accepts every question tab", () => {
    expect(INSIGHTS_TABS).toEqual([
      // What in this reader's understanding has to change — across all three cores.
      "brief",
      // The two cores that answer for themselves; the rest are the ontology's questions.
      "library",
      "harness",
      "do-next",
      "unmatched",
      "composition",
      "connections",
      "boundaries",
      "growth",
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

describe("the freshness rename", () => {
  /*
   * ⚠️ Bookmarks and agent return-chip links (`via=insights:freshness`) live a long time.
   * The tab that asked "what moved lately" now asks "what has this folder grown into", and
   * the old name has to keep landing somewhere real rather than dumping a saved link on the
   * default tab.
   */
  it("still lands an old ?tab=freshness link on the tab that replaced it", () => {
    expect(parseInsightsTab("freshness")).toBe("growth");
  });
});

describe("the first row names the thing a tab is about", () => {
  it("puts every ontology question under the ontology, and the other three under themselves", () => {
    expect(INSIGHTS_CORES).toEqual(["brief", "ontology", "library", "harness"]);
    for (const tab of ONTOLOGY_TABS) expect(coreOfTab(tab)).toBe("ontology");
    expect(coreOfTab("brief")).toBe("brief");
    expect(coreOfTab("library")).toBe("library");
    expect(coreOfTab("harness")).toBe("harness");
  });

  it("opens the ontology on its first question rather than on an empty shelf", () => {
    expect(tabOfCore("ontology")).toBe("do-next");
    expect(tabOfCore("brief")).toBe("brief");
    expect(tabOfCore("library")).toBe("library");
    // Every core's landing tab is a real tab, so the address always names something drawable.
    for (const core of INSIGHTS_CORES) expect(INSIGHTS_TABS).toContain(tabOfCore(core));
  });
});

describe("buildInsightsTabHref", () => {
  it("omits the query string for the default tab", () => {
    expect(buildInsightsTabHref("brief")).toBe("/ontology/insights/");
  });

  it("appends ?tab= for non-default tabs", () => {
    expect(buildInsightsTabHref("do-next")).toBe("/ontology/insights/?tab=do-next");
    expect(buildInsightsTabHref("composition")).toBe("/ontology/insights/?tab=composition");
    expect(buildInsightsTabHref("connections")).toBe("/ontology/insights/?tab=connections");
    expect(buildInsightsTabHref("boundaries")).toBe("/ontology/insights/?tab=boundaries");
    expect(buildInsightsTabHref("growth")).toBe("/ontology/insights/?tab=growth");
  });

  it("preserves the current locale pathname for native history updates", () => {
    expect(buildInsightsTabHref("composition", "/ko/ontology/insights/")).toBe(
      "/ko/ontology/insights/?tab=composition",
    );
    expect(buildInsightsTabHref("brief", "/en/ontology/insights/")).toBe(
      "/en/ontology/insights/",
    );
  });
});

describe("switching tabs keeps the rest of the address", () => {
  /*
   * ⚠️ The old form returned `${pathname}?tab=${tab}`, which replaced the whole query, so a
   * single tab click dropped `guides=off` and the first-run overlay came back mid-session.
   * `/architecture` pins the same property; these two must not drift.
   */
  it("preserves orthogonal flags across a switch", () => {
    expect(buildInsightsTabHref("growth", "/ontology/insights/", "?guides=off")).toBe(
      "/ontology/insights/?guides=off&tab=growth",
    );
  });

  it("still drops ?tab= entirely for the default tab, flags and all kept", () => {
    expect(buildInsightsTabHref("brief", "/ontology/insights/", "?guides=off&tab=growth")).toBe(
      "/ontology/insights/?guides=off",
    );
    expect(buildInsightsTabHref("brief", "/ontology/insights/", "?tab=growth")).toBe(
      "/ontology/insights/",
    );
  });

  it("replaces a stale tab rather than appending a second one", () => {
    expect(buildInsightsTabHref("flow", "/ontology/insights/", "?tab=growth")).toBe(
      "/ontology/insights/?tab=flow",
    );
  });
});
