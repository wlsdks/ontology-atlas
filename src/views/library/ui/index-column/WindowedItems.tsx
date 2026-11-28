import { useCallback, useLayoutEffect, useMemo, useRef, type FocusEvent, type ReactNode, type RefObject } from "react";

import { useRovingRows } from "@/shared/lib/list-rows/use-roving-rows";
import { useWindowedRows } from "@/shared/lib/list-rows/use-windowed-rows";

import type { WikiIndexItem } from "../../lib/wiki/wiki-index";
import { focusStops, ITEM_HEIGHT_PX, itemTops as buildItemTops, LIST_PAD_TOP_PX, renderedStopRange } from "../../model/index-column/wiki-index-window";
import { itemKey } from "../../model/index-column/wiki-index-rows";
import { arriveInPlace, glideFrom } from "./index-motion";
import { keepFocus, type HeldFocus } from "./keep-focus";

export interface StopProps {
  rowIndex: number;
  tabIndex: number;
  onFocus: () => void;
}

/**
 * One list's window, keyboard stops and moves. Each view has its own, so a swap between the index
 * and one group starts a fresh window rather than reading the other list's row heights. When the
 * data changes, rows still drawn glide from where they were and rows new to the data fade in.
 */
export function WindowedItems({
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
  const itemTops = useMemo(() => buildItemTops(items), [items]);
  const stops = useMemo(() => focusStops(items), [items]);
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
  const renderedStops = useMemo(
    () => renderedStopRange({ start: range.start, end: range.end }, stopOfItem, stops.length),
    [range.end, range.start, stopOfItem, stops.length],
  );
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
