'use client';

import { FolderOpen, HardDrive } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import { useLocalVault } from '@/entities/vault-session';
import { useDismissibleMenu } from '@/shared/lib/use-dismissible-menu';
import { usePanelPresence } from '@/shared/lib/use-presence';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { Surface } from '@/shared/ui/surface';
import { transientSurface } from '@/shared/ui/transient-surface';
import { recentVaultRowKey } from '../lib/recent-vault-row';
import { measureSwitcherPlacement, type SwitcherPlacement } from '../lib/switcher-placement';
import { RecentVaultList } from './RecentVaultList';

/**
 * **Which folder you are in, and the way out of it** - at the top of the rail, on every
 * destination.
 *
 * Owner, on the settings row that used to be the only way to change folders (2026-09-13):
 * even if you tell people they can come here, would they know that? He would not have.
 * The launch chooser alone does not answer this - it is gone the moment a folder opens, and
 * the person is then back in the state that produced the report.
 *
 * **Why the rail.** The shell's only persistent chrome is this rail (from `lg`) and the
 * bottom tab bar below it - there is no shared header. And the folder's name must not
 * depend on the destination: `destinationsForVaultShape` gives a wiki-only vault just
 * `library`, `agents`, `mcp` and `git`, so `/docs` and its header chip - the one surface
 * that already named the folder - **do not exist** in the state the owner was in.
 *
 * **It renders only while a folder is actually open.** With the chooser on screen the rail
 * has nothing to name, and a tile that opened a list duplicating the list already filling
 * the window would be noise. With the sample loaded there is no folder, and saying there is
 * one would be a lie about where the data is.
 */
/**
 * How much of a folder name the 64px rail can show, and which end of it survives.
 *
 * Exported for its test: the rule is "keep the end", and the end is where sibling folders
 * differ. The full name stays in `aria-label` and in the popover.
 *
 * ⚠️ **The budget has to be small enough that CSS never truncates on top of it.** At 11 the
 * label overflowed the 63px box and `truncate` added a *second* ellipsis at the other end,
 * so the screen read `…9302420…` and the tail this function exists to preserve was cut off
 * again (inspection, 2026-09-13). `truncate` stays as a backstop for an unusually wide glyph
 * set, and `vault-launch-chooser.spec.ts` measures the label's `scrollWidth` against its
 * `clientWidth` so this number cannot drift back up unnoticed.
 */
export const RAIL_LABEL_MAX_CHARS = 9;

export function railLabel(name: string): string {
  if (name.length <= RAIL_LABEL_MAX_CHARS) return name;
  return `\u2026${name.slice(-(RAIL_LABEL_MAX_CHARS - 1))}`;
}

const TABBABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keyboard stops inside `root`, in document order, that are actually on screen. */
function tabbables(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (node) => node.getAttribute('aria-hidden') !== 'true' && node.getClientRects().length > 0,
  );
}

/*
 * 26rem, not 20rem. At 320px the row's text column measured 168px while a realistic facts line
 * ("184 documents · 121 concepts · opened 3 weeks ago") needs 259.9px, so the always-available
 * switcher told a person *less* about a folder than the launch chooser did - and two similar
 * folder names then render as the same row (responsive seat, 2026-09-13, measured). The
 * placement shrinks it when the free map is narrower.
 */
const POPOVER_WIDTH_PX = 416;

/**
 * **What the popover stands on is dimmed and takes no input while it is open.**
 *
 * The popover beside the chip necessarily lies over INDEX (or its folded tab) and the map's left
 * edge - there is no free room next to the rail. Undimmed, that read as two panels colliding;
 * dimmed, it reads as one surface owning the action, the design system's rule for anything that
 * sits on top of the workbench. It starts at the rail's right edge so the chip stays lit beside
 * its popover. A press on it closes the popover through `useDismissibleMenu`'s outside press, and
 * because it sits over the map, that press never reaches a node. Opacity-only, on the settings
 * scrim's classes, so reduced motion keeps the same fade the settings sheet has.
 */
function SwitcherScrim({ open, left }: { open: boolean; left: number }) {
  const { mounted, exiting } = usePanelPresence(open);
  if (!mounted) return null;
  return (
    <div
      aria-hidden
      data-testid="vault-switch-scrim"
      style={{ left }}
      className={`fixed inset-y-0 right-0 z-40 bg-[color:var(--color-backdrop-medium)] ${exiting ? 'app-settings-scrim-out' : 'app-settings-scrim-in'}`}
    />
  );
}
const POPOVER_MAX_HEIGHT_PX = 640;

