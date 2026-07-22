import type { NavRailContextHrefs } from "@/widgets/app-nav-rail";

/**
 * 과제 ⑪ — LNB 컨텍스트 이월. 지도에서 노드를 선택한 채 좌측 레일의 "문서함"
 * 항목으로 이동하면 선택과 무관한 `/docs/` 기본 화면이 뜨던 문제 — "보던 것"이
 * 표면 전환에서 유실됐다. 데이터시트가 이미 파생해 둔 선택 노드의
 * `documentHref`(vault 파일 경로 `?slug=` 딥링크, H5 계약 — 새 파라미터/변환
 * 발명 없음)를 레일의 `contextHrefs` 형태로 바꾸는 순수 함수.
 *
 * 선택이 없거나 선택 노드에 문서 딥링크가 없으면(=`documentHref` null) 그대로
 * null 을 낸다 — `useNavRailContextHrefs(null)` 은 레일을 기본 `/docs/`
 * href 로 되돌리므로, 시각/기본 동작 변화는 0.
 */
export function buildNavRailContextHrefs(
  documentHref: string | null,
): NavRailContextHrefs | null {
  return documentHref ? { docs: documentHref } : null;
}
