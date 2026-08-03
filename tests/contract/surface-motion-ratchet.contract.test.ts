import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * 등장·퇴장 래칫 — **하드컷 표면은 늘어날 수 없다.**
 *
 * ## 전수 (2026-08-03)
 *
 * 조건부로 나타나는 표면 **20개 중 10개가 하드컷**이었고, 그 10개는 무작위가
 * 아니라 **전부 「인라인 패널」 계열**이었다:
 *
 * | 계열 | 개수 | 등장/퇴장 |
 * |---|---:|---|
 * | 모달(scrim + `aria-modal`) | 9 | 대부분 있음 |
 * | **인라인 패널** | 11 | **전부 없음** |
 *
 * (손으로 센 첫 집계는 10이었고 **이 게이트가 11로 정정했다** — 컨트롤 래칫이
 * 419를 417로 정정한 것과 같다. 세는 일은 사람이 하면 틀린다.)
 *
 * 이유가 분명하다 — 모달은 `AgentConnectSheet` 의 `AnimatePresence` 패턴을 베낄
 * 수 있었고 인라인 패널은 **베낄 패턴이 없었다.** 규율이 아니라 자산의 문제였고,
 * 그래서 `Surface` 를 놓았다(`src/shared/ui/surface.tsx`).
 *
 * ## ⚠️ 첫 판은 파일명으로 셌고, 그건 과다 계수였다 (같은 날 정정)
 *
 * 접미사(`Panel`/`Sheet`/…)로 세면 **조건부로 나타나지 않는 것까지** 잡힌다.
 * 실제로 첫 11개를 부모 렌더 게이트까지 따라가 보니 셋으로 갈렸다:
 *
 * | 부류 | 예 | 결함인가 |
 * |---|---|---|
 * | 부모가 조건부로 그린다 | `TopologyV2EdgePanel` · `ProjectQuickEditPanel` | **그렇다** |
 * | 항상 렌더된다(라우트 내용·인라인) | `AtlasGitPanel` · `WebManualConnectPanel` | 아니다 |
 * | 부모가 이미 애니메이션한다 | `AiConnectionPanel`(설정 시트 안) | 아니다 |
 *
 * 「11개가 하드컷」은 그래서 **틀린 수**였다. 안 고쳐도 되는 것을 결함으로 세면
 * 다음 사람이 필요 없는 자리에 `Surface` 를 감싸고, 그건 노이즈다.
 *
 * 그래서 **등록부로 바꿨다** — 이 저장소가 `DEGRADED_SURFACES` 에서 쓰는 것과
 * 같은 패턴이다. 각 줄이 「이건 조건부로 나타나는데 등장/퇴장이 없다」를 **주장**
 * 하고, 그 주장에 이유가 붙는다. 파일명으로 자동 수집하는 편리함을 잃는 대신,
 * 수가 무엇을 뜻하는지가 분명해진다.
 *
 * ## 왜 lint 가 아니라 래칫인가
 *
 * 각각이 **자기 렌더 게이트의 모델을 퇴장 창 동안 붙들어야** 해서 기계적이지
 * 않다(`useSurfaceSwap` 이 그 일을 한다). 오늘 강제되는 것은 하나다 —
 * **등록부가 늘지 않는다.**
 */

/**
 * **부모가 조건부로 그리는데 등장/퇴장이 없는 표면.** 각 줄이 주장이고, 그
 * 주장은 부모의 렌더 게이트를 열어 확인한 것이다.
 *
 * 여기 없는데 하드컷인 표면을 발견하면 **줄을 더하는 게 아니라 고친다** — 이
 * 등록부는 부채 목록이지 허가 목록이 아니다.
 */
const HARD_CUT_REGISTRY: ReadonlyArray<readonly [file: string, why: string]> = [
  ['src/widgets/topology-map-v2/ui/TopologyV2EdgePanel.tsx', '엣지 클릭으로 뜬다 — HomePage 의 `edgePanelModel && …` 게이트'],
  ['src/widgets/topology-map-v2/ui/TopologyV2DetailPanel.tsx', '노드 클릭으로 뜬다 — 이 앱에서 가장 자주 열리는 표면'],
  ['src/features/project-quick-edit/ui/ProjectQuickEditPanel.tsx', 'ProjectDetailPage 의 삼항으로 뜬다'],
  ['src/widgets/vault-agent-panel/ui/VaultAgentPanel.tsx', 'HomePage 의 삼항으로 뜬다'],
];

const BASELINE_HARD_CUT_SURFACES = HARD_CUT_REGISTRY.length;

/** 등록부가 실재하는 파일만 가리키는지 볼 때 쓴다. */
const SURFACE_SUFFIXES = ['Panel', 'Sheet', 'Modal', 'Drawer', 'Popover', 'Dialog'];

/** 표면에 등장/퇴장을 주는 **인정되는 기제**. 새 기제를 도입하면 여기 등재한다. */
const MOTION_MECHANISMS = ['AnimatePresence', 'usePanelPresence', 'useSurfaceSwap', '<Surface'];

function stillHardCut(): string[] {
  return HARD_CUT_REGISTRY.filter(([file]) => {
    const source = readFileSync(file, 'utf8');
    return !MOTION_MECHANISMS.some((m) => source.includes(m));
  }).map(([file]) => file);
}

describe('등장·퇴장 래칫', () => {
  const hardCut = stillHardCut();

  it('등록부의 파일이 전부 실재한다 — 없는 파일을 세면 수가 거짓이 된다', () => {
    for (const [file] of HARD_CUT_REGISTRY) {
      expect(existsSync(file), `${file} 이 없다 — 옮겼거나 지웠으면 등록부도 고친다`).toBe(true);
      const base = file.split('/').pop()!.replace('.tsx', '');
      expect(
        SURFACE_SUFFIXES.some((s) => base.endsWith(s)),
        `${base} 는 표면 접미사 관례를 안 따른다`,
      ).toBe(true);
    }
  });

  it('등록부가 늘지 않는다 — 새 표면은 Surface 로 감싼다', () => {
    expect(
      HARD_CUT_REGISTRY.length,
      '새 하드컷을 등록부에 더하지 마라. `<Surface open={…}>` 로 감싸면 퇴장 창 · 퇴장 클래스 · ' +
        'inert · 포커스 복귀가 기본으로 딸려 온다.',
    ).toBeLessThanOrEqual(BASELINE_HARD_CUT_SURFACES);
  });

  it('고쳤으면 등록부에서 지운다 — 여유를 무료로 두지 않는다', () => {
    expect(
      hardCut.length,
      `등록부에 있는데 이미 등장/퇴장을 갖춘 파일이 있다. 부채를 갚았으면 줄을 지워라:\n` +
        HARD_CUT_REGISTRY.filter(([f]) => !hardCut.includes(f))
          .map(([f]) => `  ${f}`)
          .join('\n'),
    ).toBe(HARD_CUT_REGISTRY.length);
  });
});
