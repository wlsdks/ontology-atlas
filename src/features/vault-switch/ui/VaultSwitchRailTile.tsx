'use client';

import { FolderOpen, HardDrive } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import { useLocalVault } from '@/entities/vault-session';
import { useDismissibleMenu } from '@/shared/lib/use-dismissible-menu';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { Surface } from '@/shared/ui/surface';
import { transientSurface } from '@/shared/ui/transient-surface';
import { recentVaultRowKey } from '../lib/recent-vault-row';
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

export function VaultSwitchRailTile() {
  const t = useTranslations('vaultSwitch');
  const vault = useLocalVault();
  const { open, setOpen, ref, surfaceRef } = useDismissibleMenu();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  /*
   * Where the popover stands, measured from the trigger at the moment it opens.
   *
   * ⚠️ **The popover is portalled to `document.body`, so it needs coordinates.** Anchored
   * with `absolute` inside the rail it was trapped in the rail's stacking context and the
   * map's INDEX panel painted straight over it - the text of both read on top of each other
   * (inspection, 2026-09-13). `AppNavRail`'s own note already says why: the rail is narrow,
   * so surfaces that hang off it open through a portal, exactly as the settings sheet does.
   */
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      if (wasOpen) return false;
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ top: rect.top, left: rect.right + 6 });
      return true;
    });
  }, [setOpen]);
  const busy = vault.status === 'opening' || vault.status === 'loading';

  const handleOpenRecent = useCallback(
    (record: LocalFsHandleRecord) => {
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
    setOpen(false);
    void vault.open();
  }, [setOpen, vault]);

  const handle = vault.handle;
  if (vault.status !== 'loaded' || !handle) return null;

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
        aria-label={t('railTileAriaLabel', { name })}
        ref={triggerRef}
        onClick={toggle}
        className={controlClass({
          shape: 'card',
          className:
            'group relative w-full flex-col gap-1 border-0 px-0 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]',
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
          <HardDrive size={ICON_SIZE.md} aria-hidden />
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

      {open && anchor && typeof document !== 'undefined'
        ? createPortal(
      <Surface
        open={open}
        origin="top left"
        role="dialog"
        tabIndex={-1}
        aria-label={t('switcherAriaLabel')}
        data-testid="vault-switch-popover"
        ref={(node: HTMLElement | null) => {
          surfaceRef.current = node;
          /*
           * `transient-surface.ts` says an `anchored` surface "may take focus; closes and
           * returns focus". Portalled to `document.body`, this one sat at the end of the
           * document, so Tab from the tile walked the whole page before reaching it.
           * Focusing the surface puts the list next in order, and `onExited` hands focus
           * back to the tile the person pressed.
           */
          node?.focus();
        }}
        onExited={() => triggerRef.current?.focus()}
        {...transientSurface('anchored')}
        style={{ top: anchor.top, left: anchor.left }}
        /*
         * 26rem, not 20rem. At 320px the row's text column measured 168px while a realistic
         * facts line ("184 documents · 121 concepts · opened 3 weeks ago") needs 259.9px, so
         * the always-available switcher told a person *less* about a folder than the launch
         * chooser did - and two similar folder names then render as the same row
         * (responsive seat, 2026-09-13, measured). The popover's left edge is the rail's
         * right at 69px, so 26rem still leaves 555px clear at the app's 1040px window floor.
         */
        className="fixed z-50 max-h-[min(72vh,640px)] w-[26rem] max-w-[min(80vw,26rem)] overflow-y-auto rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-2 shadow-[var(--chrome-shadow)]"
      >
        <p className="px-1.5 pt-0.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
          {t('openFolderLabel')}
        </p>
        <p className="truncate px-1.5 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {name}
        </p>
        {path ? (
          <p className="truncate px-1.5 pb-1 font-mono text-caption text-[color:var(--color-text-quaternary)]">
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
            <p className="px-1.5 pb-1.5 pt-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
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
      </Surface>,
            document.body,
          )
        : null}
    </div>
  );
}
