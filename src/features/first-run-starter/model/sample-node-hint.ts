/**
 * 샘플 모드 첫 방문의 1회성 "지도의 노드를 눌러보세요" 힌트 dismiss 정책 —
 * 순수 localStorage read/write 헬퍼.
 *
 * `first-run-starter-dismiss`(sessionStorage — "그냥 둘러볼게요"는 세션마다
 * 다시 뜨는 게 맞음)와 달리 **localStorage(영구)** 를 쓴다: 노드를 한 번
 * 눌러 "모든 것이 진짜 문서"라는 사실을 이미 체험한 사용자에게 이 힌트를
 * 매 방문 다시 보여주는 건 잔소리다(온보딩 디자이너 지적 — 첫 클릭 = 학습
 * 완료). 세션 힌트와 다른 축의 계약.
 */
export const SAMPLE_NODE_HINT_DISMISSED_KEY = 'demo:sample-node-hint-dismissed:v1';

export function readSampleNodeHintDismissed(
  key: string = SAMPLE_NODE_HINT_DISMISSED_KEY,
): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    // private mode 등 — 힌트가 다시 뜨는 것뿐, 안전한 폴백.
    return false;
  }
}

export function writeSampleNodeHintDismissed(
  key: string = SAMPLE_NODE_HINT_DISMISSED_KEY,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* private mode — skip */
  }
}
