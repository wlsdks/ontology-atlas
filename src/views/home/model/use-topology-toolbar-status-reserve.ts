import { useLayoutEffect } from "react";

/** Set on `topology-top-toolbar` when the status row has no room left on its line. */
const TOOLBAR_STATUS_YIELD_ATTR = "data-status-yield";

const LANE = '[data-testid="topology-search-action-lane"]';
const UTILITY_ROW = '[data-testid="topology-utility-action-row"]';
const STATUS = "[data-agent-activity-status-slot]";

/**
 * Shares the toolbar's second line between the search lane and the agent activity
 * status row.
 *
 * The status row ("Codex · last work 20 min ago · last change: …") hangs 8px under
 * the bell, absolutely positioned by `AgentActivityChip`, because it is a caption of
 * the bell rather than a tile. Whenever the search lane is not beside the utility
 * lane (always below `xl`, and from `xl` whenever the two do not fit on one line)
 * it lands on that same second line, and the map's right rail starts at 140px, so
 * there is no third line to move to. Measured at 1040 with a path chip before this
 * hook: the lane ran under the status row and its search tile sat on the rail's fit
 * tile.
 *
 * The lane has priority on that line; it is the map's working context (path, trail,
 * search). The status row keeps its place when it fits whole beside the lane, and
 * otherwise steps aside. The bell and the mascot's work pose still carry the agent's
 * state then, and the bell's panel holds the whole status. It is never squeezed:
 * a status row capped by a width the toolbar wrote kept re-laying itself out under
 * its own layout animation, and the measurement chased it every frame.
 *
 * Widths are text the toolbar cannot know in CSS, so this reads them and writes the
 * outcome directly (no React state): the reserve as the lane's own inline margin and
 * cap, the yield as an attribute on the toolbar. It only reads, then writes once; it
 * never clears the reserve to look at the layout underneath. Measured in Chromium
 * with the review panel open at 1040: an inline margin removed and read back in the
 * same task still resolved to the old value, so a "reset, then measure" pass kept
 * reading its own reserve and held the lane at 206px. Instead the lane's natural
 * width is its box plus what its truncated labels are hiding, which is the same
 * number with or without a reserve on it.
 */
export function useTopologyToolbarStatusReserve(toolbar: HTMLElement | null): void {
  useLayoutEffect(() => {
    if (!toolbar || typeof ResizeObserver === "undefined") return;

    let frame = 0;
    // The status row is hidden while it yields, so its width is remembered from the
    // last time it was drawn.
    let statusWidth = 0;
    const apply = (lane: HTMLElement | null, reserve: number | null, yieldStatus: boolean) => {
      if (lane) {
        const margin = reserve === null ? "" : `${reserve}px`;
        if (lane.style.marginRight !== margin) {
          lane.style.marginRight = margin;
          lane.style.maxWidth = reserve === null ? "" : `calc(100% - ${margin})`;
        }
      }
      if (yieldStatus !== toolbar.hasAttribute(TOOLBAR_STATUS_YIELD_ATTR)) {
        if (yieldStatus) toolbar.setAttribute(TOOLBAR_STATUS_YIELD_ATTR, "true");
        else toolbar.removeAttribute(TOOLBAR_STATUS_YIELD_ATTR);
      }
    };
    const measure = () => {
      frame = 0;
      const lane = toolbar.querySelector<HTMLElement>(LANE);
      const utilityRow = toolbar.querySelector<HTMLElement>(UTILITY_ROW);
      const status = toolbar.querySelector<HTMLElement>(STATUS);
      if (!lane || !utilityRow || !status || lane.offsetWidth === 0) {
        apply(lane, null, false);
        return;
      }
      // Layout widths (`offsetWidth`), not rects: the status row is a framer-motion
      // layout element, and mid-animation its rect is a transformed old box. Offset
      // widths are also in the toolbar's own CSS pixels, so they need no correction
      // for its `topology-ui-scale` zoom.
      if (status.offsetWidth > 0) statusWidth = status.offsetWidth;
      let laneWidth = lane.offsetWidth;
      for (const element of lane.querySelectorAll<HTMLElement>("*")) {
        if (element.scrollWidth > element.clientWidth && getComputedStyle(element).textOverflow === "ellipsis") {
          laneWidth += element.scrollWidth - element.clientWidth;
        }
      }
      const style = getComputedStyle(toolbar);
      const width = toolbar.offsetWidth;
      // Beside the utility lane already: the second line belongs to the status row.
      // Or, from `xl`, it would be beside it at its natural width, and only the
      // reserve is holding it down: release it and let the line close up.
      const beside = lane.getBoundingClientRect().top < utilityRow.getBoundingClientRect().bottom;
      const wouldFitBeside =
        style.flexDirection === "row" &&
        laneWidth + (Number.parseFloat(style.columnGap) || 0) + utilityRow.offsetWidth <= width;
      if (beside || wouldFitBeside) {
        apply(lane, null, false);
        return;
      }
      // One line-gap separates the lane from the status row: the same 8px the status
      // row hangs below the bell by (`gap-y-2` while it exists).
      const gap = Number.parseFloat(style.rowGap) || 0;
      if (width - laneWidth - gap >= statusWidth) {
        apply(lane, statusWidth + gap, false);
        return;
      }
      apply(lane, null, true);
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    const resize = new ResizeObserver(schedule);
    let observedStatus: HTMLElement | null = null;
    const observe = () => {
      resize.observe(toolbar);
      for (const selector of [LANE, UTILITY_ROW]) {
        const element = toolbar.querySelector<HTMLElement>(selector);
        if (element) resize.observe(element);
      }
      const status = toolbar.querySelector<HTMLElement>(STATUS);
      if (status !== observedStatus) {
        if (observedStatus) resize.unobserve(observedStatus);
        if (status) resize.observe(status);
        observedStatus = status;
      }
    };
    // The status row mounts and unmounts with the agent's work; the lane's chips come
    // and go with path mode and the trail. Their text and their density classes change
    // too, and a lane held by the reserve does not change size when that happens (it
    // truncates inside the same box), so a resize alone would miss it: measured at
    // 1512 with the review panel open, the lane was reserved at 586px while its
    // labels were still icon-first, then kept that width after they grew to 632px
    // and the path chip overflowed. `class` is the only attribute watched: the
    // reserve's own writes (inline `style`, the yield attribute) must not wake it.
    const mutations = new MutationObserver(() => {
      observe();
      schedule();
    });
    mutations.observe(toolbar, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    observe();
    measure();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      apply(toolbar.querySelector<HTMLElement>(LANE), null, false);
    };
  }, [toolbar]);
}
