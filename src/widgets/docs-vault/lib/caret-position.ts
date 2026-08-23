/**
 * The caret's **screen coordinates inside a textarea** — the value that makes the
 * mention menu appear where the user was typing.
 *
 * ## Why it is needed (2026-08-08, owner report)
 *
 * The `@` mention menu appeared in the editor's **bottom-left corner**, because
 * the old wikilink popover was pinned there and this inherited the position. The
 * owner corrected it immediately — *"It should appear right where I was typing."* (it should appear
 * right where I was typing). That is right, and there is a reason: the mention
 * menu is **an extension of the character being typed**, so away from where the
 * eyes are it does not read as the result of what was just done.
 *
 * ## How it is measured — the mirror technique
 *
 * A `textarea` has no API for caret coordinates. So an invisible `div` with **the
 * same font, width and padding** is built, the text up to the caret is put into
 * it, and a marker `span` at the end is read for its position. The browser does
 * the line-breaking for us, so we never imitate line-break rules — imitating them
 * inevitably diverges on Hangul line breaks, tabs and long words.
 *
 * That is also why so many properties have to be copied. Miss one and the mirror's
 * line-breaking differs from the original, and the coordinates then point not
 * slightly off but **at a different line**.
 */

/** Properties that must be copied for the mirror to have the same shape as the original. */
const MIRRORED_PROPERTIES = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',
  'tabSize',
] as const;

export interface CaretPoint {
  /** Relative to the textarea's padding box — scroll already subtracted. */
  top: number;
  left: number;
  /** Height of the line the caret sits on. Used when placing the menu **below** that line. */
  lineHeight: number;
}

export function caretPoint(textarea: HTMLTextAreaElement, index: number): CaretPoint {
  const doc = textarea.ownerDocument;
  const style = doc.defaultView?.getComputedStyle(textarea);
  const lineHeight = style ? parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 : 20;
  if (!style) return { top: 0, left: 0, lineHeight };

  const mirror = doc.createElement('div');
  for (const property of MIRRORED_PROPERTIES) {
    mirror.style[property] = style[property];
  }
  // Keep it off screen while **still having layout computed**. With
  // `display:none` the width is 0 and the line-breaking is completely different.
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '0';
  mirror.style.height = 'auto';
  mirror.style.overflow = 'hidden';
  // A textarea always preserves line breaks — even when the computed value is not `pre-wrap`.
  mirror.style.whiteSpace = 'pre-wrap';

  mirror.textContent = textarea.value.slice(0, index);
  const marker = doc.createElement('span');
  // An empty span has zero height and no readable position — put one zero-width character in it.
  marker.textContent = '​';
  mirror.appendChild(marker);

  // Attach it right beside the original so font inheritance and zoom factor match too.
  const host = textarea.parentElement ?? doc.body;
  host.appendChild(mirror);
  const markerTop = marker.offsetTop;
  const markerLeft = marker.offsetLeft;
  host.removeChild(mirror);

  return {
    top: markerTop - textarea.scrollTop,
    left: markerLeft - textarea.scrollLeft,
    lineHeight,
  };
}

/**
 * Move the caret coordinates to a position that keeps the menu **inside the
 * editor**.
 *
 * With the caret at the right or bottom edge, the menu would be clipped as is. In
 * that case the attachment direction flips — a clipped menu is the same as no
 * menu, and one pushed off screen creates a scroll that shifts the text being
 * edited.
 */
export function clampMenuToBox({
  caret,
  box,
  menu,
  gap = 6,
}: {
  caret: CaretPoint;
  box: { width: number; height: number };
  menu: { width: number; height: number };
  gap?: number;
}): { top: number; left: number } {
  const belowTop = caret.top + caret.lineHeight + gap;
  // If it cannot open downward, flip above the caret.
  const top =
    belowTop + menu.height <= box.height ? belowTop : Math.max(gap, caret.top - menu.height - gap);
  const left = Math.max(gap, Math.min(caret.left, box.width - menu.width - gap));
  return { top, left };
}
