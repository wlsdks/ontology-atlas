'use client';

import type { ReactNode } from 'react';

import { ChevronDown } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { RowButton } from '@/shared/ui/controls';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';

/**
 * One step of "Connect My Agent" — **only one expands at a time.**
 *
 * ## Why this component exists (2026-08-04, owner instruction)
 *
 * Owner: *"This is odd — a blue box, far too long, hard to look at; split it up."*
 * (this is odd — a blue box, far too long, hard to look at; split it up). The
 * measurement puts numbers on that: with the advanced fold open, this tab's
 * content was **2,581px** (**4.18 screenfuls** of a 617px window), and
 * "Connect"·"Is it correct?"·"What if it breaks"·"Advanced verification" were all stacked
 * **flat, at the same weight**.
 *
 * The owner picked the approach (B — stepwise progression): expand only the
 * current step, collapse finished ones to a line, and recede the ones not reached
 * yet. **Collapsing, not deleting** — everything collapsed must remain reachable.
 *
 * ## Why not `StepRow` (features)
 *
 * `StepRow` is an **always-expanded** grammar. The map sheet is right to show all
 * three steps at once (there, that is everything), while here verification, repair
 * and commands follow those three, so the same grammar becomes four screenfuls.
 * Rather than putting two behaviours under one name — which is what split
 * `StepCard`/`StepRow` in the first place — this single-consumer grammar lives next
 * to its consumer. It drops to `features` when a second consumer appears.
 *
 * ## What collapses and expands is the list-row disclosure grammar (`.ai-row-disclosure`)
 *
 * The first version (morning of 2026-08-04) wrapped it in `Surface` (chrome
 * grammar), and **that evening the owner caught the defect in the installed app** —
 * *"It stutters and opens strangely?"* (it stutters and opens strangely). Frame
 * measurement: moving from step 1 to step 3, the siblings below were pushed
 * **+254px in one frame** (the opening body mounts at full height immediately) and
 * then, 140ms later, snapped back **−352px in another single frame** (the closing
 * body holds its space through the exit window and then vanishes at once). Zero
 * transition frames.
 *
 * The cause is the choice of grammar. `Surface(chrome)` belongs to **a surface that
 * floats and covers what is below** (scale plus fade, holding layout through the
 * exit window), so applying it to an in-flow element makes the surroundings jump
 * twice. The grammar for in-flow collapsing already exists in the app:
 * `.ai-row-disclosure` (height transition, `--motion-base`) plus
 * `useRowDisclosure`. Siblings yielding and reclaiming space **continuously** is
 * part of that grammar's job. Zero new keyframes, zero new tokens. The hard-cut
 * ratchet's (`surface-motion-ratchet`) baseline of 0 is unchanged: the box is
 * always drawn and only the content drops out of the collapse, so it is not a
 * conditionally appearing surface at all (`AgentSetupStep.test.tsx` pins the
 * grammar as a contract).
 */

export type AgentSetupStepState = 'done' | 'now' | 'todo';

export interface AgentSetupStepProps {
  n: number;
  title: string;
  /** The one-line description, visible only when expanded. */
  desc?: string;
  state: AgentSetupStepState;
  /** The collapsed row's right side — one phrase for what this step is right now. */
  trailing?: string;
  open: boolean;
  onToggle: () => void;
  testId: string;
  children?: ReactNode;
}

/**
 * The number badge's fill carries state — **the glyph does not change.**
 *
 * Swapping the number for a check glyph on completion breaks the axis that counts
 * "which one am I on" halfway through. This screen once carried **four** numbering
 * systems (3 steps · 6 flow · 4 evidence · 6 commands), so no number pointed at
 * "what to do now". One numbering survives, and that one stays numbers to the end.
 *
 * ## Fact and interaction get separate channels (installed-app measurement, 2026-08-04)
 *
 * The badge fill carries **the flow's fact** (done/now/todo) only. So when the user
 * opens step 3 early, the "Now" badge is on step 1 while the expanded body is on
 * step 3 — and previously the expanded row's head carried no signal at all, so the
 * two rows read as making conflicting claims (owner's attached screenshot). The
 * prescription is not to make the badge follow (that pollutes fact with
 * interaction) but **to give expansion its own channel**: the chevron rotation at
 * the row's right end — the channel the "Having trouble?" toggle directly below
 * already uses, so it is not a new grammar. Rotation is a state confirmation, so it
 * rides the default transition (`--motion-fast`).
 */
const BADGE: Record<AgentSetupStepState, string> = {
  done: 'bg-[color:var(--color-success-a12)] text-[color:var(--color-success-text-a90)]',
  now: 'bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-text-soft)]',
  todo: 'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-quaternary)]',
};

const TRAILING_INK: Record<AgentSetupStepState, string> = {
  done: 'text-[color:var(--color-success-text-a90)]',
  now: 'text-[color:var(--color-text-tertiary)]',
  todo: 'text-[color:var(--color-text-quaternary)]',
};

export function AgentSetupStep({
  n,
  title,
  desc,
  state,
  trailing,
  open,
  onToggle,
  testId,
  children,
}: AgentSetupStepProps) {
  const bodyId = `${testId}-body`;
  const { mounted, boxRef, contentRef } = useRowDisclosure(open);
  return (
    <li className="min-w-0" data-testid={testId} data-step-state={state}>
      <RowButton
        size="md"
        /*
         * What recedes is **an unreached step that is also collapsed** (measurement
         * correction from the installed app, 2026-08-04). The old expression looked
         * only at `state === 'todo'`, so when a user opened a step they had not
         * reached, **the expanded row became the dimmest line on screen** — measured
         * in the app, opening step 3 made its title `quaternary`
         * rgb(130,130,137) while the collapsed step 1 title was `primary`
         * rgb(247,248,248). What you are reading being dimmer than what you are not
         * is an inverted hierarchy.
         *
         * The badge still carries the flow's fact only (see the `BADGE` comment
         * above) — what changes here is one step of ink on **the channel expansion
         * already owns** (the chevron rotation), so no new channel and no new tone.
         */
        tone={state === 'todo' && !open ? 'muted' : 'strong'}
        data-testid={`${testId}-toggle`}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        /* A full-width row, so the radius is removed — the list container already has its own. */
        className="gap-2.5 rounded-none"
      >
        <span
          aria-hidden
          className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-label font-[var(--font-weight-signature)] ${BADGE[state]}`}
        >
          {n}
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-[var(--font-weight-signature)]">{title}</span>
        {trailing ? (
          <span className={`shrink-0 text-label ${TRAILING_INK[state]}`}>{trailing}</span>
        ) : null}
        {/* The expansion channel — colour inherits the row's tone (zero new ink decisions). */}
        <ChevronDown
          size={ICON_SIZE.sm}
          aria-hidden
          className="shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
      </RowButton>
      {/* The box is always drawn — mounting it on open leaves the transition no
          starting height and produces a hard cut. Only the content drops out of the
          collapse, so it does not remain in the screen reader or tab order (the same
          contract as `TopologyIndexTreeRow`). The `id` lives on the box, so the
          `aria-controls` target exists even mid-collapse. */}
      <div
        ref={boxRef}
        id={bodyId}
        data-state={open ? 'open' : 'closed'}
        className="ai-row-disclosure"
        inert={!open}
      >
        {mounted ? (
          <div ref={contentRef} className="ai-row-disclosure-body px-3 pb-3">
            {desc ? (
              <p className="break-keep text-label text-[color:var(--color-text-tertiary)]">
                {desc}
              </p>
            ) : null}
            {children ? <div className="mt-2 flex flex-col gap-2">{children}</div> : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
