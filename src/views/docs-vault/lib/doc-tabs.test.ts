import { beforeEach, describe, expect, it } from "vitest";
import {
  activeDocTabStorageKey,
  DOC_TABS_MAX,
  closeDocTab,
  docTabsStorageKey,
  openOrActivateDocTab,
  pruneMissingDocTabs,
  readStoredActiveDocSlug,
  readStoredDocTabs,
  resolveRestoredActiveDocSlug,
  storeActiveDocSlug,
  storeDocTabs,
  type DocTab,
} from "./doc-tabs";

function makeTab(slug: string, lastActivatedAt: number): DocTab {
  return { slug, title: slug, lastActivatedAt };
}

describe("docTabsStorageKey", () => {
  it("includes the sourceKey in the namespace so each vault has its own key", () => {
    expect(docTabsStorageKey("server")).toBe("docsVault:openTabs:server");
    expect(docTabsStorageKey("local:my-vault")).toBe(
      "docsVault:openTabs:local:my-vault",
    );
  });
});

describe("readStoredDocTabs / storeDocTabs", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("restores saved tabs unchanged on a round trip", () => {
    const tabs = [makeTab("README", 1), makeTab("FEATURES", 2)];
    storeDocTabs("server", tabs);
    expect(readStoredDocTabs("server")).toEqual(tabs);
  });

  it("returns an empty array when the key is missing", () => {
    expect(readStoredDocTabs("missing-key")).toEqual([]);
  });

  it("returns an empty array for corrupt JSON", () => {
    window.localStorage.setItem(docTabsStorageKey("server"), "{not json");
    expect(readStoredDocTabs("server")).toEqual([]);
  });

  it("returns an empty array for a non-array value", () => {
    window.localStorage.setItem(docTabsStorageKey("server"), JSON.stringify({ foo: 1 }));
    expect(readStoredDocTabs("server")).toEqual([]);
  });

  it("drops entries with the wrong shape", () => {
    window.localStorage.setItem(
      docTabsStorageKey("server"),
      JSON.stringify([makeTab("ok", 1), { slug: "bad" }, null, "str"]),
    );
    expect(readStoredDocTabs("server")).toEqual([makeTab("ok", 1)]);
  });

  it("keeps storage separate per vault sourceKey", () => {
    storeDocTabs("server", [makeTab("README", 1)]);
    storeDocTabs("local:my-vault", [makeTab("project", 2)]);
    expect(readStoredDocTabs("server")).toEqual([makeTab("README", 1)]);
    expect(readStoredDocTabs("local:my-vault")).toEqual([makeTab("project", 2)]);
  });
});

describe("readStoredActiveDocSlug / storeActiveDocSlug", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips each vault's last explicit active doc under its own key", () => {
    storeActiveDocSlug("local:my-vault", "capabilities/audit-sample");
    expect(activeDocTabStorageKey("local:my-vault")).toBe(
      "docsVault:activeTab:local:my-vault",
    );
    expect(readStoredActiveDocSlug("local:my-vault")).toBe(
      "capabilities/audit-sample",
    );
    expect(readStoredActiveDocSlug("server")).toBeNull();
  });
});

describe("pruneMissingDocTabs", () => {
  it("drops tabs whose slug is not in validSlugs after a rename or delete", () => {
    const tabs = [makeTab("README", 1), makeTab("GONE", 2)];
    const next = pruneMissingDocTabs(tabs, new Set(["README"]));
    expect(next).toEqual([makeTab("README", 1)]);
  });

  it("returns the same reference when nothing is removed", () => {
    const tabs = [makeTab("README", 1)];
    const next = pruneMissingDocTabs(tabs, new Set(["README", "FEATURES"]));
    expect(next).toBe(tabs);
  });
});

describe("resolveRestoredActiveDocSlug", () => {
  const tabs = [
    makeTab("README", 10),
    makeTab("capabilities/audit-sample", 30),
    makeTab("FEATURES", 20),
  ];

  it("restores the vault's most recently active tab without a URL deep link", () => {
    expect(
      resolveRestoredActiveDocSlug({
        tabs,
        validSlugs: new Set(["README", "capabilities/audit-sample", "FEATURES"]),
        querySlug: null,
      }),
    ).toBe("capabilities/audit-sample");
  });

  it("prefers the remembered active doc over a tab touched by the startup default", () => {
    expect(
      resolveRestoredActiveDocSlug({
        tabs,
        validSlugs: new Set(["README", "capabilities/audit-sample", "FEATURES"]),
        querySlug: null,
        storedActiveSlug: "README",
      }),
    ).toBe("README");
  });

  it("keeps the URL deep link over the saved active tab", () => {
    expect(
      resolveRestoredActiveDocSlug({
        tabs,
        validSlugs: new Set(["README", "capabilities/audit-sample", "FEATURES"]),
        querySlug: "FEATURES",
      }),
    ).toBeNull();
  });

  it("skips tabs missing from the current vault when restoring", () => {
    expect(
      resolveRestoredActiveDocSlug({
        tabs,
        validSlugs: new Set(["README", "FEATURES"]),
        querySlug: null,
      }),
    ).toBe("FEATURES");
  });
});

