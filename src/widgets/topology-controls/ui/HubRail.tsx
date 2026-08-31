'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMediaQuery } from 'usehooks-ts';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { controlClass, Tooltip } from '@/shared/ui';
import type { Project } from '@/entities/project';

// With a list of 21 hubs already expanded on first entry, the eye never reaches the
// topology in the centre. Once the user expands it themselves, that choice is remembered.
const RAIL_OPEN_KEY = 'demo:sigma-hub-rail-open:v1';

interface HubRailProps {
  projects: Project[];
  selectedSlug?: string | null;
  onSelect: (slug: string) => void;
  /**
   * true hides the Hub Rail entirely (its tab included), preventing an overlap with
   * the expanded Hero panel at the top left. It returns to false and renders normally
   * once Hero collapses.
   */
  suppressed?: boolean;
  /**
   * Inside Layer 1, strips each hub name's container prefix (e.g. "Demo Reactor · ")
   * to keep the rail compact. Unset keeps the original name (Layer 0).
   */
  stripNamePrefix?: string;
}

/**
 * The left vertical hub shortcut bar. It lists roughly eleven hub projects so one
 * click reaches that hub — the map's "major stations". Collapsed, only a thin tab
 * remains, freeing map space.
 */
export function HubRail({
  projects,
  selectedSlug,
  onSelect,
  suppressed = false,
  stripNamePrefix,
}: HubRailProps) {
  const t = useTranslations('topologyWidgets.hubRail');
  // ⚠️ Both accesses are wrapped because `localStorage` **throws rather than
  // returning null** when storage is disabled — the installed app's WKWebView does
  // exactly that under some privacy settings. An unguarded read sits in a `useState`
  // initializer, so the throw happened during render and took the whole map down with
  // it. Storage we cannot read means "the user has not expanded it": closed.
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(RAIL_OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const setOpenPersisted = useCallback((next: boolean) => {
    setOpen(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(RAIL_OPEN_KEY, next ? '1' : '0');
    } catch {
      // The rail still opens; only the memory of it is lost.
    }
  }, []);
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);
  const buttonsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  // SSR/static-export compatible — initializeWithValue:false avoids a hydration mismatch.
  const prefersReducedMotion = useMediaQuery(
    '(prefers-reduced-motion: reduce)',
    { initializeWithValue: false },
  );
  useEffect(() => {
    if (!open) return;
    const btn = activeButtonRef.current;
    if (!btn) return;
    btn.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }, [selectedSlug, open, prefersReducedMotion]);
  if (suppressed) return null;
  const prefixWithSep = stripNamePrefix?.trim()
    ? `${stripNamePrefix.trim()} · `
    : '';
  const shortenName = (name: string): string => {
    if (!prefixWithSep || !name.startsWith(prefixWithSep)) return name;
    const rest = name.slice(prefixWithSep.length).trim();
    return rest.length > 0 ? rest : name;
  };
  // Compute each project's degree (dependencies plus references) and expose it as a
  // badge at the hub's right, so scale differences between hubs read at a glance. One
  // O(N + E) pass.
  const degreeBySlug = new Map<string, number>();
  for (const project of projects) {
    const current = degreeBySlug.get(project.slug) ?? 0;
    degreeBySlug.set(project.slug, current + project.dependencies.length);
    for (const dep of project.dependencies) {
      degreeBySlug.set(dep, (degreeBySlug.get(dep) ?? 0) + 1);
    }
  }
  // With the Layer 0 container system retired, only hubs appear in the rail.
  const hubs = projects
    .filter((p) => p.isHub)
    .slice()
    .sort(
      (a, b) => (degreeBySlug.get(b.slug) ?? 0) - (degreeBySlug.get(a.slug) ?? 0),
    );
  if (hubs.length === 0) return null;
  const railLabel = t('label');
  // Roving tabindex — a listbox must have exactly one tab stop. The selected option is
  // the sole tab entry point, and with no selection the first option is. The rest are
  // -1 so they are reached by arrow keys only (the WAI-ARIA listbox pattern). Every
  // native button used to be tabIndex 0, so Tab stopped at every hub.
  const hasActiveOption = hubs.some((hub) => hub.slug === selectedSlug);

  if (!open) {
    return (
      <Tooltip content={t('expandTooltip')} side="right" withProvider={false}>
        <button
          type="button"
          onClick={() => setOpenPersisted(true)}
          aria-label={t('expandAriaLabel')}
          className="pointer-events-auto absolute left-0 top-1/2 z-10 hidden h-16 w-5 -translate-y-1/2 items-center justify-center rounded-r-chip border border-l-0 border-[color:var(--color-divider)] bg-[color:var(--color-panel)] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)] focus-visible:ring-inset md:flex"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </Tooltip>
    );
  }

  const moveFocusToSlug = (slug: string) => {
    const el = buttonsRef.current.get(slug);
    if (el) el.focus();
    onSelect(slug);
  };

  return (
    <div
      role="listbox"
      aria-label={railLabel}
      className="pointer-events-auto absolute bottom-[212px] left-4 top-[140px] z-10 hidden max-h-[calc(100vh-352px)] w-[180px] flex-col gap-1 overflow-auto rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2 py-2 md:left-6 md:flex xl:left-8"
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
          {railLabel} · {hubs.length}
        </span>
        <Tooltip content={t('collapseTooltip')} side="right" withProvider={false}>
          <button
            type="button"
            onClick={() => setOpenPersisted(false)}
            aria-label={t('collapseAriaLabel')}
            /* The tooltip already names this control, so only the value layer is used
               rather than `IconButton` (which adds its own `title`) — combining them
               produces two tooltips. */
            className={controlClass({
              shape: 'icon',
              size: 'sm',
              tone: 'muted',
              className:
                'hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]',
            })}
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
        </Tooltip>
      </div>
      {hubs.map((hub, idx) => {
        const active = selectedSlug === hub.slug;
        const degree = degreeBySlug.get(hub.slug) ?? 0;
        const dotColor = active
          ? 'var(--color-indigo-accent)'
          : 'var(--color-overlay-3)';
        return (
          <button
            key={hub.slug}
            ref={(el) => {
              if (el) buttonsRef.current.set(hub.slug, el);
              else buttonsRef.current.delete(hub.slug);
              if (active) activeButtonRef.current = el;
            }}
            type="button"
            role="option"
            aria-selected={active}
            tabIndex={active || (!hasActiveOption && idx === 0) ? 0 : -1}
            onClick={() => onSelect(hub.slug)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                moveFocusToSlug(hubs[(idx + 1) % hubs.length].slug);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                moveFocusToSlug(
                  hubs[(idx - 1 + hubs.length) % hubs.length].slug,
                );
              } else if (e.key === 'Home') {
                e.preventDefault();
                moveFocusToSlug(hubs[0].slug);
              } else if (e.key === 'End') {
                e.preventDefault();
                moveFocusToSlug(hubs[hubs.length - 1].slug);
              }
            }}
            title={t('itemTitle', { name: hub.name, degree })}
            className={controlClass({
              shape: 'row',
              size: 'sm',
              active,
              className: `relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)] focus-visible:ring-inset ${
                active
                  ? ''
                  : 'hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]'
              }`,
            })}
          >
            {active ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full bg-[color:var(--color-indigo-accent)]"
              />
            ) : null}
            <span
              className="h-1.5 w-1.5 flex-none rounded-full"
              style={{ backgroundColor: dotColor }}
              aria-hidden
            />
            <span className="flex-1 truncate">{shortenName(hub.name)}</span>
            <span
              className={`shrink-0 font-mono text-caption tabular-nums tracking-[var(--tracking-caption)] ${
                active
                  ? 'text-[color:var(--color-text-secondary)]'
                  : 'text-[color:var(--color-text-quaternary)]'
              }`}
            >
              {degree}
            </span>
          </button>
        );
      })}
    </div>
  );
}
