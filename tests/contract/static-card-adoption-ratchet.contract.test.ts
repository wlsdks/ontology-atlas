import { statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { censusStaticSurfaces, isHandCard } from "../../scripts/lib/static-surface-census.mjs";

/**
 * Section-card adoption ratchet — **hand-written box insets cannot grow**
 * (2026-08-15).
 *
 * **Why** (ratified by the 체계 seat · docs/DECISIONS.md 2026-08-15, entry 5). A
 * five-axis inventory (radius × padding × surface × border × header): 71 cases
 * across 36 files with **51 distinct combinations**, the top three covering 18%, and
 * 41 singletons. Unlike badges, **a value layer was rejected** — fixing any padding
 * as an axis forces pixel movement on 58 or more cases, which is the shape of the
 * `fixedHeight` accident.
 *
 * What surfaced instead was that **an existing token was not being used**:
 * `--card-pad` (16px) had 16 consumers, and **12 more boxes hand-wrote the same 16px**
 * (and all 12, along with 13 of the 16 token adopters, used `rounded-panel`, so
 * reality inverted the spec table's pairing of "card = --card-pad"). These are the
 * "values hand-rewritten without looking them up" that `/design-build` 0-Z forbids,
 * so the migration moved 0 pixels.
 *
 * This ratchet blocks their return. The remaining 62 are debt needing **per-place
 * design decisions**, and the ledger holds them.
 *
 * The scanner is the single `scripts/lib/static-surface-census.mjs` — the ledger and
 * the gate must count with the same function for "the ledger is more generous than
 * the measurement" to mean anything.
 *
 * ⚠️ **Width-conditional insets (`sm:px-5`) count as hand insets too.** So a place
 * that moved only its base value onto the token does not come down in the ledger —
 * that is a fact rather than scanner error: hand-written pixels still remain there,
 * and whether to raise the ladder into the spec is a per-place decision. (Measured
 * during probing: it stayed at 1 both before and after migration, so the revert
 * probe's target had to be re-aimed at a place with no responsive remainder.)
 */

const ROOT = process.cwd();

/**
 * **The debt ledger** — exactly what the scanner produced after migration, never
 * hand-tuned. (On 2026-08-15 a hand-written ledger was wrong four times, and that
 * discipline was codified into `/design-system-audit`.)
 */
const DEBT: ReadonlyArray<readonly [file: string, count: number]> = [
  ["src/features/app-update/ui/UpdateToast.tsx", 1],
  ["src/features/docs-vault-local/ui/OntologyStarterCta.tsx", 1],
  ["src/features/first-run-starter/ui/FirstRunStarterModule.tsx", 1],
  ["src/features/project-edit/ui/DependencyPicker.tsx", 3],
  ["src/features/project-edit/ui/MarkdownField.tsx", 1],
  // 8 → 7 (2026-08-17): removed the panel box wrapping "fill in more" — a 92px box
  // wrapped a single collapsed line. Chrome containing nothing.
  ["src/features/project-edit/ui/ProjectForm.tsx", 7],
  ["src/views/docs-vault/ui/parts/EmptyState.tsx", 1],
  // 1 → 0 (2026-08-19): that single card was the download panel, and it went with the
  // wholesale deletion of the install section (`docs/DECISIONS.md`, entry 83).
  ["src/views/home/ui/CreateNodeForm.tsx", 1],
  ["src/views/home/ui/HomePage.tsx", 1],
  ["src/views/home/ui/TopologyNoMatchesState.tsx", 1],
  ["src/views/ontology-insights/ui/OntologyInsightsPage.tsx", 2],
  ["src/views/ontology-insights/ui/parts/InsightsHandoffRow.tsx", 1],
  ["src/views/ontology-insights/ui/parts/InsightsHeroCensus.tsx", 1],
  ["src/views/ontology-insights/ui/tabs/ImpactRankingCard.tsx", 1],
  ["src/views/project-detail/ui/construction-review/ConstructionReviewPanel.tsx", 2],
  ["src/views/project-detail/ui/ProjectDetailPage.tsx", 1],
  ["src/views/project-editor/ui/ProjectEditorPage.tsx", 2],
  ["src/views/project-selector/ui/ProjectSelectorPage.tsx", 3],
  ["src/widgets/app-settings-menu/ui/AiConnectionPanel.tsx", 1],
  // 2026-08-21: the executor and MCP-connect sections moved out to the Agents
  // destination, taking two hand cards from this file with them (ledger 90). What was
  // recovered comes down in the ledger — a ledger more generous than the measurement
  // is not a ratchet.
  ["src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx", 0],
  ["src/widgets/app-settings-menu/ui/ExpandSettings.tsx", 3],
  ["src/widgets/app-settings-menu/ui/FootprintSettings.tsx", 1],
  ["src/widgets/docs-quick-drawer/ui/DocsQuickDrawer.tsx", 2],
  ["src/widgets/full-detail-a1/ui/full-detail-a1-groups-panel.tsx", 1],
  ["src/widgets/full-detail-a1/ui/FullDetailA1.tsx", 2],
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
      "구획 상자(rounded-panel)의 인셋은 `p-[var(--card-pad)]` 다 — 16px 을 손으로 다시 적지 마라. " +
        "항목 상자(rounded-card)의 인셋은 강제하지 않으니, 새 상자가 정말 항목이면 그 사실이 " +
        "반경으로 드러나야 한다(구획이면 panel · 항목이면 card).",
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
