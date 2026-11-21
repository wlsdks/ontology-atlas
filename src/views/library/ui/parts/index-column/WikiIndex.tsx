"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { LibraryUiModel, LintFinding } from "@/features/library";
import { cn } from "@/shared/lib/cn";
import { useRovingRows } from "@/shared/lib/list-rows/use-roving-rows";
import { useWindowedRows } from "@/shared/lib/list-rows/use-windowed-rows";
import { yieldToFrame } from "@/shared/lib/scheduling/yield-to-frame";
import { useStaggerOnce } from "@/shared/motion/stagger";
import { Button } from "@/shared/ui";

import {
  WikiIndexBuilder,
  wikiIndexDay,
  wikiIndexItems,
  type WikiIndexEntry,
  type WikiIndexGroupKey,
  type WikiIndexItem,
  type WikiIndexReason,
} from "../../../lib/wiki/wiki-index";
import { IndexGroupChip, IndexGroupHeading, IndexGroupMore } from "./IndexGroup";
import { IndexRow } from "./IndexRow";

/** Work per slice before the browser gets a turn, so typing and scrolling never wait on the index. */
const SLICE_BUDGET_MS = 8;
/** Item heights are fixed, so the window and keyboard scrolling compute offsets instead of measuring. */
const ITEM_HEIGHT_PX: Record<WikiIndexItem["type"], number> = { heading: 38, row: 44, more: 32 };
const LIST_PAD_TOP_PX = 2;
const CLOCK_TICK_MS = 60_000;

type Translate = ReturnType<typeof useTranslations<"library">>;
type RulePath = "report.rule.uncited-fact";

export interface WikiIndexProps {
  model: Pick<LibraryUiModel, "wikiPages" | "verdicts" | "pairing" | "sources">;
  /** The latest Check wiki's findings. */
  findings: readonly LintFinding[];
  /** The open folder's identity, so the arrival plays once per folder. */
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
  const builder = useMemo(() => new WikiIndexBuilder(locale), [locale]);
  const [version, setVersion] = useState(-1);
  const writeUpsBySource = model.pairing.writeUpsBySource;

  useEffect(() => {
    builder.retarget(model.wikiPages, { verdicts: model.verdicts, writeUpsBySource, findings, nowMs: Date.now() });
    let cancelled = false;
    void (async () => {
      for (;;) {
        const sliceStart = performance.now();
        const sweep = builder.advance(() => performance.now() - sliceStart >= SLICE_BUDGET_MS);
        setVersion(builder.version);
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

  const [alone, setAlone] = useState<WikiIndexGroupKey | null>(null);
  /** True once the list has swapped between the index and one group, so later swaps cross-fade. */
  const [swapped, setSwapped] = useState(false);
  const aloneGroup = useMemo(() => (alone && version >= 0 ? builder.group(alone) : null), [alone, builder, version]);
  const groups = useMemo(() => (version >= 0 ? builder.groups() : []), [builder, version]);
  const items = useMemo(() => wikiIndexItems(aloneGroup ? [aloneGroup] : groups).filter((item) => !aloneGroup || item.type !== "heading"), [aloneGroup, groups]);

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  /** The index's scroll while a group is shown alone, restored when it closes. */
  const indexScrollRef = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** The scroll and focus a swap lands on: the pressed line unmounts, so focus would fall to the page. */
  const pendingSwapRef = useRef<{ scrollTop: number; focus: string } | null>(null);
  const showAlone = (key: WikiIndexGroupKey) => {
    indexScrollRef.current = scrollerRef.current?.scrollTop ?? 0;
    pendingSwapRef.current = { scrollTop: 0, focus: "[data-index-chip]" };
    setAlone(key);
    setSwapped(true);
  };
  const clearAlone = () => {
    if (alone) pendingSwapRef.current = { scrollTop: indexScrollRef.current, focus: `[data-index-group="${CSS.escape(alone)}"] [data-index-more]` };
    setAlone(null);
    setSwapped(true);
  };
  useLayoutEffect(() => {
    const pending = pendingSwapRef.current;
    const scroller = scrollerRef.current;
    if (!pending || !scroller) return undefined;
    pendingSwapRef.current = null;
    scroller.scrollTop = pending.scrollTop;
    // The window mounts the target only after the scroll it answers to.
    const frame = requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(pending.focus)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [alone]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !aloneGroup) return;
    event.stopPropagation();
    clearAlone();
  };

  const arrivalIds = useMemo(() => items.map(itemKey), [items]);
  const arrival = useStaggerOnce({ vaultKey: vaultScope, listKey: "wiki-index", ids: arrivalIds });
  const groupOrdinal = useMemo(() => new Map(groups.map((group, index) => [group.key, index])), [groups]);

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
    const enter = arrival(key, groupOrdinal.get(item.group) ?? 0);
    if (item.type === "heading") {
      return (
        <div key={key} className={enter.className} style={enter.style}>
          <IndexGroupHeading label={groupLabel(item.group, t)} count={item.count} locale={locale} />
        </div>
      );
    }
    if (item.type === "more") {
      const attention = item.group === "attention";
      return (
        <div key={key} data-index-group={item.group} className={enter.className} style={enter.style}>
          <IndexGroupMore
            label={attention ? t("wikiIndex.attentionAll", { count: item.count }) : t("wikiIndex.showAll", { count: item.count })}
            onPress={attention ? onOpenCheckResults : () => showAlone(item.group)}
            {...stop!}
          />
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
      <div key={key} className={enter.className} style={enter.style}>
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
    );
  };

  return (
    <div ref={rootRef} data-testid="wiki-index" data-state={aloneGroup ? "alone" : "index"} className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      {aloneGroup ? (
        <IndexGroupChip
          label={groupLabel(aloneGroup.key, t)}
          count={aloneGroup.count}
          clearLabel={t("wikiIndex.groupClear")}
          onClear={clearAlone}
          locale={locale}
        />
      ) : null}
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
        <WindowedItems
          key={aloneGroup?.key ?? "index"}
          items={items}
          scrollerRef={scrollerRef}
          label={aloneGroup ? groupLabel(aloneGroup.key, t) : undefined}
          fade={swapped}
          renderItem={renderItem}
        />
        {readingCount !== null ? (
          <p className="px-4 pt-2 text-label tabular-nums text-[color:var(--color-text-tertiary)]">
            {t("wikiIndex.reading", { count: readingCount })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface StopProps {
  rowIndex: number;
  tabIndex: number;
  onFocus: () => void;
}

/**
 * One list's window and keyboard stops. Keyed per view, so a swap between the index and one group
 * starts a fresh window rather than reading the other list's row heights.
 */
function WindowedItems({
  items,
  scrollerRef,
  label,
  fade,
  renderItem,
}: {
  items: readonly WikiIndexItem[];
  scrollerRef: RefObject<HTMLDivElement | null>;
  label: string | undefined;
  fade: boolean;
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

  return (
    <div
      ref={listRef}
      onKeyDown={roving.onKeyDown}
      aria-label={label}
      data-window={`${range.start}-${range.end}`}
      className={cn("flex flex-col px-2", fade && "motion-stagger-fade")}
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
