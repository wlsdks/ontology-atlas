import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "use-intl";

import type { LibraryWikiPage } from "@/entities/docs-vault";
import type { LibraryUiModel, LintFinding } from "@/features/library";
import { useSurfaceSwap } from "@/shared/lib/render-timing/use-presence";
import { yieldToFrame } from "@/shared/lib/scheduling/yield-to-frame";
import { useStaggerOnce } from "@/shared/motion/stagger";
import { Button } from "@/shared/ui";

import {
  WikiIndexBuilder,
  wikiIndexItems,
  type WikiIndexGroupKey,
  type WikiIndexGroupView,
  type WikiIndexItem,
} from "../../lib/wiki/wiki-index";
import { arrivalStep, groupLabel, itemKey, wikiRowText } from "../../model/index-column/wiki-index-rows";
import { IndexFrame, INDEX_VIEW, MATCHES_VIEW, frameSelector, type ViewKey } from "./IndexFrame";
import { IndexGroupChip, IndexGroupHeading, IndexGroupMore } from "./IndexGroup";
import { IndexRow } from "./IndexRow";
import type { StopProps } from "./WindowedItems";

/** Work per slice before the browser gets a turn, so typing and scrolling never wait on the index. */
const SLICE_BUDGET_MS = 8;
const CLOCK_TICK_MS = 60_000;

export interface WikiIndexProps {
  model: Pick<LibraryUiModel, "wikiPages" | "verdicts" | "pairing" | "sources" | "structural">;
  /** The latest Check wiki's findings; keep the array stable between Checks. */
  findings: readonly LintFinding[];
  /** The open folder's identity: the index is rebuilt and the arrival plays once per folder. */
  vaultScope: string;
  selectedSlug: string | null;
  onOpenPage: (slug: string) => void;
  onOpenCheckResults: () => void;
  /** The first-day press: to Sources when there are sources, else adding them. */
  onEmptyPress: () => void;
  /** Pages read so far while the folder is still being read; null once it is read. */
  readingCount: number | null;
  /** The filter's matches in rank order, drawn with the same rows in place of the groups; null when no filter is typed. */
  matches?: readonly LibraryWikiPage[] | null;
}

const NO_ITEMS: readonly WikiIndexItem[] = Object.freeze([]);

/** A group shown alone lists its rows under the chip, which names it, so it has no heading row. */
function groupItems(group: WikiIndexGroupView | null): readonly WikiIndexItem[] {
  return group ? wikiIndexItems([group]).filter((item) => item.type !== "heading") : NO_ITEMS;
}

interface AloneView {
  scope: string;
  key: WikiIndexGroupKey;
  /** Where the group's heading was drawn, so the chip rises from it; null when it was off screen. */
  headingTop: number | null;
}

