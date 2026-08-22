/**
 * 지도 옆 에이전트 도크 안의 실제 대화 표면.
 *
 * 바깥 flex 칸은 지도 폭을 양보하는 레이아웃 장치일 뿐이고, 사용자가 보는
 * 패널은 이 인셋 표면 하나다. INDEX·노드 데이터시트와 같은 radius / border /
 * surface / shadow 토큰을 써서 네 면이 모두 보이게 한다. `inset-y-3`·`right-3`
 * 은 spacing ramp의 12px 단계이고, 두 가로 여백의 합은 기존
 * `--chrome-inset`(24px)이라 소비자가 고정 콘텐츠 폭을 계산할 때 새 수를
 * 만들 필요가 없다.
 */
export const AGENT_DOCK_INSET_SURFACE_CLASS = [
  "absolute inset-y-3 right-3",
  "overflow-hidden rounded-[var(--topology-v2-panel-radius)]",
  "border border-[color:var(--topology-v2-panel-border)]",
  "bg-[color:var(--color-panel)] shadow-[var(--topology-v2-panel-shadow)]",
].join(" ");
