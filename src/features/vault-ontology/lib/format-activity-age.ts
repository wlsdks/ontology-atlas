/**
 * Formats an agent heartbeat's age (ms since `updatedAt`) as a compact
 * `"{n}s"` / `"{n}m"` / `"{n}h"` / `"{n}d"` string.
 *
 * Extracted from `ui/LiveActivityIndicator.tsx` (W6 agent visibility) so
 * `widgets/app-nav-rail`'s rail-tile title enhancement can reuse the exact
 * same "last activity" phrasing instead of re-deriving it — one formatting
 * rule, two surfaces (the popover's "업데이트: {age}" line and the rail
 * tile's hover title).
 */
export function formatActivityAge(ageMs: number): string {
  const safeAge = Math.max(0, ageMs);
  const seconds = Math.floor(safeAge / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
