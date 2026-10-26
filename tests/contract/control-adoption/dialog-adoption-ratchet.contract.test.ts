import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `role=dialog` outside the primitive can never exceed the ledger. Walks all of `src/` because a
 * hand list can sit green on nothing. Comments and selector strings like `[role=dialog]` are not
 * markup; `src/shared/ui/surfaces/dialog.tsx` is the source of truth and excluded.
 */

const ROOT = process.cwd();
const PRIMITIVE = "src/shared/ui/surfaces/dialog.tsx";

/** Strips comments while preserving line count (avoiding the lineage that counted block-comment interiors as code). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Counts only **markup** role="dialog", not selector strings like `[role="dialog"]`. */
function countDialogMarkup(source: string): number {
  const stripped = stripComments(source);
  let count = 0;
  for (const m of stripped.matchAll(/role="dialog"/g)) {
    if (stripped[(m.index ?? 0) - 1] === "[") continue;
    count += 1;
  }
  return count;
}

function scanProduction(): Map<string, number> {
  const found = new Map<string, number>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "node_modules" || name === ".next") continue;
        walk(p);
        continue;
      }
      if (!name.endsWith(".tsx") || name.endsWith(".test.tsx")) continue;
      const rel = path.relative(ROOT, p);
      if (rel === PRIMITIVE) continue;
      const count = countDialogMarkup(readFileSync(p, "utf8"));
      if (count > 0) found.set(rel, count);
    }
  };
  for (const root of ["src", "app"]) walk(path.join(ROOT, root));
  return found;
}

/**
 * **Registered** — places that cannot in principle move to the portal primitive.
 * Not debt but an exception with evidence; growing this list requires writing the
 * "why" into the same diff.
 */
const REGISTERED: ReadonlyArray<readonly [file: string, count: number, why: string]> = [
  [
    "src/views/home/ui/TopologyBlockingOverlays.tsx",
    3,
    "map composer — lives inside the --z-map-scrim(25) layer and the map coordinate system. Lifting it to a body portal (--z-dialog 60) breaks the layer contract with the other chrome on the map.",
  ],
  [
    "src/features/vault-switch/ui/VaultSwitchRailTile.tsx",
    1,
    "The rail's folder switcher is a **non-modal anchored popover**, and it already " +
      "portals itself to document.body — so the thing this ratchet exists to prevent " +
      "(a hand-assembled surface trapped in its trigger's stacking context) is not what " +
      "it is. What it cannot take is the primitive's modality: `Dialog` owns a scrim, a " +
      "focus trap and a scroll lock, and `shared/ui/surfaces/transient-surface.ts` gives the " +
      "`anchored` kind the opposite contract — it stands beside what opened it and leaves " +
      "the background alive and pressable. A scrim over the map would also be a second " +
      "answer to 'is the page still usable', which the single-transient rule forbids. It " +
      "keeps `role=\"dialog\"` because the APG names a non-modal popover with rich " +
      "content a dialog, and `role=\"menu\"` was rejected by the interaction and " +
      "workbench seats for having no menu items (2026-09-13). Focus in and focus back to " +
      "the trigger are implemented at the call site via `Surface`'s ref and `onExited`.",
  ],
];

/** Debt to repay: red if the count rises; a row is deleted when it reaches 0. */
/*
 * GlobalSearch is absent here — its modality is composed by Radix, so no
 * `role="dialog"` markup string exists in the source and it is outside this
 * scanner's view (an error in the under-counting direction). That debt is repaid
 * by migration in the `variant="palette"` registration round.
 */
