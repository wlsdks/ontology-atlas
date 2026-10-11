import { statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { censusStaticSurfaces, isHandCard } from "../../scripts/lib/static-surface-census.mjs";

/**
 * Hand-written box insets cannot grow. Width-conditional insets (`sm:px-5`) count as hand insets too.
 * The scanner is the single `scripts/lib/static-surface-census.mjs`.
 */

const ROOT = process.cwd();

/** Per-file ceilings exactly as the scanner produces them, never hand-tuned. */
const DEBT: ReadonlyArray<readonly [file: string, count: number]> = [
  ["src/features/app-update/ui/UpdateToast.tsx", 1],
  ["src/features/docs-vault-local/ui/OntologyStarterCta.tsx", 1],
  ["src/features/first-run-starter/ui/FirstRunStarterModule.tsx", 1],
  ["src/features/project-edit/ui/DependencyPicker.tsx", 3],
  ["src/features/project-edit/ui/MarkdownField.tsx", 1],
  ["src/features/project-edit/ui/ProjectForm.tsx", 1],
  ["src/features/project-edit/ui/ProjectFormActions.tsx", 1],
  ["src/features/project-edit/ui/ProjectFormBanners.tsx", 2],
  ["src/features/project-edit/ui/ProjectFormPreview.tsx", 2],
  ["src/features/project-edit/ui/project-form-parts.tsx", 1],
  ["src/views/docs-vault/ui/parts/EmptyState.tsx", 1],
  ["src/views/home/ui/CreateNodeForm.tsx", 1],
  ["src/views/home/ui/TopologyBlockingOverlays.tsx", 1],
  ["src/views/home/ui/TopologyNoMatchesState.tsx", 1],
  ["src/views/project-detail/ui/construction-review/ConstructionReviewPanel.tsx", 2],
  ["src/views/project-detail/ui/ProjectDetailPage.tsx", 1],
  ["src/views/project-editor/ui/ProjectEditorPage.tsx", 2],
  ["src/views/project-selector/ui/ProjectSelectorPage.tsx", 0],
  // A ledger more generous than the measurement is not a ratchet: recovered rows come down.
  ["src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx", 0],
  ["src/widgets/app-settings-menu/ui/ExpandSettings.tsx", 3],
  ["src/widgets/app-settings-menu/ui/FootprintSettings.tsx", 1],
  ["src/widgets/docs-quick-drawer/ui/DocsQuickDrawer.tsx", 2],
  ["src/widgets/full-detail-a1/ui/full-detail-a1-groups-panel.tsx", 1],
  ["src/widgets/full-detail-a1/ui/FullDetailA1.tsx", 1],
  ["src/widgets/project-drawer/ui/ProjectDrawer.tsx", 3],
  ["src/widgets/topology-controls/ui/VaultStartSteps.tsx", 1],
  ["src/widgets/vault-agent-panel/ui/AgentProposalCard.tsx", 1],
  ["src/widgets/vault-agent-panel/ui/AgentScopeSheet.tsx", 1],
];

describe("섹션 카드 채택 래칫", () => {
  const census = censusStaticSurfaces(ROOT);
  const found = census.cards;
  const ledger = new Map(DEBT);

  it("탐지기가 공회전하지 않는다 — 파일을 훑고 장부가 실재한다", () => {
    expect(census.scanned, "훑은 파일이 너무 적다 — 워커가 죽었다").toBeGreaterThan(100);
    expect([...found.values()].reduce((a, b) => a + b, 0), "카드를 하나도 못 찾았다").toBeGreaterThan(0);
    for (const [file] of DEBT) {
      expect(statSync(path.join(ROOT, file)).isFile(), `${file} 이 실재하지 않는다`).toBe(true);
    }
  });

  it("손으로 쓴 상자 인셋은 장부를 넘지 못한다 — 새 파일은 첫날부터 0", () => {
    const over: string[] = [];
    for (const [file, count] of found) {
      const allowed = ledger.get(file) ?? 0;
      if (count > allowed) over.push(`${file}: ${count} > 장부 ${allowed}`);
    }
    expect(
      over,
      "A section box (rounded-panel) is inset with `p-[var(--card-pad)]`; do not write 16px by hand again. " +
        "An item box (rounded-card) inset is not enforced, so if the new box really is an item, " +
        "its radius has to say so (a section is panel, an item is card).",
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

  /* ── Resident probes (/gate-probe) ── */
  it("프로브: 손 인셋은 잡고 토큰 채택·비대상 반경은 안 잡는다", () => {
    expect(isHandCard('<div className="rounded-panel border px-4 py-4"')).toBe(true);
    expect(isHandCard('<section className="rounded-card p-3"')).toBe(true);
    expect(isHandCard('<div className="rounded-panel border p-[var(--card-pad)]"')).toBe(false);
    expect(isHandCard('<div className="rounded-chip px-2 py-0.5"')).toBe(false);
    expect(isHandCard('<div className="flex gap-2"')).toBe(false);
  });
});
