import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultConflictError } from "@/entities/vault-session";
import {
  DOCS_VAULT_LIST_COLLAPSED_KEY,
  DOCS_VAULT_SOURCE_KEY,
  escapeHtml,
  isDocsVaultLocalSourceDisabled,
  parseDocsVaultSource,
  parseDocsVaultView,
  persistEditorSave,
  readStoredListCollapsed,
  readStoredSource,
  scheduleStateSync,
  shouldShowDogfoodVaultHint,
  shouldShowDesktopVaultWelcome,
  shouldSwitchToDogfoodVault,
  shouldHonorLocalIntent,
  shouldPreferLocalOnLanding,
  storeListCollapsed,
  storeSource,
} from "./persistence";

describe("parseDocsVaultView", () => {
  // Since folder-topology was removed, 'doc' is the only view. An unknown value is always
  // normalized to 'doc' too.
  it("항상 'doc' 반환", () => {
    expect(parseDocsVaultView("doc")).toBe("doc");
    expect(parseDocsVaultView(null)).toBe("doc");
    expect(parseDocsVaultView(undefined)).toBe("doc");
    expect(parseDocsVaultView("")).toBe("doc");
    expect(parseDocsVaultView("alien")).toBe("doc");
  });
});

describe("parseDocsVaultSource", () => {
  it("accepts only explicit server/local source values", () => {
    expect(parseDocsVaultSource("server")).toBe("server");
    expect(parseDocsVaultSource("local")).toBe("local");
    expect(parseDocsVaultSource("README")).toBeNull();
    expect(parseDocsVaultSource(null)).toBeNull();
  });
});

