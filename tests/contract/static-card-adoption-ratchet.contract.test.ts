import { statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { censusStaticSurfaces, isHandCard } from "../../scripts/lib/static-surface-census.mjs";

/**
 * 섹션 카드 채택 래칫 — **손으로 쓴 상자 인셋이 늘지 못한다** (2026-08-15).
 *
 * ## 왜 (「체계」석 비준 · docs/DECISIONS.md 2026-08-15 (5))
 *
 * 5축 전수(반경 × 패딩 × 표면 × 보더 × 헤더): 71건 / 36파일 / **결합 51종** ·
 * 상위3 커버 18% · 싱글턴 41. 배지와 달리 **값 층은 반려**됐다 — 어떤 패딩을
 * 축으로 고정해도 58건 이상에 픽셀 이동을 강요하고, 그게 `fixedHeight` 사고의
 * 모양이다.
 *
 * 대신 드러난 것은 **이미 있는 토큰을 안 쓰고 있었다**는 사실이다:
 * `--card-pad`(16px)의 소비처가 16곳인데, **같은 값 16px 을 손으로 다시 적은
 * 상자가 12곳** 더 있었다(그리고 그 12곳도, 토큰 채택 16곳 중 13곳도 전부
 * `rounded-panel` 이라 「카드 = --card-pad」라던 규격 표의 짝은 현실이
 * 뒤집었다). `/design-build` 0-Z 가 금지하는 「찾아보지 않고 손으로 다시 적은
 * 값」이라 이주는 픽셀 0 이었다.
 *
 * 이 래칫은 그 재유입을 막는다. 나머지 62건은 **자리별 디자인 판정**이 필요한
 * 부채라 장부가 붙든다.
 *
 * 스캐너는 `scripts/lib/static-surface-census.mjs` 하나다 — 장부와 게이트가
 * 같은 함수로 세어야 「장부가 실측보다 후하다」가 뜻을 갖는다.
 *
 * ⚠️ **화면 폭별 인셋(`sm:px-5`)도 손 인셋으로 센다.** 그래서 밑값만 토큰으로
 * 옮긴 자리는 장부에서 안 내려간다 — 그건 스캐너의 오차가 아니라 사실이다.
 * 그 자리에는 아직 손으로 적은 픽셀이 남아 있고, 사다리를 규격으로 올릴지는
 * 자리별 판정이다. (프로브 때 실측: 이주 전후 둘 다 1로 남아, 되돌리기
 * 프로브의 표적을 반응형 잔여가 없는 자리로 다시 잡아야 했다.)
 */

const ROOT = process.cwd();

/**
 * **부채 장부** — 이주 후 스캐너가 뽑은 값 그대로다(손으로 다듬지 않는다.
 * 2026-08-15 에 손으로 적은 장부가 네 번 틀렸고, 그 규율을
 * `/design-system-audit` 에 성문화했다).
 */
const DEBT: ReadonlyArray<readonly [file: string, count: number]> = [
  ["src/features/app-update/ui/UpdateToast.tsx", 1],
  ["src/features/docs-vault-local/ui/OntologyStarterCta.tsx", 1],
  ["src/features/first-run-starter/ui/FirstRunStarterModule.tsx", 1],
  ["src/features/project-edit/ui/DependencyPicker.tsx", 3],
  ["src/features/project-edit/ui/MarkdownField.tsx", 1],
  // 8 → 7 (2026-08-17): 「더 채우기」를 감싸던 패널 상자를 걷어 냈다. 접힌 줄
  // 하나를 92px 상자가 감싸고 있었다 — 담은 것 없는 크롬.
  ["src/features/project-edit/ui/ProjectForm.tsx", 7],
  ["src/views/agent-skills/ui/SkillProcessRail.tsx", 1],
  ["src/views/docs-vault/ui/parts/EmptyState.tsx", 1],
  ["src/views/download/ui/DownloadPage.tsx", 1],
  ["src/views/home/ui/CreateNodeForm.tsx", 1],
  ["src/views/home/ui/HomePage.tsx", 1],
  ["src/views/home/ui/TopologyNoMatchesState.tsx", 1],
  ["src/views/ontology-insights/ui/OntologyInsightsPage.tsx", 2],
  ["src/views/ontology-insights/ui/parts/InsightsHandoffRow.tsx", 1],
  ["src/views/ontology-insights/ui/parts/InsightsHeroCensus.tsx", 1],
  ["src/views/ontology-insights/ui/tabs/ImpactRankingCard.tsx", 1],
  ["src/views/ontology-studio/ui/StudioCompass.tsx", 3],
  ["src/views/ontology-studio/ui/StudioDeltaPreview.tsx", 2],
  ["src/views/ontology-studio/ui/StudioMaterializeDialog.tsx", 1],
  ["src/views/ontology-studio/ui/StudioPicker.tsx", 3],
  ["src/views/ontology-studio/ui/StudioPracticeRail.tsx", 1],
  ["src/views/project-detail/ui/construction-review/ConstructionReviewPanel.tsx", 2],
  ["src/views/project-detail/ui/ProjectDetailPage.tsx", 1],
  ["src/views/project-editor/ui/ProjectEditorPage.tsx", 2],
  ["src/views/project-selector/ui/ProjectSelectorPage.tsx", 3],
  ["src/widgets/app-settings-menu/ui/AiConnectionPanel.tsx", 1],
  ["src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx", 2],
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

  /* ── 상주 프로브 (/gate-probe) ── */
  it("프로브: 손 인셋은 잡고 토큰 채택·비대상 반경은 안 잡는다", () => {
    expect(isHandCard('<div className="rounded-panel border px-4 py-4"')).toBe(true);
    expect(isHandCard('<section className="rounded-card p-3"')).toBe(true);
    expect(isHandCard('<div className="rounded-panel border p-[var(--card-pad)]"')).toBe(false);
    expect(isHandCard('<div className="rounded-chip px-2 py-0.5"')).toBe(false);
    expect(isHandCard('<div className="flex gap-2"')).toBe(false);
  });
});
