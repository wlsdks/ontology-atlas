import { statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  censusStaticSurfaces,
  isHandBadge,
} from "../../scripts/lib/static-surface-census.mjs";

/**
 * Hand-written badge geometry (radius plus inset or type step) without `badgeClass` cannot grow.
 * Status dots, the `shared/ui` primitive layer and tests are not counted; colour is not counted.
 */

const ROOT = process.cwd();

/**
 * The scanner is `scripts/lib/static-surface-census.mjs`: the ledger and the gate must count with the
 * same function for the ledger-more-generous check to mean anything.
 */

/** Per-file ceilings: growth turns red, and a row reaching 0 is deleted. */
const DEBT: ReadonlyArray<readonly [file: string, count: number]> = [
  ["src/entities/project/ui/ProjectCard.tsx", 1],
  ["src/features/agent-activity/ui/AgentActivityChip.tsx", 1],
  ["src/features/first-run-starter/ui/FirstRunStarterModule.tsx", 1],
  ["src/features/project-edit/ui/DependencyPicker.tsx", 2],
  ["src/features/project-edit/ui/ProjectFormActions.tsx", 2],
  ["src/features/project-edit/ui/project-form-parts.tsx", 2],
  ["src/views/docs-vault/ui/parts/DocMetaBar.tsx", 2],
  ["src/views/docs-vault/ui/parts/DocsSidebarBody.tsx", 2],
  ["src/views/download/ui/DemoStage.tsx", 1],
  ["src/views/home/ui/TopologyCommandChrome.tsx", 1],
  ["src/views/project-detail/ui/construction-review/ConstructionReviewPanel.tsx", 1],
  ["src/views/project-editor/ui/ProjectEditorPage.tsx", 1],
  ["src/widgets/app-nav-rail/ui/AppNavRail.tsx", 1],
  ["src/widgets/atlas-git-panel/ui/SetupMode.tsx", 3],
  ["src/widgets/docs-vault/ui/DocsVaultEditor.tsx", 3],
  ["src/widgets/docs-vault/ui/DocsVaultViewer.tsx", 1],
  ["src/widgets/global-search/ui/GlobalSearch.tsx", 2],
  ["src/widgets/project-drawer/ui/ProjectDrawer.tsx", 3],
  ["src/widgets/search-palette/ui/SearchPalette.tsx", 1],
  ["src/widgets/ontology-map/ui/detail-panel/RelationGroupShell.tsx", 1],
  ["src/widgets/vault-agent-panel/ui/AgentLockedState.tsx", 1],
];

describe("정적 배지 채택 래칫", () => {
  const census = censusStaticSurfaces(ROOT);
  const found = census.badges;
  const ledger = new Map(DEBT);

  it("탐지기가 공회전하지 않는다 — 파일을 실제로 훑고 장부가 실재한다", () => {
    // Locks that enough files were scanned, not that the number of caught files is non-zero.
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
      "Do not hand-write badge geometry: `badgeClass({ shape })` (src/shared/ui/badge-class.ts) " +
        "owns the radius, inset and type step. Colour and tracking still go through className.",
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
