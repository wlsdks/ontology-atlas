import type { Components } from 'react-markdown';
import { githubAnchorSlug } from '@/shared/lib/library/github-anchor-slug';
import { detectCallout } from '../../lib/viewer/detect-callout';
import { flattenText, slugFromChildren } from '../../lib/viewer/heading-text';
import { BodyImage } from './BodyImage';
import { CalloutBlock } from './CalloutBlock';
import type { MatchHighlighter } from './create-match-highlighter';
import { HeadingAnchor } from './HeadingAnchor';
import { renderMarkdownLink, type MarkdownLinkContext } from './render-markdown-link';
import { RemoteImage } from './RemoteImage';
import { VaultImage } from './VaultImage';

const HEADING_CLASS = {
  h1: 'group relative mt-0 mb-6 text-display font-[var(--font-weight-strong)] leading-display text-[color:var(--color-text-primary)]',
  // No section gap above a first-line heading; the Library draws the title in its own header.
  h2: 'group relative mt-10 mb-3 text-title font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)] first:mt-0',
  h3: 'group relative mt-6 mb-2 text-title font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]',
} as const;

/**
 * Line-length cap on prose elements only (paragraphs, lists, quotes); headings, tables, code and
 * images keep the full column. A max-width only narrows, and prose stays left-aligned.
 */
const PROSE_MEASURE = 'max-w-[var(--measure-prose)]';

interface MarkdownComponentsInput {
  link: MarkdownLinkContext;
  highlightChildren: MatchHighlighter;
  markSourceLines: boolean;
  basePath: string;
  resolveImage: ((path: string) => Promise<string | null>) | undefined;
}

/**
 * The element renderers `react-markdown` draws the body with. Each entry is a component type for
 * `react-markdown`, so the caller memoizes the result: a fresh object per render would remount
 * every link and citation in the body.
 */
export function createMarkdownComponents({
  link,
  highlightChildren,
  markSourceLines,
  basePath,
  resolveImage,
}: MarkdownComponentsInput): Components {
  const docSlug = link.docSlug;
  /**
   * The GitHub-rule heading id when it differs from this viewer's, rendered as a second empty
   * anchor so links written for either surface work; scroll-spy keeps the id above.
   */
  const headingAliasOf = (children: React.ReactNode) => {
    const canonical = slugFromChildren(children);
    const alias = githubAnchorSlug(flattenText(children));
    return alias && alias !== canonical ? alias : null;
  };

  const renderHeading = (
    Tag: 'h2' | 'h3',
    className: string,
    highlightKey: string,
    children: React.ReactNode,
    rest: React.HTMLAttributes<HTMLHeadingElement>,
  ) => {
    // Heading ids must be idempotent across StrictMode double renders; duplicate headings share an id
    // (the browser anchors to the first).
    const slug = slugFromChildren(children);
    const alias = headingAliasOf(children);
    return (
      <Tag id={slug} className={className} data-line={lineOf(rest)} {...rest}>
        {alias ? <span id={alias} aria-hidden /> : null}
        {highlightChildren(children, highlightKey)}
        <HeadingAnchor anchor={slug} docSlug={docSlug} basePath={basePath} />
      </Tag>
    );
  };

  const lineOf = (props: object): number | undefined =>
    markSourceLines ? (props as { node?: { position?: { start?: { line?: number } } } }).node?.position?.start?.line : undefined;

  return {
    a(props) {
      return renderMarkdownLink(link, props);
    },
    h1: ({ children, ...rest }) => renderHeading('h2', HEADING_CLASS.h1, 'h1', children, rest),
    h2: ({ children, ...rest }) => renderHeading('h2', HEADING_CLASS.h2, 'h2', children, rest),
    h3: ({ children, ...rest }) => renderHeading('h3', HEADING_CLASS.h3, 'h3', children, rest),
    p({ children, ...rest }) {
      return (
        <p
          className={`${PROSE_MEASURE} my-3 break-keep text-reading leading-prose text-[color:var(--color-text-secondary)]`}
          data-line={lineOf(rest)}
          {...rest}
        >
          {highlightChildren(children, 'p')}
        </p>
      );
    },
    ul(props) {
      return (
        <ul
          className={`${PROSE_MEASURE} my-3 list-disc break-keep pl-6 text-reading leading-prose text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]`}
          {...props}
        />
      );
    },
    ol(props) {
      return (
        <ol
          className={`${PROSE_MEASURE} my-3 list-decimal break-keep pl-6 text-reading leading-prose text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]`}
          {...props}
        />
      );
    },
    li({ children, ...rest }) {
      return (
        <li className="my-1" data-line={lineOf(rest)} {...rest}>
          {highlightChildren(children, 'li')}
        </li>
      );
    },
    code({ className, children, ...rest }) {
      const isBlock = /language-/.test(className ?? '');
      if (!isBlock) {
        return (
          <code
            className="rounded-micro bg-[color:var(--color-indigo-line-a06)] px-1 py-0.5 font-mono text-label text-[color:var(--color-indigo-pale-a95)] md:text-body"
            {...rest}
          >
            {children}
          </code>
        );
      }
      return (
        <code className={`${className} font-mono text-label md:text-body`} {...rest}>
          {children}
        </code>
      );
    },
    pre(props) {
      return (
        <pre
          className="my-4 overflow-x-auto rounded-chip border border-[color:var(--color-overlay-2)] bg-[color:var(--color-surface-deep-a80)] p-3 font-mono text-label leading-body text-[color:var(--color-indigo-pale-a92)] md:text-body"
          {...props}
        />
      );
    },
    blockquote({ children, ...rest }) {
      const callout = detectCallout(children);
      if (callout) {
        return (
          <CalloutBlock kind={callout.kind} title={callout.title}>
            {callout.rest}
          </CalloutBlock>
        );
      }
      return (
        <blockquote
          className={`${PROSE_MEASURE} my-4 border-l-2 border-[color:var(--color-indigo-line-a35)] pl-4 italic text-[color:var(--color-text-tertiary)]`}
          {...rest}
        >
          {children}
        </blockquote>
      );
    },
    table(props) {
      return (
        <div className="my-4 overflow-x-auto">
          <table
            className="w-full border-collapse text-body text-[color:var(--color-text-secondary)]"
            {...props}
          />
        </div>
      );
    },
    th(props) {
      return (
        <th
          className="border-b border-[color:var(--color-divider)] px-2 py-1.5 text-left font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
          {...props}
        />
      );
    },
    td(props) {
      return (
        <td
          className="border-b border-[color:var(--color-overlay-2)] px-2 py-1.5 align-top [&_a]:-mx-2 [&_a]:inline-flex [&_a]:min-h-8 [&_a]:items-center [&_a]:rounded-chip [&_a]:px-2"
          {...props}
        />
      );
    },
    hr() {
      return <hr className="my-6 border-[color:var(--color-border-soft)]" />;
    },
    img({ src, alt, title }) {
      const rawSrc = typeof src === 'string' ? src : undefined;
      if (rawSrc && /^https?:/i.test(rawSrc)) return <RemoteImage src={rawSrc} alt={alt ?? ''} />;
      // A server vault has no resolveImage and references public/docs-vault directly.
      if (!rawSrc || /^(data:|blob:)/i.test(rawSrc) || !resolveImage) {
        return <BodyImage src={rawSrc ?? ''} alt={alt ?? ''} title={title} />;
      }
      return (
        <VaultImage
          src={rawSrc}
          alt={alt ?? ''}
          docSlug={docSlug}
          resolve={resolveImage}
        />
      );
    },
  };
}
