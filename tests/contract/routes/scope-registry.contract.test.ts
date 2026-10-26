import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  HOME_QUERY_KEYS,
  VAULT_SCOPED_HOME_QUERY_KEYS } from "@/views/home/model/route-state/url-state";
/**
 * Registry gate for state that outlives its scope: every URL query key and persistent storage
 * key has one row. A key missing from registry or code fails; a `vault-scoped` key must be protected.
 */
// ────────────────────────────────────────────────────────────────────────────
// Scope providers — **which functions count as an exact scope**
// ────────────────────────────────────────────────────────────────────────────
/**
 * Scope providers that separate vaults **exactly**. They distinguish both
 * `local:<folder>` and `sample:<sample>`.
 */
const EXACT_SCOPE_PROVIDERS = [
    "vaultIdentityScope",
    "useVaultIdentityScope",
    "setChangeBaselineScope",
    "growthProjectKey"
] as const;
/**
 * ⚠️ **`vaultScopeKey()` alone is not a scope.**
 *
 * That function is for the **storage namespace**, so it collapses both samples
 * (dogfood and the example storefront) into a single `'server'`. Using it to decide
 * "did the vault change" means **a sample-to-sample switch is not seen as a change**,
 * and this gate would **certify** the very defect it exists to block.
 *
 * Widening `vaultScopeKey` is not the answer either — that would **move the storage
 * location** of pins, recents, and open tabs, orphaning users' existing lists instead
 * of fixing anything. So only the four already-shipped sites below may use this
 * coarse scope, and **the list is frozen**: a new key can only join by editing this
 * paragraph.
 */
const FROZEN_COARSE_SCOPE_KEYS = new Set([
    "demo:docs-vault:pinned:v1:",
    "demo:docs-vault:recent:v2:",
    "docsVault:openTabs:",
    "docsVault:activeTab:"
]);

// ────────────────────────────────────────────────────────────────────────────
// ① URL query key registry — the map's address vocabulary (`/topology`)
// ────────────────────────────────────────────────────────────────────────────

type Scope = "global" | "vault-scoped";

/**
 * `global` = the value is a **fixed enumeration**, so it means the same in any vault.
 * `vault-scoped` = the value is **a name from this vault**, so after a vault change it
 * points at nothing.
 */
const URL_KEY_REGISTRY: Record<string, { scope: Scope; note: string;
}> = {
  p: { scope: "vault-scoped", note: "selected node/project slug" },
  c: { scope: "vault-scoped", note: "project category value" },
  hub: { scope: "vault-scoped", note: "hub node slug (zero consumers today, so dormant)" },
  pathFrom: { scope: "vault-scoped", note: "path start slug" },
  pathTo: { scope: "vault-scoped", note: "path end slug" },
  from: { scope: "vault-scoped", note: "old alias of pathFrom" },
  to: { scope: "vault-scoped", note: "old alias of pathTo" },
  open: { scope: "vault-scoped", note: "list of expanded parent slugs" },
  realm: { scope: "vault-scoped", note: "realm root slug" },
  constellation: { scope: "vault-scoped", note: "saved constellation folder UUID, or the intent of a new constellation" },
  impact: { scope: "global", note: "none|upstream|downstream|network" },
  pulse: { scope: "global", note: "all|7d|30d" },
  mode: { scope: "global", note: "overview|focus|path|health" },
  create: { scope: "global", note: "intent flag with the concept as its only value" },
  workbench: { scope: "global", note: "edit|create workbench intent" },
  edit: { scope: "vault-scoped", note: "relation type and target node slug" },
  index: { scope: "global", note: "expanded|collapsed" },
  recent: { scope: "global", note: "auto|1|7|30" },
  via: { scope: "global", note: "insights return marker: a tab name (independent of the vault)" },
  review: { scope: "global", note: "insights queue row id; the queue is derived each time, so it is not a vault name" },
  ask: { scope: "global", note: "enumeration of intent kinds" },
  view: { scope: "global", note: "map view enumeration: hex, structure, strata, coupling" },
};

// ────────────────────────────────────────────────────────────────────────────
// ② Persistent storage key registry
// ────────────────────────────────────────────────────────────────────────────

