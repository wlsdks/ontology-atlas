/**
 * 「무엇을 물어봐야 하지」에 대한 답 — **이 폴더의 지금 상태에서** 뽑는다.
 *
 * ## 왜 (2026-08-17 소유자 지시)
 *
 * 대화창을 열면 빈 입력칸 하나가 있다. 에이전트를 붙여 놓고도 무엇을 시킬지
 * 모르면 그 연결은 없는 것과 같다.
 *
 * 그런데 흔한 답 — 예시 문장 세 개를 박아 두는 것 — 은 추천이 아니라 장식이다.
 * *"무엇이든 물어보세요"* · *"코드를 설명해줘"* 는 어느 앱에나 붙일 수 있고,
 * 그래서 아무 값도 없다. 게다가 사용자가 눌러 보면 자기 폴더와 상관없는 답이
 * 나와서, 추천을 한 번 더 믿지 않게 된다.
 *
 * 그래서 규칙 하나: **지금 볼트에서 실제로 관측된 사실이 있을 때만 그 사실에
 * 대한 추천이 나온다.** 끊긴 덩어리가 없으면 「이어줘」는 아예 안 나온다.
 * 재료는 이미 계산돼 있다 (`computeVaultHealth` 의 `islands` ·
 * `missingContainment`) — 지도와 분석 화면이 쓰는 그 값 그대로다.
 *
 * ## 왜 문장이 아니라 열쇠와 값을 돌려주나
 *
 * 이 함수는 순수하게 두고 번역은 화면이 한다. 문장을 여기서 만들면 로케일이
 * 둘인 이 저장소에서 한국어만 나오거나, 번역 파일과 이 파일이 갈라진다.
 */

/** 한 번에 보여 주는 개수. 고를 것이 많으면 사람은 고르지 않는다(Hick). */
export const SUGGESTION_LIMIT = 3;

export type SuggestionKind =
  /** starter vault has a project but no source binding — connect before analysis */
  | 'connectSource'
  /** 볼트가 비어 있다 — 고칠 것이 없으니 만들 것을 권한다 */
  | 'bootstrap'
  /** 지도에서 따로 떨어진 덩어리가 있다 */
  | 'island'
  /** 노드는 도메인을 가리키는데 도메인이 되받지 않는다 */
  | 'containment'
  /** 코드 근거(`path:`)가 없는 역량이 있다 */
  | 'evidence'
  /** 늘 있는 하나 — 지도만 보고 이 폴더를 설명하게 한다 */
  | 'explain';

export interface ChatSuggestion {
  kind: SuggestionKind;
  /** 화면이 `t(...)` 에 그대로 넘기는 값들. 실제 슬러그·개수가 들어간다. */
  params: Record<string, string | number>;
}

export interface SuggestionInput {
  nodeCount: number;
  /** 주 덩어리 밖으로 떨어진 그룹들 (`VaultHealthResult.islands`) */
  islands: readonly (readonly string[])[];
  missingContainment: readonly { slug: string; domain: string }[];
  /** `path:` 가 비어 있는 역량 슬러그 */
  unevidenced: readonly string[];
  sourceState?: 'loading' | 'unbound' | 'bound' | 'unavailable' | 'no-projects';
}

/**
 * 볼트가 「아직 시작 전」인 경계. `init` 이 심는 시작 노드가 다섯이라,
 * 그보다 적거나 같으면 아직 아무도 이 지도를 짓지 않은 것이다.
 */
const STARTER_NODE_CEILING = 5;

export function chatSuggestions(input: SuggestionInput): ChatSuggestion[] {
  // 아직 지을 것이 없는 볼트에 「고쳐라」를 권하면 없는 문제를 만들어 낸다.
  if (input.nodeCount <= STARTER_NODE_CEILING) {
    if (input.sourceState === 'unbound') {
      return [{ kind: 'connectSource', params: { count: input.nodeCount } }];
    }
    if (
      input.sourceState === 'loading'
      || input.sourceState === 'unavailable'
      || input.sourceState === 'no-projects'
    ) {
      return [];
    }
    return [{ kind: 'bootstrap', params: { count: input.nodeCount } }];
  }

  const out: ChatSuggestion[] = [];

  // 손이 가는 것부터 — 고칠 대상이 이름으로 있는 것이 가장 앞이다.
  const biggestIsland = input.islands[0];
  if (biggestIsland && biggestIsland.length > 0) {
    out.push({
      kind: 'island',
      params: { first: biggestIsland[0], count: biggestIsland.length },
    });
  }

  const gap = input.missingContainment[0];
  if (gap) {
    out.push({ kind: 'containment', params: { slug: gap.slug, domain: gap.domain } });
  }

  if (input.unevidenced.length > 0) {
    out.push({
      kind: 'evidence',
      params: { first: input.unevidenced[0], count: input.unevidenced.length },
    });
  }

  // 늘 하나는 남긴다 — 아무 문제가 없다고 빈손으로 두면 그때가 정확히
  // 「무엇을 물어보지」가 다시 생기는 순간이다.
  out.push({ kind: 'explain', params: { count: input.nodeCount } });

  return out.slice(0, SUGGESTION_LIMIT);
}
