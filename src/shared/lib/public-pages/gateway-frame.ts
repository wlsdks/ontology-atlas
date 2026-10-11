/**
 * The two frame pieces every gateway surface shares: the origin padding and the single column.
 * They live in `shared` so gateway views do not import each other; the x origin is
 * `--gateway-origin`.
 */

/**
 * The origin padding. **Because it is `px-`, both sides** take the origin, and
 * that is the whole of the left/right symmetry.
 *
 * Below `md` this token does not govern — `max(1.5rem, safe-area)` does, because
 * a 200px gutter starves the content at narrow widths.
 */
export const PAGE_GUTTER =
  'px-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] md:px-[var(--gateway-origin)]';

/**
 * The one column inside the origin, pinned left, capped at `--gateway-page-max`. With each side
 * padded by (vw-1920)/2 the column fills the rest, so no `mx-auto`. Gate:
 * `tests/contract/gateway-column-width.contract.test.ts`.
 */
export const PAGE_COLUMN = 'w-full max-w-[var(--gateway-page-max)]';