interface StorageEntry {
  key: string;
  /**
   * `storage` is a localStorage/sessionStorage/IndexedDB key (or prefix); `event` is a window event name
   * sharing the namespace; `legacy` is an old key never read back, only cleaned up once.
   */
  kind: "storage" | "event" | "legacy";
  scope: Scope;
  /** The function name through which a `vault-scoped` storage key receives its scope. */
  scopedBy?: string;
  /** The file declaring the key literal — the "did the declaration move" check reads this. */
  file?: string;
  /**
   * The test file that asserts a value written in vault A is not visible in vault B. Finding the scope
   * function name in source does not prove protection.
   */
  provenBy?: string;
  note: string;
}

const STORAGE_KEY_REGISTRY: StorageEntry[] = [
  // ── State about the app itself (vault-independent) ───────────────────────
  { key: "app-update:dismissed-version", kind: "storage", scope: "global", note: "dismissed update version" },
  { key: "app-update:last-check", kind: "storage", scope: "global", note: "time of the last update check" },
  { key: "app-update:auto-check", kind: "storage", scope: "global", file: "src/features/app-update/model/update-state.ts", note: "Automatic update check on this computer: on (default) or off" },
  { key: "atlas.appearance.text-size", kind: "storage", scope: "global", file: "src/shared/lib/preferences/text-size.ts", note: "Text size: default, large or larger" },
  { key: "library.wikiWriteMode", kind: "storage", scope: "global", file: "src/shared/lib/preferences/appearance-preferences.ts", note: "How an agent's wiki page lands on this computer: auto or ask" },
  { key: "atlas.appearance.frameMeter", kind: "storage", scope: "global", note: "frame meter display preference" },
  { key: "atlas.appearance.view3d", kind: "storage", scope: "global", note: "3D view (map dome view) preference, off (2D) by default" },
  { key: "atlas.appearance.structure", kind: "storage", scope: "global", note: "Domain structure preference" },
    { key: "atlas.appearance.galaxy", kind: "storage", scope: "global", note: "Retired view preference, read only for migration" },
  { key: "atlas.appearance.territories", kind: "storage", scope: "global", note: "Retired view preference, never read; removed on the next pick" },
  { key: "atlas.appearance.hex-board", kind: "storage", scope: "global", note: "Hex board view preference (one tile per capability) — off by default" },
  { key: "atlas.appearance.hex-relief", kind: "storage", scope: "global", note: "Hex board relief pose preference — off by default" },
  { key: "atlas.appearance.map-arrangement", kind: "storage", scope: "global", note: "3D arrangement basis: ownership (dome, default) / coupling (force cloud)" },
  { key: "atlas.appearance.map-drag-speed", kind: "storage", scope: "global", note: "Map drag speed (0.5x-2x, default 1x), a hand preference of this machine" },
  { key: "atlas.appearance.map-zoom-speed", kind: "storage", scope: "global", note: "Map zoom speed (0.5x-2x, default 1x), a hand preference of this machine" },
  { key: "atlas.agentActivity.status", kind: "storage", scope: "global", note: "status chip on/off preference" },
  { key: "atlas.agentActivity.notifications", kind: "storage", scope: "global", note: "notification inbox on/off preference" },
  { key: "atlas.agentActivity.kinds", kind: "storage", scope: "global", note: "muted notification kinds" },
  { key: "atlas.agentActivity.tab", kind: "storage", scope: "global", note: "The bell panel's last tab — a reading preference of this machine, not a fact about any folder" },
  { key: "ontology-atlas:canvas-background:v1", kind: "storage", scope: "global", note: "canvas background preference" },
  { key: "ontology-atlas:glyph-set:v1", kind: "storage", scope: "global", note: "glyph set preference" },
  { key: "ontology-atlas:footprint:v1", kind: "storage", scope: "global", note: "footprint trail preference" },
  // Expansion affordance, structure, and three numbers. Screen preferences like the
  // footprint and the background, so vault-independent — changing folder must not
  // change my preference for how things expand.
  { key: "ontology-atlas:expand:v1", kind: "storage", scope: "global", note: "expand affordance, structure and count preference" },
  { key: "atlas.acp-chat.width", kind: "storage", scope: "global", note: "chat column width; a display taste of this computer, so it stays when the vault changes" },
  // The Library index: which of its two lists is drawn, and whether the column is folded
  // to its rail. Both are this screen's shape on this machine, like the chat width above —
  // changing folder must not change how the column stands.
  { key: "atlas.library.index-segment", kind: "storage", scope: "global", note: "Library index: Sources or Wiki" },
  { key: "atlas.library.index-collapsed", kind: "storage", scope: "global", note: "Library index folded to its rail tab" },
  { key: "atlas.library.guide-seen", kind: "storage", scope: "global", note: "The Library home raised its three-step guide once on this machine" },
  {
    key: "ontology-atlas:machine-approvals",
    kind: "storage",
    scope: "global",
    file: "src/shared/lib/connectors/machine-approvals-format.ts",
    provenBy: "src/shared/lib/connectors/machine-approvals.test.ts",
    note: "Connector and round allowances on this Mac, keyed inside by absolute folder path; never in the vault, because the folder travels and consent must not",
  },
  {
    key: "ontology-atlas:machine-approvals-change",
    kind: "event",
    scope: "global",
    note: "An allowance changed; the panels and the rounds clock re-read (shared/lib/connectors/machine-approvals.ts)",
  },
  { key: "ontology-atlas:locale", kind: "storage", scope: "global", note: "display language" },
  { key: "ontology-atlas:local-endpoint", kind: "storage", scope: "global", note: "local LLM endpoint" },
  // Which brain Compile runs on when this computer offers both. A machine preference
  // like the chat width, not a fact about the folder: the same choice should hold when
  // the person opens another folder on the same computer.
  { key: "ontology-atlas:compile-brain", kind: "storage", scope: "global", note: "which side to run compilation on" },
  { key: "ontology-atlas:guide-auto-start:v1", kind: "storage", scope: "global", note: "tour auto-start preference" },
  { key: "demo:audience-plain:v1", kind: "storage", scope: "global", note: "plain-language register preference" },
  { key: "demo:left-panel-collapsed:v2", kind: "storage", scope: "global", note: "left panel collapsed preference" },
  { key: "demo:index-panel-collapsed:v1", kind: "storage", scope: "global", note: "INDEX collapsed preference" },
  { key: "demo:sigma-hub-rail-open:v1", kind: "storage", scope: "global", note: "hub rail open preference" },
  { key: "demo:docs-vault:list-collapsed", kind: "storage", scope: "global", note: "document list collapsed preference" },
  { key: "dev:desktop-shell", kind: "storage", scope: "global", note: "desktop shell development override" },
  { key: "demo:gesture-hint:dismissed:v1", kind: "storage", scope: "global", note: "gesture hint, one time only" },
  { key: "demo:first-run-starter-dismissed:v1", kind: "storage", scope: "global", note: "first-run card, one time only (session)" },
  { key: "demo:vault-start-steps-dismissed:v1", kind: "storage", scope: "global", note: "first-steps card, one time only (session); withdrawn once the last step is passed" },
  { key: "vault-open-guide:auto:v1", kind: "storage", scope: "global", note: "open-folder guide, one time only" },
  { key: "ontology-atlas:last-route", kind: "storage", scope: "global", note: "**Nobody reads it**: route restoration was retired on 2026-07-30 (`locale-redirect.tsx`). It is a dead key rather than a defect, so this registry records only the fact and leaves deletion as a separate matter" },

  // ── Things that *define* the scope (they are the answer to "which vault") ──
  { key: "demo:sample-source:v1", kind: "storage", scope: "global", note: "which built-in sample this is; an input to the scope, not state inside the scope" },
  { key: "demo:docs-vault:source", kind: "storage", scope: "global", note: "which of local|server is being viewed" },
  { key: "docs-vault:current-handle", kind: "storage", scope: "global", note: "IndexedDB: current vault handle" },
  { key: "docs-vault:fs-handle:", kind: "storage", scope: "global", note: "IndexedDB store prefix: vault handle storage" },
  { key: "docs-vault:fs-handle:recent", kind: "storage", scope: "global", note: "IndexedDB: recent vault handles" },

  // ── One-shot intent handed from one screen to the next (session) ─────────
  { key: "demo:open-search", kind: "storage", scope: "global", note: "session: intent to open the search palette" },
  { key: "demo:open-shortcuts", kind: "storage", scope: "global", note: "session: intent to open the shortcut sheet" },
  { key: "ontology-atlas:route-focus-intent", kind: "storage", scope: "global", note: "session: focus target after a route change" },
  { key: "ontology-atlas:settings-locale-focus", kind: "storage", scope: "global", note: "session: focus on the language field of the settings sheet" },
  { key: "ontology-atlas:agent-chat-intent:pending", kind: "storage", scope: "global", note: "session: runner id handed from the agent destination to the map chat dock" },

  // ── Per-vault content — protected by an exact scope ──────────────────────
  {
    key: "demo:change-baseline:v2:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "setChangeBaselineScope",
    file: "src/entities/knowledge-graph/lib/ontology-tree/change-baseline-store.ts",
    provenBy: "src/entities/knowledge-graph/lib/ontology-tree/change-baseline-store.test.ts",
    note: "Change baseline per folder, hashed per node; other folders' entries give way only when storage refuses a save",
  },
  {
    key: "demo:change-baseline:v1:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "setChangeBaselineScope",
    file: "src/entities/knowledge-graph/lib/ontology-tree/change-baseline-store.ts",
    provenBy: "src/entities/knowledge-graph/lib/ontology-tree/change-baseline-store.test.ts",
    note: "The first form: each folder's entry is converted once to its own v2 key, then removed",
  },
  {
    // Which proposed documents this person passed on. Per vault for the same reason as
    // every slot below: a refusal in one folder must not hide a candidate in another.
    // Deliberately **not** in the vault — it is a store of absences, and nothing in the
    // folder could ever contradict it (`declined-candidates.ts` says so in full).
    key: "atlas.library.declined:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "useVaultIdentityScope",
    file: "src/features/library/lib/sources/declined-candidates.ts",
    provenBy: "src/features/library/lib/sources/declined-candidates.test.ts",
    note: "candidate handed over from document search; a convenience that stays on this computer only",
  },
  {
    // When this reader last looked at the brief. A reader fact, never the folder's, and per
    // vault because each folder has its own brief.
    key: "atlas.insights.briefSeenAt:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "useVaultIdentityScope",
    file: "src/views/ontology-insights/lib/brief/brief-anchor.ts",
    provenBy: "src/views/ontology-insights/lib/brief/brief-anchor.test.ts",
    note: "last time the briefing was seen; the baseline for measuring \"since then\", per folder",
  },
  {
    key: "ontology-atlas:insights-brief-seen-change",
    kind: "event",
    scope: "global",
    note: "event that announces a baseline time change within the same tab; not a storage key",
  },
  {
    key: "atlas.map.hex-board.v1:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "useVaultIdentityScope",
    file: "src/views/home/model/map-canvas/hex-board-placement-store.ts",
    provenBy: "src/views/home/model/map-canvas/hex-board-placement-store.test.ts",
    note: "Hex board placement (append-only tile cells) per folder — view state, never meaning",
  },
  {
    key: "atlas.map.flat-rings.v1:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "useVaultIdentityScope",
    file: "src/views/home/model/map-canvas/flat-ring-memory-store.ts",
    provenBy: "src/views/home/model/map-canvas/flat-ring-memory-store.test.ts",
    note: "Flat dial memory per folder: ring radii, domain angles and order, capability order — view state, never meaning",
  },
  {
    key: "atlas.agentActivity.readAt:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "useVaultIdentityScope",
    file: "src/features/agent-activity/model/read-at-storage.ts",
    provenBy: "src/features/agent-activity/model/read-at-storage.test.ts",
    note: "notification \"seen up to here\"; the feed is per vault, so the threshold is per vault too",
  },

  // ── Per-vault content — protected only by the coarse scope (`vaultScopeKey`) ──
  //    Already-shipped storage locations; widening them orphans users' lists.
  //    The `FROZEN_COARSE_SCOPE_KEYS` paragraph above is the evidence.
  {
    key: "demo:docs-vault:pinned:v1:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "vaultScopeKey",
    file: "src/entities/docs-vault/lib/vault-scope-key.ts",
    provenBy: "src/entities/docs-vault/lib/vault-scope-key.test.ts",
    note: "pinned documents; the two samples share one spot (a known coarse scope)",
  },
  {
    key: "demo:docs-vault:recent:v2:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "vaultScopeKey",
    file: "src/entities/docs-vault/lib/vault-scope-key.ts",
    provenBy: "src/entities/docs-vault/lib/vault-scope-key.test.ts",
    note: "recent documents; same as above",
  },
  {
    key: "docsVault:openTabs:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "vaultScopeKey",
    file: "src/views/docs-vault/lib/doc-tabs/doc-tabs.ts",
    provenBy: "src/views/docs-vault/lib/doc-tabs/doc-tabs.test.ts",
    note: "open tabs; the caller passes recentKey (=vaultScopeKey) under the name `sourceKey`",
  },
  {
    key: "docsVault:activeTab:",
    kind: "storage",
    scope: "vault-scoped",
    scopedBy: "vaultScopeKey",
    file: "src/views/docs-vault/lib/doc-tabs/doc-tabs.ts",
    provenBy: "src/views/docs-vault/lib/doc-tabs/doc-tabs.test.ts",
    note: "active tab; same as above",
  },

  // ── Per-vault content that is **not protected** (see KNOWN_UNPROTECTED below) ──
  {
    key: "ontology-atlas:docs-vault-editor-draft:",
    kind: "storage",
    scope: "vault-scoped",
    file: "src/widgets/docs-vault/ui/DocsVaultEditor.tsx",
    note: "editor draft; a data-loss path, being fixed by PR #827",
  },
  {
    key: "demo:recent-search-slugs:v1",
    kind: "storage",
    scope: "vault-scoped",
    file: "src/widgets/search-palette/ui/SearchPalette.tsx",
    note: "recent search slugs; the consumer filters by intersection with the current node, so the damage is small",
  },

  {
    key: "demo:change-baseline:v1",
    kind: "legacy",
    scope: "global",
    note: "global baseline from the era that did not know the vault; it cannot tell which vault it belongs to, so it is cleared once rather than read back",
  },
  {
    key: "atlas.agentActivity.readAt",
    kind: "legacy",
    scope: "global",
    note: "global read time from the era that did not know the vault; same as above",
  },
  {
    key: "demo:docs-vault:recent:v1",
    kind: "legacy",
    scope: "global",
    note: "recent documents v1; after migrating to v2 it is only read and cleared",
  },

  // ── Event names (not storage — registered here because they share the namespace) ──
  { key: "ontology-atlas:agent-activity-read", kind: "event", scope: "global", note: "read-mark broadcast" },
  { key: "ontology-atlas:appearance-preference-change", kind: "event", scope: "global", note: "" },
  { key: "ontology-atlas:audience-preference-change", kind: "event", scope: "global", note: "" },
  { key: "ontology-atlas:guide-auto-start-change", kind: "event", scope: "global", note: "" },
  { key: "ontology-atlas:preference-change", kind: "event", scope: "global", file: "src/shared/lib/preferences/define-preference.ts", note: "Same-tab change of a definePreference store" },
  { key: "ontology-atlas:open-settings", kind: "event", scope: "global", file: "src/shared/lib/keyboard/surface-requests.ts", note: "Request that a visible settings trigger open the sheet" },
  { key: "ontology-atlas:open-shortcuts", kind: "event", scope: "global", file: "src/shared/lib/keyboard/surface-requests.ts", note: "Request that the keyboard shortcut sheet open" },
  { key: "ontology-atlas:local-endpoint-change", kind: "event", scope: "global", note: "" },
  {
    key: "ontology-atlas:navigation-intent",
    kind: "event",
    scope: "global",
    note: "navigation start; the always-on rAF loop steps aside for the frame budget (shared/lib/navigation/navigation-intent.ts)",
  },
  { key: "ontology-atlas:secret-change", kind: "event", scope: "global", note: "" },
  {
    key: "ontology-atlas:connector-secret-change",
    kind: "event",
    scope: "global",
    note: "change in whether an external MCP connection tool token is held; panels on other screens read it again (shared/lib/connectors/tauri-connector-secrets.ts)",
  },
  { key: "ontology-atlas:agent-chat-intent", kind: "event", scope: "global", note: "agent to chat open request" },
  { key: "ontology-atlas:verify-edge-selected", kind: "event", scope: "global", note: "e2e verification hook" },
  { key: "ontology-atlas:verify-select-edge", kind: "event", scope: "global", note: "e2e verification hook" }
];

