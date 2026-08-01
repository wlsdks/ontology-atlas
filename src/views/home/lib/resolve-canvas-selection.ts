/**
 * **지도에 실제로 포커스를 줄 슬러그** — 주소가 가리키는 것이 이 볼트에
 * 실재할 때만.
 *
 * ## 왜 이 함수가 생겼나 (2026-08-01)
 *
 * 예전엔 `selectedProject?.slug ?? selectedOntologyNode?.id ?? selectedSlug`
 * 였다. 마지막 `?? selectedSlug` 가 **아무것도 가리키지 않는 이름**을 그대로
 * 캔버스에 내려보냈고, 엔진의 ego 포커스는 `focusedNodeId !== null` 만 보고
 * 실재를 안 본다(`topology-physics-step.ts`). 그래서 볼트를 바꿔 낡은 `?p=`
 * 가 남으면:
 *
 * - 지도가 **통째로 흐려진다** — 이웃이 0인 노드에 포커스한 것과 같아서,
 *   화면 위의 모든 노드가 dim 밴드로 내려간다. 사용자에겐 "지도가 고장났다".
 * - 첫 방문 힌트가 **영구 소멸한다** — `hasSelection` 이 참이 되어
 *   `use-sample-node-hint` 가 학습 완료로 기록한다. 누른 적도 없는데.
 *
 * ## 규칙: 「없다」와 「아직 모른다」를 가른다
 *
 * 볼트가 아직 안 실린 동안 포커스를 걷어내면 딥링크가 깜빡인다. 그래서 이
 * 함수는 미해석을 **확정할 수 있을 때만** null 을 낸다 — 판정 문법은 미해석
 * 토스트(`deeplink-miss-notice.ts`)와 같다. kind 접두사가 있는 슬러그
 * (`element:foo`)는 프로젝트 슬러그와 절대 충돌하지 않으므로 프로젝트 목록을
 * 기다리지 않고, bare 슬러그는 프로젝트일 수도 있으니 기다린다.
 *
 * 순수 함수 — 판정만 하고 아무것도 안 바꾼다.
 */
export interface CanvasSelectionInput {
  /** 주소가 요청한 원본 값 (`?p=`). */
  selectedSlug: string | null;
  /** 프로젝트 또는 온톨로지 노드로 해석된 id. 해석 실패면 null. */
  resolvedSlug: string | null;
  /**
   * 볼트 복원과 현재 온톨로지 소스가 "없다"를 진단할 만큼 정착했는가.
   * 거짓이면 아직 정적 샘플이 로컬 그래프로 교체될 수 있다.
   */
  sourceReady: boolean;
  /** `useProjects().loaded`. */
  projectsLoaded: boolean;
  /** 온톨로지 그래프가 한 번이라도 도착했는가. */
  ontologyLoaded: boolean;
}

export function resolveCanvasSelectedSlug({
  selectedSlug,
  resolvedSlug,
  sourceReady,
  projectsLoaded,
  ontologyLoaded,
}: CanvasSelectionInput): string | null {
  if (resolvedSlug) return resolvedSlug;
  if (!selectedSlug) return null;
  // 아직 모른다 — 원본을 그대로 들고 있어 딥링크가 깜빡이지 않게 한다.
  if (!sourceReady || !ontologyLoaded) return selectedSlug;
  if (!selectedSlug.includes(":") && !projectsLoaded) return selectedSlug;
  // 없다가 확정됐다 — 유령을 선택된 것으로 취급하지 않는다.
  return null;
}
