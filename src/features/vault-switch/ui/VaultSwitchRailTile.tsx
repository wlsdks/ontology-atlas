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
 * Characters the 64px rail label shows, keeping the tail where sibling folders differ. Small
 * enough that CSS `truncate` never cuts again; `vault-launch-chooser.spec.ts` measures it.
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

/* 416, not 320: at 320 the text column was 168px against a ~260px facts line; the placement shrinks it when the free map is narrower. */
const POPOVER_WIDTH_PX = 416;

/**
 * Dims and blocks the workspace right of the rail while the popover is open; a press on it
 * closes the popover and never reaches a map node. It reuses the settings scrim classes
 * so reduced motion keeps its fade.
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

/**
 * The open folder's name and the way to switch it, at the top of the rail on every destination.
 * Renders only while a folder is open: the chooser and the sample have no folder to name.
 */
export function VaultSwitchRailTile() {
  const t = useTranslations('vaultSwitch');
  const vault = useLocalVault();
  // Callbacks read these, never `vault`, which carries the manifest.
  const { open: pickFolder, openRecent, forgetRecent, status: vaultStatus } = vault;
  const { open, setOpen, ref, surfaceRef } = useDismissibleMenu();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  /*
   * The popover is portalled to `document.body` so INDEX cannot paint over it, hence coordinates.
   * The spec `app-chrome-interaction.spec.ts` measures the placement by elementFromPoint.
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
  const busy = vaultStatus === 'opening' || vaultStatus === 'loading';

  /* Focus the popover once on open; an inline ref callback re-runs every commit and steals focus. */
  const setSurface = useCallback(
    (node: HTMLElement | null) => {
      const wasEmpty = surfaceRef.current === null;
      surfaceRef.current = node;
      if (node && wasEmpty) node.focus({ preventScroll: true });
    },
    [surfaceRef],
  );

  /* Return focus to the chip only when it would otherwise drop to `<body>`. */
  const returnFocusIfLost = useCallback(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  /* A switch started from the popover ends with focus on the chip, which names the new folder. */
  const switchingRef = useRef(false);

  /* Move focus out when the popover closes, not when its exit ends, or it sits on `<body>` mid-exit. */
  const wasOpenRef = useRef(open);
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!wasOpen || open) return;
    const active = document.activeElement;
    const inSurface = active instanceof Node && Boolean(surfaceRef.current?.contains(active));
    if (inSurface || active === null || active === document.body) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [open, surfaceRef]);

  useEffect(() => {
    if (!switchingRef.current || busy) return;
    switchingRef.current = false;
    if (vaultStatus === 'loaded') returnFocusIfLost();
  }, [busy, vaultStatus, returnFocusIfLost]);

  /*
   * Tab past either edge closes the popover and continues where Tab from the chip would go.
   * Handled on keydown, not blur: a blur timeout misfires when the window itself loses focus.
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
      void openRecent(record);
    },
    [setOpen, openRecent],
  );
  const handleForget = useCallback(
    (target: LocalFsHandleRecord | readonly LocalFsHandleRecord[]) => {
      void forgetRecent(target);
    },
    [forgetRecent],
  );
  const handlePick = useCallback(() => {
    switchingRef.current = true;
    setOpen(false);
    void pickFolder();
  }, [setOpen, pickFolder]);

  /* The chip stays, marked busy, while the next folder opens, so the rail items do not jump. */
  const handle = vault.handle;
  if (!handle || (vaultStatus !== 'loaded' && !busy)) return null;

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
        /* `dialog`, not `menu`: without `menuitem` children VoiceOver announces an empty menu. */
        aria-haspopup="dialog"
        /* No `title`: the OS tooltip is drawn outside the design system over a label already on screen. */
        aria-label={busy ? t('railTileOpeningAriaLabel', { name }) : t('railTileAriaLabel', { name })}
        aria-busy={busy || undefined}
        data-busy={busy ? 'true' : undefined}
        ref={triggerRef}
        /* `aria-disabled`, not `disabled`, so the busy chip keeps focus and stays in the tab order. */
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
        {/* Trimmed in JS, not `direction: rtl` (bidi reorders punctuation); `leading-caption` keeps the 60px pitch. */}
        <span className="block w-full truncate px-0.5 text-center text-[length:var(--app-nav-rail-label-size)] leading-caption text-[color:var(--color-text-tertiary)]">
          {railLabel(name)}
        </span>
      </button>

      {/* Gated on the anchor alone so `Surface` can play its exit and fire `onExited`. */}
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
        /* Focusing the portalled surface puts its list next in the tab order. */
        ref={setSurface}
        onExited={returnFocusIfLost}
        {...transientSurface('anchored')}
        style={{ top: anchor.top, left: anchor.left, width: anchor.width, maxHeight: anchor.maxHeight }}
        className="fixed z-50 overflow-y-auto rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-2 shadow-[var(--chrome-shadow)]"
      >
        {/* One start line: captions, row glyphs and the picker glyph all begin 12px in. */}
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
        {/* The current folder is not offered as somewhere to switch to. */}
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
              onForgetAll={handleForget}
              onLocate={handlePick}
              // A dialog would take focus out of this popover, which closes it and the dialog with it.
              missingReview="inline"
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