export function WikiIndex({
  model,
  findings,
  vaultScope,
  selectedSlug,
  onOpenPage,
  onOpenCheckResults,
  onEmptyPress,
  readingCount,
  matches = null,
}: WikiIndexProps) {
  const t = useTranslations("library");
  const locale = useLocale();
  // One index per folder and locale: a new folder never inherits the last one's pages or open group.
  const { builder } = useMemo(() => ({ builder: new WikiIndexBuilder(locale), scope: vaultScope }), [locale, vaultScope]);
  const [built, setBuilt] = useState<{ builder: WikiIndexBuilder; version: number } | null>(null);
  const version = built?.builder === builder ? built.version : -1;
  const writeUpsBySource = model.pairing.writeUpsBySource;

  useEffect(() => {
    builder.retarget(model.wikiPages, { verdicts: model.verdicts, writeUpsBySource, findings, nowMs: Date.now() });
    let cancelled = false;
    void (async () => {
      for (;;) {
        const sliceStart = performance.now();
        const sweep = builder.advance(() => performance.now() - sliceStart >= SLICE_BUDGET_MS);
        setBuilt((held) => (held?.builder === builder && held.version === builder.version ? held : { builder, version: builder.version }));
        if (sweep.done) return;
        await yieldToFrame();
        if (cancelled) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [builder, findings, model.verdicts, model.wikiPages, writeUpsBySource]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // The first draw waits for the first check results, so "Needs a look" does not push the column down.
  const judged = model.verdicts.size > 0 || model.structural.unmeasured.length === 0;
  const [alone, setAlone] = useState<AloneView | null>(null);
  const aloneKey = alone?.scope === vaultScope ? alone.key : null;
  const aloneGroup = useMemo(() => (aloneKey && version >= 0 ? builder.group(aloneKey) : null), [aloneKey, builder, version]);
  if (alone && version >= 0 && !aloneGroup) setAlone(null);
  const groups = useMemo(() => (version >= 0 && judged ? builder.groups() : []), [builder, judged, version]);
  const indexItems = useMemo(() => wikiIndexItems(groups), [groups]);

  const matchItems = useMemo(() => {
    if (!matches || version < 0) return NO_ITEMS;
    const items: WikiIndexItem[] = [];
    for (const page of matches) {
      const entry = builder.entry(page.slug);
      if (entry) items.push({ type: "row", group: entry.home, entry });
    }
    return items;
  }, [builder, matches, version]);

  const viewKey: ViewKey = matches ? MATCHES_VIEW : aloneGroup ? aloneGroup.key : INDEX_VIEW;
  const { leaving } = useSurfaceSwap<ViewKey>(viewKey);
  const leavingAlone = leaving && leaving !== INDEX_VIEW && leaving !== MATCHES_VIEW ? leaving : null;
  const leavingGroup = useMemo(() => (leavingAlone && version >= 0 ? builder.group(leavingAlone) : null), [builder, leavingAlone, version]);
  const aloneItems = useMemo(() => groupItems(aloneGroup), [aloneGroup]);
  const leavingItems = useMemo(() => groupItems(leavingGroup), [leavingGroup]);
  const itemsOf = (view: ViewKey): readonly WikiIndexItem[] =>
    view === INDEX_VIEW ? indexItems : view === MATCHES_VIEW ? matchItems : view === aloneGroup?.key ? aloneItems : view === leavingGroup?.key ? leavingItems : NO_ITEMS;
  const views = [viewKey, leaving].filter((view): view is ViewKey => view !== null).sort((a, b) => (a === INDEX_VIEW ? -1 : b === INDEX_VIEW ? 1 : 0));

  const rootRef = useRef<HTMLDivElement | null>(null);
  /** The index's scroll while a group is shown alone, restored when it closes. */
  const indexScrollRef = useRef(0);
  /** The scroll and focus a swap lands on: the pressed line leaves, so focus would fall to the page. */
  const pendingSwapRef = useRef<{ scrollTop: number; focus: string | null } | null>(null);
  const currentScroller = () => rootRef.current?.querySelector<HTMLElement>(`${frameSelector(viewKey)} [data-index-scroller]`) ?? null;
  const showAlone = (key: WikiIndexGroupKey) => {
    indexScrollRef.current = currentScroller()?.scrollTop ?? 0;
    const heading = rootRef.current?.querySelector(`${frameSelector(INDEX_VIEW)} [data-index-heading-of="${CSS.escape(key)}"]`);
    pendingSwapRef.current = { scrollTop: 0, focus: "[data-index-chip]" };
    setAlone({ scope: vaultScope, key, headingTop: heading ? heading.getBoundingClientRect().top : null });
  };
  // Typing in the filter leaves the index from wherever it stood; clearing the field lands there again.
  const lastViewRef = useRef<ViewKey>(viewKey);
  useLayoutEffect(() => {
    const was = lastViewRef.current;
    lastViewRef.current = viewKey;
    if (was === viewKey) return;
    if (viewKey === MATCHES_VIEW && was === INDEX_VIEW) {
      indexScrollRef.current = rootRef.current?.querySelector<HTMLElement>(`${frameSelector(INDEX_VIEW)} [data-index-scroller]`)?.scrollTop ?? 0;
    }
    if (was === MATCHES_VIEW && viewKey === INDEX_VIEW) pendingSwapRef.current = { scrollTop: indexScrollRef.current, focus: null };
  }, [viewKey]);
  const clearAlone = () => {
    if (aloneKey) pendingSwapRef.current = { scrollTop: indexScrollRef.current, focus: `[data-index-group="${CSS.escape(aloneKey)}"] [data-index-more]` };
    setAlone(null);
  };
  useLayoutEffect(() => {
    const pending = pendingSwapRef.current;
    const frame = rootRef.current?.querySelector<HTMLElement>(frameSelector(viewKey));
    const scroller = frame?.querySelector<HTMLElement>("[data-index-scroller]");
    if (!pending || !frame || !scroller) return undefined;
    pendingSwapRef.current = null;
    scroller.scrollTop = pending.scrollTop;
    if (pending.focus === null) return undefined;
    const focus = pending.focus;
    // At once when the target is drawn, so the next key lands; a windowed one mounts after the scroll.
    const target = frame.querySelector<HTMLElement>(focus);
    if (target) {
      target.focus({ preventScroll: true });
      return undefined;
    }
    const id = requestAnimationFrame(() => frame.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [viewKey]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !aloneGroup || viewKey !== aloneGroup.key) return;
    event.stopPropagation();
    clearAlone();
  };

  const arrivalIds = useMemo(() => indexItems.map(itemKey), [indexItems]);
  const arrival = useStaggerOnce({ vaultKey: vaultScope, listKey: "wiki-index", ids: arrivalIds });

  if (model.wikiPages.length === 0) {
    return (
      <div data-testid="wiki-index" data-state="empty" className="px-4 pt-[22px]">
        <h3 className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{t("wikiIndex.empty.title")}</h3>
        <p className="mt-1.5 text-label text-[color:var(--color-text-tertiary)]">{t("wikiIndex.empty.body")}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={onEmptyPress}>
          {model.sources.length > 0 ? t("wikiIndex.empty.toSources") : t("sources.add")}
        </Button>
      </div>
    );
  }

  /** `current` is false for the view a swap is fading out: inert, so it names no row by test id. */
  const renderItem = (item: WikiIndexItem, stop: StopProps | null, current: boolean) => {
    const key = itemKey(item);
    const enter = arrival(key, arrivalStep(item.group));
    if (item.type === "heading") {
      return (
        <div key={key} data-glide-key={key} data-index-heading-of={item.group}>
          <div className={enter.className} style={enter.style}>
            <IndexGroupHeading label={groupLabel(item.group, t)} count={item.count} locale={locale} />
          </div>
        </div>
      );
    }
    if (item.type === "more") {
      const attention = item.group === "attention";
      return (
        <div key={key} data-glide-key={key} data-index-group={item.group}>
          <div className={enter.className} style={enter.style}>
            <IndexGroupMore
              label={attention ? t("wikiIndex.attentionAll", { count: item.count }) : t("wikiIndex.showAll", { count: item.count })}
              onPress={attention ? onOpenCheckResults : () => showAlone(item.group)}
              {...stop!}
            />
          </div>
        </div>
      );
    }
    const { entry } = item;
    const { needsLook, detail, date, label } = wikiRowText({ entry, group: item.group, nowMs, locale, t });
    return (
      <div key={key} data-glide-key={key} data-index-slug={entry.page.slug} data-index-group={item.group}>
        <div className={enter.className} style={enter.style}>
          <IndexRow
            title={entry.title}
            detail={detail}
            date={date}
            attention={needsLook}
            selected={entry.page.slug === selectedSlug}
            label={label}
            onPress={() => onOpenPage(entry.page.slug)}
            testId={current && item.group === entry.home ? `library-wiki-${entry.page.slug}` : undefined}
            {...stop!}
          />
        </div>
      </div>
    );
  };

  const readingLine = readingCount !== null ? (
    <p className="px-4 pt-2 text-label tabular-nums text-[color:var(--color-text-tertiary)]">
      {t("wikiIndex.reading", { count: readingCount })}
    </p>
  ) : null;

  return (
    <div
      ref={rootRef}
      data-testid="wiki-index"
      data-state={matches ? "matches" : aloneGroup ? "alone" : "index"}
      className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)]"
      onKeyDown={onKeyDown}
    >
      {views.map((view) => {
        const group = view === INDEX_VIEW || view === MATCHES_VIEW ? null : view === aloneGroup?.key ? aloneGroup : leavingGroup;
        const chip = group ? (
          <IndexGroupChip
            label={groupLabel(group.key, t)}
            count={group.count}
            clearLabel={t("wikiIndex.groupClear")}
            onClear={clearAlone}
            locale={locale}
          />
        ) : null;
        return (
          <IndexFrame
            key={view}
            view={view}
            current={view === viewKey}
            fadeIn={leaving !== null}
            quick={view === MATCHES_VIEW || leaving === MATCHES_VIEW}
            chipFromTop={view === aloneGroup?.key ? alone?.headingTop ?? null : null}
            chip={chip}
            items={itemsOf(view)}
            label={group ? groupLabel(group.key, t) : view === MATCHES_VIEW ? t("wiki.listAria") : undefined}
            renderItem={renderItem}
            footer={readingLine}
          />
        );
      })}
    </div>
  );
}