export function VaultSwitchRailTile() {
  const t = useTranslations('vaultSwitch');
  const vault = useLocalVault();
  const { open, setOpen, ref, surfaceRef } = useDismissibleMenu();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  /*
   * Where the popover stands, measured when it opens and again when the window resizes.
   *
   * ⚠️ **The popover is portalled to `document.body`, so it needs coordinates.** Anchored
   * with `absolute` inside the rail it was trapped in the rail's stacking context and the
   * map's INDEX panel painted straight over it - the text of both read on top of each other
   * (inspection, 2026-09-13). `AppNavRail`'s own note already says why: the rail is narrow,
   * so surfaces that hang off it open through a portal, exactly as the settings sheet does.
   *
   * **It opens beside its chip, over a dimmed workspace.** Stepped past INDEX into the free map it
   * covered the fitted graph's top node and stood ~350px from the chip under the toolbar's own
   * buttons, reading as their dropdown; hung over INDEX with nothing dimmed it collided with the
   * INDEX card at equal weight (reviews, 2026-09-25). `switcher-placement.ts` keeps it one gap past
   * the rail, top aligned with the chip, and `SwitcherScrim` dims and blocks everything right of the
   * rail while it is open. `app-chrome-interaction.spec.ts` measures both by elementFromPoint.
   */
  const [anchor, setAnchor] = useState<SwitcherPlacement | null>(null);
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setAnchor(
      measureSwitcherPlacement(trigger, {
        width: POPOVER_WIDTH_PX,
        maxHeight: Math.min(window.innerHeight * 0.72, POPOVER_MAX_HEIGHT_PX),
      }),
    );
  }, []);

  const toggle = useCallback(() => {
    if (!open) place();
    setOpen((wasOpen) => !wasOpen);
  }, [open, place, setOpen]);
  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, place]);
  const busy = vault.status === 'opening' || vault.status === 'loading';

  /*
   * **The popover takes focus once, when it opens** - not on every render. The ref callback
   * used to be an inline arrow, which React re-runs on every commit, so any re-render while the
   * popover was open pulled focus back from whichever row the person had tabbed to.
   */
  const setSurface = useCallback(
    (node: HTMLElement | null) => {
      const wasEmpty = surfaceRef.current === null;
      surfaceRef.current = node;
      if (node && wasEmpty) node.focus({ preventScroll: true });
    },
    [surfaceRef],
  );

  /*
   * **Focus goes back to the chip only when it has nowhere else to be.** After Escape, or after a
   * folder was picked, focus sat on a control that had just left the page, so the browser dropped
   * it to `<body>` and the next Tab restarted from the skip link (inspection, 2026-09-25: BODY at
   * 1512, 1280 and 1040). After a press on some other control, that control keeps it.
   */
  const returnFocusIfLost = useCallback(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  /*
   * A switch that started from the popover ends on the chip. The chip stays mounted while the
   * next folder loads (see below), and once the new folder has landed it is the one place that
   * names it, so the keyboard lands there too.
   */
  const switchingRef = useRef(false);
  useEffect(() => {
    if (!switchingRef.current || busy) return;
    switchingRef.current = false;
    if (vault.status === 'loaded') returnFocusIfLost();
  }, [busy, vault.status, returnFocusIfLost]);

  /*
   * **Tab out of the popover closes it, and goes where Tab from the chip would have gone.**
   * Portalled to the end of `<body>`, the popover was the last stop in the tab order, so Tab
   * past its last control walked to `<body>` and on to the skip link while the popover stayed
   * open over the INDEX (inspection, 2026-09-25).
   *
   * ⚠️ **Not a blur handler.** The first fix closed on blur and, when focus left for nothing,
   * decided in a 0ms timeout - which returned early because the window itself had lost focus
   * to the browser's own chrome. The next Tab brought focus back to the skip link, no blur fired
   * on the popover, and it stayed open at every step at a 300ms typing pace; only a burst of
   * Tabs faster than the timeout passed the test (review, 2026-09-25). So the edges of the tab
   * order are handled where they happen - the keydown - and a `focusin` anywhere outside the
   * chip and the popover closes it however focus got there.
   */
  const handleSurfaceKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
      const surface = surfaceRef.current;
      const trigger = triggerRef.current;
      const active = document.activeElement;
      if (!surface || !trigger || !active || !surface.contains(active)) return;
      const items = tabbables(surface);
      if (event.shiftKey) {
        if (active !== surface && active !== items[0]) return;
        event.preventDefault();
        setOpen(false);
        trigger.focus({ preventScroll: true });
        return;
      }
      // Forward from the surface itself or any row but the last is the browser's to walk.
      if (items.length > 0 && active !== items[items.length - 1]) return;
      event.preventDefault();
      setOpen(false);
      const order = tabbables(document.body).filter((node) => !surface.contains(node));
      const next = order[order.indexOf(trigger) + 1] ?? trigger;
      next.focus({ preventScroll: true });
    },
    [setOpen, surfaceRef],
  );
  useEffect(() => {
    if (!open) return undefined;
    const handleFocusIn = (event: globalThis.FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (surfaceRef.current?.contains(target) || ref.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('keydown', handleSurfaceKeyDown);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('keydown', handleSurfaceKeyDown);
    };
  }, [open, ref, setOpen, surfaceRef, handleSurfaceKeyDown]);

  const handleOpenRecent = useCallback(
    (record: LocalFsHandleRecord) => {
      switchingRef.current = true;
      setOpen(false);
      void vault.openRecent(record);
    },
    [setOpen, vault],
  );
  const handleForget = useCallback(
    (record: LocalFsHandleRecord) => {
      void vault.forgetRecent(record);
    },
    [vault],
  );
  const handlePick = useCallback(() => {
    switchingRef.current = true;
    setOpen(false);
    void vault.open();
  }, [setOpen, vault]);

  /*
   * **The chip stays while the next folder opens.** It used to render only on `loaded`, so a
   * switch removed it for the whole load and every rail item below slid up 66px, then back down
   * four seconds later (inspection, 2026-09-25, sampled per frame). While opening it keeps the
   * name it has - the folder still open while the picker is up, then the incoming one once the
   * read starts - and says it is busy.
   */
  const handle = vault.handle;
  if (!handle || (vault.status !== 'loaded' && !busy)) return null;

  const name = handle.name;
  // The absolute path is knowable only on the desktop - a web FSA handle has no path.
  const path = getTauriVaultRootPath(handle) ?? null;
  const currentKey = recentVaultRowKey({
    id: 'current',
    handle,
    desktopRootPath: path ?? undefined,
    name,
    createdAt: 0,
    lastAccessedAt: 0,
  });
  const alternatives = vault.recentVaults.filter(
    (record) => recentVaultRowKey(record) !== currentKey,
  );

  return (
    <div ref={ref} className="relative w-full shrink-0 pb-2">
      <button
        type="button"
        data-testid="vault-switch-rail-tile"
        aria-expanded={open}
        /*
         * `dialog`, not `menu`. The popover's children are a folder list and a picker
         * button, not menu items, and `role="menu"` without `menuitem` children makes
         * VoiceOver announce a menu with nothing in it (interaction and workbench seats,
         * 2026-09-13).
         */
        aria-haspopup="dialog"
        /*
         * The rail is 64px wide, so the visible label can only ever be the first few
         * characters of a folder name. `aria-label` and the popover carry it whole; the
         * label is the reminder, and the popover is the answer. A `title` is deliberately
         * absent for the same reason the destination tiles give: the OS tooltip is a grey
         * box drawn outside this design system, over a label that is already on screen.
         */
        aria-label={busy ? t('railTileOpeningAriaLabel', { name }) : t('railTileAriaLabel', { name })}
        aria-busy={busy || undefined}
        data-busy={busy ? 'true' : undefined}
        ref={triggerRef}
        /*
         * **Busy, but still holding focus.** While the next folder loads a press has nothing to
         * switch from, so the chip says it is disabled - with `aria-disabled`, not `disabled`. A
         * natively disabled button cannot hold focus, so from the press on "Open a folder"
         * until the load finished (about 3.6s) focus sat on `<body>` and a Tab in that window
         * restarted from the skip link (review, 2026-09-25). `aria-disabled` keeps the chip in
         * the tab order with its state announced, and the press is ignored here.
         */
        aria-disabled={busy || undefined}
        onClick={() => {
          if (busy) return;
          toggle();
        }}
        className={controlClass({
          shape: 'card',
          className:
            'group relative w-full flex-col gap-1 border-0 px-0 py-1 aria-disabled:cursor-progress aria-disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]',
        })}
      >
        <span
          className={
            'relative flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card border transition-colors ' +
            (open
              ? 'border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-a14)] text-[color:var(--color-indigo-pale-a94)]'
              : 'border-[color:var(--color-divider)] text-[color:var(--color-text-secondary)] group-hover:bg-[color:var(--color-overlay-2)] group-hover:text-[color:var(--color-text-primary)]')
          }
        >
          <HardDrive size={ICON_SIZE.md} aria-hidden className={busy ? 'animate-pulse' : undefined} />
        </span>
        {/*
          **The tail is kept, not the head.** `ontology-atlas` and `ontology-atlas-old`
          share every character a head truncation leaves on screen, so the label answered
          "which folder" with the one part that does not distinguish them (interaction and
          workbench seats, 2026-09-13). Trimming in JS rather than with `direction: rtl`
          avoids bidi reordering on a name that begins or ends with punctuation.

          `leading-caption` pairs with `text-caption`; every sibling rail label uses that
          pair, and an unpaired leading here made the tile 64px against the destinations'
          60px pitch.
        */}
        <span className="block w-full truncate px-0.5 text-center text-[length:var(--app-nav-rail-label-size)] leading-caption text-[color:var(--color-text-tertiary)]">
          {railLabel(name)}
        </span>
      </button>

      {/*
        Gated on the anchor alone, not on `open`: `Surface` owns its presence and plays the exit
        when `open` turns false. With `open &&` here the portal unmounted the surface in the same
        commit, so the exit never ran and `onExited` - the focus return - never fired.
      */}
      {anchor && typeof document !== 'undefined'
        ? createPortal(
      <>
      <SwitcherScrim open={open} left={anchor.scrimLeft} />
      <Surface
        open={open}
        origin="top left"
        role="dialog"
        tabIndex={-1}
        aria-label={t('switcherAriaLabel')}
        data-testid="vault-switch-popover"
        /*
         * `transient-surface.ts` says an `anchored` surface "may take focus; closes and returns
         * focus". Portalled to `document.body`, this one sat at the end of the document, so Tab
         * from the tile walked the whole page before reaching it. Focusing the surface puts the
         * list next in order, and `onExited` hands focus back to the tile when it has nowhere
         * else to be.
         */
        ref={setSurface}
        onExited={returnFocusIfLost}
        {...transientSurface('anchored')}
        style={{ top: anchor.top, left: anchor.left, width: anchor.width, maxHeight: anchor.maxHeight }}
        className="fixed z-50 overflow-y-auto rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-2 shadow-[var(--chrome-shadow)]"
      >
        {/*
          One start line for everything in the popover: the captions, the recent rows' glyph
          column and the picker's glyph all begin 12px in (`px-3`), the inset the rows and the
          picker already had. The captions sat at 6px, so the popover read as three columns.
        */}
        <div>
        <p className="px-3 pt-0.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
          {t('openFolderLabel')}
        </p>
        <p className="truncate px-3 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {name}
        </p>
        {path ? (
          <p className="truncate px-3 pb-1 font-mono text-caption text-[color:var(--color-text-quaternary)]">
            {path}
          </p>
        ) : null}
        {/*
          **The folder you are in is not somewhere to switch to.**
          `recentVaults` includes it, so the list was offering the person the row they were
          already standing on - and for the reporter, who has used exactly one folder, the
          whole "switch to" section was his own name a second time under a heading promising
          alternatives (evidence seat, 2026-09-13). With no alternatives the heading and list
          both go and the picker below carries the whole answer.
        */}
        {alternatives.length > 0 ? (
          <>
            <p className="px-3 pb-1.5 pt-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
              {t('switchTo')}
            </p>
            <RecentVaultList
              records={alternatives}
              currentKey={currentKey}
              busy={busy}
              onOpen={handleOpenRecent}
              onForget={handleForget}
              onLocate={handlePick}
            />
          </>
        ) : null}
        <button
          type="button"
          data-testid="vault-switch-pick-other"
          onClick={handlePick}
          disabled={busy}
          className={controlClass({
            shape: 'row',
            hoverSurface: 'lift',
            className: 'mt-2 gap-2 px-3 py-2',
          })}
        >
          <FolderOpen size={ICON_SIZE.md} aria-hidden className="shrink-0" />
          <span className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
            {t('pickAnotherFolder')}
          </span>
        </button>
        </div>
      </Surface>
      </>,
            document.body,
          )
        : null}
    </div>
  );
}
