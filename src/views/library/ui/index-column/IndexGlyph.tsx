import type { ReactNode } from "react";

/**
 * 16px wide with the mark centred, so a 12px icon, a 6px dot or no mark leaves the words on one
 * start line. The slot is not `aria-hidden`; the mark inside carries its own.
 */
export function IndexGlyph({ children }: { children?: ReactNode }) {
  return <span className="flex w-4 flex-none items-center justify-center">{children}</span>;
}
