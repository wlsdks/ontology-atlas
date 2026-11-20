"use client";

import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { useTranslations } from "next-intl";
import { BookText, FileText } from "lucide-react";

import { OntologyMapKindGlyph } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { citedSources, type FootLink, type FootSource } from "./wiki-reader-facts";

/**
 * The citations the viewer drew in the painted body, per NFC path, or null before a body is
 * painted; held outside React so its arrival renders the foot alone.
 */
export interface PaintedBody {
  get: () => ReadonlyMap<string, number> | null;
  set: (drawn: ReadonlyMap<string, number> | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createPaintedBody(): PaintedBody {
  let body: ReadonlyMap<string, number> | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => body,
    set(next) {
      if (next === body) return;
      body = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Where the open page sits: the sources it cites with how many citations each, the pages that link
 * here, the concepts it touches. A group with nothing is absent; nothing is read to draw it.
 */
export function WikiPageFoot({ painted, originals, isPresent, linkedFrom, concepts, onOpenSource, onOpenPage, onOpenConcept, t }: {
  /** The citations the viewer drew; the foot counts only those. */
  painted: PaintedBody;
  originals: readonly { path: string; name: string; state: unknown }[];
  isPresent: (path: string) => boolean;
  linkedFrom: readonly FootLink[];
  concepts: readonly FootLink[];
  onOpenSource: (path: string) => void;
  onOpenPage: (slug: string) => void;
  onOpenConcept: (slug: string) => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const body = useSyncExternalStore(painted.subscribe, painted.get, () => null);
  const cited: FootSource[] = useMemo(
    () => (body === null ? [] : citedSources(originals, body, isPresent)),
    [body, isPresent, originals],
  );
  if (body === null) return null;
  if (cited.length === 0 && linkedFrom.length === 0 && concepts.length === 0) return null;

  return (
    <footer
      data-testid="wiki-page-foot"
      className="mx-auto mb-10 w-full max-w-[var(--measure-doc-column)] px-6 md:px-10"
    >
      <div className="grid gap-x-8 gap-y-6 border-t border-[color:var(--color-border-soft)] pt-6 md:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
        {cited.length > 0 ? (
          <FootGroup testId="wiki-foot-sources" title={t("wikiReader.citedSources")}>
            {cited.map((source) => (
              <FootRow
                key={source.path}
                icon={<FileText size={ICON_SIZE.sm} aria-hidden />}
                label={source.name}
                meta={t("wikiReader.citationCount", { count: source.count })}
                title={source.path}
                onPress={source.present ? () => onOpenSource(source.path) : null}
              />
            ))}
          </FootGroup>
        ) : null}
        {linkedFrom.length > 0 ? (
          <FootGroup testId="wiki-foot-linked-from" title={t("wikiReader.linkedFrom")}>
            {linkedFrom.map((page) => (
              <FootRow
                key={page.slug}
                icon={<BookText size={ICON_SIZE.sm} aria-hidden />}
                label={page.title}
                onPress={() => onOpenPage(page.slug)}
              />
            ))}
          </FootGroup>
        ) : null}
        {concepts.length > 0 ? (
          <FootGroup testId="wiki-foot-concepts" title={t("wikiReader.concepts")}>
            {concepts.map((concept) => (
              <FootRow
                key={concept.slug}
                icon={<OntologyMapKindGlyph kind={concept.kind ?? ""} size={ICON_SIZE.sm} />}
                label={concept.title}
                onPress={() => onOpenConcept(concept.slug)}
              />
            ))}
          </FootGroup>
        ) : null}
      </div>
    </footer>
  );
}

function FootGroup({ testId, title, children }: { testId: string; title: string; children: ReactNode }) {
  return (
    <section data-testid={testId} aria-label={title} className="min-w-0">
      <h3 className="mb-1.5 text-label font-[var(--font-weight-emphasis)] leading-label text-[color:var(--color-text-tertiary)]">
        {title}
      </h3>
      <ul className="-mx-2 flex flex-col">{children}</ul>
    </section>
  );
}

/** One row: one line high like its neighbours; a long name wraps instead of being cut. */
function FootRow({ icon, label, meta, title, onPress }: {
  icon: ReactNode;
  label: string;
  meta?: string;
  title?: string;
  onPress: (() => void) | null;
}) {
  const inner = (
    <>
      <span className="flex h-5 w-4 flex-none items-center justify-center opacity-70">{icon}</span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{label}</span>
      {meta ? <span className="flex-none text-label leading-label text-[color:var(--color-text-tertiary)]">{meta}</span> : null}
    </>
  );
  const rowClass = "min-h-9 items-start gap-2 px-2 py-2 text-body leading-label";
  return (
    <li data-testid="wiki-foot-row">
      {onPress ? (
        <button type="button" title={title} onClick={onPress}
          className={controlClass({ shape: "row", tone: "muted", hoverInk: "strong", className: rowClass })}>
          {inner}
        </button>
      ) : (
        <span title={title} className={`flex w-full text-[color:var(--color-text-tertiary)] ${rowClass}`}>{inner}</span>
      )}
    </li>
  );
}
