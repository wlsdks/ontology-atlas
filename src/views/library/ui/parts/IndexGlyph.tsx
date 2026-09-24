import type { ReactNode } from "react";

/**
 * **The index column's one glyph slot** (design sweep, 2026-09-25).
 *
 * 16px wide with the mark centred in it, so a 12px icon, a 6px dot or no mark at all leaves
 * the words after it on the same line. Every door, row and card in the Library's index
 * puts its leading mark here; that is what makes the column read as one start line for
 * text instead of four (`LibrarySection`, `INDEX_ROW_INSET`).
 *
 * The slot itself is not hidden from assistive technology: the mark inside it carries its
 * own `aria-hidden`, and a probe that looks for a row's first hidden decoration (the report
 * row's selection edge) must not find an empty wrapper first.
 */
export function IndexGlyph({ children }: { children?: ReactNode }) {
  return <span className="flex w-4 flex-none items-center justify-center">{children}</span>;
}
