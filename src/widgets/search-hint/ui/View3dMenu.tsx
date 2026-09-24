'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { usePanelPresence } from '@/shared/lib/use-presence';
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
 * The **view picker** the 「3D」 chip opens (2026-08-18).
 *
 * ## Why a popup rather than a toggle
 *
 * With two arrangements inside 3D (dome and cloud), a single 「3D on/off」 toggle can
 * no longer say **what you are looking at**. The arrangements were first put in the
 * settings sheet, and two owner verdicts came back: *"Where can I see the cloud?
 * There's nothing to choose."* (where can I see the cloud? there's nothing to choose) and
 * *"Nobody knows what "ownership" and "coupling" mean — pressing 3D should bring up a selection popup."* (nobody knows
 * what "ownership" and "coupling" mean — pressing 3D should bring up a selection popup).
 *
 * Both are the same diagnosis. **A control that changes what you are looking at
 * belongs over what you are looking at.** The settings sheet is the place for values
 * you set once and rarely change, not for 「how do I look at this screen」.
 *
 * ## Why three rows — flat is chosen here too
 *
 * Splitting 「turn 3D off」 and 「choose a shape within 3D」 into two controls makes the
 * user read one state in two places. With all three in one list, **what you are
 * looking at reads from one place** and choosing is a single act. So the duplicate
 * switch in the settings sheet was removed when this popup appeared — this
 * repository's «one fact, one place» discipline.
 *
 * ## Why the names are not 「ownership/coupling」
 *
 * That was the first copy, and the owner did not recognise it. An abstract noun is
 * only a name to someone who already knows the concept. Name the visible thing first
 * (**dome** · **cloud**) and attach what it answers on a line below. The internal
 * keys (`ownership`/`coupling`) are unchanged — the screen's words differing from the
 * code's words is normal; putting the code's words on screen is the accident.
 */

/**
 * One row of the list — the two flat views plus the three 3D arrangements.
 *
 * `galaxy` is 2D too, but it owns a stable three-arm placement for every real
 * concept while Flat keeps the containment map. It is one row here because to
 * a reader "how does the map look" is one question, and because that is where
 * the owner went looking for it (2026-09-10, superseded spatial direction
 * selected 2026-09-15).
 */
type View3dChoice = 'flat' | 'territories' | 'hex' | 'galaxy' | MapArrangement;

/*
 * Cone before Strata before Cloud. The order is how far each moves from the flat
 * map above it: Cone and Strata both draw containment (Cone as nested shapes,
 * Strata as stacked levels) and Cloud drops containment altogether, so reading
 * down the list is one continuous step away from the default rather than a jump
 * out and back.
 */
/*
 * Territories sits directly under Flat: it is the same flat plane with nothing folded, so it
 * is the smallest step away from the default (owner decision, 2026-09-24).
 */
/* The hex board follows Territories: the same flat plane, one tile per capability (2026-09-25). */
const CHOICES: readonly View3dChoice[] = ['flat', 'territories', 'hex', 'galaxy', 'ownership', 'strata', 'coupling'];

/**
 * Is this press on the map itself? The picker floats over the canvas, so the
 * canvas is the one surface a dismissing press must not also act on. Matched by
 * element type rather than by importing the map widget — `search-hint` and
 * `ontology-map` are siblings, and a DOM shape is not a dependency.
 */
function isMapCanvas(target: Node): boolean {
  const element = target instanceof Element ? target : target.parentElement;
  return element?.closest('canvas') != null;
}

