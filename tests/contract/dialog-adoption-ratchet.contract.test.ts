import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Dialog 채택 래칫 — **프리미티브 밖의 `role="dialog"` 는 장부를 넘지 못한다.**
 *
 * ## 왜 (2026-08-15 「체계」석 비준, docs/DECISIONS.md)
 *
 * `role="dialog"` 26곳/23파일이 모달성을 각자 조립하고 있었다 — 스크림 토큰
 * 5갈래 · 폭 하드코딩 8종 · aria-modal 선언 대비 트랩 실재 8/20 · 스크림도
 * 트랩도 없는 aria-modal(2곳). 그 답이 `src/shared/ui/dialog.tsx` 다. 이
 * 래칫은 **새 파일이 첫날부터 프리미티브를 쓰게** 만들고, 기존 부채는 줄기만
 * 하게 붙든다.
 *
 * ## 왜 lint 가 아니라 계약 테스트인가
 *
 * 판정이 「저장소 전체의 개수」라 파일 하나의 AST 셀렉터로는 셀 수 없다 —
 * design.md 「lint 가 못 보는 층」의 래칫 행 그대로다. 그리고 손으로 적은
 * 파일 목록을 걷는 것이 아니라 **src/ 전수를 워킹**한다 — 손 목록은
 * surface-motion-ratchet 이 빈 목록 위에서 초록이던 사고의 재발 경로다.
 *
 * ## 스캐너의 사정거리
 *
 * - 주석은 지우고 센다(아이콘 래칫이 산문 주석을 값으로 세던 결함의 회피).
 * - `[role="dialog"]` 처럼 **셀렉터 문자열 안**의 것은 마크업이 아니다 —
 *   여닫는 표면이 아니라 그것을 찾는 코드다(route-focus-manager).
 * - `src/shared/ui/dialog.tsx` 자신은 정본이라 제외한다.
 */

const ROOT = process.cwd();
const PRIMITIVE = "src/shared/ui/dialog.tsx";

/** 주석 제거 — 줄 수 보존. (블록 주석 가운데 줄을 코드로 세던 계보의 회피.) */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** 셀렉터 문자열(`[role="dialog"]`)이 아닌 **마크업** role="dialog" 만 센다. */
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
 * **등재** — 원리적으로 포털 프리미티브로 못 옮기는 자리. 부채가 아니라
 * 근거를 가진 예외이고, 늘리려면 이 diff 에 「왜」를 적어야 한다.
 */
const REGISTERED: ReadonlyArray<readonly [file: string, count: number, why: string]> = [
  [
    "src/views/home/ui/HomePage.tsx",
    3,
    "지도 컴포저 — --z-map-scrim(25) 층·지도 좌표계 내부에 산다. body 포털(--z-dialog 60)로 올리면 지도 위 다른 크롬과의 층 계약이 깨진다.",
  ],
  [
    "src/views/ontology-studio/ui/StudioDeltaPreview.tsx",
    1,
    "나침 무대 내부 absolute 스태킹 — 무대 좌표계 안에서만 유효한 지역 표면이라 화면 기준 포털이 아니다.",
  ],
];

/**
 * **부채** — 갚을 대상. 수가 늘면 빨개지고 0 이 되면 줄을 지운다. 상환
 * 우선순위(체계석 처방): ProjectDrawer(유일한 현행 modal-without-modality)
 * → backdrop-medium 7파일(스크림 수렴 = 위계석 승인 후) → 팔레트 3
 * (`variant="palette"` 등재와 함께).
 *
 * 2026-08-15 창립 census: 26곳/23파일 중 첫 소비자 3파일(NewDocKindDialog ·
 * StudioMaterializeDialog · StudioPracticeCleanup)이 같은 PR 에서 이주해
 * 남은 부채가 아래 17파일/17곳이다(+ 스캐너 시야 밖 Radix 1).
 */
/*
 * GlobalSearch 는 여기 없다 — 모달성이 Radix 합성이라 `role="dialog"` 마크업
 * 문자열이 소스에 없고, 이 스캐너의 시야 밖이다(과소 계상 방향). 그 부채는
 * `variant="palette"` 등재 라운드에서 이주로 갚는다.
 */
const DEBT: ReadonlyArray<readonly [file: string, count: number]> = [
  ["src/features/guided-tour/ui/GuidedTourCard.tsx", 1],
  ["src/features/docs-vault-local/ui/VaultOpenGuideSheet.tsx", 1],
  ["src/features/project-quick-edit/ui/ProjectQuickEditPanel.tsx", 1],
  ["src/features/ontology-blocks/ui/BlockImportModule.tsx", 1],
  ["src/features/vault-ontology/ui/RecentChangesNeedsVaultDialog.tsx", 1],
  ["src/features/vault-ontology/ui/LiveActivityIndicator.tsx", 1],
  ["src/views/docs-vault/ui/parts/DocsVaultAuditModal.tsx", 1],
  ["src/views/ontology-studio/ui/StudioEntryChoice.tsx", 1],
  ["src/views/ontology-studio/ui/StudioCompass.tsx", 1],
  ["src/widgets/topology-map-v2/ui/TopologyV2EdgePanel.tsx", 1],
  ["src/widgets/docs-quick-drawer/ui/DocsQuickDrawer.tsx", 1],
  // 2026-08-21 — 그 시트는 은퇴했다(원장 90 · 붙이는 일이 목적지가 됐다).
  // 회수분은 장부에서 지운다: 실재하지 않는 파일을 들고 있으면 「감소」가
  // 이사·개명만으로도 성립해 래칫이 헐거워진다.
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
    // 정본이 사라지면(이름 변경 등) 이 래칫 전체가 대상을 잃는다.
    const primitive = readFileSync(path.join(ROOT, PRIMITIVE), "utf8");
    expect(countDialogMarkup(primitive), "프리미티브에서 role=dialog 마크업을 못 찾았다").toBeGreaterThan(0);
    // 부채 장부가 실재하지 않는 파일을 들고 있으면 「감소」가 이사·개명으로도 성립한다.
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
   * ── 상주 프로브 — 탐지기 자신이 살아 있는지 (/gate-probe: 통과는 증거가 아니다).
   */
  it("프로브: 마크업은 잡히고, 셀렉터 문자열과 주석은 잡히지 않는다", () => {
    expect(countDialogMarkup('<div role="dialog" aria-modal="true" />')).toBe(1);
    expect(countDialogMarkup("document.querySelector('[role=\"dialog\"]')")).toBe(0);
    expect(countDialogMarkup('// role="dialog" 를 설명하는 주석\nconst a = 1;')).toBe(0);
    expect(countDialogMarkup('/* role="dialog" */\nconst a = 1;')).toBe(0);
    expect(countDialogMarkup('<div role="dialog" /><div role="dialog" />')).toBe(2);
  });
});