/**
 * **Knowingly unfixed today** — each row carries its reason.
 *
 * Why this list exists: naming what is unprotected is more honest than a gate that
 * claims everything is protected. A new violation is not on this list and therefore
 * fails immediately. The ceiling (`MAX_KNOWN_UNPROTECTED`) is a ratchet, so the list
 * cannot grow — and when it shrinks (a repair merges) it passes quietly.
 */
const KNOWN_UNPROTECTED: Record<string, string> = {
  "ontology-atlas:docs-vault-editor-draft:":
    "PR #827 is adding the vault scope; it is not yet in the base of this branch (origin/main)",
  "demo:recent-search-slugs:v1":
    "the consumer filters by intersection with the current node, so nothing false shows on screen; low repair priority",
};
const MAX_KNOWN_UNPROTECTED = 2;

// ────────────────────────────────────────────────────────────────────────────
// Scanner — key literals that really exist in the code
// ────────────────────────────────────────────────────────────────────────────

const REPO_ROOT = join(__dirname, "..", "..", "..");

/**
 * The namespaces storage keys live in — every prefix this app uses. A key created
 * under a new prefix is invisible to the scanner, so such a key must widen this list
 * first.
 */
const KEY_NAMESPACE_SHAPE =
  /^(demo:|ontology-atlas:|atlas\.|atlas:|docs-vault:|docsVault:|app-update:|dev:|vault-open-guide:|library\.)[A-Za-z0-9:._$%{}-]*$/;
