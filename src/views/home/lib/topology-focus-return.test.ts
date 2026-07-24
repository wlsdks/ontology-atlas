import { afterEach, describe, expect, it } from "vitest";
import { restoreTopologyFocusAfterDatasheetClose } from "./topology-focus-return";

afterEach(() => {
  document.body.replaceChildren();
});

describe("restoreTopologyFocusAfterDatasheetClose", () => {
  it("returns focus to the matching visible INDEX row", () => {
    const row = document.createElement("div");
    row.tabIndex = -1;
    row.dataset.indexRow = "capability:audit-sample";
    document.body.append(row);

    expect(
      restoreTopologyFocusAfterDatasheetClose("capability:audit-sample"),
    ).toBe("row");
    expect(document.activeElement).toBe(row);
  });

  it("falls back to the INDEX search when the selected row is filtered out", () => {
    const search = document.createElement("input");
    search.dataset.testid = "topology-index-search";
    document.body.append(search);

    expect(
      restoreTopologyFocusAfterDatasheetClose("capability:hidden"),
    ).toBe("search");
    expect(document.activeElement).toBe(search);
  });

  it("falls back to the collapsed INDEX tab when the panel is closed", () => {
    const tab = document.createElement("button");
    tab.dataset.testid = "topology-index-tab";
    document.body.append(tab);

    expect(
      restoreTopologyFocusAfterDatasheetClose("capability:canvas-selection"),
    ).toBe("tab");
    expect(document.activeElement).toBe(tab);
  });

  it("does nothing when no stable INDEX focus target exists", () => {
    expect(
      restoreTopologyFocusAfterDatasheetClose("capability:missing"),
    ).toBe(null);
    expect(document.activeElement).toBe(document.body);
  });
});
