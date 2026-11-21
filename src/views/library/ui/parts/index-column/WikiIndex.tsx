"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { LibraryUiModel, LintFinding } from "@/features/library";
import { cn } from "@/shared/lib/cn";
import { useRovingRows } from "@/shared/lib/list-rows/use-roving-rows";
import { useWindowedRows } from "@/shared/lib/list-rows/use-windowed-rows";
import { useSurfaceSwap } from "@/shared/lib/render-timing/use-presence";
import { yieldToFrame } from "@/shared/lib/scheduling/yield-to-frame";
import { useStaggerOnce } from "@/shared/motion/stagger";
import { Button } from "@/shared/ui";

import {
  WikiIndexBuilder,
  wikiIndexDay,
  wikiIndexItems,
  type WikiIndexEntry,
  type WikiIndexGroupKey,
  type WikiIndexGroupView,
  type WikiIndexItem,
  type WikiIndexReason,
} from "../../../lib/wiki/wiki-index";
import { IndexGroupChip, IndexGroupHeading, IndexGroupMore } from "./IndexGroup";
import { IndexRow } from "./IndexRow";
import { arriveInPlace, fadeView, glideFrom } from "./index-motion";

/** Work per slice before the browser gets a turn, so typing and scrolling never wait on the index. */
const SLICE_BUDGET_MS = 8;
/** Item heights are fixed, so the window and keyboard scrolling compute offsets instead of measuring. */
const ITEM_HEIGHT_PX: Record<WikiIndexItem["type"], number> = { heading: 38, row: 44, more: 32 };
const LIST_PAD_TOP_PX = 2;
const CLOCK_TICK_MS = 60_000;
const INDEX_VIEW = "index";

type Translate = ReturnType<typeof useTranslations<"library">>;
type RulePath = "report.rule.uncited-fact";
/** The whole index, or one group shown alone. */
type ViewKey = WikiIndexGroupKey | typeof INDEX_VIEW;

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
}

function groupLabel(key: WikiIndexGroupKey, t: Translate): string {
  return key.startsWith("folder:") ? `${key.slice("folder:".length)}/` : t(`wikiIndex.group.${key as "attention"}`);
}

function reasonText(reason: WikiIndexReason, t: Translate): string {
  if (reason.kind !== "rule") return t(`wikiIndex.reason.${reason.kind}`);
  const path = `report.rule.${reason.code}` as RulePath;
  return t.has(path) ? t(path) : reason.code;
}

function provenance(entry: WikiIndexEntry, t: Translate): string {
  const sources = entry.page.sourcePaths;
  if (sources.length === 0) return t("wikiIndex.row.noSource");
  if (sources.length > 1) return t("wikiIndex.row.sources", { count: sources.length });
  return sources[0]!.slice(sources[0]!.lastIndexOf("/") + 1);
}

function dayText(entry: WikiIndexEntry, nowMs: number, locale: string, t: Translate): string | null {
  const day = wikiIndexDay(entry.writtenAtMs, nowMs);
  if (!day) return null;
  if (day.kind === "ago") return t("wikiIndex.day.ago", { count: day.days });
  if (day.kind !== "date") return t(`wikiIndex.day.${day.kind}`);
  return new Date(day.ms).toLocaleDateString(locale, day.otherYear
    ? { year: "numeric", month: "short", day: "numeric" }
    : { month: "short", day: "numeric" });
}

function itemKey(item: WikiIndexItem): string {
  return item.type === "row" ? `${item.group}\u0000${item.entry.page.slug}` : `${item.type}\u0000${item.group}`;
}

/** The arrival step by kind of group, so a group appearing late never shifts the others' delays. */
function arrivalStep(group: WikiIndexGroupKey): number {
  if (group === "attention") return 0;
  if (group === "answers") return 1;
  return group.startsWith("folder:") ? 2 : 3;
}

const NO_ITEMS: readonly WikiIndexItem[] = Object.freeze([]);

