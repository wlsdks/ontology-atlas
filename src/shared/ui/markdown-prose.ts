/**
 * The one styling for authored Markdown rendered for reading, so a document reads the same on
 * every surface. `@tailwindcss/typography` is not installed, so `prose` classes emit nothing.
 * It owns only the Markdown elements; the container's width, padding and base type stay at the
 * call site.
 */
export const MARKDOWN_PROSE_CLASS = [
  '[&_h1]:mt-3 [&_h1]:mb-2 [&_h1]:text-display [&_h1]:font-[var(--font-weight-signature)] [&_h1]:text-[color:var(--color-text-primary)]',
  '[&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-title [&_h2]:font-[var(--font-weight-signature)] [&_h2]:text-[color:var(--color-text-primary)]',
  '[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-body-lg [&_h3]:font-[var(--font-weight-signature)] [&_h3]:text-[color:var(--color-text-primary)]',
  '[&_p]:my-1.5',
  // Descendant selectors, because a nested list is not a child of the Markdown root.
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