const DEBT: ReadonlyArray<readonly [file: string, count: number]> = [
  ["src/features/docs-vault-local/ui/VaultOpenGuideSheet.tsx", 1],
  ["src/features/project-quick-edit/ui/ProjectQuickEditPanel.tsx", 1],
  ["src/features/ontology-blocks/ui/BlockImportModule.tsx", 1],
  ["src/features/vault-ontology/ui/RecentChangesNeedsVaultDialog.tsx", 1],
  ["src/views/docs-vault/ui/parts/DocsVaultAuditModal.tsx", 1],
  ["src/widgets/ontology-map/ui/OntologyMapEdgePanel.tsx", 1],
  ["src/widgets/docs-quick-drawer/ui/DocsQuickDrawer.tsx", 1],
  // Rows for files that no longer exist are deleted: holding them lets a decrease be achieved by a
  // move or rename alone, loosening the ratchet.
  ["src/widgets/docs-vault/ui/DocsVaultUnifiedPalette.tsx", 1],
  ["src/widgets/search-palette/ui/SearchPalette.tsx", 1],
  ["src/widgets/shortcut-sheet/ui/ShortcutSheet.tsx", 1],
  ["src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx", 1],
  ["src/widgets/project-drawer/ui/ProjectDrawer.tsx", 1],
];

describe("Dialog adoption ratchet", () => {
  const scan = scanProduction();
  const ledger = new Map<string, number>([
    ...REGISTERED.map(([file, count]) => [file, count] as const),
    ...DEBT,
  ]);

  it("the detector does not idle — the primitive itself carries markup, and the ledger files exist", () => {
    // If the source of truth disappears (a rename, say), this whole ratchet loses its target.
    const primitive = readFileSync(path.join(ROOT, PRIMITIVE), "utf8");
    /*
     * The primitive passes the role as a prop (`alertdialog` for confirmations). Anti-idle check: it must
     * default the prop to `dialog`, offer only `dialog | alertdialog`, and put the prop on the element;
     * a rename empties all three and kills this ratchet loudly.
     */
    expect(
      primitive.includes('role = "dialog"'),
      "the primitive does not default role to dialog",
    ).toBe(true);
    expect(
      primitive.includes('role?: "dialog" | "alertdialog"'),
      "the role options of the primitive are not dialog | alertdialog",
    ).toBe(true);
    expect(
      primitive.includes("role={role}"),
      "the primitive does not attach role to the element",
    ).toBe(true);
    // A debt ledger holding non-existent files lets a "decrease" be achieved by a move or rename.
    for (const [file] of [...REGISTERED, ...DEBT]) {
      expect(statSync(path.join(ROOT, file)).isFile(), `${file} does not exist`).toBe(true);
    }
    expect(scan.size, "the scan found no file — the worker runs on an empty set").toBeGreaterThan(0);
  });

  it("role=dialog markup outside the primitive cannot exceed the ledger — a new file starts at 0 on day one", () => {
    const over: string[] = [];
    for (const [file, count] of scan) {
      const allowed = ledger.get(file) ?? 0;
      if (count > allowed) over.push(`${file}: ${count} > ledger ${allowed}`);
    }
    expect(
      over,
      "Do not hand-assemble a modal: src/shared/ui/surfaces/dialog.tsx (Dialog) owns the scrim, focus trap, Escape, focus return and scroll lock. " +
        "If a portal is impossible at that site in principle, register it in REGISTERED with the reason.",
    ).toEqual([]);
  });

  it("reclaimed ledger entries at 0 have their line deleted — a ledger more generous than the measurement loosens the ratchet", () => {
    const stale: string[] = [];
    for (const [file, allowed] of DEBT) {
      const actual = scan.get(file) ?? 0;
      if (actual < allowed) stale.push(`${file}: ledger ${allowed} > measured ${actual} — lower the ledger`);
    }
    expect(stale).toEqual([]);
  });

  /*
   * ── Resident probe — is the detector itself alive (/gate-probe: passing is not evidence).
   */
  it("probe: markup is caught, selector strings and comments are not", () => {
    expect(countDialogMarkup('<div role="dialog" aria-modal="true" />')).toBe(1);
    expect(countDialogMarkup("document.querySelector('[role=\"dialog\"]')")).toBe(0);
    expect(countDialogMarkup('// role="dialog" 를 설명하는 주석\nconst a = 1;')).toBe(0);
    expect(countDialogMarkup('/* role="dialog" */\nconst a = 1;')).toBe(0);
    expect(countDialogMarkup('<div role="dialog" /><div role="dialog" />')).toBe(2);
  });
});
