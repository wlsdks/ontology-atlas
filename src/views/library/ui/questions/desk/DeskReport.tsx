import { Children, isValidElement, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { LibrarySourceRow } from '@/entities/docs-vault';
import { passageLabelText, questionDeskReportFilename, serializeQuestionDeskReport, splitQuestionDeskReportSections } from '@/features/library';
import { passageLabelFor } from '@/shared/lib/library/source-passage';
import { controlClass } from '@/shared/ui/control-class';
import { normalizeOriginalPaths, parseWikilinkHref, resolveSourceCitation, rewriteWikilinks } from '@/shared/lib/library/source-citation';
import { WIKI_CITATION_ANCHOR_PATTERN } from '@/shared/lib/library/wiki-page-schema';
import { Chip } from '@/shared/ui';
import { MOTION, OVERLAY_RISE, OVERLAY_RISE_REDUCED, OVERLAY_SETTLED, STAGGER } from '@/shared/motion';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { latinEyebrowClass } from '@/shared/lib/locale-text/latin-eyebrow';

const VALID_SOURCE_ANCHOR = new RegExp(`^(?:${WIKI_CITATION_ANCHOR_PATTERN})$`);
/** A line as the rows print it: a positive number of at most seven digits with no leading zero. */
const SHORT_LINE_ANCHOR = /^l[1-9]\d{0,6}$/u;

/**
 * The shared rewriter keeps only what lies between the first and second `#`, so `#l5#l9` would
 * open line 5 while the export, which splits at the last `#`, names line 9. Escaping every later
 * `#` keeps the whole tail in the anchor, where the pressable check below refuses it.
 */
function keepWholeAnchor(markdown: string): string {
  return markdown.replace(/\[\[([^\]|]+?)((?:\|[^\]]+?)?)\]\]/gu, (whole, target: string, label: string) => {
    const first = target.indexOf('#');
    if (first < 0 || target.indexOf('#', first + 1) < 0) return whole;
    return `[[${target.slice(0, first + 1)}${target.slice(first + 1).replaceAll('#', '%23')}${label}]]`;
  });
}

/** Listed originals grouped by file name, so a citation can tell same-named files apart. */
function pathsByName(paths: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const byName = new Map<string, string[]>();
  for (const path of paths) {
    const normal = path.normalize('NFC');
    const name = normal.slice(normal.lastIndexOf('/') + 1);
    byName.set(name, [...(byName.get(name) ?? []), normal]);
  }
  return byName;
}

/** The file name, or the shortest trailing path no other listed original ends with. */
function distinguishingPath(path: string, byName: ReadonlyMap<string, readonly string[]>): string {
  const segments = path.split('/');
  const normal = path.normalize('NFC');
  const peers = (byName.get(normal.slice(normal.lastIndexOf('/') + 1)) ?? []).filter((peer) => peer !== normal);
  for (let count = 1; count < segments.length; count += 1) {
    const tail = segments.slice(-count).join('/');
    const tailNormal = tail.normalize('NFC');
    if (!peers.some((peer) => peer === tailNormal || peer.endsWith(`/${tailNormal}`))) return tail;
  }
  return path;
}

export interface QuestionDeskReportDraft {
  question: string;
  searchId: number;
  listingVersion: string;
  vaultScope: string;
  text: string;
  coverage: string;
  limits: string;
  generatedAt: string;
}

