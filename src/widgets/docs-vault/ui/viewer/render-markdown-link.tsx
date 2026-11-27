import { Link } from '@/i18n/navigation';
import type { ExtraProps } from 'react-markdown';
import type { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { OntologyMapKindGlyph, controlClass } from '@/shared/ui';
import {
  decodeWikilinkSlug,
  parseWikilinkHref,
  resolveSourceCitation,
} from '@/shared/lib/library/source-citation';
import { sourceCitationWords } from '@/features/library';
import { resolveWikilinkTargetSlug } from '@/shared/lib/vault-document/parse-frontmatter';
import { resolveDocLink } from '../../lib/resolve-doc-link';
import { MissingWikilink } from './MissingWikilink';

type ViewerTranslator = ReturnType<typeof useTranslations<'vaultWidgets.viewer'>>;
type LibraryTranslator = ReturnType<typeof useTranslations<'library'>>;

export interface ViewerCitation {
  path: string | null;
  rawPath: string;
  anchor?: string;
}

/** Everything a link's destination is resolved against; built once per set of viewer inputs. */
export interface MarkdownLinkContext {
  docSlug: string;
  t: ViewerTranslator;
  libraryT: LibraryTranslator;
  vaultSlugs: Set<string>;
  normalizedVaultSlugs: ReadonlySet<string>;
  normalizedOriginalPaths: ReadonlyMap<string, string> | undefined;
  namedSource: string | undefined;
  reducedMotion: boolean;
  getDocHref: (slug: string, hash?: string) => string;
  getProjectHref: (slug: string) => string;
  onNavigate: (slug: string) => void;
  onSourceNavigate: ((path: string, anchor?: string) => void) | undefined;
  onCitationPress: ((citation: ViewerCitation, button: HTMLButtonElement) => void) | undefined;
  onConceptNavigate: ((slug: string) => void) | undefined;
  linkTargets: ReadonlyMap<string, { title: string; kind: string | null }> | undefined;
}

/**
 * A citation the Library opens in place: a chip after the sentence, quiet until pointed at. It
 * stays inline so a long run of citations wraps with the text.
 */
const CITATION_CHIP_CLASS =
  'mx-0.5 inline rounded-micro bg-[color:var(--color-indigo-line-a06)] px-1 py-px align-baseline text-label leading-label text-[color:var(--color-indigo-line-a90)] [box-decoration-break:clone] whitespace-normal transition-colors hover:bg-[color:var(--color-indigo-line-a22)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--color-indigo-focus-ring)] aria-expanded:bg-[color:var(--color-indigo-line-a22)] aria-expanded:text-[color:var(--color-text-primary)]';
const CITATION_CHIP_MISSING_CLASS =
  'bg-transparent border-b border-dashed border-[color:var(--color-amber-source-a50)] rounded-none text-[color:var(--color-amber-source-text-a85)]';

function scrollToAnchorNextFrame(anchor: string | undefined, reducedMotion: boolean) {
  if (anchor && typeof window !== 'undefined') {
    requestAnimationFrame(() => {
      document
        .getElementById(anchor)
        ?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  }
}

/** Renders one markdown link: a wikilink, a source citation, a page link, or an ordinary URL. */
export function renderMarkdownLink(
  ctx: MarkdownLinkContext,
  { href, children, ...rest }: React.ComponentPropsWithoutRef<'a'> & ExtraProps,
) {
  const {
    docSlug, t, libraryT, vaultSlugs, normalizedVaultSlugs, normalizedOriginalPaths, namedSource,
    reducedMotion, getDocHref, getProjectHref, onNavigate, onSourceNavigate, onCitationPress,
    onConceptNavigate, linkTargets,
  } = ctx;
  const docLink = (slug: string, anchor: string | undefined, label: React.ReactNode) => (
    <Link
      href={getDocHref(slug, anchor)}
      onClick={(e) => {
        e.preventDefault();
        onNavigate(slug);
        scrollToAnchorNextFrame(anchor, reducedMotion);
      }}
      className="prose-link text-[color:var(--color-indigo-line-a90)] hover:decoration-[color:var(--color-indigo-accent)]"
    >
      {label}
    </Link>
  );
  const externalLink = (url: string) => (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      /* A prose link stays display:inline so it wraps. */
      className="prose-link decoration-[color:var(--color-indigo-line-a40)] hover:decoration-[color:var(--color-indigo-accent)]"
      {...rest}
    >
      {children}
      <ExternalLink size={ICON_SIZE.sm} className="ml-1 inline align-baseline opacity-60" aria-hidden />
    </a>
  );

  if (!href) return <span {...rest}>{children}</span>;
  const wikilink = parseWikilinkHref(href);
  if (wikilink) {
    const { rawSlug: rawWikiSlug, rawAnchor, labelled } = wikilink;
    const typedSlug = rawWikiSlug ? decodeWikilinkSlug(rawWikiSlug) : rawWikiSlug;
    const wikiSlug = typedSlug
      ? resolveWikilinkTargetSlug(typedSlug, docSlug)
      : typedSlug;
    const anchor = rawAnchor ? decodeWikilinkSlug(rawAnchor) : rawAnchor;
    /*
     * Percent-decode and NFC-normalise: the parser passes Hangul slugs encoded and macOS
     * stores NFD; same rule as the CLI's `validate.mjs`.
     */
    const citation = rawWikiSlug
      ? resolveSourceCitation(
          rawWikiSlug,
          rawAnchor,
          normalizedOriginalPaths,
          onSourceNavigate !== undefined,
        )
      : null;
    if (citation) {
      const words = sourceCitationWords(
        { path: citation.path ?? citation.rawPath, anchor: citation.anchor },
        { nameFile: citation.rawPath !== namedSource },
        libraryT,
      );
      const shown = labelled ? children : words.text;
      /*
       * The press opens the passage beside the citation rather than leaving the page. The
       * resolution above is unchanged: `path` is the allow-listed one or null, and nothing
       * here reads the file.
       */
      if (onCitationPress && citation.status !== 'unavailable') {
        const known = citation.status === 'known' && citation.path !== null;
        const label = words.place
          ? t('sourceCitationTitleAt', { path: citation.path ?? citation.rawPath, place: words.place })
          : t('sourceCitationTitle', { path: citation.path ?? citation.rawPath });
        return (
          <button
            type="button"
            aria-label={label}
            aria-expanded={false}
            data-source-path={citation.path ?? undefined}
            data-source-anchor={citation.anchor}
            data-citation-state={known ? 'known' : 'missing'}
            onClick={(event) => onCitationPress(
              { path: known ? citation.path : null, rawPath: citation.rawPath, anchor: citation.anchor },
              event.currentTarget,
            )}
            className={known ? CITATION_CHIP_CLASS : `${CITATION_CHIP_CLASS} ${CITATION_CHIP_MISSING_CLASS}`}
          >
            {shown}
          </button>
        );
      }
      if (citation.status === 'known' && citation.path && onSourceNavigate) {
        return (
          <button
            type="button"
            aria-label={
              words.place
                ? t('sourceCitationTitleAt', { path: citation.path, place: words.place })
                : t('sourceCitationTitle', { path: citation.path })
            }
            data-source-path={citation.path}
            data-source-anchor={citation.anchor}
            onClick={() => onSourceNavigate(citation.path!, citation.anchor)}
            className={controlClass({
              shape: 'link',
              tone: 'accent',
              hoverInk: 'strong',
              className: 'inline align-baseline break-keep whitespace-normal',
            })}
          >
            {shown}
          </button>
        );
      }
      return (
        <span
          className="border-b border-dashed border-[color:var(--color-amber-source-a50)] text-[color:var(--color-amber-source-text-a85)]"
          title={t(
            citation.status === 'missing'
              ? 'sourceCitationMissing'
              : 'sourceCitationUnavailable',
            { path: citation.rawPath },
          )}
          {...rest}
        >
          {shown}
        </span>
      );
    }
    /*
     * Resolve against the linking document, as `extractOutLinkTargets`
     * and `validateWikiFolder` do, so `[[budget]]` in `wiki/handover.md` means `wiki/budget`.
     */
    // A `project:` prefix routes to the public topology route, e.g. [[project:reactor]].
    if (wikiSlug && wikiSlug.startsWith('project:')) {
      const projectSlug = wikiSlug.slice('project:'.length);
      // A locale-aware Link; a raw anchor loads the locale-less root and drops `?p=`.
      return (
        <Link
          href={getProjectHref(projectSlug)}
          className="prose-link text-[color:var(--color-amber-docs-a95)] decoration-[color:var(--color-amber-docs-a35)] hover:decoration-[color:var(--color-amber-docs-a100)]"
          title={t('projectLinkTitle', { slug: projectSlug })}
        >
          {children}
        </Link>
      );
    }
    if (linkTargets && wikiSlug) {
      const target = linkTargets.get(wikiSlug);
      if (target && normalizedVaultSlugs.has(wikiSlug)) {
        if (wikiSlug === docSlug.normalize('NFC')) return <span>{labelled ? children : target.title}</span>;
        const concept = target.kind !== null && onConceptNavigate !== undefined;
        return (
          <Link
            href={getDocHref(wikiSlug, anchor)}
            data-link-target={wikiSlug}
            onClick={(e) => {
              e.preventDefault();
              if (concept) {
                onConceptNavigate(wikiSlug);
                return;
              }
              onNavigate(wikiSlug);
              scrollToAnchorNextFrame(anchor, reducedMotion);
            }}
            className="prose-link text-[color:var(--color-indigo-line-a90)] hover:decoration-[color:var(--color-indigo-accent)]"
          >
            {target.kind ? (
              <OntologyMapKindGlyph kind={target.kind} size={ICON_SIZE.sm} className="mr-1 inline-block shrink-0 align-[-0.125em]" />
            ) : null}
            {labelled ? children : target.title}
          </Link>
        );
      }
      if (!target) {
        return <MissingWikilink text={labelled ? children : typedSlug} description={libraryT('wikiReader.linkMissing')} />;
      }
    }
    if (wikiSlug && normalizedVaultSlugs.has(wikiSlug)) {
      return docLink(wikiSlug, anchor, children);
    }
    return (
      <span
        className="border-b border-dashed border-[color:var(--color-amber-source-a50)] text-[color:var(--color-amber-source-text-a85)]"
        title={t('wikilinkMissing', { slug: typedSlug })}
        {...rest}
      >
        {children}
      </span>
    );
  }
  if (href.startsWith('#')) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  if (/^https?:\/\//i.test(href)) return externalLink(href);
  const resolved = resolveDocLink({
    href,
    fromSlug: docSlug,
    vaultSlugs,
  });
  if (resolved.kind === 'internal') return docLink(resolved.slug, resolved.anchor, children);
  if (resolved.kind === 'unresolved') {
    return (
      <span
        className="text-[color:var(--color-text-tertiary)] underline decoration-dotted underline-offset-2"
        title={t('externalLinkUnresolved', { href })}
        {...rest}
      >
        {children}
      </span>
    );
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
