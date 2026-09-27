/**
 * Caret screen coordinates inside a textarea, so the mention menu opens where the user types. A
 * hidden mirror div with the same font, width and padding lets the browser break lines; a missed
 * copied property moves the result to another line.
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
  // Off screen but still laid out; `display:none` would zero the width and change line breaks.
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
 * Moves the menu to stay inside the editor, flipping direction at the right or bottom edge; a
 * clipped menu is useless and an overflowing one scrolls the text being edited.
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
