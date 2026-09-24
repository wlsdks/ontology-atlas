'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { Surface } from '@/shared/ui/surface';
import { transientSurface } from '@/shared/ui/transient-surface';

import { formatAssetSize, macosAssetFor } from '../lib/release-state';

/**
 * The Mac download as one control (owner, 2026-09-08: *"too many buttons — press Mac and get
 * Silicon and Intel"*). A browser cannot tell which chip a Mac has, so the choice is the
 * person's; it opens under the button as a two-row menu carrying each file's real size, and the
 * files stay real links. Before this the hero held five controls across three rows.
 *
 * The menu is a `Surface` (entrance and exit through the panel primitive) declared as a
 * transient `menu`: it stands under its trigger, closes on Escape, Tab, an outside press, or a
 * choice, and hands focus back to the trigger. Arrow keys move between the two rows.
 */
export function HeroMacMenu({
  variant,
  testId,
  className,
}: {
  /** `primary` is the filled winner; `outline` stands beside a Windows winner. */
  variant: 'primary' | 'outline';
  testId: string;
  className?: string;
}) {
  const t = useTranslations('download');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const menuId = useId();

  const silicon = macosAssetFor('aarch64');
  const intel = macosAssetFor('x64');

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  // An outside press closes; a press inside (a row) navigates and closes through the row.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, close]);

  /*
   * Focus lands on the first row **the moment the surface attaches**, via a callback ref
   * rather than a frame timer.
   *
   * ⚠️ The timer lost a race it could never win. `Surface` gates on `usePanelPresence`, which
   * sets `mounted` inside an effect — so on the render where `open` flips true the surface
   * returns `null`, and `menuRef.current` is still null when the next frame arrives. Measured
   * on the built export: 420 ms after the trigger was clicked, `document.activeElement` was
   * still the trigger button. Nothing focused the menu, ever.
   *
   * That is why the menu did not close on Escape: `onMenuKeyDown` sits inside the surface and
   * reads keys that bubble up from a focused row, and no row was focused, so the key landed on
   * the trigger — whose own handler answers only ArrowDown. The same silence broke ArrowDown,
   * ArrowUp, Home and End inside the menu, which nothing was checking.
   *
   * A callback ref fires exactly when React attaches the node, so there is no window to miss.
   */
  const attachMenu = useCallback((node: HTMLElement | null) => {
    menuRef.current = node;
    // The node exists only while the menu is open — `usePanelPresence` mounts it on open and
    // drops it after the exit window — so attaching *is* the open signal, and reading `open`
    // here would only be a second, later copy of the same fact.
    node?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);

  /*
   * Escape closes wherever focus happens to be.
   *
   * The handler inside the surface stays — it is the one that also runs the arrow keys — but
   * Escape must not depend on focus having arrived somewhere in particular. A person who opens
   * a menu and immediately presses Escape is asking for it to go away, and "it went away only
   * if the focus move had already landed" is the class of defect this whole surface contract
   * exists to catch.
   */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      close(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') {
      close(false);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    }
  };

  if (!silicon) return null;

  const rows = [
    { asset: silicon, label: t('heroMacSilicon'), testId: 'gateway-hero-macos-aarch64' },
    ...(intel ? [{ asset: intel, label: t('heroMacIntel'), testId: 'gateway-hero-macos-x64' }] : []),
  ];

  return (
    <div ref={rootRef} className={cn('relative min-w-0', className)}>
      <Button
        ref={triggerRef}
        variant={variant === 'primary' ? 'primary' : 'outline'}
        size="lg"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="min-w-0 whitespace-normal text-left sm:whitespace-nowrap"
      >
        <Download size={ICON_SIZE.lg} aria-hidden />
        {t('heroMacCta')}
        <ChevronDown
          size={ICON_SIZE.md}
          aria-hidden
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </Button>
      <Surface
        open={open}
        ref={attachMenu}
        id={menuId}
        role="menu"
        aria-label={t('heroMacMenuLabel')}
        origin="top left"
        data-testid="gateway-hero-mac-menu"
        {...transientSurface('menu')}
        className="absolute left-0 top-full z-10 mt-2 min-w-[16rem] rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-1 shadow-[var(--shadow-elevation-1)]"
      >
        {/* Key handling sits on an inner wrapper: the surface primitive owns identity and
            motion, and keydown bubbles up from the focused row. */}
        <div onKeyDown={onMenuKeyDown}>
        {rows.map((row) => (
          <a
            key={row.testId}
            role="menuitem"
            href={row.asset.downloadUrl}
            data-testid={row.testId}
            onClick={() => close(false)}
            className={controlClass({
              shape: 'row',
              size: 'md',
              hoverSurface: 'lift',
              className: 'justify-between gap-6 rounded-chip text-[color:var(--color-text-primary)]',
            })}
          >
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="shrink-0 font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">
              {formatAssetSize(row.asset.sizeBytes)}
            </span>
          </a>
        ))}
        </div>
      </Surface>
    </div>
  );
}
