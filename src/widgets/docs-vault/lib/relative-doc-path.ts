/**
 * The **relative markdown path** between two vault slugs — the link an `@` mention
 * puts in the body.
 *
 * ## Why a standard link (2026-08-08, owner report)
 *
 * The first version put a `[[slug|name]]` wikilink in the body. The owner asked —
 * *"`[[` 이거는 옵시디언 특유라서 우리가 쓰면 안되는거 아닌가?"* (isn't `[[` an
 * Obsidian thing we shouldn't use?)
 *
 * A fair point. Wikilinks come from MediaWiki (2001) and are a **PKM convention**
 * used by Roam, Logseq, Obsidian, Foam and Dendron rather than an Obsidian
 * invention. But the impression is Obsidian — and above all, **measured, the
 * standard link wins on every axis**:
 *
 * | | `[[slug\|name]]` | `[name](../path.md)` |
 * |---|---|---|
 * | Our viewer | link | link (`resolveDocLink`) |
 * | Obsidian | link | link |
 * | **GitHub · VS Code · generic markdown viewers** | **broken text** | **link** |
 * | When a node is renamed | goes stale | goes stale |
 *
 * The last row settled it. Wikilinks were assumed to «survive file moves because
 * they are slugs», but `redirectBacklinks` fixes **frontmatter only** and never
 * touches bodies (measured). So the two notations are equal on that axis, and the
 * remaining difference is **whether it renders on GitHub**.
 *
 * So the answer is not "invent our own syntax" — ours would be **broken text in
 * every other tool**, and that would be us breaking this product's promise that
 * everything can be carried out as plain markdown. Not their syntax and not ours:
 * **the markdown standard**.
 */

/**
 * The relative path (including `.md`) from the `fromSlug` document to the `toSlug`
 * document.
 *
 * The viewer's `resolveDocLink` resolves a link **relative to that document's
 * folder**, so a vault-root-relative path cannot be used as is — writing
 * `capabilities/fixtures.md` from `domains/typed-api` sends it looking for
 * `domains/capabilities/fixtures` (a resolution rule confirmed by measurement).
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
   * The same folder gets a `./` prefix. Without it the link is `fixtures.md`, which
   * still reads as a link but **looks like a file name inside prose** — the prefix
   * makes it visibly a link. The resolving side already strips `./`.
   */
  return up === 0 && toParts.length === shared ? `./${path}` : path;
}

/**
 * One markdown link line to put in the body.
 *
 * A `]` in the label breaks the link syntax on the spot, so it is escaped — a title
 * is a human-written value and can contain anything.
 */
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
