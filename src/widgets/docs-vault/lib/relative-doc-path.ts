/**
 * Relative markdown path between two vault slugs, the link an `@` mention writes. A standard link,
 * not a `[[wikilink]]`: it renders on GitHub, VS Code and every markdown viewer, keeping vault
 * content plain markdown.
 */

/**
 * Relative path (with `.md`) from `fromSlug` to `toSlug`; `resolveDocLink` resolves relative to the
 * linking document's folder, so a vault-root path would miss.
 */
export function relativeDocPath(fromSlug: string, toSlug: string): string {
  const fromParts = fromSlug.split('/');
  const toParts = toSlug.split('/');
  // The last segment is the file name, so it is dropped from the directory comparison.
  fromParts.pop();
  const fileName = `${toParts.pop()}.md`;

  let shared = 0;
  while (shared < fromParts.length && shared < toParts.length && fromParts[shared] === toParts[shared]) {
    shared += 1;
  }
  const up = fromParts.length - shared;
  const segments = [...Array.from({ length: up }, () => '..'), ...toParts.slice(shared), fileName];
  const path = segments.join('/');
  /*
   * Same folder gets `./` so the link does not read as a file name in prose; the resolver strips
   * it.
   */
  return up === 0 && toParts.length === shared ? `./${path}` : path;
}

/** One markdown link line; `]` in the label is escaped or the link breaks. */
export function buildDocLinkMarkdown({
  fromSlug,
  toSlug,
  label,
}: {
  fromSlug: string;
  toSlug: string;
  label: string;
}): string {
  const text = (label.trim() || toSlug).replace(/([[\]])/g, '\\$1');
  return `[${text}](${relativeDocPath(fromSlug, toSlug)})`;
}
