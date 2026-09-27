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
 * The open-document tab strip in zone-c; the URL `?slug=` stays the active source of truth.
 * The active tab's canvas background covers the header's 1px baseline and draws its own
 * 2px indigo underline.
 * It uses `nav` + `aria-current`, not `role="tablist"`: with no `tabpanel` or roving tabindex
 * that role promises arrow keys.
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
  // Edge fade only on a side with hidden tabs; mask alpha only, so reduced motion is unaffected.
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
    // A JS scroll is not covered by the CSS reduced-motion layer.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // `scrollIntoView(inline:"nearest")` can leave the active tab half shown when a new tab changes
    // the width in the same frame, so compute `scrollLeft` after layout. Tab count is a dependency.
    const frame = requestAnimationFrame(() => {
      const el = activeTabRef.current;
      const strip = el?.closest("nav");
      if (!el || !strip) return;
      const cell = el.parentElement ?? el; // `offsetLeft` is relative to the header, not the nav; rect differences are exact.
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
              // Middle-click closes; `auxclick` is blocked so it does not paste or autoscroll.
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
                // A keyboard close removes the focused ×, so focus moves to the new active tab once it renders.
                // Pointer clicks keep the browser's focus policy.
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
