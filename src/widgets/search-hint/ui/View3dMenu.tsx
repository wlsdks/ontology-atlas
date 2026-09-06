'use client';

import { useEffect, useRef } from 'react';
import { usePanelPresence } from '@/shared/lib/use-presence';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { useRovingRadioGroup } from '@/shared/lib/use-roving-radio-group';
import { controlClass } from '@/shared/ui/control-class';
import { transientSurface } from '@/shared/ui/transient-surface';
import {
  useMapArrangement,
  useView3d,
  writeMapArrangement,
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

/** One row of the list — flat (2D) plus the three 3D arrangements. */
type View3dChoice = 'flat' | MapArrangement;

/*
 * Cone before Strata before Cloud. The order is how far each moves from the flat
 * map above it: Cone and Strata both draw containment (Cone as nested shapes,
 * Strata as stacked levels) and Cloud drops containment altogether, so reading
 * down the list is one continuous step away from the default rather than a jump
 * out and back.
 */
const CHOICES: readonly View3dChoice[] = ['flat', 'ownership', 'strata', 'coupling'];

export function View3dMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('searchWidgets.hint');
  const view3d = useView3d();
  const arrangement = useMapArrangement();
  const value: View3dChoice = view3d ? arrangement : 'flat';
  const boxRef = useRef<HTMLDivElement | null>(null);
  /*
   * The way out — a surface that appears conditionally **is born owing a way to
   * disappear** (`surface-motion-ratchet`). Without one it vanishes in a single frame
   * on close, and that is a hard cut where the user cannot see what they just closed.
   */
  const presence = usePanelPresence(open);

  const apply = (next: View3dChoice) => {
    if (next === 'flat') {
      writeView3d(false);
    } else {
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
    const onDown = (e: PointerEvent) => {
      const box = boxRef.current;
      if (box && e.target instanceof Node && !box.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', onKey);
    // Received on capture — stops the map canvas swallowing pointerdown first and
    // leaving the popup open.
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [onClose, open]);

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
        'rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)]',
        'bg-[color:var(--topology-v2-panel-surface)] p-1.5 shadow-[var(--topology-v2-panel-shadow)]',
      )}
    >
      <div {...group.groupProps} aria-label={t('view3dAriaLabel')} className="flex flex-col gap-1">
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
                    : 'text-[color:var(--topology-v2-panel-text-primary)]',
                )}
              >
                {t(`view3dChoice.${choice}`)}
              </span>
              {/* One line for what that row answers. The name alone does not convey
                  «what is different» — which is why 「Ownership/Combination」 failed. */}
              <span className="break-keep text-label text-[color:var(--topology-v2-panel-text-secondary)]">
                {t(`view3dChoiceHint.${choice}`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