describe("persistEditorSave", () => {
  // Data-loss regression guard: if the editor's onSave swallows `VaultConflictError` (as an older
  // version did), `doSave` marks the buffer phantom-clean, shows "saved", and the next poll
  // re-fetch overwrites the unsaved edit. `persistEditorSave` never swallows a conflict; it
  // re-throws so the editor keeps the buffer dirty.
  it("성공 시 resolve, onConflict 미호출", async () => {
    const saveDoc = vi.fn().mockResolvedValue(undefined);
    const onConflict = vi.fn();
    await expect(
      persistEditorSave(saveDoc, { slug: "a", content: "x", expectedMtime: 10 }, onConflict),
    ).resolves.toBeUndefined();
    expect(saveDoc).toHaveBeenCalledWith("a", "x", { expectedMtime: 10 });
    expect(onConflict).not.toHaveBeenCalled();
  });

  it("VaultConflictError 는 swallow 하지 않고 re-throw + onConflict 호출", async () => {
    const conflict = new VaultConflictError("a", 10, 20);
    const saveDoc = vi.fn().mockRejectedValue(conflict);
    const onConflict = vi.fn();
    await expect(
      persistEditorSave(saveDoc, { slug: "a", content: "x", expectedMtime: 10 }, onConflict),
    ).rejects.toBe(conflict);
    expect(onConflict).toHaveBeenCalledWith(conflict);
  });

  it("conflict 가 아닌 에러는 onConflict 없이 re-throw", async () => {
    const boom = new Error("disk full");
    const saveDoc = vi.fn().mockRejectedValue(boom);
    const onConflict = vi.fn();
    await expect(
      persistEditorSave(saveDoc, { slug: "a", content: "x" }, onConflict),
    ).rejects.toBe(boom);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it("onConflict 미제공이어도 conflict 를 re-throw", async () => {
    const conflict = new VaultConflictError("a", 10, 20);
    const saveDoc = vi.fn().mockRejectedValue(conflict);
    await expect(
      persistEditorSave(saveDoc, { slug: "a", content: "x", expectedMtime: 10 }),
    ).rejects.toBe(conflict);
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

describe("source storage", () => {
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
});

describe("shouldPreferLocalOnLanding (C5)", () => {
  it("prefers local when a vault is loaded and current source is Sample", () => {
    expect(shouldPreferLocalOnLanding("loaded", "server")).toBe(true);
  });

  it("keeps an explicit packaged-doc deep link on Sample without changing the stored local preference", () => {
    expect(shouldPreferLocalOnLanding("loaded", "server", "server")).toBe(false);
  });

  it("does not re-flip when already local", () => {
    expect(shouldPreferLocalOnLanding("loaded", "local")).toBe(false);
  });

  it("does not force local while the vault is still restoring / idle / errored", () => {
    expect(shouldPreferLocalOnLanding("idle", "server")).toBe(false);
    expect(shouldPreferLocalOnLanding("loading", "server")).toBe(false);
    expect(shouldPreferLocalOnLanding("error", "server")).toBe(false);
    expect(shouldPreferLocalOnLanding("unsupported", "server")).toBe(false);
  });
});

describe("doc list collapse storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("list-collapsed: 빈 storage 는 펼침(false) default", () => {
    expect(readStoredListCollapsed()).toBe(false);
  });

  it("list-collapsed: 접기 저장 후 다시 read 하면 true 유지", () => {
    storeListCollapsed(true);
    expect(window.localStorage.getItem(DOCS_VAULT_LIST_COLLAPSED_KEY)).toBe("1");
    expect(readStoredListCollapsed()).toBe(true);
  });

  it("list-collapsed: 펼침 저장은 '0' 으로 기록", () => {
    storeListCollapsed(false);
    expect(window.localStorage.getItem(DOCS_VAULT_LIST_COLLAPSED_KEY)).toBe("0");
    expect(readStoredListCollapsed()).toBe(false);
  });

  it("list-collapsed: 잘못된 값이면 펼침(false) fallback", () => {
    window.localStorage.setItem(DOCS_VAULT_LIST_COLLAPSED_KEY, "garbage");
    expect(readStoredListCollapsed()).toBe(false);
  });
});

// Contract change: the gate looks only at capability (FSA support), not the runtime — resolving the
// contradiction where the map could write to the vault in the same web session while only the docs
// surface was locked behind macOS.
describe("capability-gated local vault source", () => {
  it("honors ?intent=local in every runtime (web included — builder parity)", () => {
    expect(shouldHonorLocalIntent("local", true)).toBe(true);
    expect(shouldHonorLocalIntent("local", false)).toBe(true);
    expect(shouldHonorLocalIntent("server", true)).toBe(false);
    expect(shouldHonorLocalIntent(null, true)).toBe(false);
    expect(shouldHonorLocalIntent(undefined, true)).toBe(false);
  });

  it("shows dogfood vault hint only for desktop local dogfood handoff", () => {
    expect(
      shouldShowDogfoodVaultHint({
        dogfood: "1",
        isDesktopRuntime: true,
        source: "local",
        hasLocalManifest: false,
      }),
    ).toBe(true);
    expect(
      shouldShowDogfoodVaultHint({
        dogfood: "1",
        isDesktopRuntime: false,
        source: "local",
        hasLocalManifest: false,
      }),
    ).toBe(false);
    expect(
      shouldShowDogfoodVaultHint({
        dogfood: null,
        isDesktopRuntime: true,
        source: "local",
        hasLocalManifest: false,
      }),
    ).toBe(false);
    expect(
      shouldShowDogfoodVaultHint({
        dogfood: "1",
        isDesktopRuntime: true,
        source: "local",
        hasLocalManifest: true,
      }),
    ).toBe(false);
  });

  it("switches dogfood deep links away from a different loaded desktop vault", () => {
    expect(
      shouldSwitchToDogfoodVault({
        dogfood: "1",
        isDesktopRuntime: true,
        source: "local",
        localVaultStatus: "loaded",
        currentRootPath: "/private/tmp/ontology-atlas-editor-smoke",
        dogfoodRootPath: "/Users/dana/side-project/ontology-atlas/docs/ontology",
      }),
    ).toBe(true);
    expect(
      shouldSwitchToDogfoodVault({
        dogfood: "1",
        isDesktopRuntime: true,
        source: "local",
        localVaultStatus: "loaded",
        currentRootPath: "/Users/dana/side-project/ontology-atlas/docs/ontology",
        dogfoodRootPath: "/Users/dana/side-project/ontology-atlas/docs/ontology",
      }),
    ).toBe(false);
    expect(
      shouldSwitchToDogfoodVault({
        dogfood: "1",
        isDesktopRuntime: true,
        source: "local",
        localVaultStatus: "idle",
        currentRootPath: null,
        dogfoodRootPath: "/Users/dana/side-project/ontology-atlas/docs/ontology",
      }),
    ).toBe(false);
    expect(
      shouldSwitchToDogfoodVault({
        dogfood: null,
        isDesktopRuntime: true,
        source: "local",
        localVaultStatus: "loaded",
        currentRootPath: "/private/tmp/ontology-atlas-editor-smoke",
        dogfoodRootPath: "/Users/dana/side-project/ontology-atlas/docs/ontology",
      }),
    ).toBe(false);
  });

  it("treats the current old checkout path as an accepted dogfood vault root", () => {
    expect(
      shouldSwitchToDogfoodVault({
        dogfood: "1",
        isDesktopRuntime: true,
        source: "local",
        localVaultStatus: "loaded",
        currentRootPath: "/Users/dana/side-project/oh-my-ontology/docs/ontology",
        dogfoodRootPath: "/Users/dana/side-project/ontology-atlas/docs/ontology",
        dogfoodRootPaths: [
          "/Users/dana/side-project/ontology-atlas/docs/ontology",
          "/Users/dana/side-project/oh-my-ontology/docs/ontology",
        ],
      }),
    ).toBe(false);
  });

  it("gates local vault source on capability, not runtime", () => {
    expect(
      isDocsVaultLocalSourceDisabled({
        isDesktopRuntime: false,
        localVaultStatus: "idle",
      }),
    ).toBe(false);
    expect(
      isDocsVaultLocalSourceDisabled({
        isDesktopRuntime: false,
        localVaultStatus: "unsupported",
      }),
    ).toBe(true);
    expect(
      isDocsVaultLocalSourceDisabled({
        isDesktopRuntime: true,
        localVaultStatus: "idle",
      }),
    ).toBe(false);
    expect(
      isDocsVaultLocalSourceDisabled({
        isDesktopRuntime: true,
        localVaultStatus: "unsupported",
      }),
    ).toBe(true);
  });

  it("shows the desktop vault welcome before a local vault is selected", () => {
    expect(
      shouldShowDesktopVaultWelcome({
        isDesktopRuntime: true,
        source: "local",
        localVaultStatus: "idle",
        hasLocalManifest: false,
      }),
    ).toBe(true);
    expect(
      shouldShowDesktopVaultWelcome({
        isDesktopRuntime: true,
        source: "local",
        localVaultStatus: "loaded",
        hasLocalManifest: true,
      }),
    ).toBe(false);
    // A web session gets the welcome (with its open CTA) too, under the capability contract.
    expect(
      shouldShowDesktopVaultWelcome({
        isDesktopRuntime: false,
        source: "local",
        localVaultStatus: "idle",
        hasLocalManifest: false,
      }),
    ).toBe(true);
    expect(
      shouldShowDesktopVaultWelcome({
        isDesktopRuntime: true,
        source: "server",
        localVaultStatus: "idle",
        hasLocalManifest: false,
      }),
    ).toBe(false);
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
