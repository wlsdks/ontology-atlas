/**
 * 파일/폴더 선택창을 **취소한 것은 실패가 아니다**.
 *
 * 진입 검수 E-1b: 폴더 선택을 그냥 취소했는데 카드 안에 danger red 로
 * 「user aborted」(브라우저 원문 문자열)가 떴다. 취소는 사용자가 의도한 정상
 * 종료라 오류 표면을 만들 이유가 없다 — 선택창을 띄우기 직전 상태로 조용히
 * 돌아가야 한다.
 *
 * 호출자가 `err instanceof DOMException && err.name === 'AbortError'` 로
 * 직접 판정하면 두 가지 자리에서 새는데, 둘 다 실제로 존재한다:
 *
 * 1. **다른 realm 의 DOMException** — iframe·워커·확장이 던진 예외는
 *    `instanceof` 가 false 다(생성자가 다른 realm 소속).
 * 2. **DOMException 이 아닌 취소** — Tauri 커맨드는 `Err(String)` 을 문자열로
 *    reject 하고, 폴리필은 평범한 `Error` 를 던진다.
 *
 * 그래서 판정 기준을 "생성자"에서 **"이름/문구"** 로 내린다. 취소를 오류로
 * 잘못 분류하는 쪽이 오류를 취소로 잘못 분류하는 쪽보다 사용자에게 비싸다 —
 * 전자는 정상 조작에 빨간 경고를 띄우고, 후자는 조용히 원 상태로 돌아간다.
 */
const ABORT_NAME = 'AbortError';
/** 브라우저 원문 문구 — 이름이 소실된 경로(문자열 reject)를 위한 2차 판정. */
const ABORT_MESSAGE = /\buser\s+aborted\b/i;

export function isPickerAbort(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (typeof err === 'string') return ABORT_MESSAGE.test(err);
  const candidate = err as { name?: unknown; message?: unknown };
  if (candidate.name === ABORT_NAME) return true;
  return typeof candidate.message === 'string' && ABORT_MESSAGE.test(candidate.message);
}
