'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { armMapLayoutMorph } from '@/shared/lib/map-layout-morph-store';
import { usePanelPresence } from '@/shared/lib/use-presence';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { useRovingRadioGroup } from '@/shared/lib/use-roving-radio-group';
import { controlClass } from '@/shared/ui/control-class';
import { transientSurface } from '@/shared/ui/transient-surface';
import {
  useGalaxy,
  useHexBoard,
  useMapArrangement,
  useTerritories,
  useView3d,
  writeGalaxy,
  writeHexBoard,
  writeMapArrangement,
  writeTerritories,
  writeView3d,
  type MapArrangement,
} from '@/shared/lib/appearance-preferences';

/**
 * The view picker the map-view chip opens. A control that changes what you are looking at
 * sits over the map, not in settings, and every view, flat included, is one list so the
 * current view reads from one place. Rows name the visible shape, never the internal key.
 */

/** One row: the flat views plus the 3D arrangements; "how does the map look" is one question. */
type View3dChoice = 'flat' | 'territories' | 'hex' | 'galaxy' | MapArrangement;

/*
 * Ordered by distance from the flat map: the flat-plane views first, then Strata
 * (containment as levels) before Neural (no containment). A stored Cone opens
 * Strata (`resolveStoredMapArrangement`).
 */
const CHOICES: readonly View3dChoice[] = ['flat', 'territories', 'hex', 'galaxy', 'strata', 'coupling'];

/**
 * The canvas is the one surface a dismissing press must not also act on. Matched by
 * element type, since `search-hint` may not import its sibling `ontology-map`.
 */
function isMapCanvas(target: Node): boolean {
  const element = target instanceof Element ? target : target.parentElement;
  return element?.closest('canvas') != null;
}

export function View3dMenu({
  open,
  onClose,
  anchorRef,
  groupId,
}: {
  open: boolean;
  /** `returnFocus`: a choice or Escape gives focus back to the chip; an outside press does not. */
  onClose: (returnFocus: boolean) => void;
  /** The radiogroup's id, which the chip names in `aria-controls`. */
  groupId?: string;
  /** The chip that owns this picker; a press on it is not an outside press. */
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations('searchWidgets.hint');
  const view3d = useView3d();
  const arrangement = useMapArrangement();
  const galaxy = useGalaxy();
  const territories = useTerritories();
  const hexBoard = useHexBoard();
  const value: View3dChoice = view3d ? arrangement : hexBoard ? 'hex' : territories ? 'territories' : galaxy ? 'galaxy' : 'flat';
  const boxRef = useRef<HTMLDivElement | null>(null);
  const presence = usePanelPresence(open);
  const reducedMotion = usePrefersReducedMotion();

  const write = (next: View3dChoice) => {
    if (next !== value) armMapLayoutMorph();
    writeTerritories(next === 'territories');
    writeHexBoard(next === 'hex');
    if (next === 'flat' || next === 'galaxy' || next === 'territories' || next === 'hex') {
      writeGalaxy(next === 'galaxy');
      writeView3d(false);
    } else {
      writeGalaxy(false);
      // The arrangement goes first, or 3D assembles the old arrangement for a frame and rebuilds.
      writeMapArrangement(next);
      writeView3d(true);
    }
  };

  /*
   * Arrow keys change the view with the picker still open, so the map follows while
   * watching; a press, Enter included, chooses, closes and returns focus to the chip.
   */
  const group = useRovingRadioGroup({ value, values: CHOICES, onChange: write });

  // On open, focus the checked view. The box mounts one commit after `open`, so both are
  // awaited. A layout effect, or an Escape landing before a passive effect lets that
  // effect focus the closing radio and drop focus to <body>.
  const boxMounted = presence.mounted;
  useLayoutEffect(() => {
    if (!open || !boxMounted) return;
    boxRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus({ preventScroll: true });
  }, [open, boxMounted]);

  /*
   * Closes on an outside press or Esc, with no scrim or trap: the map stays visible while
   * choosing. The component is always rendered, so listeners live only while open, or its
   * Escape `stopPropagation()` kills Escape across the app.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose(true);
      }
    };
    /*
     * Putting the picker away must not walk the map. The anchor is not outside, or the chip
     * closes and reopens it in one batch. A dismissing press on the canvas is swallowed on
     * pointerdown and the following click, or it selects a node and writes trail and the
     * URL's `open=` state; other chrome still acts on the first press.
     */
    const onDown = (e: PointerEvent) => {
      const box = boxRef.current;
      if (!(e.target instanceof Node)) return;
      if (box?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose(false);
      if (!isMapCanvas(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const swallowClick = (click: Event) => {
        click.preventDefault();
        click.stopPropagation();
      };
      document.addEventListener('click', swallowClick, { capture: true, once: true });
      // If no click follows (a drag, a press that left the canvas), drop the trap on
      // the next frame rather than eating an unrelated later click.
      requestAnimationFrame(() =>
        document.removeEventListener('click', swallowClick, true),
      );
    };
    document.addEventListener('keydown', onKey);
    // Capture phase, or the map canvas swallows pointerdown first and the picker stays open.
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [anchorRef, onClose, open]);

  if (!presence.mounted) return null;

  return (
    <div
      ref={boxRef}
      {...transientSurface('menu')}
      data-testid="topology-view-3d-menu"
      data-map-layout-pick=""
      data-state={presence.exiting ? 'closed' : 'open'}
      className={cn(
        reducedMotion ? 'overlay-fade-only' : 'overlay-spring-surface',
        presence.exiting && 'pointer-events-none',
        // Hangs from the chip's left edge into the map; growing leftward would put it under INDEX.
        'absolute left-0 top-full z-40 mt-2 w-60',
        'rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)]',
        'bg-[color:var(--map-panel-surface)] p-1.5 shadow-[var(--map-panel-shadow)]',
      )}
    >
      <div {...group.groupProps} id={groupId} aria-label={t('mapViewAriaLabel')} className="flex flex-col gap-1">
        {CHOICES.map((choice, index) => {
          const active = choice === value;
          const item = group.itemProps(index);
          return (
            <button
              key={choice}
              {...item}
              onClick={() => {
                item.onClick();
                onClose(true);
              }}
              type="button"
              data-testid={`topology-view-3d-choice-${choice}`}
              className={controlClass({
                shape: 'row',
                size: 'md',
                // Hover comes from the value layer (`hover-axis-adoption-ratchet`).
                hoverSurface: 'lift',
                active,
                className: 'w-full flex-col items-start gap-0.5 px-2.5 py-2 text-left',
              })}
            >
              <span
                className={cn(
                  'text-body',
                  active
                    ? 'text-[color:var(--color-indigo-text-soft)]'
                    : 'text-[color:var(--map-panel-text-primary)]',
                )}
              >
                {t(`view3dChoice.${choice}`)}
              </span>
              {/* What the row answers; balanced so a two-line hint in this 240px picker
                  never leaves one word alone on its second line. */}
              <span className="break-keep text-balance text-label text-[color:var(--map-panel-text-secondary)]">
                {t(`view3dChoiceHint.${choice}`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
