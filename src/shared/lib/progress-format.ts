/**
 * 진행률 문구 — **모르는 것을 아는 척하지 않는다.**
 *
 * ## 왜 shared 에 있나
 *
 * 이 규율이 필요한 자리가 둘이 됐다: 앱 갱신 내려받기(`features/app-update`)와
 * 에이전트 도구 설치(`features/acp-doctor`). 같은 층의 두 기능이 같은 판단을
 * 해야 하면 한 단 아래로 내린다(`.claude/rules/architecture.md`) — 사본을 두면
 * 어느 날 한쪽만 「총량을 모를 때 0%」를 그리기 시작한다.
 */

/**
 * 받은 양을 퍼센트 문구로. **총량을 모르면 `null`** — 가짜 퍼센트를 그리지
 * 않는다. 이 저장소의 로딩 표면이 전부 따르는 규율이다.
 *
 * 분모가 0 이하인 경우도 「모른다」로 친다. 0 으로 나눈 값을 화면에 올리면
 * 진행률이 아니라 나눗셈 사고가 그려진다.
 */
export function formatDownloadProgress(received: number, total: number | null): string | null {
  if (total === null || total <= 0) return null;
  const percent = Math.min(100, Math.max(0, Math.round((received / total) * 100)));
  return `${percent}%`;
}
