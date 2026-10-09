import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSIGHTS_TAB,
  INSIGHTS_CORES,
  INSIGHTS_TABS,
  ONTOLOGY_TABS,
  buildInsightsTabHref,
  coreOfTab,
  parseInsightsTab,
  parseInsightsTabHref,
  tabOfCore,
} from "./insights-tab-state";

describe("parseInsightsTab", () => {
  it("defaults to relationships when the param is missing", () => {
    expect(parseInsightsTab(null)).toBe("connections");
    expect(parseInsightsTab(undefined)).toBe("connections");
    expect(parseInsightsTab("")).toBe("connections");
  });

  it("accepts every question tab", () => {
    expect(INSIGHTS_TABS).toEqual([
      // What in this reader's understanding has to change, across all three cores.
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
      // The one tab written by an agent: prose on what this product is and how it moves.
      "flow",
    ]);
    for (const tab of INSIGHTS_TABS) {
      expect(parseInsightsTab(tab)).toBe(tab);
    }
  });

  it("maps legacy overview and relations links to composition and connections", () => {
    expect(parseInsightsTab("overview")).toBe("composition");
    expect(parseInsightsTab("relations")).toBe("connections");
  });

  it("maps a legacy structure tab link to composition", () => {
    expect(parseInsightsTab("structure")).toBe("composition");
  });

  it("falls back to the default tab for unknown values (old reader-intent tabs included)", () => {
    expect(parseInsightsTab("proof")).toBe(DEFAULT_INSIGHTS_TAB);
    expect(parseInsightsTab("collaboration")).toBe(DEFAULT_INSIGHTS_TAB);
    expect(parseInsightsTab("nonsense")).toBe(DEFAULT_INSIGHTS_TAB);
  });
});

describe("the freshness rename", () => {
  // Saved links and return chips with `via=insights:freshness` land on the tab that replaced freshness.
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
    // Every core lands on a real tab, so the address always names something drawable.
    for (const core of INSIGHTS_CORES) expect(INSIGHTS_TABS).toContain(tabOfCore(core));
  });
});

describe("buildInsightsTabHref", () => {
  it("omits the query string for the default tab", () => {
    expect(buildInsightsTabHref("connections")).toBe("/ontology/insights/");
  });

  it("appends ?tab= for non-default tabs", () => {
    expect(buildInsightsTabHref("do-next")).toBe("/ontology/insights/?tab=do-next");
    expect(buildInsightsTabHref("composition")).toBe("/ontology/insights/?tab=composition");
    expect(buildInsightsTabHref("brief")).toBe("/ontology/insights/?tab=brief");
    expect(buildInsightsTabHref("boundaries")).toBe("/ontology/insights/?tab=boundaries");
    expect(buildInsightsTabHref("growth")).toBe("/ontology/insights/?tab=growth");
  });

  it("preserves the current locale pathname for native history updates", () => {
    expect(buildInsightsTabHref("composition", "/ko/ontology/insights/")).toBe(
      "/ko/ontology/insights/?tab=composition",
    );
    expect(buildInsightsTabHref("connections", "/en/ontology/insights/")).toBe(
      "/en/ontology/insights/",
    );
  });
});

describe("switching tabs keeps the rest of the address", () => {
  // A tab switch keeps other query flags such as `guides=off`, as `/architecture` does.
  it("preserves orthogonal flags across a switch", () => {
    expect(buildInsightsTabHref("growth", "/ontology/insights/", "?guides=off")).toBe(
      "/ontology/insights/?guides=off&tab=growth",
    );
  });

  it("still drops ?tab= entirely for the default tab, flags and all kept", () => {
    expect(buildInsightsTabHref("connections", "/ontology/insights/", "?guides=off&tab=growth")).toBe(
      "/ontology/insights/?guides=off",
    );
    expect(buildInsightsTabHref("connections", "/ontology/insights/", "?tab=growth")).toBe(
      "/ontology/insights/",
    );
  });

  it("replaces a stale tab rather than appending a second one", () => {
    expect(buildInsightsTabHref("flow", "/ontology/insights/", "?tab=growth")).toBe(
      "/ontology/insights/?tab=flow",
    );
  });
});

describe("parseInsightsTabHref", () => {
  it("answers with the tab for a destination on this same board", () => {
    expect(parseInsightsTabHref("/ontology/insights/?tab=do-next")).toBe("do-next");
    expect(parseInsightsTabHref("/ontology/insights/?tab=growth")).toBe("growth");
    // No query is the default tab; a retired name resolves through the aliases.
    expect(parseInsightsTabHref("/ontology/insights/")).toBe("connections");
    expect(parseInsightsTabHref("/ontology/insights/?tab=freshness")).toBe("growth");
  });

  it("leaves every other destination alone", () => {
    expect(parseInsightsTabHref("/library/")).toBeNull();
    expect(parseInsightsTabHref("/library/?tab=rounds")).toBeNull();
    expect(parseInsightsTabHref("/architecture/?view=coverage")).toBeNull();
    expect(parseInsightsTabHref("/download/")).toBeNull();
    expect(parseInsightsTabHref("/topology/")).toBeNull();
    // A different screen whose path starts with the same words is not this board.
    expect(parseInsightsTabHref("/ontology/insights-archive/")).toBeNull();
  });
});