/** A group shown alone lists its rows under the chip, which names it, so it has no heading row. */
function groupItems(group: WikiIndexGroupView | null): readonly WikiIndexItem[] {
  return group ? wikiIndexItems([group]).filter((item) => item.type !== "heading") : NO_ITEMS;
}

function frameSelector(view: ViewKey): string {
  return `[data-index-frame="${CSS.escape(view)}"]`;
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

  const viewKey: ViewKey = aloneGroup ? aloneGroup.key : INDEX_VIEW;
  const { leaving } = useSurfaceSwap<ViewKey>(viewKey);
  const leavingAlone = leaving && leaving !== INDEX_VIEW ? leaving : null;
  const leavingGroup = useMemo(() => (leavingAlone && version >= 0 ? builder.group(leavingAlone) : null), [builder, leavingAlone, version]);
  const aloneItems = useMemo(() => groupItems(aloneGroup), [aloneGroup]);
  const leavingItems = useMemo(() => groupItems(leavingGroup), [leavingGroup]);
  const itemsOf = (view: ViewKey): readonly WikiIndexItem[] =>
    view === INDEX_VIEW ? indexItems : view === aloneGroup?.key ? aloneItems : view === leavingGroup?.key ? leavingItems : NO_ITEMS;
  const views = [viewKey, leaving].filter((view): view is ViewKey => view !== null).sort((a, b) => (a === INDEX_VIEW ? -1 : b === INDEX_VIEW ? 1 : 0));

  const rootRef = useRef<HTMLDivElement | null>(null);
  /** The index's scroll while a group is shown alone, restored when it closes. */
  const indexScrollRef = useRef(0);
  /** The scroll and focus a swap lands on: the pressed line leaves, so focus would fall to the page. */
  const pendingSwapRef = useRef<{ scrollTop: number; focus: string } | null>(null);
  const currentScroller = () => rootRef.current?.querySelector<HTMLElement>(`${frameSelector(viewKey)} [data-index-scroller]`) ?? null;
  const showAlone = (key: WikiIndexGroupKey) => {
    indexScrollRef.current = currentScroller()?.scrollTop ?? 0;
    const heading = rootRef.current?.querySelector(`${frameSelector(INDEX_VIEW)} [data-index-heading-of="${CSS.escape(key)}"]`);
    pendingSwapRef.current = { scrollTop: 0, focus: "[data-index-chip]" };
    setAlone({ scope: vaultScope, key, headingTop: heading ? heading.getBoundingClientRect().top : null });
  };
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
    // At once when the target is drawn, so the next key lands; a windowed one mounts after the scroll.
    const target = frame.querySelector<HTMLElement>(pending.focus);
    if (target) {
      target.focus({ preventScroll: true });
      return undefined;
    }
    const id = requestAnimationFrame(() => frame.querySelector<HTMLElement>(pending.focus)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [viewKey]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !aloneGroup) return;
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

  const renderItem = (item: WikiIndexItem, stop: StopProps | null) => {
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
    const reasons = entry.reasons.map((reason) => reasonText(reason, t));
    const inAttention = item.group === "attention";
    const detail = inAttention
      ? reasons.length > 1 ? t("wikiIndex.row.moreReasons", { reason: reasons[0]!, count: reasons.length - 1 }) : reasons[0]!
      : provenance(entry, t);
    const date = dayText(entry, nowMs, locale, t);
    const label = [entry.title, entry.page.summary, reasons.join(", "), provenance(entry, t), date].filter(Boolean).join(" · ");
    return (
      <div key={key} data-glide-key={key} data-index-slug={entry.page.slug} data-index-group={item.group}>
        <div className={enter.className} style={enter.style}>
          <IndexRow
            title={entry.title}
            detail={detail}
            date={date}
            attention={reasons.length > 0}
            selected={entry.page.slug === selectedSlug}
            label={label}
            onPress={() => onOpenPage(entry.page.slug)}
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
      data-state={aloneGroup ? "alone" : "index"}
      className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)]"
      onKeyDown={onKeyDown}
    >
      {views.map((view) => {
        const group = view === INDEX_VIEW ? null : view === aloneGroup?.key ? aloneGroup : leavingGroup;
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
            chipFromTop={view === aloneGroup?.key ? alone?.headingTop ?? null : null}
            chip={chip}
            items={itemsOf(view)}
            label={group ? groupLabel(group.key, t) : undefined}
            renderItem={renderItem}
            footer={readingLine}
          />
        );
      })}
    </div>
  );
}