function formatReportTimestamp(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/**
 * A report's citation of an inventoried original. The screen shows the file and its line; the full
 * address is the press's description and the only text print shows, so a printed report still
 * names exactly what it cites.
 */
function CitationPress({ address, place, labelled, path, anchor, answer, onOpenSource }: {
  address: string;
  place: string;
  labelled: ReactNode;
  path: string;
  anchor: string;
  answer: boolean;
  onOpenSource: (path: string, anchor: string) => void;
}) {
  const addressId = useId();
  return <button type="button" data-source-path={path} data-source-anchor={anchor} title={address}
    aria-describedby={addressId} onClick={() => onOpenSource(path, anchor)}
    className={controlClass({ shape: 'link', size: 'lg', tone: 'accent', hoverInk: 'strong', className: answer ? 'inline break-all underline text-body-lg leading-body' : 'inline break-all underline' })}>
    {labelled ? <>{labelled} · </> : null}
    <span data-citation-place="true" className="print:hidden">{place}</span>
    <span id={addressId} data-citation-address="true" className="hidden print:inline">{address}</span>
  </button>;
}

function SafeReportMarkdown({ text, sources, onOpenSource, answer = false }: {
  text: string;
  sources: readonly LibrarySourceRow[];
  onOpenSource: (path: string, anchor: string) => void;
  answer?: boolean;
}) {
  const t = useTranslations('library.questionDesk');
  const tLibrary = useTranslations('library');
  const known = useMemo(() => normalizeOriginalPaths(new Set(sources.map((source) => source.path))), [sources]);
  const byName = useMemo(() => pathsByName(sources.map((source) => source.path)), [sources]);
  const isCitationLink = (child: ReactNode) => isValidElement<{ href?: string }>(child)
    && Boolean(child.props.href && parseWikilinkHref(child.props.href));
  return <div data-report-markdown="true" className={answer
    ? 'min-w-0 text-reading leading-prose text-[color:var(--color-text-primary)]'
    : 'min-w-0 text-reading leading-prose text-[color:var(--color-text-secondary)]'} data-testid="question-desk-report-markdown">
    <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={{
      h1: ({ children }) => <h3 className="mb-2 mt-5 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)] first:mt-0">{children}</h3>,
      h2: ({ children }) => <h3 className="mb-2 mt-5 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)] first:mt-0">{children}</h3>,
      h3: ({ children }) => <h4 className="mb-2 mt-4 text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{children}</h4>,
      p: ({ children, node }) => {
        if (!answer) return <p className="my-3 break-words">{children}</p>;
        const parts = Children.toArray(children);
        const citations = parts.filter(isCitationLink);
        const prose = citations.length ? parts.filter((child) => !isCitationLink(child)).reduce<ReactNode[]>((merged, child) => {
          if (typeof child === 'string' && typeof merged[merged.length - 1] === 'string') {
            merged[merged.length - 1] = String(merged[merged.length - 1]) + child;
          } else merged.push(child);
          return merged;
        }, []).map((child) => typeof child === 'string'
          ? child.replace(/[ \t]{2,}/gu, ' ').replace(/\s+([.,!?;:)\]])/gu, '$1')
          : child) : parts;
        const isAnswerLead = node?.position?.start.offset === 0;
        return <div data-report-paragraph="answer" className="my-4 first:mt-0">
          <p className={isAnswerLead
            ? 'break-words text-display font-[var(--font-weight-strong)] leading-display text-[color:var(--color-text-primary)]'
            : 'my-3 break-words'}>{prose}</p>
          {citations.length ? <div data-report-citations="true" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-body-lg leading-body">{citations}</div> : null}
        </div>;
      },
      ul: ({ children }) => <ul className="my-3 list-disc pl-5">{children}</ul>,
      ol: ({ children }) => <ol className="my-3 list-decimal pl-5">{children}</ol>,
      li: ({ children }) => <li className="my-1 break-words">{children}</li>,
      pre: ({ children }) => <pre className="my-3 overflow-x-auto whitespace-pre-wrap break-words">{children}</pre>,
      img: () => <span className="text-label text-[color:var(--color-text-tertiary)]">{t('report.imageUnavailable')}</span>,
      a: ({ href, children }) => {
        const wikilink = href ? parseWikilinkHref(href) : null;
        const citation = wikilink ? resolveSourceCitation(wikilink.rawSlug, wikilink.rawAnchor, known, true) : null;
        // A second `#` survives `keepWholeAnchor` inside the anchor and leaves the citation inert.
        if (citation?.status === 'known' && citation.path && citation.anchor && !citation.anchor.includes('#')
          && VALID_SOURCE_ANCHOR.test(citation.anchor)) {
          const address = `${citation.path}#${citation.anchor}`;
          /* On screen the file and its line, as the rows write them; any other anchor shows the
             address as written. Print keeps the address. */
          const place = SHORT_LINE_ANCHOR.test(citation.anchor)
            ? `${distinguishingPath(citation.path, byName)} · ${passageLabelText(passageLabelFor(citation.anchor, []), citation.anchor, tLibrary)}`
            : address;
          return <CitationPress address={address} place={place} labelled={wikilink?.labelled ? children : null}
            path={citation.path} anchor={citation.anchor} answer={answer} onOpenSource={onOpenSource} />;
        }
        return <span title={citation ? t('report.citationUnavailable') : t('report.externalUnavailable')}
          className="break-all border-b border-dashed border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)]"
          data-testid={citation ? 'question-desk-report-citation-unavailable' : undefined}>
          {wikilink?.labelled === false && citation ? null : <>{children} </>}
          {citation ? `${citation.rawPath}${citation.anchor ? `#${citation.anchor}` : ''} ${t('report.unavailableShort')}` : null}
        </span>;
      },
    }}>{rewriteWikilinks(keepWholeAnchor(text))}</ReactMarkdown>
  </div>;
}

function DraftReport({ text, sources, onOpenSource }: {
  text: string;
  sources: readonly LibrarySourceRow[];
  onOpenSource: (path: string, anchor: string) => void;
}) {
  const locale = useLocale();
  const t = useTranslations('library.questionDesk');
  const reduced = usePrefersReducedMotion();
  const sections = useMemo(() => splitQuestionDeskReportSections(text, locale), [locale, text]);
  if (!sections) return <div data-testid="question-desk-report-raw">
    <p className="mb-3 text-label leading-label text-[color:var(--color-text-tertiary)]">{t('report.rawFallback')}</p>
    <SafeReportMarkdown text={text} sources={sources} onOpenSource={onOpenSource} />
  </div>;
  const renderSection = (index: number) => {
    const section = sections[index]!;
    return <motion.section key={section.title} data-report-section-index={index} data-testid={`question-desk-report-section-${index}`}
      data-report-chapter-start={index === 2 ? 'true' : undefined}
      initial={reduced ? OVERLAY_RISE_REDUCED : OVERLAY_RISE} animate={OVERLAY_SETTLED}
      transition={{ ...(reduced ? MOTION.fast : MOTION.settle), delay: reduced ? 0 : index * STAGGER }}
      className={index === 0 ? 'max-w-[var(--measure-doc-column)] border-b border-[color:var(--color-border-soft)] pb-6'
        : index === 3 ? 'border-t border-[color:var(--color-border-soft)] pt-5' : ''}>
      <div data-report-section-heading="true" className={index === 0 ? 'mb-4' : 'mb-2'}>
        <h5 className={index === 0
          ? 'text-title font-[var(--font-weight-strong)] leading-title text-[color:var(--color-indigo-text-soft)]'
          : 'text-title font-[var(--font-weight-strong)] leading-title text-[color:var(--color-text-primary)]'}>{section.title}</h5>
      </div>
      {section.markdown ? <SafeReportMarkdown text={section.markdown} sources={sources} onOpenSource={onOpenSource} answer={index === 0} />
        : <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t('report.emptySection')}</p>}
    </motion.section>;
  };
  return <div data-report-sections="true" data-testid="question-desk-report-sections" className="space-y-7">
    {renderSection(0)}
    <div data-report-evidence-pair="true">
      {renderSection(1)}
      <div data-report-right="true" className="flex flex-col gap-7">
        {renderSection(2)}
        {renderSection(3)}
      </div>
    </div>
  </div>;
}

