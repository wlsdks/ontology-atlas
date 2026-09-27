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
  // 'doc' is the only view; unknown values normalize to it.
  it("always returns 'doc'", () => {
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

describe("source storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("source defaults to 'server' with empty storage", () => {
    expect(readStoredSource()).toBe("server");
  });

  it("source reads back the saved value", () => {
    storeSource("local");
    expect(readStoredSource()).toBe("local");
    expect(window.localStorage.getItem(DOCS_VAULT_SOURCE_KEY)).toBe("local");
  });

  it("source falls back to 'server' for an invalid value", () => {
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

  it("prefers local when the launch stopped for the person to choose a folder", () => {
    // A deferred launch loads no manifest by design; without this arm the person meant to pick
    // a folder lands on the sample.
    expect(shouldPreferLocalOnLanding("idle", "server", null, true)).toBe(true);
  });

  it("still respects an explicit Sample deep link while choosing", () => {
    // An explicit sample URL still wins.
    expect(shouldPreferLocalOnLanding("idle", "server", "server", true)).toBe(false);
  });

  it("does not re-flip while choosing if the source is already local", () => {
    expect(shouldPreferLocalOnLanding("idle", "local", null, true)).toBe(false);
  });

  it("leaves the idle verdict unchanged when nothing is being chosen", () => {
    // Without a pending choice an idle vault must not force local.
    expect(shouldPreferLocalOnLanding("idle", "server", null, false)).toBe(false);
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

// Capability (FSA support) gates the source, not the runtime.
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
    // A web session gets the welcome with its open CTA too.
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
  it("runs in a microtask rather than immediately", async () => {
    const fn = vi.fn();
    scheduleStateSync(fn);
    expect(fn).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(fn).toHaveBeenCalledOnce();
  });
});
