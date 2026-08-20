/**
 * 앱 내 업데이트의 상태 기계 — UI 없이, 순수하게.
 *
 * 왜 분리하는가: 이 기능에서 실제로 틀리기 쉬운 것은 그리기가 아니라 **언제
 * 말을 거는가**다. 너무 자주 물으면 소음이고, 거절을 기억하지 못하면 무례하고,
 * 실패를 성공처럼 그리면 거짓말이 된다. 그 판단은 렌더링과 무관하므로 여기서
 * 검사 가능한 함수로 만든다.
 *
 * 이 표면의 성격 — **사용자가 부른 것이 아니라 앱이 꺼낸 말이다.** 그래서
 * 주목을 훔치지 않고, 거절이 쉽고, 거절을 기억한다. 이 앱의 절제 헌장이
 * 여기서도 그대로다: glow 도, 배지도, 흔들림도 없다.
 */

export type UpdatePhase =
  /** 아직 확인하지 않았거나 데스크톱 앱이 아니다. 아무것도 그리지 않는다. */
  | { kind: 'idle' }
  /** 확인 중. 이 단계는 **화면에 그리지 않는다** — 사용자가 부른 일이 아니다. */
  | { kind: 'checking' }
  /** 최신이다. 사용자가 직접 확인을 눌렀을 때만 보인다. */
  | { kind: 'current' }
  /** 새 버전이 있다. 여기서 처음으로 말을 건다. */
  | { kind: 'available'; version: string; notes: string | null }
  /** 내려받는 중. 진행률을 아는 만큼만 말한다. */
  | { kind: 'downloading'; version: string; received: number; total: number | null }
  /** 설치까지 끝났다. 남은 것은 재시작뿐이다. */
  | { kind: 'ready'; version: string }
  /** 실패. 무엇이 실패했는지 말하고, 손으로 받을 길을 남긴다. */
  | { kind: 'failed'; message: string };

/** 하루에 한 번. 앱을 자주 켜는 사람에게 매번 묻지 않기 위해서다. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** 거절은 그 버전에 한해 기억한다 — 다음 버전에는 다시 물어야 한다. */
export const DISMISSED_VERSION_KEY = 'app-update:dismissed-version';
export const LAST_CHECK_KEY = 'app-update:last-check';

export interface CheckPolicyInput {
  readonly isDesktop: boolean;
  readonly now: number;
  readonly lastCheckedAt: number | null;
  /** 사용자가 설정에서 직접 눌렀는가. 그렇다면 간격은 무시한다. */
  readonly manual?: boolean;
}

/**
 * 지금 확인해도 되는가.
 *
 * 웹에서는 **영원히 아니다** — 브라우저 탭은 자기를 교체할 수 없고, 거기서
 * 업데이트를 말하는 것은 할 수 없는 일을 제안하는 것이다.
 */
export function shouldCheckForUpdate({
  isDesktop,
  now,
  lastCheckedAt,
  manual = false,
}: CheckPolicyInput): boolean {
  if (!isDesktop) return false;
  if (manual) return true;
  if (lastCheckedAt === null) return true;
  // 시계가 뒤로 간 경우(시간대 변경·수동 조정)도 확인 대상이다. 음수 경과를
  // 그대로 두면 다음 확인이 영영 오지 않는다.
  const elapsed = now - lastCheckedAt;
  return elapsed < 0 || elapsed >= CHECK_INTERVAL_MS;
}

/**
 * 이 버전을 사용자에게 보여도 되는가.
 *
 * 같은 버전을 이미 거절했다면 다시 꺼내지 않는다. 거절은 "지금 말고" 이지
 * "영원히 말고" 가 아니므로, **버전이 올라가면 기억은 만료된다.**
 */
export function shouldSurfaceVersion(version: string, dismissedVersion: string | null): boolean {
  if (!version) return false;
  return version !== dismissedVersion;
}

/**
 * 진행률 문구는 **`shared/lib` 로 내려갔다** — 에이전트 도구 설치도 같은 규율이
 * 필요해졌고, 같은 층의 두 기능이 같은 판단을 하면 한 단 아래가 그 자리다.
 * 여기서 다시 내보내는 것은 이 모듈을 부르던 곳을 그대로 두기 위해서다.
 */
export { formatDownloadProgress } from '@/shared/lib/progress-format';

/** 릴리스 노트는 한 문단이면 충분하다. 팝오버가 읽을거리가 되면 아무도 안 읽는다. */
export function summarizeNotes(notes: string | null | undefined, maxChars = 220): string | null {
  if (!notes) return null;
  const firstBlock = notes.trim().split(/\n{2,}/)[0]?.replace(/\s+/g, ' ').trim();
  if (!firstBlock) return null;
  if (firstBlock.length <= maxChars) return firstBlock;
  return `${firstBlock.slice(0, maxChars - 1).trimEnd()}…`;
}
