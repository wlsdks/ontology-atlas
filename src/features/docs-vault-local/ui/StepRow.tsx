'use client';

/**
 * Number badge + title + description + content — one grammar for the "three connection steps".
 *
 * **Why this file exists** (2026-08-02, design council). One concept had split into two names: the
 * map sheet's `StepRow` (no border) and the settings panel's `StepCard` (with card chrome) — and
 * **the number badge classes were byte-identical between them**. The only difference was that
 * `StepCard` wrapped one more layer of `rounded-chip border ... bg-[...] px-2.5 py-2.5`.
 *
 * That one layer produced **four nested borders** in the settings panel:
 *
 * ```
 * app-settings-popover       1px --color-border-soft        r12
 *  └ section (indigo panel)  1px --color-indigo-line-a22    r6
 *     └ agent-setup-step-N   1px --color-border-soft        r6   ← this layer
 *        └ agent-client-…    1px --color-indigo-line-a54    r6
 * ```
 *
 * ⚠️ This diagram is written **with token names** — writing values lets the prose quietly go stale
 * when a token moves, and `check-no-raw-color` counts literals inside comments as violations, which
 * freezes that gate red (measured in the 2026-08-04 audit: these two lines were that gate's only
 * violations, and the gate was not wired into CI so nobody knew).
 *
 * Merging onto the version without card chrome brings it to three layers and also removes the defect
 * where «step 2 has one line of content but full card chrome» — with no border or background, the
 * idea of a "card with zero lines of content" cannot arise.
 *
 * Why it lives in `features`: its two consumers are `widgets/agent-connect` and
 * `widgets/app-settings-menu`, so instead of a same-layer cross-import it moves one layer down (FSD
 * import direction).
 */

export interface StepRowProps {
  n: number;
  title: string;
  desc?: string;
  /**
   * Per-surface marker. The two consumers already have their own names (map sheet =
   * `agent-connect-step-N`, settings = `agent-setup-step-N`), and unifying them while merging would
   * quietly point the e2e specs, validators, and contract tests at a different surface.
   */
  testId?: string;
  children?: React.ReactNode;
}

export function StepRow({ n, title, desc, testId, children }: StepRowProps) {
  return (
    <section className="flex flex-col" data-testid={testId ?? `agent-connect-step-${n}`}>
      {/*
       * The number is **a line head, not a left rail** (owner report 2026-08-03: *"1하고 밑에보면
       * 그냥 다 공백 이어지는 이런 구조 이상해"* — under the "1" it is just continuous blank space,
       * which looks wrong).
       *
       * It used to be `flex gap-3`, so the number had its own column and that column ran empty for
       * **the full height of the step's content**. In this sheet, where one step can hold a code
       * block and exceed 400px, that column becomes the longest empty band on screen — no ink, the
       * most space.
       *
       * Raising the number onto the title line removes that band and lets the content use the width.
       */}
      <p className="flex items-center gap-2">
      {/*
       * The ink is **indigo on tint** (`--color-indigo-text-soft`), not marker indigo
       * (`--color-indigo-accent`).
       *
       * Measured 2026-08-04: accent (#7170ff) over the `indigo-a16`/panel composite `rgb(28,30,48)`
       * is **4.27:1**, below AA (4.5:1). text-soft in the same place is **8.39:1**. Separating the
       * two indigos is exactly why this repository split them
       * (`accent-ink-contrast.contract.test.ts`), and this slot was hand-writing its way around that
       * licence — not using the value layer's `tone` kept it out of that gate's source scan too.
       *
       * ⚠️ Being `aria-hidden`, axe's `color-contrast` also skips this slot. It is hidden from AT,
       * not from the eye, so to a sighted person it is still low-contrast text. This was where the
       * blind spots of two automated checks overlapped.
       */}
        <span
          aria-hidden
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-indigo-a16)] font-mono text-label font-[var(--font-weight-signature)] text-[color:var(--color-indigo-text-soft)]"
        >
          {n}
        </span>
        <b className="min-w-0 text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
          {title}
        </b>
      </p>
      <div className="min-w-0 flex-1">
        {desc ? (
          <p className="mt-1.5 text-body leading-body text-[color:var(--color-text-tertiary)]">
            {desc}
          </p>
        ) : null}
      {/*
       * ⚠️ **There can be more than one child — which is why this is `flex-col gap`.**
       *
       * It used to be a plain div with only `mt-2.5`. Each child uses `gap-2.5` internally, so most
       * screens looked fine, but in the one place with **two children** (`AgentConnectAction` +
       * `AgentClientButtons`) the space between them was 0 — "see what will be written first" and
       * "Connect to Claude Code" touched and read as one block (owner report 2026-07-29).
       *
       * When a container does not own the spacing between its children and leaves it to them, it goes
       * unnoticed with one child and breaks silently the moment there are two.
       */}
        {children ? <div className="mt-2.5 flex flex-col gap-2.5">{children}</div> : null}
      </div>
    </section>
  );
}