describe("openOrActivateDocTab", () => {
  it("appends a tab for a new slug", () => {
    const tabs = [makeTab("README", 1)];
    const next = openOrActivateDocTab(tabs, { slug: "FEATURES", title: "Features" }, 2);
    expect(next.map((t) => t.slug)).toEqual(["README", "FEATURES"]);
    expect(next[1]).toEqual({ slug: "FEATURES", title: "Features", lastActivatedAt: 2 });
  });

  it("activates and retitles an already open slug without duplicating it", () => {
    const tabs = [makeTab("README", 1), makeTab("FEATURES", 2)];
    const next = openOrActivateDocTab(
      tabs,
      { slug: "README", title: "새 타이틀" },
      99,
    );
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual({ slug: "README", title: "새 타이틀", lastActivatedAt: 99 });
    // Activating does not reorder.
    expect(next.map((t) => t.slug)).toEqual(["README", "FEATURES"]);
  });

  it(`evicts the least recently activated tab past ${DOC_TABS_MAX} tabs`, () => {
    let tabs: DocTab[] = [];
    for (let i = 0; i < DOC_TABS_MAX; i += 1) {
      tabs = openOrActivateDocTab(tabs, { slug: `doc-${i}`, title: `doc-${i}` }, i);
    }
    expect(tabs).toHaveLength(DOC_TABS_MAX);
    tabs = openOrActivateDocTab(tabs, { slug: "doc-3", title: "doc-3" }, 100);
    tabs = openOrActivateDocTab(tabs, { slug: "doc-new", title: "doc-new" }, 101);
    expect(tabs).toHaveLength(DOC_TABS_MAX);
    expect(tabs.map((t) => t.slug)).not.toContain("doc-0");
    expect(tabs.map((t) => t.slug)).toContain("doc-3");
    expect(tabs.map((t) => t.slug)).toContain("doc-new");
  });

  it("never evicts the tab opened or activated by the same call", () => {
    let tabs: DocTab[] = [];
    for (let i = 0; i < DOC_TABS_MAX + 1; i += 1) {
      tabs = openOrActivateDocTab(tabs, { slug: `doc-${i}`, title: `doc-${i}` }, i);
    }
    expect(tabs).toHaveLength(DOC_TABS_MAX);
    expect(tabs.map((t) => t.slug)).toContain(`doc-${DOC_TABS_MAX}`);
  });
});

describe("closeDocTab", () => {
  const tabs = [makeTab("A", 1), makeTab("B", 2), makeTab("C", 3)];

  it("keeps the active tab when closing an inactive one", () => {
    const result = closeDocTab(tabs, "A", "B");
    expect(result.tabs.map((t) => t.slug)).toEqual(["B", "C"]);
    expect(result.nextActiveSlug).toBe("B");
  });

  it("activates the left neighbour when closing the active tab", () => {
    const result = closeDocTab(tabs, "B", "B");
    expect(result.tabs.map((t) => t.slug)).toEqual(["A", "C"]);
    expect(result.nextActiveSlug).toBe("A");
  });

  it("activates the right neighbour when closing the first active tab", () => {
    const result = closeDocTab(tabs, "A", "A");
    expect(result.tabs.map((t) => t.slug)).toEqual(["B", "C"]);
    expect(result.nextActiveSlug).toBe("B");
  });

  it("returns a null nextActiveSlug when closing the last tab", () => {
    const result = closeDocTab([makeTab("ONLY", 1)], "ONLY", "ONLY");
    expect(result.tabs).toEqual([]);
    expect(result.nextActiveSlug).toBeNull();
  });

  it("returns tabs unchanged when closing an unknown slug", () => {
    const result = closeDocTab(tabs, "NOPE", "B");
    expect(result.tabs).toBe(tabs);
    expect(result.nextActiveSlug).toBe("B");
  });
});