/** The agent's unreviewed report, with its exports; print and Markdown read exactly what it shows. */
export function DeskReport({ report, coverageCompact, coverageInfo, sources, dockOpen, reducedMotion, onOpenSource, onFileReport, filingReport, fileReportNote }: {
  report: QuestionDeskReportDraft;
  coverageCompact: string;
  /** The scope glyph; print drops it with the actions. */
  coverageInfo: ReactNode;
  sources: readonly LibrarySourceRow[];
  dockOpen: boolean;
  reducedMotion: boolean;
  onOpenSource: (path: string, anchor?: string) => void;
  onFileReport: (() => void) | null;
  filingReport: boolean;
  fileReportNote: string | null;
}) {
  const t = useTranslations('library.questionDesk');
  const locale = useLocale();
  const [printError, setPrintError] = useState<string | null>(null);
  const printCleanupRef = useRef<(() => void) | null>(null);
  const printContentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => { printCleanupRef.current?.(); }, []);

  const downloadReport = () => {
    const markdown = serializeQuestionDeskReport(report, locale, new Set(sources.map((source) => source.path)));
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = questionDeskReportFilename(report);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const printReport = async () => {
    setPrintError(null);
    const root = document.documentElement;
    const printMedia = window.matchMedia?.('print');
    printCleanupRef.current?.();
    const printable = printContentRef.current;
    if (!printable) { setPrintError(t('report.printFailed')); return; }
    const printRoot = document.createElement('div');
    printRoot.dataset.questionDeskPrintRoot = 'true';
    const printPageStyle = document.createElement('style');
    printPageStyle.textContent = '@page { size: A4; margin: 18mm 16mm; }';
    const content = printable.cloneNode(true) as HTMLDivElement;
    content.removeAttribute('data-testid');
    content.querySelectorAll('[data-report-actions], [data-report-scope-disclosure]').forEach((control) => control.remove());
    content.querySelectorAll('[id], [data-testid]').forEach((element) => {
      element.removeAttribute('id');
      element.removeAttribute('data-testid');
    });
    printRoot.appendChild(content);
    const onMediaChange = () => { if (!printMedia?.matches) clear(); };
    const clear = () => {
      delete root.dataset.printScope;
      printRoot.remove();
      printPageStyle.remove();
      window.removeEventListener('afterprint', clear);
      printMedia?.removeEventListener?.('change', onMediaChange);
      if (printCleanupRef.current === clear) printCleanupRef.current = null;
    };
    printCleanupRef.current = clear;
    document.body.appendChild(printRoot);
    document.head.appendChild(printPageStyle);
    root.dataset.printScope = 'question-desk';
    window.addEventListener('afterprint', clear, { once: true });
    printMedia?.addEventListener?.('change', onMediaChange);
    try { await Promise.resolve(window.print()); }
    catch { clear(); setPrintError(t('report.printFailed')); }
  };

  return <motion.section key={`${report.searchId}:${report.generatedAt}`}
    initial={reducedMotion ? false : OVERLAY_RISE} animate={OVERLAY_SETTLED} transition={MOTION.settle}
    data-testid="question-desk-report" data-question-desk-report="true" data-dock-open={dockOpen ? 'true' : 'false'} aria-labelledby="question-desk-report-title">
    <p role="status" className="sr-only">{t('report.readyNotice')}</p>
    <div ref={printContentRef} data-question-desk-print="true" data-testid="question-desk-print-content">
      <header className="mb-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p data-testid="question-desk-report-masthead" className={`text-caption leading-caption text-[color:var(--color-indigo-text-soft)] ${latinEyebrowClass(locale, 'tracking-[var(--tracking-caps-08)]')}`}>{t('report.masthead')}</p>
            <p className="mt-1 text-label leading-label text-[color:var(--color-indigo-text-soft)]">{t('report.unreviewed')}</p>
          </div>
          <div data-report-actions="true" className="min-w-0">
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Chip tone="muted" onClick={downloadReport} data-testid="question-desk-download-markdown">{t('report.downloadMarkdown')}</Chip>
              <Chip tone="muted" onClick={() => void printReport()} data-testid="question-desk-print-pdf">{t('report.printPdf')}</Chip>
              <Chip tone="accent" disabled={!onFileReport || filingReport} onClick={onFileReport ?? undefined} data-testid="question-desk-file-report">
                {filingReport ? t('report.filing') : t('report.file')}
              </Chip>
            </div>
            {printError ? <p role="alert" className="mt-2 text-label leading-label text-[color:var(--color-danger-text)]" data-testid="question-desk-print-error">{printError}</p> : null}
            {fileReportNote ? <p role="alert" className="mt-2 text-label leading-label text-[color:var(--color-danger-text)]">{fileReportNote}</p> : null}
          </div>
        </div>
        <h3 id="question-desk-report-title" className="mt-3 max-w-[var(--measure-doc-column)] text-display font-[var(--font-weight-strong)] leading-display tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">{report.question}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-label leading-label text-[color:var(--color-text-tertiary)]">
          <time dateTime={report.generatedAt} data-testid="question-desk-report-generated">{t('report.generated', { time: formatReportTimestamp(report.generatedAt, locale) })}</time>
          <span>{coverageCompact}</span>
          <span data-report-scope-disclosure="true" className="inline-flex">{coverageInfo}</span>
        </div>
      </header>
      <DraftReport text={report.text} sources={sources} onOpenSource={onOpenSource} />
      <footer className="mt-6 border-t border-[color:var(--color-border-soft)] pt-3 text-label leading-label text-[color:var(--color-text-tertiary)]">
        <h5 className="font-[var(--font-weight-strong)] text-[color:var(--color-text-secondary)]">{t('report.searchScope')}</h5>
        <p className="mt-1">{report.coverage}</p>
        <p className="mt-1">{report.limits}</p>
        <p className="mt-2">{t('report.caveat')}</p>
        <p className="mt-2">{t('report.citationNote')}</p>
      </footer>
    </div>
  </motion.section>;
}