/**
 * One view of the column: the whole index, or a group alone under its chip. Two exist at once only
 * while one replaces the other; the leaving one is inert and fades out from where it was drawn.
 */
function IndexFrame({
  view,
  current,
  fadeIn,
  chipFromTop,
  chip,
  items,
  label,
  renderItem,
  footer,
}: {
  view: ViewKey;
  current: boolean;
  /** Mounted as a swap's incoming view, so it fades in rather than being there at once. */
  fadeIn: boolean;
  chipFromTop: number | null;
  chip: ReactNode;
  items: readonly WikiIndexItem[];
  label: string | undefined;
  renderItem: (item: WikiIndexItem, stop: StopProps | null) => ReactNode;
  footer: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const firstDraw = !mountedRef.current;
    mountedRef.current = true;
    if (firstDraw && !fadeIn) return;
    if (firstDraw) frame.style.opacity = "0";
    fadeView(frame, current);
    frame.style.opacity = "";
    const chipEl = frame.querySelector("[data-index-chip]");
    if (firstDraw && chipEl && chipFromTop !== null) glideFrom(chipEl, chipFromTop - chipEl.getBoundingClientRect().top);
    // `fadeIn` and `chipFromTop` matter only at mount; `current` drives every later fade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  return (
    <div
      ref={frameRef}
      data-index-frame={view}
      data-current={current ? "" : undefined}
      inert={!current || undefined}
      aria-hidden={!current || undefined}
      className={cn("col-start-1 row-start-1 flex min-h-0 flex-col", current ? "z-[1]" : "pointer-events-none")}
    >
      {chip}
      <div ref={scrollerRef} data-index-scroller="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3 [overflow-anchor:none]">
        <WindowedItems items={items} scrollerRef={scrollerRef} label={label} renderItem={renderItem} />
        {footer}
      </div>
    </div>
  );
}

interface StopProps {
  rowIndex: number;
  tabIndex: number;
  onFocus: () => void;
}

/** The row that held focus, so it keeps focus when an update moves it out of the window. */
interface HeldFocus {
  el: HTMLElement;
  key: string;
  slug: string | null;
  group: string | null;
}

/**
 * One list's window, keyboard stops and moves. Each view has its own, so a swap between the index
 * and one group starts a fresh window rather than reading the other list's row heights. When the
 * data changes, rows still drawn glide from where they were and rows new to the data fade in.
 */
