import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultConflictError } from "@/entities/vault-session";
import {
  DOCS_VAULT_LIST_COLLAPSED_KEY,
  escapeHtml,
  parseDocsVaultView,
  persistEditorSave,
  readStoredListCollapsed,
  scheduleStateSync,
  shouldShowDogfoodVaultHint,
  shouldShowDesktopVaultWelcome,
  shouldSwitchToDogfoodVault,
  storeListCollapsed,
} from "./persistence";

describe("parseDocsVaultView", () => {
  // 'doc' is the only view; unknown values normalize to it.
  it("always returns 'doc'", () => {
    expect(parseDocsVaultView("doc")).toBe("doc");
    expect(parseDocsVaultView(null)).toBe("doc");
    expect(parseDocsVaultView(undefined)).toBe("doc");
    expect(parseDocsVaultView("")).toBe("doc");
    expect(parseDocsVaultView("alien")).toBe("doc");
  });
});

describe("persistEditorSave", () => {
  // A swallowed `VaultConflictError` would mark the buffer clean and let the next poll overwrite
  // the unsaved edit.
  it("resolves on success without calling onConflict", async () => {
    const saveDoc = vi.fn().mockResolvedValue(undefined);
    const onConflict = vi.fn();
    await expect(
      persistEditorSave(saveDoc, { slug: "a", content: "x", expectedMtime: 10 }, onConflict),
    ).resolves.toBeUndefined();
    expect(saveDoc).toHaveBeenCalledWith("a", "x", { expectedMtime: 10 });
    expect(onConflict).not.toHaveBeenCalled();
  });

  it("rethrows VaultConflictError and calls onConflict", async () => {
    const conflict = new VaultConflictError("a", 10, 20);
    const saveDoc = vi.fn().mockRejectedValue(conflict);
    const onConflict = vi.fn();
    await expect(
      persistEditorSave(saveDoc, { slug: "a", content: "x", expectedMtime: 10 }, onConflict),
    ).rejects.toBe(conflict);
    expect(onConflict).toHaveBeenCalledWith(conflict);
  });

  it("rethrows other errors without calling onConflict", async () => {
    const boom = new Error("disk full");
    const saveDoc = vi.fn().mockRejectedValue(boom);
    const onConflict = vi.fn();
    await expect(
      persistEditorSave(saveDoc, { slug: "a", content: "x" }, onConflict),
    ).rejects.toBe(boom);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it("rethrows a conflict when onConflict is absent", async () => {
    const conflict = new VaultConflictError("a", 10, 20);
    const saveDoc = vi.fn().mockRejectedValue(conflict);
    await expect(
      persistEditorSave(saveDoc, { slug: "a", content: "x", expectedMtime: 10 }),
    ).rejects.toBe(conflict);
  });
});

describe("escapeHtml", () => {
  it("replaces the four entities", () => {
    expect(escapeHtml("a&b<c>d\"e")).toBe("a&amp;b&lt;c&gt;d&quot;e");
  });

  it("leaves a string without entities unchanged", () => {
    expect(escapeHtml("로그인 spec — auth")).toBe("로그인 spec — auth");
  });

  it("returns an empty string for an empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});

describe("doc list collapse storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("list-collapsed defaults to expanded with empty storage", () => {
    expect(readStoredListCollapsed()).toBe(false);
  });

  it("list-collapsed reads back true after saving collapsed", () => {
    storeListCollapsed(true);
    expect(window.localStorage.getItem(DOCS_VAULT_LIST_COLLAPSED_KEY)).toBe("1");
    expect(readStoredListCollapsed()).toBe(true);
  });

  it("list-collapsed writes '0' for expanded", () => {
    storeListCollapsed(false);
    expect(window.localStorage.getItem(DOCS_VAULT_LIST_COLLAPSED_KEY)).toBe("0");
    expect(readStoredListCollapsed()).toBe(false);
  });

  it("list-collapsed falls back to expanded for an invalid value", () => {
    window.localStorage.setItem(DOCS_VAULT_LIST_COLLAPSED_KEY, "garbage");
    expect(readStoredListCollapsed()).toBe(false);
  });
});

describe("the folder screen's dogfood and welcome rules", () => {
  it("shows the dogfood hint only for a dogfood hand-off with no folder read", () => {
    expect(shouldShowDogfoodVaultHint({ dogfood: "1", hasLocalManifest: false })).toBe(true);
    expect(shouldShowDogfoodVaultHint({ dogfood: null, hasLocalManifest: false })).toBe(false);
    expect(shouldShowDogfoodVaultHint({ dogfood: "1", hasLocalManifest: true })).toBe(false);
  });

  const ATLAS = "/Users/dana/side-project/ontology-atlas/docs/ontology";
  it("switches a dogfood deep link away from a different loaded folder", () => {
    expect(
      shouldSwitchToDogfoodVault({
        dogfood: "1",
        localVaultStatus: "loaded",
        currentRootPath: "/private/tmp/ontology-atlas-editor-smoke",
        dogfoodRootPath: ATLAS,
      }),
    ).toBe(true);
    expect(
      shouldSwitchToDogfoodVault({ dogfood: "1", localVaultStatus: "loaded", currentRootPath: ATLAS, dogfoodRootPath: ATLAS }),
    ).toBe(false);
    expect(
      shouldSwitchToDogfoodVault({ dogfood: "1", localVaultStatus: "idle", currentRootPath: null, dogfoodRootPath: ATLAS }),
    ).toBe(false);
    expect(
      shouldSwitchToDogfoodVault({
        dogfood: null,
        localVaultStatus: "loaded",
        currentRootPath: "/private/tmp/ontology-atlas-editor-smoke",
        dogfoodRootPath: ATLAS,
      }),
    ).toBe(false);
  });

  it("treats the current old checkout path as an accepted dogfood vault root", () => {
    expect(
      shouldSwitchToDogfoodVault({
        dogfood: "1",
        localVaultStatus: "loaded",
        currentRootPath: "/Users/dana/side-project/oh-my-ontology/docs/ontology",
        dogfoodRootPath: ATLAS,
        dogfoodRootPaths: [ATLAS, "/Users/dana/side-project/oh-my-ontology/docs/ontology"],
      }),
    ).toBe(false);
  });

  it("shows the vault welcome before a folder is read", () => {
    expect(shouldShowDesktopVaultWelcome({ localVaultStatus: "idle", hasLocalManifest: false })).toBe(true);
    expect(shouldShowDesktopVaultWelcome({ localVaultStatus: "loaded", hasLocalManifest: true })).toBe(false);
  });

  it("shows the welcome when the only known folder failed to restore, not a loading frame", () => {
    expect(shouldShowDesktopVaultWelcome({ localVaultStatus: "error", hasLocalManifest: false })).toBe(true);
    // A folder already read stays on screen when a later refresh fails.
    expect(shouldShowDesktopVaultWelcome({ localVaultStatus: "error", hasLocalManifest: true })).toBe(false);
  });
});

describe("scheduleStateSync", () => {
  it("runs in a microtask rather than immediately", async () => {
    const syncCallback = vi.fn();
    scheduleStateSync(syncCallback);
    expect(syncCallback).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(syncCallback).toHaveBeenCalledOnce();
  });
});
