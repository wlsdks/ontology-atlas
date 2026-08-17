/**
 * 첫 걸음 카드를 **거둔 상태** — 세션 단위.
 *
 * `localStorage` 를 안 쓰는 이유는 옆 카드(`first-run-starter`)와 같다:
 * 「나중에 할게요」는 지금 안 보겠다는 뜻이지 **다시는 안 보겠다**는 뜻이 아니다.
 * 앱을 새로 열면 다시 첫 걸음을 안내하는 편이 맞다 — 그때도 마지막 걸음을
 * 지나면 다시 거둬진다.
 *
 * 읽고 쓰는 함수는 그 카드가 이미 가진 것을 그대로 쓴다(키만 다르다) — 같은
 * 정책을 두 번 구현하면 한쪽만 고쳐지는 날이 온다.
 */
export const VAULT_START_STEPS_DISMISSED_KEY = 'demo:vault-start-steps-dismissed:v1';
