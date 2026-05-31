import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultConflictError } from "@/features/docs-vault-local";
import {
  DOCS_VAULT_SOURCE_KEY,
  escapeHtml,
  isDocsVaultLocalSourceDisabled,
  parseDocsVaultView,
  persistEditorSave,
  readStoredSource,
  scheduleStateSync,
  shouldShowDesktopVaultWelcome,
  shouldHonorLocalIntent,
  storeSource,
} from "./persistence";

describe("parseDocsVaultView", () => {
  it("known value 그대로 반환", () => {
    expect(parseDocsVaultView("doc")).toBe("doc");
    expect(parseDocsVaultView("folder-topology")).toBe("folder-topology");
  });

  it("unknown / null / undefined 는 'doc' fallback", () => {
    expect(parseDocsVaultView(null)).toBe("doc");
    expect(parseDocsVaultView(undefined)).toBe("doc");
    expect(parseDocsVaultView("")).toBe("doc");
    expect(parseDocsVaultView("alien")).toBe("doc");
  });
});

describe("persistEditorSave", () => {
  // 데이터 손실 회귀 가드: 에디터 onSave 가 VaultConflictError 를 swallow 하면
  // (구버전) doSave 가 buffer 를 phantom-clean 하고 "저장됨" 을 띄운 뒤, 다음
  // poll re-fetch 가 미저장 편집을 덮어쓴다. persistEditorSave 는 conflict 를
  // 절대 swallow 하지 않고 re-throw 해 에디터가 dirty 를 유지하게 한다.
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

describe("desktop-only local vault source", () => {
  it("honors ?intent=local only inside the installed desktop runtime", () => {
    expect(shouldHonorLocalIntent("local", true)).toBe(true);
    expect(shouldHonorLocalIntent("local", false)).toBe(false);
    expect(shouldHonorLocalIntent("server", true)).toBe(false);
    expect(shouldHonorLocalIntent(null, true)).toBe(false);
    expect(shouldHonorLocalIntent(undefined, true)).toBe(false);
  });

  it("disables local vault source in hosted browsers even when browser APIs exist", () => {
    expect(
      isDocsVaultLocalSourceDisabled({
        isDesktopRuntime: false,
        localVaultStatus: "idle",
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
    expect(
      shouldShowDesktopVaultWelcome({
        isDesktopRuntime: false,
        source: "local",
        localVaultStatus: "idle",
        hasLocalManifest: false,
      }),
    ).toBe(false);
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
