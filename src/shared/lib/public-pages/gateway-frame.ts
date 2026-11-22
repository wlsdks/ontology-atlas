/**
 * The two frame pieces every gateway surface shares: the origin padding and the single column.
 * They live in `shared` so gateway views do not import each other; the x origin is
 * `--gateway-origin`.
 */

/**
 * The origin padding: `px-` puts the origin on both sides, which is the whole left/right symmetry.
 * Below `md` `max(1.5rem, safe-area)` governs instead, since a 200px gutter starves narrow content.
 */
export const PAGE_GUTTER =
  'px-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] md:px-[var(--gateway-origin)]';

/**
 * The one column inside the origin, pinned left, capped at `--gateway-page-max`. With each side
 * padded by (vw-1920)/2 the column fills the rest, so no `mx-auto`.
 */
export const PAGE_COLUMN = 'w-full max-w-[var(--gateway-page-max)]';
