import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSIGHTS_TAB,
  INSIGHTS_SECTIONS,
  INSIGHTS_TABS,
  buildInsightsTabHref,
  harnessOverviewHref,
  parseInsightsTab,
  parseInsightsTabHref,
} from "./insights-tab-state";

describe("parseInsightsTab", () => {
  it("defaults to relationships when the param is missing", () => {
    expect(parseInsightsTab(null)).toBe("connections");
    expect(parseInsightsTab(undefined)).toBe("connections");
    expect(parseInsightsTab("")).toBe("connections");
  });

  it("accepts every question tab", () => {
    expect(INSIGHTS_TABS).toEqual([
      "brief",
      "library",
      "do-next",
      "unmatched",
      "composition",
      "connections",
      "boundaries",
      "growth",
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

  it("falls back to the default tab for the retired Guidance and Written explanations links", () => {
    expect(parseInsightsTab("harness")).toBe(DEFAULT_INSIGHTS_TAB);
    expect(parseInsightsTab("flow")).toBe(DEFAULT_INSIGHTS_TAB);
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

describe("the section bar", () => {
  it("holds System relationships, Review summary and Wiki, in that order", () => {
    expect(INSIGHTS_SECTIONS).toEqual(["connections", "brief", "library"]);
    for (const section of INSIGHTS_SECTIONS) expect(INSIGHTS_TABS).toContain(section);
  });
});

describe("harnessOverviewHref", () => {
  it("opens At a glance and keeps every other flag", () => {
    expect(harnessOverviewHref("?tab=harness")).toBe("/architecture/?view=overview");
    expect(harnessOverviewHref("?tab=harness&guides=off")).toBe("/architecture/?guides=off&view=overview");
    expect(harnessOverviewHref("?guides=off&tab=harness&via=x")).toBe("/architecture/?guides=off&via=x&view=overview");
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
    expect(buildInsightsTabHref("brief", "/ontology/insights/", "?tab=growth")).toBe(
      "/ontology/insights/?tab=brief",
    );
  });
});

describe("parseInsightsTabHref", () => {
  it("answers with the tab for a destination on this same board", () => {
    expect(parseInsightsTabHref("/ontology/insights/?tab=do-next")).toBe("do-next");
    expect(parseInsightsTabHref("/ontology/insights/?tab=growth")).toBe("growth");
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
