import type { SVGProps } from 'react';

/**
 * The X mark as a platform pointer, for the reasons in `github-mark.tsx`. One `currentColor`
 * (`.claude/rules/design.md`), and 14px so it stands level with the GitHub mark, which also
 * fills its 16 viewBox.
 */
const X_MARK_16 =
  'M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.6.75Zm-.86 13.028h1.36L4.323 2.145H2.865l8.875 11.633Z';

export interface XMarkProps
  extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox' | 'children'> {
  /** Square, in px. */
  size?: number;
}

export function XMark({ size = 14, ...rest }: XMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      focusable="false"
      {...rest}
    >
      <path data-mark-part="x" d={X_MARK_16} />
    </svg>
  );
}
