/**
 * 토폴로지 색 팔레트 — 테마(light/dark)별 분기.
 *
 * Sigma 가 WebGL 로 노드/엣지 색을 그리니까 CSS 변수를 직접 못 쓴다.
 * 대신 `document.documentElement.dataset.theme` 을 읽어 RGBA 문자열 묶음을
 * 돌려준다. mount 시 / 토글 시 graph attr 재계산 + sigma.refresh.
 *
 * 다크 모드 색은 기존 hardcoded 값과 1:1 일치 — 라이트 모드만 새로 추가.
 *
 * 라이트 모드에서 배경이 거의 화이트라 다크용 옅은 알파 RGBA 가 사라져
 * "선이 안 보이는" 문제를 해결. 라이트는 배경 대비 어두운 톤 + 알파 ↑ 로
 * 가독성 확보.
 */

export interface TopologyPalette {
  /** 비-허브 노드 테두리. 다크: 회청 30%, 라이트: 진회 28% */
  nodeBorder: string;
  /** 허브 노드 테두리. 다크: 인디고 55%, 라이트: 인디고 70% */
  hubBorder: string;
  /** 허브 노드 외곽 halo. 선택 / hover 시 reducer 가 강화. */
  hubOuterHalo: string;
  /** 기본 엣지 색 (graph build 시 모든 엣지에 적용). */
  edge: string;
  /** `kind: contains` 엣지 — 계층 표현용 옅은 neutral. */
  edgeContains: string;
  /** `kind: depends-on` 엣지 — cross-project 의존 인디고 톤. */
  edgeDependsOn: string;
  /** 검색/depth/category 필터로 가려진 엣지. */
  edgeDim: string;
  /** 카드/툴팁 배경 톤 (텍스트 라벨이 sigma label 영역과 어울리게). */
  labelText: string;
}

const DARK: TopologyPalette = {
  nodeBorder: 'rgba(200, 210, 230, 0.3)',
  hubBorder: 'rgba(139, 151, 255, 0.55)',
  hubOuterHalo: 'rgba(139, 151, 255, 0.08)',
  edge: 'rgba(170, 185, 210, 0.08)',
  edgeContains: 'rgba(170, 185, 210, 0.10)',
  edgeDependsOn: 'rgba(139, 151, 255, 0.16)',
  edgeDim: 'rgba(255, 255, 255, 0.005)',
  labelText: 'rgba(235, 240, 250, 0.95)',
};

const LIGHT: TopologyPalette = {
  // off-white(#f7f8fa) 배경 위에서 의미 있게 보이게 한참 진한 톤 + 충분한 알파.
  nodeBorder: 'rgba(60, 72, 96, 0.6)',
  hubBorder: 'rgba(70, 86, 200, 0.85)',
  hubOuterHalo: 'rgba(70, 86, 200, 0.18)',
  // 다크는 0.08 인데 그건 검은 배경에서 작동. 라이트 흰 배경엔 0.55+ 필요.
  edge: 'rgba(60, 72, 96, 0.55)',
  edgeContains: 'rgba(60, 72, 96, 0.6)',
  edgeDependsOn: 'rgba(70, 86, 200, 0.7)',
  // dim 은 "거의 안 보임" 의미를 유지하되 흰 배경에서 노이즈 없게 어두운 톤 +
  // 낮은 알파.
  edgeDim: 'rgba(20, 30, 50, 0.06)',
  labelText: 'rgba(20, 22, 26, 0.95)',
};

export function resolveTopologyPalette(): TopologyPalette {
  if (typeof document === 'undefined') return DARK;
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'light' ? LIGHT : DARK;
}

export function getTopologyPalette(theme: 'light' | 'dark' | null | undefined): TopologyPalette {
  return theme === 'light' ? LIGHT : DARK;
}
