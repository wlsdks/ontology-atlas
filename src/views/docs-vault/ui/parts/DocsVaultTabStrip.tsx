"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { useTranslations } from "next-intl";
import { FileText, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { cn } from "@/shared/lib/cn";
import { IconButton } from "@/shared/ui";
import type { DocTab } from "../../lib/doc-tabs";
import { controlClass } from '@/shared/ui/control-class';

export interface DocsVaultTabStripProps {
  tabs: DocTab[];
  activeSlug: string | null;
  onActivate: (slug: string) => void;
  onClose: (slug: string) => void;
  t: ReturnType<typeof useTranslations<"docsVault">>;
}

/**
 * The open-document tab strip in the header's zone-c.
 *
 * It represents the document working set (the URL `?slug=` is the active source of truth;
 * this strip owns only the open list). To prove structurally that it is not a top-level view
 * switcher, the call site renders it only when `view==='doc'`.
 *
 * The detail that makes it read right: the active tab's background is `--color-canvas` (the
 * same as the body), fully covering the header's 1px baseline, and it draws its own 2px indigo
 * underline on top. `DocsVaultPage` draws that baseline as an absolutely positioned 1px line
 * (z-0) and this strip renders above it (z-10) at full height, so the baseline is invisible in
 * the active tab's column — no double line.
 *
 * The surface (active canvas, inactive hover) is owned by the wrapper spanning **the whole tab
 * column**. Giving the background to the label button alone leaves the header panel colour
 * showing for the close button's width (20px) plus its gap (6px), which notches the right side
 * of the active tab and makes the full-width 2px underline protrude past the background by
 * those 26px.
 *
 * a11y: `role="tablist"`/`"tab"` is deliberately not used. This strip is **document
 * navigation**, not a WAI-ARIA tab widget toggling a `tabpanel` on the same screen (the active
 * source of truth is the URL `?slug=`). Borrowing the role alone makes AT promise "tab n of N"
 * and arrow-key movement while roving tabindex, `aria-controls`, and `tabpanel` are all
 * missing, so nothing happens. The honest contract is `nav` + `aria-current="page"`, which also
 * keeps the owner's "a tab is a working set, not a top-level mode" contract on the AT side
 * (role=tab is announced as a mode switch).
 */
export function DocsVaultTabStrip({
  tabs,
  activeSlug,
  onActivate,
  onClose,
  t,
}: DocsVaultTabStripProps) {
  const activeTabRef = useRef<HTMLButtonElement | null>(null);
  const stripRef = useRef<HTMLElement | null>(null);
  const pendingKeyboardCloseRef = useRef<string | null>(null);
  // When the open-document working set overflows the strip, an edge fade is enabled only on
  // the side with hidden tabs — correcting a defect of zero overflow affordance (silent
  // hiding). It uses mask alpha only: no colour, no glow, no motion, unaffected by reduced-motion.
  const [edgeOverflow, setEdgeOverflow] = useState({ left: false, right: false });

  const recomputeEdges = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const maxScroll = strip.scrollWidth - strip.clientWidth;
    const left = strip.scrollLeft > 1;
    const right = strip.scrollLeft < maxScroll - 1;
    setEdgeOverflow((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right },
    );
  }, []);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    recomputeEdges();
    strip.addEventListener("scroll", recomputeEdges, { passive: true });
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(recomputeEdges)
        : null;
    resizeObserver?.observe(strip);
    return () => {
      strip.removeEventListener("scroll", recomputeEdges);
      resizeObserver?.disconnect();
    };
  }, [recomputeEdges, tabs.length]);

  useEffect(() => {
    // A JS scroll animation cannot be switched off by the reduced-motion base layer in
    // globals.css (it is a behavior argument, not a CSS transition) — so it is respected here.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Review defect (2026-07-23) — `scrollIntoView(inline:"nearest")` can stop with the active
    // tab only half exposed when adding a tab changes the strip width in the same frame
    // (measured at EN 1440: the glyph was cut at the strip boundary with no ellipsis and the ×
    // was invisible — flaky). After layout settles (rAF) `scrollLeft` is computed directly so
    // the whole active tab is always inside the viewport, deterministically. The tab count is a
    // dependency too, so it re-corrects on the frame where a new tab changed the width.
    const frame = requestAnimationFrame(() => {
      const el = activeTabRef.current;
      const strip = el?.closest("nav");
      if (!el || !strip) return;
      const cell = el.parentElement ?? el; // the tab column (wrapper) — full width, close button included
      // `offsetLeft`'s offsetParent is not the nav but the enclosing header (relative), so it is
      // inflated by zone-l's width. The scroller's content coordinate is computed from rect
      // differences instead, which is exact even when activating a tab in the middle.
      const cellRect = cell.getBoundingClientRect();
      const stripRect = strip.getBoundingClientRect();
      const left = cellRect.left - stripRect.left + strip.scrollLeft;
      const right = left + cellRect.width;
      let target = strip.scrollLeft;
      if (right > strip.scrollLeft + strip.clientWidth) target = right - strip.clientWidth;
      if (left < target) target = left;
      if (target !== strip.scrollLeft) {
        strip.scrollTo({ left: target, behavior: reduced ? "auto" : "smooth" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [activeSlug, tabs.length]);

  useLayoutEffect(() => {
    const closedSlug = pendingKeyboardCloseRef.current;
    if (!closedSlug || tabs.some((tab) => tab.slug === closedSlug)) return;

    const nextActiveTab = activeTabRef.current;
    if (!nextActiveTab) return;
    nextActiveTab.focus({ preventScroll: true });
    pendingKeyboardCloseRef.current = null;
  }, [activeSlug, tabs]);

  if (tabs.length === 0) return null;

  // A transparent fade only on the edge that has hidden content. Four states: both, either, neither.
  const fade = "var(--docs-tab-edge-fade)";
  const maskImage = edgeOverflow.left && edgeOverflow.right
    ? `linear-gradient(to right, transparent 0, black ${fade}, black calc(100% - ${fade}), transparent 100%)`
    : edgeOverflow.right
      ? `linear-gradient(to right, black calc(100% - ${fade}), transparent 100%)`
      : edgeOverflow.left
        ? `linear-gradient(to right, transparent 0, black ${fade})`
        : undefined;

  return (
    <nav
      ref={stripRef}
      aria-label={t("tabs.stripAriaLabel")}
      data-edge-overflow={
        edgeOverflow.left && edgeOverflow.right
          ? "both"
          : edgeOverflow.right
            ? "right"
            : edgeOverflow.left
              ? "left"
              : undefined
      }
      className="docs-vault-tab-strip flex h-full min-w-0 flex-1 items-stretch overflow-x-auto"
      style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
    >
      {tabs.map((tab) => {
        const active = tab.slug === activeSlug;
        return (
          <div
            key={tab.slug}
            data-token="docs-tab"
            data-active={active ? "true" : undefined}
            className={cn(
              "group relative flex h-full flex-none items-stretch transition-colors",
              active
                ? "bg-[color:var(--color-canvas)]"
                : "hover:bg-[color:var(--color-overlay-2)]",
            )}
            style={{
              minWidth: "var(--docs-tab-min)",
              maxWidth: "var(--docs-tab-max)",
            }}
          >
            <button
              ref={active ? activeTabRef : undefined}
              type="button"
              aria-current={active ? "page" : undefined}
              title={tab.title}
              onClick={() => onActivate(tab.slug)}
              // Middle-click closes — the universal idiom of editor tabs. `auxclick` is blocked
              // so it does not leak into paste or autoscroll.
              onAuxClick={(event) => {
                if (event.button !== 1) return;
                event.preventDefault();
                onClose(tab.slug);
              }}
              className={controlClass({
                shape: "row",
                stacked: true,
                size: "sm",
                tone: active ? "default" : "muted",
                className: cn(
                  "min-w-0 flex-1 gap-1.5 pl-3 pr-1",
                  !active && "group-hover:text-[color:var(--color-text-secondary)]",
                ),
              })}
            >
              <FileText size={ICON_SIZE.md} aria-hidden className="flex-none" />
              <span className="min-w-0 flex-1 truncate text-left">{tab.title}</span>
            </button>
            <IconButton
              size="sm"
              label={t("tabs.closeAria", { title: tab.title })}
              onClick={(event) => {
                event.stopPropagation();
                // Closing × via keyboard activation (click.detail=0) removes that button from the
                // DOM immediately. Focus moves to the new active tab's label once it renders, so
                // the current position in the document working set is preserved. A pointer click
                // is left to the browser's natural focus policy.
                if (event.detail === 0) {
                  pendingKeyboardCloseRef.current = tab.slug;
                }
                onClose(tab.slug);
              }}
              className={cn(
                "my-auto mr-1.5 flex-none hover:bg-[color:var(--color-overlay-3)] hover:text-[color:var(--color-text-primary)]",
                active
                  ? "opacity-100"
                  : "[@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              )}
            >
              <X size={ICON_SIZE.md} aria-hidden />
            </IconButton>
            {active ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[2px] bg-[color:var(--color-indigo-brand)]"
              />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
