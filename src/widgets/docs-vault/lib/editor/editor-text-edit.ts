export interface TextEdit {
  content: string;
  /** Where the textarea selection lands after the edit. */
  selectionStart: number;
  selectionEnd: number;
}

const FRONTMATTER_BLOCK = /^---[\s\S]*?\n---\n?/;

/** The body the preview draws: the leading frontmatter block is not prose. */
export function stripFrontmatterBlock(content: string): string {
  return content.replace(FRONTMATTER_BLOCK, '');
}

/** Wraps the selection (or the placeholder when nothing is selected) and selects the wrapped text. */
export function wrapSelectionEdit(
  content: string,
  start: number,
  end: number,
  wrapper: string,
  placeholder: string,
): TextEdit {
  const selected = content.slice(start, end) || placeholder;
  const selectionStart = start + wrapper.length;
  return {
    content: content.slice(0, start) + wrapper + selected + wrapper + content.slice(end),
    selectionStart,
    selectionEnd: selectionStart + selected.length,
  };
}

/** Puts `prefix` at the start of the caret's line and keeps the caret where the text it follows is. */
export function prefixLineEdit(content: string, caret: number, prefix: string): TextEdit {
  const lineStart = content.lastIndexOf('\n', caret - 1) + 1;
  return {
    content: content.slice(0, lineStart) + prefix + content.slice(lineStart),
    selectionStart: caret + prefix.length,
    selectionEnd: caret + prefix.length,
  };
}

/** Writes `[selection](url)` and selects `url` so the address is typed next. */
export function insertLinkEdit(
  content: string,
  start: number,
  end: number,
  fallbackText: string,
): TextEdit {
  const selected = content.slice(start, end);
  const body = `[${selected || fallbackText}](url)`;
  const urlStart = start + body.indexOf('(url)') + 1;
  return {
    content: content.slice(0, start) + body + content.slice(end),
    selectionStart: urlStart,
    selectionEnd: urlStart + 'url'.length,
  };
}