export function View3dMenu({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * The 「3D」 chip that owns this picker. A press on it is the chip's own
   * business — see the dismissal block below.
   */
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
  /*
   * The way out — a surface that appears conditionally **is born owing a way to
   * disappear** (`surface-motion-ratchet`). Without one it vanishes in a single frame
   * on close, and that is a hard cut where the user cannot see what they just closed.
   */
  const presence = usePanelPresence(open);

  const apply = (next: View3dChoice) => {
    // At most one of the three flags is on; each row writes all of them.
    writeTerritories(next === 'territories');
    writeHexBoard(next === 'hex');
    if (next === 'flat' || next === 'galaxy' || next === 'territories' || next === 'hex') {
      // The 2D views turn the dome off; the Galaxy choice also selects its
      // dedicated stable sky coordinates while Flat restores its prior map.
      writeGalaxy(next === 'galaxy');
      writeView3d(false);
    } else {
      writeGalaxy(false);
  // Write the arrangement **first** — turning 3D on and then changing the arrangement
  // starts assembling with the old arrangement for one frame and then rebuilds (the
  // assembly animation stutters twice).
      writeMapArrangement(next);
      writeView3d(true);
    }
    onClose();
  };

  const group = useRovingRadioGroup({ value, values: CHOICES, onChange: apply });

  /*
   * Closes on an outside press or Esc. This surface **does not block what is behind
   * it** — the point is choosing while watching the map, and a modal would hide the
   * result while choosing. So there is no scrim and no trap (it is not subject to the
   * modal contract).
   *
   * ⚠️ **While closed it listens to nothing.** This component is **always rendered**
   * beside the chip (even with `open` false). Hooks run before any early return, so
   * without this guard it would intercept document Esc and `stopPropagation()`
   * **the whole time the menu is closed** — killing Esc across the app. Measured
   * (2026-08-19 CI): node detail stopped closing on Esc, and five specs went red
   * together, covering the keyboard path, focus return and the popover contract. A
   * conditional surface's global listener lives **only while open**.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    /**
     * **Putting the picker away must not walk the map** (owner report, 2026-09-07).
     *
     * Two holes met here, and together they wrote state the owner never asked for:
     *
     * 1. The chip counted as 「outside」. Pressing it a second time closed here and
     *    the chip's own toggle reopened in the same React batch, so the control that
     *    opens the picker **could not close it** (measured: `data-state` stayed
     *    `open` after a second chip press). The only way out left was pressing the
     *    map.
     * 2. That press was not consumed. It dismissed the picker **and** reached the
     *    canvas, selecting whatever node sat under it. In 3D every tier is drawn, so
     *    that is usually a capability or an element — which appends a footprint step
     *    and derives the node's `contains` ancestors into `open=`. Back in flat 2D
     *    the reader finds a walked-trail chip and one domain fanned open, from a click
     *    they never meant to make.
     *
     * So: the anchor is not outside, and a dismissing press that lands on the map
     * canvas closes the picker and stops there. It is swallowed on `pointerdown`
     * (capture) plus the `click` that follows, because the canvas acts on both.
     * Other chrome is left alone on purpose — a press on the search chip or the nav
     * rail should still do its job on the first try; only the surface this picker
     * hovers over is protected, and only for the one press that dismissed it.
     */
    const onDown = (e: PointerEvent) => {
      const box = boxRef.current;
      if (!(e.target instanceof Node)) return;
      if (box?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose();
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
    // Received on capture — stops the map canvas swallowing pointerdown first and
    // leaving the popup open.
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
      data-state={presence.exiting ? 'closed' : 'open'}
      className={cn(
        'overlay-spring-surface',
        presence.exiting && 'pointer-events-none',
        // Below `xl` the lane sits in the top-right corner, so a menu centred under
        // the chip ran into the right-hand control column (measured 2026-09-02 at
        // 1100 and 1200 px: it covered the fit, tour, and help tiles). There it
        // hangs from the chip's right edge instead, which keeps it left of that
        // column; from `xl` up the lane is centred in the map and the menu centres
        // under the chip as before.
        'absolute right-0 top-full z-40 mt-2 w-60 xl:left-1/2 xl:right-auto xl:-translate-x-1/2',
        'rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)]',
        'bg-[color:var(--map-panel-surface)] p-1.5 shadow-[var(--map-panel-shadow)]',
      )}
    >
      <div {...group.groupProps} aria-label={t('mapViewAriaLabel')} className="flex flex-col gap-1">
        {CHOICES.map((choice, index) => {
          const active = choice === value;
          return (
            <button
              key={choice}
              {...group.itemProps(index)}
              type="button"
              data-testid={`topology-view-3d-choice-${choice}`}
              className={controlClass({
                shape: 'row',
                size: 'md',
                // Hover is owned by the value layer — writing it by hand makes the
                // app's hover grammar diverge site by site (`hover-axis-adoption-ratchet`).
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
              {/* One line for what that row answers. The name alone does not convey
                  «what is different» — which is why 「Ownership/Combination」 failed. */}
              <span className="break-keep text-label text-[color:var(--map-panel-text-secondary)]">
                {t(`view3dChoiceHint.${choice}`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
