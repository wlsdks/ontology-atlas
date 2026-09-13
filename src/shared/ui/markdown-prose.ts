/**
 * The one way authored Markdown is styled when it is **rendered for reading**.
 *
 * ⚠️ **Why this exists.** A node's body *is* Markdown, and two of the three places that
 * showed it were not rendering it at all:
 *
 * - the full-detail body on a **writable** vault printed the raw source in a
 *   `whitespace-pre-wrap` paragraph, so a reader met `## Definition`, `- item` and
 *   backticks as literal characters (owner, 2026-09-14, on the installed app);
 * - the **read-only** branch beside it did parse the Markdown, but styled it with
 *   `prose prose-invert` — and `@tailwindcss/typography` is not installed in this
 *   project, so those two classes emit nothing. Real `h2` and `ul` elements were
 *   produced and then flattened by Preflight into body-sized text with no bullets.
 *
 * The second one is the reason this is a constant rather than a fix at one call site:
 * a dead class name looks exactly like a live one in a diff, and it stayed dead here
 * for as long as nobody read a long body on that surface.
 *
 * **What it does not own.** Container concerns — width, padding, radius, the base ink
 * and size of ordinary prose — stay at the call site, because they differ per surface
 * (a map panel, a field preview, a document column). This owns only what the Markdown
 * elements themselves must look like, so the same document reads the same way wherever
 * it is shown.
 *
 * Values come from the type, radius and colour ramps; nothing here is a raw literal.
 */
export const MARKDOWN_PROSE_CLASS = [
  '[&_h1]:mt-3 [&_h1]:mb-2 [&_h1]:text-display [&_h1]:font-[var(--font-weight-signature)] [&_h1]:text-[color:var(--color-text-primary)]',
  '[&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-title [&_h2]:font-[var(--font-weight-signature)] [&_h2]:text-[color:var(--color-text-primary)]',
  '[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-body-lg [&_h3]:font-[var(--font-weight-signature)] [&_h3]:text-[color:var(--color-text-primary)]',
  '[&_p]:my-1.5',
  // Descendant rather than child selectors: a nested list under a list item is not a
  // child of the Markdown root, and it was the nested "Included / Excluded" lists in
  // the dogfood vault's own domain bodies that made this visible.
  '[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:my-0.5',
  '[&_strong]:font-[var(--font-weight-emphasis)] [&_strong]:text-[color:var(--color-text-primary)]',
  '[&_code]:rounded-micro [&_code]:bg-[color:var(--color-elevated)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-body',
  '[&_pre]:rounded-chip [&_pre]:bg-[color:var(--color-elevated)] [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:font-mono [&_pre]:text-body [&_pre>code]:bg-transparent [&_pre>code]:px-0',
  '[&_a]:text-[color:var(--color-indigo-accent)] [&_a]:underline',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-[color:var(--color-border-strong)] [&_blockquote]:pl-3 [&_blockquote]:text-[color:var(--color-text-tertiary)]',
  '[&_hr]:my-3 [&_hr]:border-[color:var(--color-divider)]',
  '[&_table]:my-2 [&_table]:w-full [&_table]:text-body [&_th]:pb-1 [&_th]:pr-3 [&_th]:text-left [&_th]:font-[var(--font-weight-emphasis)] [&_td]:py-1 [&_td]:pr-3 [&_td]:align-top',
].join(' ');
