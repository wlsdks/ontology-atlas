/** Chat density; the document screen keeps its own, larger set. */
export const CHAT_MARKDOWN = [
  'break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:mb-2',
  '[&_ul]:my-2 [&_ul]:pl-[18px] [&_ol]:my-2 [&_ol]:pl-[18px]',
  '[&_li]:mb-1 [&_li]:list-disc [&_li]:pl-0.5 [&_li::marker]:text-[color:var(--color-text-quaternary)]',
  '[&_code]:rounded-micro [&_code]:border [&_code]:border-[color:var(--color-border-soft)]',
  '[&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-label [&_code]:text-[color:var(--color-text-tertiary)]',
  '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-card [&_pre]:border',
  '[&_pre]:border-[color:var(--color-border-soft)] [&_pre]:bg-[color:var(--color-overlay-1)] [&_pre]:p-2.5',
  '[&_pre_code]:border-0 [&_pre_code]:p-0',
  '[&_strong]:font-[var(--font-weight-strong)] [&_strong]:text-[color:var(--color-text-primary)]',
  '[&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-body-lg [&_h1]:font-[var(--font-weight-strong)] [&_h1]:text-[color:var(--color-text-primary)]',
  '[&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-body-lg [&_h2]:font-[var(--font-weight-strong)] [&_h2]:text-[color:var(--color-text-primary)]',
  '[&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-body [&_h3]:font-[var(--font-weight-strong)] [&_h3]:text-[color:var(--color-text-primary)]',
  '[&_a]:text-[color:var(--color-indigo-accent)] [&_a]:underline-offset-2',
].join(' ');

/** One step quieter than the answer. */
export const WORK_MARKDOWN = [
  'break-keep text-label leading-label text-[color:var(--color-text-quaternary)]',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:mb-1.5',
  '[&_ul]:my-1.5 [&_ul]:pl-[18px] [&_ol]:my-1.5 [&_ol]:pl-[18px]',
  '[&_li]:mb-1 [&_li]:list-disc',
  '[&_code]:rounded-micro [&_code]:border [&_code]:border-[color:var(--color-border-soft)]',
  '[&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-caption',
  '[&_strong]:font-[var(--font-weight-emphasis)] [&_strong]:text-[color:var(--color-text-tertiary)]',
].join(' ');
