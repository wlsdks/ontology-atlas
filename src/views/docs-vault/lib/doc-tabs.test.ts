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
  it("네임스페이스에 sourceKey 를 그대로 포함한다 (vault 별 키 분리)", () => {
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

  it("round-trip 으로 저장한 탭을 그대로 복원한다", () => {
    const tabs = [makeTab("README", 1), makeTab("FEATURES", 2)];
    storeDocTabs("server", tabs);
    expect(readStoredDocTabs("server")).toEqual(tabs);
  });

  it("키가 없으면 빈 배열을 반환한다", () => {
    expect(readStoredDocTabs("missing-key")).toEqual([]);
  });

  it("손상된 JSON 은 빈 배열로 안전하게 처리한다", () => {
    window.localStorage.setItem(docTabsStorageKey("server"), "{not json");
    expect(readStoredDocTabs("server")).toEqual([]);
  });

  it("배열이 아닌 값은 빈 배열로 처리한다", () => {
    window.localStorage.setItem(docTabsStorageKey("server"), JSON.stringify({ foo: 1 }));
    expect(readStoredDocTabs("server")).toEqual([]);
  });

  it("shape 이 맞지 않는 항목은 걸러낸다", () => {
    window.localStorage.setItem(
      docTabsStorageKey("server"),
      JSON.stringify([makeTab("ok", 1), { slug: "bad" }, null, "str"]),
    );
    expect(readStoredDocTabs("server")).toEqual([makeTab("ok", 1)]);
  });

  it("vault(sourceKey) 별로 저장 공간이 분리된다", () => {
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

  it("vault별 마지막 명시적 활성 문서를 별도 key로 round-trip 한다", () => {
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
  it("validSlugs 에 없는 탭(rename/delete 로 사라진 문서)을 조용히 제거한다", () => {
    const tabs = [makeTab("README", 1), makeTab("GONE", 2)];
    const next = pruneMissingDocTabs(tabs, new Set(["README"]));
    expect(next).toEqual([makeTab("README", 1)]);
  });

  it("제거할 것이 없으면 원본 참조를 그대로 반환한다", () => {
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

  it("URL 딥링크가 없으면 현재 vault의 가장 최근 활성 탭을 복원한다", () => {
    expect(
      resolveRestoredActiveDocSlug({
        tabs,
        validSlugs: new Set(["README", "capabilities/audit-sample", "FEATURES"]),
        querySlug: null,
      }),
    ).toBe("capabilities/audit-sample");
  });

  it("명시적으로 기억한 활성 문서는 시작 기본값이 갱신한 탭 시각보다 우선한다", () => {
    expect(
      resolveRestoredActiveDocSlug({
        tabs,
        validSlugs: new Set(["README", "capabilities/audit-sample", "FEATURES"]),
        querySlug: null,
        storedActiveSlug: "README",
      }),
    ).toBe("README");
  });

  it("URL 딥링크가 있으면 저장된 활성 탭으로 덮어쓰지 않는다", () => {
    expect(
      resolveRestoredActiveDocSlug({
        tabs,
        validSlugs: new Set(["README", "capabilities/audit-sample", "FEATURES"]),
        querySlug: "FEATURES",
      }),
    ).toBeNull();
  });

  it("현재 vault에서 사라진 탭은 복원 후보에서 제외한다", () => {
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
  it("새 슬러그는 뒤에 탭을 추가한다", () => {
    const tabs = [makeTab("README", 1)];
    const next = openOrActivateDocTab(tabs, { slug: "FEATURES", title: "Features" }, 2);
    expect(next.map((t) => t.slug)).toEqual(["README", "FEATURES"]);
    expect(next[1]).toEqual({ slug: "FEATURES", title: "Features", lastActivatedAt: 2 });
  });

  it("이미 열린 슬러그는 중복 추가하지 않고 activate(+title 갱신)만 한다", () => {
    const tabs = [makeTab("README", 1), makeTab("FEATURES", 2)];
    const next = openOrActivateDocTab(
      tabs,
      { slug: "README", title: "새 타이틀" },
      99,
    );
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual({ slug: "README", title: "새 타이틀", lastActivatedAt: 99 });
    // 탭 순서(위치)는 유지 — activate 가 재배열하지 않는다.
    expect(next.map((t) => t.slug)).toEqual(["README", "FEATURES"]);
  });

  it(`상한 ${DOC_TABS_MAX}개를 넘기면 가장 오래 activate 안 된 탭을 LRU 로 축출한다`, () => {
    let tabs: DocTab[] = [];
    for (let i = 0; i < DOC_TABS_MAX; i += 1) {
      tabs = openOrActivateDocTab(tabs, { slug: `doc-${i}`, title: `doc-${i}` }, i);
    }
    expect(tabs).toHaveLength(DOC_TABS_MAX);
    // doc-3 을 최근 activate 로 갱신 — 가장 오래된 후보에서 제외되게.
    tabs = openOrActivateDocTab(tabs, { slug: "doc-3", title: "doc-3" }, 100);
    // 새 문서 추가 → 상한 초과 → 가장 오래(activate 안 된) 탭이 축출된다.
    tabs = openOrActivateDocTab(tabs, { slug: "doc-new", title: "doc-new" }, 101);
    expect(tabs).toHaveLength(DOC_TABS_MAX);
    expect(tabs.map((t) => t.slug)).not.toContain("doc-0");
    expect(tabs.map((t) => t.slug)).toContain("doc-3");
    expect(tabs.map((t) => t.slug)).toContain("doc-new");
  });

  it("새로 열리거나 activate 된 탭은 같은 호출로 절대 축출되지 않는다", () => {
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

  it("활성 탭이 아닌 탭을 닫으면 활성 선택이 바뀌지 않는다", () => {
    const result = closeDocTab(tabs, "A", "B");
    expect(result.tabs.map((t) => t.slug)).toEqual(["B", "C"]);
    expect(result.nextActiveSlug).toBe("B");
  });

  it("활성 탭을 닫으면 왼쪽 인접 탭으로 이동한다", () => {
    const result = closeDocTab(tabs, "B", "B");
    expect(result.tabs.map((t) => t.slug)).toEqual(["A", "C"]);
    expect(result.nextActiveSlug).toBe("A");
  });

  it("맨 왼쪽(첫) 활성 탭을 닫으면 왼쪽이 없으므로 오른쪽 인접 탭으로 이동한다", () => {
    const result = closeDocTab(tabs, "A", "A");
    expect(result.tabs.map((t) => t.slug)).toEqual(["B", "C"]);
    expect(result.nextActiveSlug).toBe("B");
  });

  it("마지막 남은 탭을 닫으면 nextActiveSlug 는 null(호출부가 폴백)", () => {
    const result = closeDocTab([makeTab("ONLY", 1)], "ONLY", "ONLY");
    expect(result.tabs).toEqual([]);
    expect(result.nextActiveSlug).toBeNull();
  });

  it("존재하지 않는 slug 를 닫으려 하면 아무 변화 없이 그대로 반환한다", () => {
    const result = closeDocTab(tabs, "NOPE", "B");
    expect(result.tabs).toBe(tabs);
    expect(result.nextActiveSlug).toBe("B");
  });
});
