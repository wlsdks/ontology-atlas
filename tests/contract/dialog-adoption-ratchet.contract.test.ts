import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Dialog adoption ratchet — **`role="dialog"` outside the primitive can never
 * exceed the ledger.**
 *
 * **Why** (ratified by the design-system seat 2026-08-15,
 * docs/DECISIONS.md). 26 places across 23 files were each assembling modality
 * themselves: 5 different scrim tokens, 8 hardcoded widths, a focus trap actually
 * present in only 8 of 20 places declaring aria-modal, and 2 aria-modals with
 * neither scrim nor trap. The answer is `src/shared/ui/dialog.tsx`. This ratchet
 * makes **new files use the primitive from day one** and holds existing debt so
 * it can only fall.
 *
 * **Why a contract test and not lint.** The verdict is "how many across the whole
 * repository", which no single-file AST selector can count — exactly the ratchet
 * row in design.md's "layer lint cannot see". And it **walks all of src/** rather
 * than a hand-written file list, because a hand list is the path that let
 * surface-motion-ratchet sit green on an empty list.
 *
 * **The scanner's reach.**
 *
 * - Comments are stripped before counting (avoiding the icon ratchet's defect of
 *   counting prose comments as values).
 * - Occurrences **inside a selector string** such as `[role="dialog"]` are not
 *   markup — that is code looking for the surface, not the surface itself
 *   (route-focus-manager).
 * - `src/shared/ui/dialog.tsx` itself is the source of truth and is excluded.
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
    "src/views/home/ui/HomePage.tsx",
    3,
    "지도 컴포저 — --z-map-scrim(25) 층·지도 좌표계 내부에 산다. body 포털(--z-dialog 60)로 올리면 지도 위 다른 크롬과의 층 계약이 깨진다.",
  ],
];

/**
 * **Debt** — to be repaid. It turns red if the count rises, and the row is
 * deleted when it reaches 0. Repayment order (the design-system seat's prescription):
 * ProjectDrawer (the only remaining modal-without-modality) → the 7
 * backdrop-medium files (scrim convergence, after the hierarchy seat approves) → the 3
 * palettes (together with registering `variant="palette"`).
 *
 * Founding inventory 2026-08-15: of 26 places across 23 files, the first three
 * consumers (NewDocKindDialog, StudioMaterializeDialog, StudioPracticeCleanup)
 * migrated in the same PR, leaving the 17 files / 17 places below (plus 1 Radix
 * case outside the scanner's view).
 */
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
  ["src/widgets/topology-map-v2/ui/TopologyV2EdgePanel.tsx", 1],
  ["src/widgets/docs-quick-drawer/ui/DocsQuickDrawer.tsx", 1],
  // 2026-08-21 — that sheet was retired (ledger entry 90). Recovered rows are
  // deleted from the ledger: holding a file that no longer exists lets a "decrease"
  // be achieved by a move or rename alone, which loosens the ratchet.
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
     * ⚠️ **The primitive stopped writing the role as a literal on 2026-09-05** and now passes a
     * prop, because a confirmation that names what it is about to destroy is `alertdialog` in the
     * APG and the alternative was a consumer hand-building a modal to get one attribute.
     *
     * So what the anti-idle check asks for is unchanged in substance — **does the primitive still
     * own the role** — and is asked of the shape it now has: it must default the prop to
     * `dialog`, offer only `dialog | alertdialog`, and put the prop on the element. A rename
     * still empties all three and kills this ratchet loudly, which is the whole point of the
     * check.
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
      "모달을 손으로 조립하지 마라 — src/shared/ui/dialog.tsx (Dialog) 가 스크림·트랩·Esc·복귀·스크롤락을 소유한다. " +
        "원리적으로 포털이 불가한 자리라면 REGISTERED 에 근거와 함께 등재하라.",
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
