import type { ScreenContextSnapshot } from './types';

/**
 * 화면 문맥 주입 — 이 에이전트의 가장 큰 우위.
 *
 * MCP 에이전트는 화면에 눈이 없다. 사용자가 "이거 정의 좀 고쳐줘" 라고 하면
 * "이거" 가 무엇인지 모른다. 앱 에이전트는 매 턴 **시스템 측에서** 지금 보고
 * 있는 것을 넣는다 — 모델이 도구로 부를 필요가 없으니 항상 신선하다.
 *
 * 지도 상태는 위젯이 prop 으로 내려준다. feature 가 widget 을 import 하면
 * FSD 방향 위반이다.
 */

export const EMPTY_SCREEN_CONTEXT: ScreenContextSnapshot = {
  focusedSlug: null,
  focusedTitle: null,
  focusedKind: null,
  lenses: [],
  projectTitle: null,
  visibleNodeCount: 0,
  recentChanges: [],
};

/**
 * 최근 변경 블록의 상한 — 줄 수와 줄 길이 둘 다. 이 블록은 매 왕복에
 * 실려 나가므로(사용자 비용 = BYOK 요금), 커밋 메시지가 길어질수록 조용히
 * 커지는 길을 여기서 막는다.
 */
export const RECENT_CHANGES_LINE_CAP = 5;
export const RECENT_CHANGES_CHAR_CAP = 120;

/** 모델에게 보낼 구조화 블록. 사용자 말풍선의 에코와 같은 사실을 말한다. */
export function formatScreenContextBlock(snapshot: ScreenContextSnapshot): string {
  const lines: string[] = [];
  if (snapshot.focusedSlug) {
    lines.push(
      `looking_at: ${snapshot.focusedSlug}${snapshot.focusedTitle ? ` (${snapshot.focusedTitle})` : ''}${snapshot.focusedKind ? ` · kind=${snapshot.focusedKind}` : ''}`,
    );
  } else {
    lines.push('looking_at: (no concept selected — the whole map is in view)');
  }
  if (snapshot.projectTitle) lines.push(`project_scope: ${snapshot.projectTitle}`);
  if (snapshot.lenses.length > 0) lines.push(`active_lenses: ${snapshot.lenses.join(', ')}`);
  lines.push(`concepts_on_screen: ${snapshot.visibleNodeCount}`);
  // 세션 사이의 이어짐 — 대화는 사라져도 볼트와 git 은 남는다. 없으면 줄
  // 자체를 넣지 않는다: 빈 목록을 보내면 모델이 "최근 변경 없음" 을 사실로
  // 읽는데, 실제로는 git 이 아닌 폴더일 수도 있다.
  const recent = (snapshot.recentChanges ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, RECENT_CHANGES_LINE_CAP)
    .map((entry) =>
      entry.length > RECENT_CHANGES_CHAR_CAP
        ? `${entry.slice(0, RECENT_CHANGES_CHAR_CAP - 1)}…`
        : entry,
    );
  if (recent.length > 0) {
    lines.push('recent_changes_in_this_folder (newest first, from git history):');
    for (const entry of recent) lines.push(`  - ${entry}`);
  }
  return `<screen_context>\n${lines.join('\n')}\n</screen_context>`;
}

/**
 * 사용자 말풍선에 그대로 붙는 에코 — "에이전트가 본 것" 이 항상 화면에
 * 남는다. 보내고 나서 다른 노드로 옮겨가면 어긋남이 보이고, 어긋남이 보이는
 * 것 자체가 수정 신호다.
 */
export function screenContextEcho(
  snapshot: ScreenContextSnapshot,
  labels: { lookingAt: (title: string) => string; wholeMap: string },
): string {
  if (!snapshot.focusedSlug) return labels.wholeMap;
  return labels.lookingAt(snapshot.focusedTitle ?? snapshot.focusedSlug);
}
