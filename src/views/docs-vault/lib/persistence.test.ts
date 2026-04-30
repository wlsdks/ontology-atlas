import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DOCS_VAULT_AUDIENCE_KEY,
  DOCS_VAULT_SOURCE_KEY,
  escapeHtml,
  parseDocsVaultAudience,
  parseDocsVaultView,
  readStoredAudience,
  readStoredSource,
  scheduleStateSync,
  storeAudience,
  storeSource,
} from "./persistence";

describe("parseDocsVaultView", () => {
  it("4 종 known value 그대로 반환", () => {
    expect(parseDocsVaultView("doc")).toBe("doc");
    expect(parseDocsVaultView("graph")).toBe("graph");
    expect(parseDocsVaultView("stats")).toBe("stats");
    expect(parseDocsVaultView("folder-topology")).toBe("folder-topology");
  });

  it("unknown / null / undefined 는 'doc' fallback", () => {
    expect(parseDocsVaultView(null)).toBe("doc");
    expect(parseDocsVaultView(undefined)).toBe("doc");
    expect(parseDocsVaultView("")).toBe("doc");
    expect(parseDocsVaultView("alien")).toBe("doc");
  });
});

describe("parseDocsVaultAudience", () => {
  it("3 종 known value 그대로 반환", () => {
    expect(parseDocsVaultAudience("planner")).toBe("planner");
    expect(parseDocsVaultAudience("engineer")).toBe("engineer");
    expect(parseDocsVaultAudience("all")).toBe("all");
  });

  it("unknown / null / undefined 는 'all' fallback", () => {
    expect(parseDocsVaultAudience(null)).toBe("all");
    expect(parseDocsVaultAudience(undefined)).toBe("all");
    expect(parseDocsVaultAudience("")).toBe("all");
    expect(parseDocsVaultAudience("alien")).toBe("all");
  });
});

describe("escapeHtml", () => {
  it("4 entity 정확히 치환", () => {
    expect(escapeHtml("a&b<c>d\"e")).toBe("a&amp;b&lt;c&gt;d&quot;e");
  });

  it("entity 없는 일반 문자열은 그대로", () => {
    expect(escapeHtml("로그인 spec — auth")).toBe("로그인 spec — auth");
  });

  it("빈 문자열은 빈 문자열", () => {
    expect(escapeHtml("")).toBe("");
  });
});

describe("source / audience storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("source: 빈 storage 는 'server' default", () => {
    expect(readStoredSource()).toBe("server");
  });

  it("source: 저장 후 다시 read", () => {
    storeSource("local");
    expect(readStoredSource()).toBe("local");
    expect(window.localStorage.getItem(DOCS_VAULT_SOURCE_KEY)).toBe("local");
  });

  it("source: 잘못된 값 저장돼 있으면 'server' fallback", () => {
    window.localStorage.setItem(DOCS_VAULT_SOURCE_KEY, "garbage");
    expect(readStoredSource()).toBe("server");
  });

  it("audience: 빈 storage 는 'all' default", () => {
    expect(readStoredAudience()).toBe("all");
  });

  it("audience: 저장 후 다시 read", () => {
    storeAudience("planner");
    expect(readStoredAudience()).toBe("planner");
    expect(window.localStorage.getItem(DOCS_VAULT_AUDIENCE_KEY)).toBe(
      "planner",
    );
  });

  it("audience: legacy key (`aslan:docs-vault:mode`) fallback", () => {
    window.localStorage.setItem("aslan:docs-vault:mode", "engineer");
    expect(readStoredAudience()).toBe("engineer");
  });

  it("audience: 신규 key 가 우선, legacy 무시", () => {
    window.localStorage.setItem(DOCS_VAULT_AUDIENCE_KEY, "planner");
    window.localStorage.setItem("aslan:docs-vault:mode", "engineer");
    expect(readStoredAudience()).toBe("planner");
  });

  it("audience: 잘못된 값 저장돼 있으면 'all' fallback", () => {
    window.localStorage.setItem(DOCS_VAULT_AUDIENCE_KEY, "garbage");
    expect(readStoredAudience()).toBe("all");
  });
});

describe("scheduleStateSync", () => {
  it("queueMicrotask 로 호출 (즉시 실행 안 됨)", async () => {
    const fn = vi.fn();
    scheduleStateSync(fn);
    expect(fn).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(fn).toHaveBeenCalledOnce();
  });
});
