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
  /** 비-허브 노드 테두리. 다크: 회청 30%, 라이트: 진회 50% (cycle 47) */
  nodeBorder: string;
  /** 허브 노드 테두리. 다크: 인디고 55%, 라이트: 인디고 92% */
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
  /**
   * R+ (cycle 47) — DOMAIN_TONE 의 fill 알파 multiplier 와 base shift.
   * 다크에선 1 (변경 없음). 라이트에선 흰 캔버스 위에서 pale 한 watercolor
   * 톤이 \"먼지\" 처럼 보이는 문제 해결 — base lightness 를 감산해 graphite
   * 톤으로 시프트. resolveLeafFill() 가 DOMAIN_TONE rgba 를 받아 변환.
   */
  leafFillSaturate: number;
  /** R+ ontology 노드 (capability/element) 의 default fill. */
  ontologyFill: string;
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
  leafFillSaturate: 1,
  ontologyFill: 'rgba(160, 168, 184, 0.55)',
};

const LIGHT: TopologyPalette = {
  // R+ (cycle 47): 사용자 피드백 \"화이트모드 토폴로지가 징그럽고 벌레같다\".
  // 원인 분석 — 이전 nodeBorder 0.78 알파가 leaf 노드의 옅은 fill 을 압도해
  // 모든 leaf 가 \"링/구멍\" 으로 읽혀 spider-web 효과. Obsidian/Logseq
  // 패턴: solid filled circle 우세 + 매우 가는 hairline border + edge 알파
  // 낮춤 으로 깔끔한 \"성좌\" 느낌. 흰 캔버스 한정으로 dramatic 하향:
  //   nodeBorder 0.78 → 0.28 (border 는 hairline 만, fill 이 dominant)
  //   edge 0.70 → 0.42 (dense graph 에서 spider-web 노이즈 제거)
  //   edgeContains 0.72 → 0.32 (계층 edge 는 더 배경으로 — 시각 hierarchy)
  //   hubOuterHalo 0.22 → 0.34 (hub 는 \"별\" 처럼 더 강한 글로우)
  // 1st 시도: nodeBorder 0.28 → 노드 자체가 사라짐. 2nd 시도: 균형 — border
  // 는 hairline-but-visible (0.5), fill 은 saturate (DOMAIN_TONE 자체는
  // 그대로 두고 default leaf 만 진한 graphite 톤). 결과: 흰 배경 위에서
  // \"solid filled circle with subtle outline\" — Obsidian/Logseq 톤.
  nodeBorder: 'rgba(40, 50, 72, 0.5)',
  hubBorder: 'rgba(60, 76, 200, 0.92)',
  hubOuterHalo: 'rgba(70, 86, 200, 0.32)',
  edge: 'rgba(40, 50, 72, 0.38)',
  edgeContains: 'rgba(40, 50, 72, 0.28)',
  edgeDependsOn: 'rgba(60, 76, 200, 0.58)',
  // dim 은 \"거의 안 보임\" 의미 유지.
  edgeDim: 'rgba(20, 30, 50, 0.06)',
  labelText: 'rgba(20, 22, 26, 0.95)',
  // saturate=1.7: DOMAIN_TONE 의 pale rgb (160-200) 를 60-90 graphite 까지
  // 끌어내려 흰 배경에서 \"실재하는 dot\" 으로 읽힘. ontology 노드도 동일.
  leafFillSaturate: 1.7,
  ontologyFill: 'rgba(70, 84, 110, 0.85)',
};

/**
 * DOMAIN_TONE 의 pale rgba 를 light 모드 graphite 으로 시프트.
 * \`rgba(R, G, B, A)\` 입력. saturate factor 만큼 base lightness 를 감산.
 */
export function applyLeafFillSaturate(rgba: string, saturate: number): string {
  if (saturate === 1) return rgba;
  const m = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (!m) return rgba;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  const a = m[4] !== undefined ? Number(m[4]) : 1;
  // saturate > 1 이면 darker shift. 단순 multiplicative 로 luminance 감소.
  // 채도 보존을 위해 rgb 를 같은 factor 로 나눔. clamp 0~255.
  const f = saturate;
  const dr = Math.max(0, Math.round(r / f));
  const dg = Math.max(0, Math.round(g / f));
  const db = Math.max(0, Math.round(b / f));
  return `rgba(${dr}, ${dg}, ${db}, ${a})`;
}

export function resolveTopologyPalette(): TopologyPalette {
  if (typeof document === 'undefined') return DARK;
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'light' ? LIGHT : DARK;
}

export function getTopologyPalette(theme: 'light' | 'dark' | null | undefined): TopologyPalette {
  return theme === 'light' ? LIGHT : DARK;
}
