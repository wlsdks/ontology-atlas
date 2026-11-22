/**
 * JS mirror of the `--icon-*` ramp in `app/globals.css`, because a lucide `size={N}` prop
 * cannot read a CSS `var()`.
 * Choose by the type beside the icon: sm next to label or body, md next to body-lg, lg next to
 * title or standalone. Chrome and rail icons and the `data-kind-glyph` marker have their own
 * contracts (docs/DESIGN-SYSTEM.md). A token nobody uses is wrong information
 * (`.claude/rules/design.md`), so every lucide size prop reads this constant.
 */
export const ICON_SIZE = {
  /** `--icon-sm`, the default. */
  sm: 12,
  md: 14,
  lg: 16,
} as const;