const TRANSLATION_NAMESPACE_LEAD = /\b(?:use|get)Translations\s*(?:<\s*|\(\s*)$/;

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
      if (path.includes("__tests__")) continue;
      files.push(path);
    }
  };
  walk(join(REPO_ROOT, "src"));
  walk(join(REPO_ROOT, "app"));
  return files;
}

/** An example string inside a comment is not a key — blanked out while preserving offsets. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) =>
      lead + " ".repeat(m.length - lead.length));
}

function scanKeyLiterals(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles()) {
    const text = stripComments(readFileSync(file, "utf8"));
    const literal = /(["'`])([^"'`\n]*)\1/g;
    let match: RegExpExecArray | null;
    while ((match = literal.exec(text)) !== null) {
      const value = match[2];
      if (!KEY_NAMESPACE_SHAPE.test(value)) continue;
      if (TRANSLATION_NAMESPACE_LEAD.test(text.slice(Math.max(0, match.index - 40), match.index))) continue;
      const relative = file.slice(REPO_ROOT.length + 1);
      const paths = found.get(value) ?? [];
      if (!paths.includes(relative)) paths.push(relative);
      found.set(value, paths);
    }
  }
  return found;
}

const SCANNED = scanKeyLiterals();
const REGISTERED = new Map(STORAGE_KEY_REGISTRY.map((entry) => [entry.key, entry]));

// ────────────────────────────────────────────────────────────────────────────
// Checks
// ────────────────────────────────────────────────────────────────────────────

describe("scope registry: URL query keys", () => {
  it("every query key of the map is registered", () => {
    const declared = new Set(Object.values(HOME_QUERY_KEYS));
    const registered = new Set(Object.keys(URL_KEY_REGISTRY));
    expect(declared.size, "if the HOME_QUERY_KEYS collection is empty the scope gate is void too").toBeGreaterThan(0);

    const unregistered = [...declared].filter((key) => !registered.has(key));
    expect(
      unregistered,
      "if you made a new query key, write global/vault-scoped in URL_KEY_REGISTRY").toEqual([]);
  });

  it("the registry has no dead line", () => {
    const declared = new Set<string>(Object.values(HOME_QUERY_KEYS));
    const dead = Object.keys(URL_KEY_REGISTRY).filter((key) => !declared.has(key));
    expect(dead, "a key that disappeared from HOME_QUERY_KEYS is removed from the registry too").toEqual([]);
  });

  /**
   * The tag must match the actual cleanup list. A mismatch leaves the registry saying
   * "protected" while the code clears nothing — precisely where a gate certifies a
   * defect.
   */
  it("the keys tagged vault-scoped are the cleanup list", () => {
    const tagged = Object.entries(URL_KEY_REGISTRY)
      .filter(([, meta]) => meta.scope === "vault-scoped")
      .map(([key]) => key)
      .sort();
    expect(tagged).toEqual([...VAULT_SCOPED_HOME_QUERY_KEYS].sort());
  });

  /**
   * Testing the pure predicate alone **cannot see missing wiring** — the function is
   * green while the screen is unchanged. So the source is checked for consumers really
   * calling it (precedent: `rules-path-scope.contract.test.ts`).
   */
  it("the decision functions are really wired into the map", () => {
    const homePage = readFileSync(
      join(REPO_ROOT, "src/views/home/ui/HomePage.tsx"),
      "utf8");
    const owners = [
      ['src/views/home/model/use-topology-vault-read-model.tsx', 'useTopologyVaultReadModel', ['clearVaultScopedRouteState', 'useVaultSessionIdentityScope']],
      ['src/views/home/model/map-canvas/use-topology-graph-projection.ts', 'useTopologyGraphProjection', ['resolveCanvasSelectedSlug']],
      ['src/views/home/model/map-canvas/use-topology-scene-controls.tsx', 'useTopologySceneControls', ['useTopologyPathLens']],
      ['src/views/home/ui/TopologyCommandChrome.tsx', 'TopologyCommandChrome', ['canCopyTopologyPathPacket']]
        ] as const;
    for (const [file, owner, witnesses] of owners) {
      const source = readFileSync(join(REPO_ROOT, file), "utf8");
      expect(homePage).toContain(owner.startsWith('use') ? `${owner}({` : `<${owner}`);
            for (const witness of witnesses) {
                const usage = witness === 'clearVaultScopedRouteState'
                    ? /setRouteState\(clearVaultScopedRouteState,\s*\{ replace: true \}\)/
                    : new RegExp(`\\b${witness}\\s*\\(`);
                expect(source, `${witness} missing in ${file}`).toMatch(usage);
            }
        }
        const scene = readFileSync(join(REPO_ROOT, 'src/views/home/model/map-canvas/use-topology-scene-controls.tsx'), 'utf8');
        expect(scene).toMatch(/\buseTopologyPathLens\(\{/);
        const pathLens = readFileSync(join(REPO_ROOT, "src/views/home/model/map-canvas/use-topology-path-lens.ts"), "utf8");
        expect(pathLens).toMatch(/\bresolveTopologyPathChipState\(\{/);
        expect(pathLens).toMatch(/\bcanCopyTopologyPathPacket\(chipState\)/);
    });
});
describe("scope registry: persisted storage keys", () => {
    it("no key literal in code is missing from the registry", () => {
        const unregistered = [...SCANNED.entries()]
            .filter(([key]) => !REGISTERED.has(key))
            .map(([key, paths]) => `${key}  (${paths.join(", ")})`);
        expect(unregistered, "if you made a new storage key/event, add one line to STORAGE_KEY_REGISTRY").toEqual([]);
    });
    it("the registry has no dead line", () => {
        const dead = STORAGE_KEY_REGISTRY.filter((entry) => !SCANNED.has(entry.key)).map((entry) => entry.key);
        expect(dead, "a key that disappeared from code is removed from the registry too").toEqual([]);
    });
    it("the key really exists in the file the registry declares", () => {
        const misplaced: string[] = [];
        for (const entry of STORAGE_KEY_REGISTRY) {
            if (!entry.file)
                continue;
            const paths = SCANNED.get(entry.key) ?? [];
            if (!paths.includes(entry.file)) {
                misplaced.push(`${entry.key} → ${entry.file} (actual: ${paths.join(", ")})`);
            }
        }
        expect(misplaced).toEqual([]);
    });
    /**
     * **`vaultScopeKey` is not an exact scope.** Without this test the registry certifies
     * a key that collapses the two samples as "protected" — the gate approving the defect
     * it exists to block.
     */
    it("the coarse scope (vaultScopeKey) is allowed only in the four frozen places", () => {
        const offenders = STORAGE_KEY_REGISTRY.filter((entry) => entry.scopedBy === "vaultScopeKey" && !FROZEN_COARSE_SCOPE_KEYS.has(entry.key)).map((entry) => entry.key);
        expect(offenders, "vaultScopeKey lumps the two samples together as 'server'; new keys use vaultIdentityScope").toEqual([]);
    });
    it("the list of four frozen places has not grown", () => {
        expect([...FROZEN_COARSE_SCOPE_KEYS].sort()).toEqual([
            "demo:docs-vault:pinned:v1:",
            "demo:docs-vault:recent:v2:",
            "docsVault:activeTab:",
            "docsVault:openTabs:"
        ]);
    });
    /**
     * **The evidence of protection is a test.** Checking whether the scope function's
     * name appears in the source passed in a real measurement (see the
     * `StorageEntry.provenBy` comment). So each key names a test file asserting "a value
     * written in vault A is not visible in vault B", and this check only verifies that
     * file exists and really handles that key — what turns red on a revert is **that
     * test**, not this one.
     */
    it("a vault-scoped storage key names a test that locks it by behavior", () => {
        const unprotected: string[] = [];
        for (const entry of STORAGE_KEY_REGISTRY) {
            if (entry.kind !== "storage" || entry.scope !== "vault-scoped")
                continue;
            if (entry.key in KNOWN_UNPROTECTED)
                continue;
            if (!entry.scopedBy || !entry.provenBy) {
                unprotected.push(`${entry.key}: scopedBy/provenBy not declared`);
                continue;
            }
            // It must be a prefix — with no room for a scope suffix it cannot receive one.
            if (!entry.key.endsWith(":")) {
                unprotected.push(`${entry.key}: not a prefix, and there is no place to attach it`);
                continue;
            }
            let proof: string;
            try {
                proof = readFileSync(join(REPO_ROOT, entry.provenBy), "utf8");
            }
            catch {
                unprotected.push(`${entry.key}: test file ${entry.provenBy} does not exist`);
                continue;
            }
            if (!proof.includes(entry.key)) {
                unprotected.push(`${entry.key}: ${entry.provenBy} does not exercise this key`);
            }
        }
        expect(unprotected).toEqual([]);
    });
    it("a protected vault-scoped key uses the exact scope provider (excluding the four coarse places)", () => {
        const wrong = STORAGE_KEY_REGISTRY.filter((entry) => {
            if (entry.kind !== "storage" || entry.scope !== "vault-scoped")
                return false;
            if (entry.key in KNOWN_UNPROTECTED)
                return false;
            if (FROZEN_COARSE_SCOPE_KEYS.has(entry.key))
                return false;
            return !EXACT_SCOPE_PROVIDERS.includes(entry.scopedBy as (typeof EXACT_SCOPE_PROVIDERS)[number]);
        }).map((entry) => `${entry.key} (scopedBy=${entry.scopedBy})`);
        expect(wrong).toEqual([]);
    });
    it("the list of known but unfixed cases does not grow (ratchet)", () => {
        const listed = Object.keys(KNOWN_UNPROTECTED);
        expect(listed.length).toBeLessThanOrEqual(MAX_KNOWN_UNPROTECTED);
        for (const key of listed) {
            expect(REGISTERED.get(key)?.scope, `${key} must be in the registry as vault-scoped`).toBe("vault-scoped");
            expect(KNOWN_UNPROTECTED[key].length, `${key} has no reason`).toBeGreaterThan(10);
        }
    });
    it("old keys are not read back, only removed", () => {
        for (const entry of STORAGE_KEY_REGISTRY) {
            if (entry.kind !== "legacy")
                continue;
            for (const file of SCANNED.get(entry.key) ?? []) {
                const source = stripComments(readFileSync(join(REPO_ROOT, file), "utf8"));
                // Reading `demo:docs-vault:recent:v1` is legitimate because it is a migration.
                if (entry.key === "demo:docs-vault:recent:v1")
                    continue;
                const readsIt = new RegExp(`getItem\\(\\s*["'\`]${entry.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(source);
                expect(readsIt, `${file} reads back ${entry.key}`).toBe(false);
            }
        }
    });
});
