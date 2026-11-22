import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** The editor's side-by-side preview: plain markdown prose, without the viewer's links and citations. */
export function EditorPreview({ body }: { body: string }) {
  return (
    <div className="min-h-0 w-1/2 overflow-auto bg-[color:var(--color-surface-deep-a20)]">
      <article className="mx-auto max-w-[var(--measure-doc-column)] px-6 py-6 md:px-8">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: (props) => (
              <h1
                className="mt-0 mb-4 text-display font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
                {...props}
              />
            ),
            h2: (props) => (
              <h2
                className="mt-8 mb-2 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
                {...props}
              />
            ),
            h3: (props) => (
              <h3
                className="mt-6 mb-2 text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
                {...props}
              />
            ),
            p: (props) => (
              <p
                className="my-3 text-body leading-prose text-[color:var(--color-text-secondary)]"
                {...props}
              />
            ),
            ul: (props) => (
              <ul
                className="my-3 list-disc pl-6 text-body leading-prose text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]"
                {...props}
              />
            ),
            ol: (props) => (
              <ol
                className="my-3 list-decimal pl-6 text-body leading-prose text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]"
                {...props}
              />
            ),
            code: ({ className, children, ...rest }) => {
              const isBlock = /language-/.test(className ?? '');
              if (!isBlock) {
                return (
                  <code
                    className="rounded-micro bg-[color:var(--color-indigo-line-a06)] px-1 py-0.5 font-mono text-label text-[color:var(--color-indigo-pale-a95)]"
                    {...rest}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <code className={className} {...rest}>
                  {children}
                </code>
              );
            },
            pre: (props) => (
              <pre
                className="my-3 overflow-x-auto rounded-chip border border-[color:var(--color-overlay-2)] bg-[color:var(--color-surface-deep-a80)] p-3 font-mono text-body text-[color:var(--color-indigo-pale-a92)]"
                {...props}
              />
            ),
            blockquote: (props) => (
              <blockquote
                className="my-3 border-l-2 border-[color:var(--color-indigo-line-a35)] pl-3 italic text-[color:var(--color-text-tertiary)]"
                {...props}
              />
            ),
          }}
        >
          {body}
        </ReactMarkdown>
      </article>
    </div>
  );
}
