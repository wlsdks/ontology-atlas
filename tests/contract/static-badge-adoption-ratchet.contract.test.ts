import { statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  censusStaticSurfaces,
  isHandBadge,
} from "../../scripts/lib/static-surface-census.mjs";

/**
 * Static badge adoption ratchet — **hand-written badge geometry cannot grow**
 * (2026-08-15).
 *
 * **Why** (ratified by the 체계 seat, docs/DECISIONS.md). Inventory: 67 static badges
 * split across **30 geometries and 60 colours**. The per-box spec table already had a
 * badge row, and its prescription (`rounded-chip px-2 py-0.5` label) had **zero exact
 * matches in production** — by this repository's own precedent, *a spec nobody uses is
 * not a spec but misinformation*.
 *
 * This category also has a history of **a part dying once**: `Card`, `Badge`, and
 * `DetailCard` were deleted on 2026-08-03 with zero consumers. The post-mortem named
 * the cause not as the components but as **components without a gate**, so this
 * ratchet is born in the **same PR** as `badgeClass`. The three alive today (Dialog,
 * Checkbox, SegmentedControl) were all born that way.
 *
 * **What is counted**: a `<span>` that hand-writes **geometry (radius plus inset or a
 * type step)** without going through `badgeClass`. Not counted: status dots (textless
 * circles), the `shared/ui` primitive layer, and tests.
 *
 * Colour and letter-spacing are **not counted** — those are axes the value layer
 * deliberately does not cover (there is no majority), so counting them would create
 * debt that can never be repaid. Colour convergence is a per-place design verdict and
 * belongs to the next round.
 */

const ROOT = process.cwd();

/**
 * **The scanner is not built here** — it calls
 * `scripts/lib/static-surface-census.mjs`. The ledger and the gate must count with
 * **the same function** for the two-way "the ledger is more generous than the
 * measurement" check to mean anything (a discipline codified in
 * `/design-system-audit` after a hand-written ledger was wrong four times on
 * 2026-08-15).
 */

/**
 * **The debt ledger** — measured right after the 2026-08-15 migration (17
 * byte-identical places). These are per-file ceilings; growth turns red, and a row
 * reaching 0 is deleted.
 *
 * The repayment order follows `/design-system-audit`'s fix order: ① geometry that
 * already matches (0 pixels moved) → ② ±1px → ③ places needing a design verdict. This
 * PR finished ①; most of what remains is ② and ③ and needs a per-place verdict.
 */
const DEBT: ReadonlyArray<readonly [file: string, count: number]> = [
  ["src/entities/project/ui/ProjectCard.tsx", 1],
  ["src/features/agent-activity/ui/AgentActivityChip.tsx", 1],
  ["src/features/docs-vault-local/ui/StepRow.tsx", 1],
  ["src/features/first-run-starter/ui/FirstRunStarterModule.tsx", 1],
  ["src/features/project-edit/ui/DependencyPicker.tsx", 2],
  ["src/features/project-edit/ui/ProjectForm.tsx", 4],
  ["src/views/docs-vault/ui/parts/DocMetaBar.tsx", 2],
  ["src/views/docs-vault/ui/parts/DocsSidebarBody.tsx", 2],
  ["src/views/download/ui/DemoStage.tsx", 1],
  ["src/views/home/ui/HomePage.tsx", 1],
  ["src/views/ontology-insights/ui/tabs/DomainCouplingCard.tsx", 1],
  ["src/views/ontology-insights/ui/tabs/FreshnessTab.tsx", 1],
  ["src/views/project-detail/ui/ProjectDetailPage.tsx", 2],
  ["src/views/project-detail/ui/construction-review/ConstructionReviewPanel.tsx", 1],
  ["src/views/project-editor/ui/ProjectEditorPage.tsx", 1],
  ["src/widgets/app-nav-rail/ui/AppNavRail.tsx", 1],
  ["src/widgets/app-settings-menu/ui/AgentSetupStep.tsx", 1],
  ["src/widgets/atlas-git-panel/ui/AtlasGitPanel.tsx", 3],
  ["src/widgets/docs-vault/ui/DocsVaultEditor.tsx", 3],
  ["src/widgets/docs-vault/ui/DocsVaultViewer.tsx", 1],
  ["src/widgets/gateway-chrome/ui/GatewayNav.tsx", 1],
  ["src/widgets/global-search/ui/GlobalSearch.tsx", 2],
  ["src/widgets/project-drawer/ui/ProjectDrawer.tsx", 3],
  ["src/widgets/search-palette/ui/SearchPalette.tsx", 1],
  ["src/widgets/topology-index-panel/ui/TopologyIndexPanel.tsx", 1],
  ["src/widgets/topology-map-v2/ui/TopologyV2DetailPanel.tsx", 2],
  ["src/widgets/vault-agent-panel/ui/AgentLockedState.tsx", 1],
];

describe("정적 배지 채택 래칫", () => {
  const census = censusStaticSurfaces(ROOT);
  const found = census.badges;
  const ledger = new Map(DEBT);

  it("탐지기가 공회전하지 않는다 — 파일을 실제로 훑고 장부가 실재한다", () => {
    // Locks "enough files were scanned", not "the number of caught files is non-zero"
    // (the 2026-08-03 label-decoration precedent: do not aim the idling guard at the
    // wrong thing).
    expect(census.scanned, "훑은 파일이 너무 적다 — 워커가 죽었다").toBeGreaterThan(100);
    for (const [file] of DEBT) {
      expect(statSync(path.join(ROOT, file)).isFile(), `${file} 이 실재하지 않는다`).toBe(true);
    }
  });

  it("손으로 쓴 배지 기하는 장부를 넘지 못한다 — 새 파일은 첫날부터 0", () => {
    const over: string[] = [];
    for (const [file, count] of found) {
      const allowed = ledger.get(file) ?? 0;
      if (count > allowed) over.push(`${file}: ${count} > 장부 ${allowed}`);
    }
    expect(
      over,
      "배지 기하를 손으로 쓰지 마라 — `badgeClass({ shape })`(src/shared/ui/badge-class.ts)가 " +
        "반경·인셋·타입단을 소유한다. 색과 자간은 그대로 className 으로 넘기면 된다.",
    ).toEqual([]);
  });

  it("장부의 회수분은 내린다 — 실측보다 후한 장부는 래칫이 아니다", () => {
    const stale: string[] = [];
    for (const [file, allowed] of DEBT) {
      const actual = found.get(file) ?? 0;
      if (actual < allowed) stale.push(`${file}: 장부 ${allowed} > 실측 ${actual} — 내려라`);
    }
    expect(stale).toEqual([]);
  });

  /* ── Standing probes (/gate-probe) ── */
  it("프로브: 손 배지는 잡고 badgeClass 소비자·상태 점은 안 잡는다", () => {
    expect(isHandBadge('<span className="rounded-full px-2 py-0.5 text-caption"')).toBe(true);
    expect(isHandBadge('<span className="rounded-micro text-label"')).toBe(true);
    expect(isHandBadge('<span className={badgeClass({ shape: "pill" })}')).toBe(false);
    expect(isHandBadge('<span className="size-2 rounded-full bg-[color:var(--color-status-success)]"')).toBe(false);
    expect(isHandBadge('<span className="flex items-center gap-2"')).toBe(false);
  });
});
