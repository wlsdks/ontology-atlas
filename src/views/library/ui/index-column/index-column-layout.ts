/** Opens an index chip's explanation into the reader beside the column, wrapped to a short paragraph. */
export const INDEX_CHIP_TIP = {
  side: "right",
  align: "start",
  panelClassName: "max-w-[min(20rem,calc(100vw-2rem))] [word-break:keep-all]",
} as const;

/** Boxes stand on the column's `px-3` edge. */
export const INDEX_LIST_INSET = "px-3";
/** Content starts after the same 1px edge, 10px pad and 16px glyph slot (`IndexGlyph`) as every control. */
export const INDEX_ROW_INSET = "gap-1.5 border border-transparent px-2.5 py-1.5";
/** A quiet door on the row text line, on the 28px step under a 32px primary. */
export const INDEX_QUIET_INSET = "gap-1.5 border border-transparent px-2.5 py-0.5";
/** A caption with no glyph of its own still starts on the text line: an empty `IndexGlyph` leads it. */
export const INDEX_TEXT_LINE = "flex gap-1.5 border-x border-transparent px-2.5";
