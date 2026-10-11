import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `role=dialog` outside the primitive can never exceed the ledger. Walks all of `src/` because a
 * hand list can sit green on nothing. Comments and selector strings like `[role=dialog]` are not
 * markup; `src/shared/ui/dialog.tsx` is the source of truth and excluded.
 */

const ROOT = process.cwd();
const PRIMITIVE = "src/shared/ui/dialog.tsx";

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
    "지도 컴포저 — --z-map-scrim(25) 층·지도 좌표계 내부에 산다. body 포털(--z-dialog 60)로 올리면 지도 위 다른 크롬과의 층 계약이 깨진다.",
  ],
  [
    "src/features/vault-switch/ui/VaultSwitchRailTile.tsx",
    1,
    "The rail's folder switcher is a **non-modal anchored popover**, and it already " +
      "portals itself to document.body — so the thing this ratchet exists to prevent " +
      "(a hand-assembled surface trapped in its trigger's stacking context) is not what " +
      "it is. What it cannot take is the primitive's modality: `Dialog` owns a scrim, a " +
      "focus trap and a scroll lock, and `shared/ui/transient-surface.ts` gives the " +
      "`anchored` kind the opposite contract — it stands beside what opened it and leaves " +
      "the background alive and pressable. A scrim over the map would also be a second " +
      "answer to 'is the page still usable', which the single-transient rule forbids. It " +
      "keeps `role=\"dialog\"` because the APG names a non-modal popover with rich " +
      "content a dialog, and `role=\"menu\"` was rejected by the interaction and " +
      "workbench seats for having no menu items (2026-09-13). Focus in and focus back to " +
      "the trigger are implemented at the call site via `Surface`'s ref and `onExited`.",
  ],
  [
    "src/views/ontology-insights/ui/tabs/HarnessCoverageOverview.tsx",
    1,
    "Measured Guidance evidence is a rich **non-modal anchored dialog**: the reader must be " +
      "able to select another domain/role mark while evidence is open, so the modal Dialog " +
      "primitive's scrim, focus trap and scroll lock would violate the interaction. The desktop " +
      "surface portals to document.body, declares transientSurface('anchored'), takes focus once, " +
      "retains inert evidence through Surface exit, and restores only the correct live trigger for " +
      "Escape/Close intent. Replacement and outside intent cannot steal focus. The narrow branch " +
      "still uses the modal Dialog primitive. Behavioral evidence: HarnessCoverageOverview.test.tsx " +
      "and tests/e2e/harness-tab.spec.ts. Native geometry/motion acceptance remains separate.",
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
  ["src/features/guided-tour/ui/GuidedTourCard.tsx", 1],
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

describe("Dialog 채택 래칫", () => {
  const scan = scanProduction();
  const ledger = new Map<string, number>([
    ...REGISTERED.map(([file, count]) => [file, count] as const),
    ...DEBT,
  ]);

  it("탐지기가 공회전하지 않는다 — 프리미티브 자신이 마크업을 갖고, 장부 파일이 실재한다", () => {
    // If the source of truth disappears (a rename, say), this whole ratchet loses its target.
    const primitive = readFileSync(path.join(ROOT, PRIMITIVE), "utf8");
    /*
     * The primitive passes the role as a prop (`alertdialog` for confirmations). Anti-idle check: it must
     * default the prop to `dialog`, offer only `dialog | alertdialog`, and put the prop on the element;
     * a rename empties all three and kills this ratchet loudly.
     */
    expect(
      primitive.includes('role = "dialog"'),
      "프리미티브가 role 기본값을 dialog 로 두지 않는다",
    ).toBe(true);
    expect(
      primitive.includes('role?: "dialog" | "alertdialog"'),
      "프리미티브의 role 선택지가 dialog | alertdialog 가 아니다",
    ).toBe(true);
    expect(
      primitive.includes("role={role}"),
      "프리미티브가 role 을 요소에 붙이지 않는다",
    ).toBe(true);
    // A debt ledger holding non-existent files lets a "decrease" be achieved by a move or rename.
    for (const [file] of [...REGISTERED, ...DEBT]) {
      expect(statSync(path.join(ROOT, file)).isFile(), `${file} 이 실재하지 않는다`).toBe(true);
    }
    expect(scan.size, "스캔이 아무 파일도 못 찾았다 — 워커가 빈 집합 위에서 돈다").toBeGreaterThan(0);
  });

  it("프리미티브 밖의 role=dialog 마크업은 장부를 넘지 못한다 — 새 파일은 첫날부터 0", () => {
    const over: string[] = [];
    for (const [file, count] of scan) {
      const allowed = ledger.get(file) ?? 0;
      if (count > allowed) over.push(`${file}: ${count} > 장부 ${allowed}`);
    }
    expect(
      over,
      "Do not hand-assemble a modal: src/shared/ui/dialog.tsx (Dialog) owns the scrim, focus trap, Escape, focus return and scroll lock. " +
        "If a portal is impossible at that site in principle, register it in REGISTERED with the reason.",
    ).toEqual([]);
  });

  it("장부의 0 회수분은 줄을 지운다 — 장부가 실측보다 후하면 래칫이 헐겁다", () => {
    const stale: string[] = [];
    for (const [file, allowed] of DEBT) {
      const actual = scan.get(file) ?? 0;
      if (actual < allowed) stale.push(`${file}: 장부 ${allowed} > 실측 ${actual} — 장부를 내려라`);
    }
    expect(stale).toEqual([]);
  });

  /*
   * ── Resident probe — is the detector itself alive (/gate-probe: passing is not evidence).
   */
  it("프로브: 마크업은 잡히고, 셀렉터 문자열과 주석은 잡히지 않는다", () => {
    expect(countDialogMarkup('<div role="dialog" aria-modal="true" />')).toBe(1);
    expect(countDialogMarkup("document.querySelector('[role=\"dialog\"]')")).toBe(0);
    expect(countDialogMarkup('// role="dialog" 를 설명하는 주석\nconst a = 1;')).toBe(0);
    expect(countDialogMarkup('/* role="dialog" */\nconst a = 1;')).toBe(0);
    expect(countDialogMarkup('<div role="dialog" /><div role="dialog" />')).toBe(2);
  });
});
