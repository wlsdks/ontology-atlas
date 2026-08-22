import { statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  censusStaticSurfaces,
  isHandBadge,
} from "../../scripts/lib/static-surface-census.mjs";

/**
 * 정적 배지 채택 래칫 — **손으로 쓴 배지 기하가 늘지 못한다** (2026-08-15).
 *
 * ## 왜 (「체계」석 비준 · docs/DECISIONS.md)
 *
 * 전수: 정적 배지 67건이 **기하 30종 · 색 60종**으로 갈려 있었다. 「박스별
 * 규격 표」가 이미 배지 행을 갖고 있었는데 그 처방(`rounded-chip px-2 py-0.5`
 * label)의 **정확 일치는 프로덕션 0건**이었다 — 이 저장소의 판례로 판정하면
 * *"아무도 안 쓰는 규격은 규격이 아니라 오정보다"*.
 *
 * 그리고 이 갈래에는 **부품이 한 번 죽은 이력**이 있다: `Card`/`Badge`/
 * `DetailCard` 가 2026-08-03 에 소비처 0으로 삭제됐다. 부검은 컴포넌트가
 * 아니라 **게이트 없는 컴포넌트**를 사인으로 지목했고, 그래서 이 래칫이
 * `badgeClass` 와 **같은 PR 에서** 태어난다. 오늘 살아 있는 셋(Dialog ·
 * Checkbox · SegmentedControl)이 전부 그 방식으로 났다.
 *
 * ## 무엇을 세나
 *
 * `badgeClass` 를 거치지 않고 **기하(반경 + 인셋 또는 타입단)를 손으로 적은
 * `<span>`**. 세지 않는 것: 상태 점(글자 없는 원) · `shared/ui` 프리미티브 층 ·
 * 테스트.
 *
 * 색과 자간은 **세지 않는다** — 값 층이 일부러 안 덮는 축이라(다수파 없음)
 * 세면 영원히 갚을 수 없는 부채가 된다. 색 수렴은 자리별 디자인 판정이고
 * 다음 라운드의 일이다.
 */

const ROOT = process.cwd();

/**
 * **스캐너는 여기서 만들지 않는다** — `scripts/lib/static-surface-census.mjs`
 * 를 부른다. 장부와 게이트가 **같은 함수**로 세어야 「장부가 실측보다 후하다」
 * 는 양방향 검사가 뜻을 갖는다(2026-08-15 에 손으로 적은 장부가 네 번 틀린
 * 뒤 `/design-system-audit` 에 성문화한 규율).
 */

/**
 * **부채 장부** — 2026-08-15 이주(바이트 동일 17곳) 직후 실측. 파일별 상한이고
 * 늘면 빨개진다. 0이 되면 줄을 지운다.
 *
 * 갚는 순서는 `/design-system-audit` 의 수정 순서 그대로다: ① 기하가 이미
 * 같은 것(픽셀 0) → ② ±1px → ③ 디자인 판정이 필요한 것. 이번 PR 이 ①을
 * 끝냈고, 남은 것은 대부분 ②③이라 자리별 판정이 필요하다.
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
  ["src/widgets/topology-map-v2/ui/TopologyV2DetailPanel.tsx", 2],
  ["src/widgets/vault-agent-panel/ui/AgentLockedState.tsx", 1],
];

describe("정적 배지 채택 래칫", () => {
  const census = censusStaticSurfaces(ROOT);
  const found = census.badges;
  const ledger = new Map(DEBT);

  it("탐지기가 공회전하지 않는다 — 파일을 실제로 훑고 장부가 실재한다", () => {
    // 「걸린 파일이 0이 아니다」가 아니라 「훑은 파일이 충분하다」를 잠근다
    // (2026-08-03 label-decoration 판례: 공회전 방지의 대상을 틀리지 않는다).
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

  /* ── 상주 프로브 (/gate-probe) ── */
  it("프로브: 손 배지는 잡고 badgeClass 소비자·상태 점은 안 잡는다", () => {
    expect(isHandBadge('<span className="rounded-full px-2 py-0.5 text-caption"')).toBe(true);
    expect(isHandBadge('<span className="rounded-micro text-label"')).toBe(true);
    expect(isHandBadge('<span className={badgeClass({ shape: "pill" })}')).toBe(false);
    expect(isHandBadge('<span className="size-2 rounded-full bg-[color:var(--color-status-success)]"')).toBe(false);
    expect(isHandBadge('<span className="flex items-center gap-2"')).toBe(false);
  });
});