function WindowedItems({
  items,
  scrollerRef,
  label,
  renderItem,
}: {
  items: readonly WikiIndexItem[];
  scrollerRef: RefObject<HTMLDivElement | null>;
  label: string | undefined;
  renderItem: (item: WikiIndexItem, stop: StopProps | null) => ReactNode;
}) {
  const itemTops = useMemo(() => {
    const tops = new Float64Array(items.length + 1);
    for (let i = 0; i < items.length; i += 1) tops[i + 1] = tops[i]! + ITEM_HEIGHT_PX[items[i]!.type];
    return tops;
  }, [items]);
  const stops = useMemo(() => items.flatMap((item, index) => (item.type === "heading" ? [] : [index])), [items]);
  const stopOfItem = useMemo(() => new Map(stops.map((itemIndex, stop) => [itemIndex, stop])), [stops]);

  const [range, listRef] = useWindowedRows<HTMLDivElement>({ count: items.length, estimate: ITEM_HEIGHT_PX.row });
  const scrollToStop = useCallback((stop: number) => {
    const scroller = scrollerRef.current;
    const itemIndex = stops[stop];
    if (!scroller || itemIndex === undefined) return;
    const top = LIST_PAD_TOP_PX + itemTops[itemIndex]!;
    const bottom = LIST_PAD_TOP_PX + itemTops[itemIndex + 1]!;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight;
  }, [itemTops, scrollerRef, stops]);
  const renderedStops = useMemo(() => {
    let start = stops.length;
    let end = 0;
    for (let i = range.start; i < range.end; i += 1) {
      const stop = stopOfItem.get(i);
      if (stop === undefined) continue;
      start = Math.min(start, stop);
      end = stop + 1;
    }
    return { start: Math.min(start, end), end };
  }, [range.end, range.start, stopOfItem, stops.length]);
  const roving = useRovingRows({ count: stops.length, listRef, scrollToRow: scrollToStop, rendered: renderedStops });

  const heldFocusRef = useRef<HeldFocus | null>(null);
  const onFocusCapture = (event: FocusEvent<HTMLDivElement>) => {
    const wrapper = (event.target as HTMLElement).closest<HTMLElement>("[data-glide-key]");
    heldFocusRef.current = wrapper ? {
      el: event.target as HTMLElement,
      key: wrapper.dataset.glideKey!,
      slug: wrapper.dataset.indexSlug ?? null,
      group: wrapper.dataset.indexGroup ?? null,
    } : null;
  };
  const onBlurCapture = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && !event.currentTarget.contains(next)) heldFocusRef.current = null;
  };

  const lastTopsRef = useRef<{ items: readonly WikiIndexItem[]; tops: Map<string, number> } | null>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    const tops = new Map<string, number>();
    items.forEach((item, index) => tops.set(itemKey(item), itemTops[index]!));
    const last = lastTopsRef.current;
    lastTopsRef.current = { items, tops };
    if (!list || !last || last.items.length === 0) return;
    const reach = scrollerRef.current?.clientHeight ?? 0;
    for (const wrapper of list.querySelectorAll<HTMLElement>(":scope > [data-glide-key]")) {
      const key = wrapper.dataset.glideKey!;
      const was = last.tops.get(key);
      if (was === undefined) arriveInPlace(wrapper);
      else if (Math.abs(was - tops.get(key)!) <= reach) glideFrom(wrapper, was - tops.get(key)!);
    }
    keepFocus(list, heldFocusRef.current);
  }, [items, itemTops, listRef, scrollerRef]);

  return (
    <div
      ref={listRef}
      onKeyDown={roving.onKeyDown}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
      aria-label={label}
      data-window={`${range.start}-${range.end}`}
      className="flex flex-col px-2"
      style={{ paddingTop: LIST_PAD_TOP_PX + range.before, paddingBottom: range.after }}
    >
      {items.slice(range.start, range.end).map((item, offset) => {
        const stop = stopOfItem.get(range.start + offset);
        return renderItem(item, stop === undefined ? null : {
          rowIndex: stop,
          tabIndex: roving.tabIndexOf(stop),
          onFocus: () => roving.onRowFocus(stop),
        });
      })}
    </div>
  );
}

/** A focused row an update took away hands focus to its page elsewhere, else its group's line. */
function keepFocus(list: HTMLElement, held: HeldFocus | null): void {
  if (!held || held.el.isConnected) return;
  const active = document.activeElement;
  if (active && active !== document.body && list.ownerDocument.contains(active)) return;
  const stop = "[data-row-index]";
  const candidates = [
    `[data-glide-key="${CSS.escape(held.key)}"] ${stop}`,
    held.slug ? `[data-index-slug="${CSS.escape(held.slug)}"] ${stop}` : null,
    held.group ? `[data-index-group="${CSS.escape(held.group)}"] [data-index-more]` : null,
    stop,
  ];
  for (const selector of candidates) {
    const target = selector ? list.querySelector<HTMLElement>(selector) : null;
    if (target) {
      target.focus({ preventScroll: true });
      return;
    }
  }
}
