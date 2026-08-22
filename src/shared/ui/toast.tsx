'use client';

import { type ReactNode } from 'react';
import { toast as sonnerToast, Toaster } from 'sonner';

type ToastTone = 'success' | 'info' | 'error';

/**
 * At most **one** follow-up action per toast (PO council, 2026-08-03).
 *
 * A toast dismisses itself, so it has no right to ask for a choice: two or more
 * actions pressure the user to decide before it disappears. One action is not a
 * choice, it is a way back to what they just did.
 *
 * It is optional for the same reason — missing it must cost the user nothing.
 * Anything that hurts to miss belongs on a persistent surface.
 */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastApi {
  /** `action` is optional so the ~50 existing `useToast()` call sites are untouched. */
  show: (message: string, tone?: ToastTone, action?: ToastAction) => void;
}

/**
 * The app's one notification popup, on sonner. No screen builds its own — they
 * all go through `useToast().show()`.
 *
 * **`theme="dark"` is not decoration.** Without it sonner falls back to its light
 * theme; the owner reported white, off-brand toasts on 2026-07-24 for exactly
 * that reason.
 *
 * `'use client'` because sonner's store is client-only.
 */
export function ToastProvider({
  children,
  /**
   * Accessible name for the notification region, **injected rather than read**
   * (2026-08-15). This component used to call `useTranslations('nav')` itself,
   * which tied it to this app's next-intl setup and its `nav` namespace — so it
   * did not run at all in a project that took only the design system. A primitive
   * that fetches its own strings belongs to the app, not to the system.
   *
   * The English default means a forgotten injection still leaves no unnamed
   * region for a screen reader; `AppProviders` supplies the translation here.
   */
  notificationsLabel = 'Notifications',
}: {
  children: ReactNode;
  notificationsLabel?: string;
}) {
  return (
    <>
      {children}
      <Toaster
        theme="dark"
        closeButton
        position="bottom-right"
        // Bottom and right offsets come from CSS variables so a page can push
        // toasts clear of its own furniture: a bottom action bar would otherwise
        // sit under them, and with a panel docked to the right of the map, 16px
        // from the viewport edge lands *inside* the panel (`toast-position.ts`;
        // owner screen, 2026-08-16). Everywhere else the default 16px applies.
        offset={{
          top: 16,
          right: 'var(--app-toast-right-offset, 16px)',
          bottom: 'var(--app-toast-bottom-offset, 16px)',
          left: 16,
        }}
        gap={8}
        containerAriaLabel={notificationsLabel}
        // sonner's default hotkey (Alt+T) gets appended to the region label,
        // which reads as ambiguous in a screen reader. Disabled so the label is
        // only the locale-aware name.
        hotkey={[]}
        toastOptions={{
          classNames: {
            // `app-toast` is a motion hook, not styling: it replaces sonner's
            // stock 400ms `ease` (measured 2026-07-28 — 2.5% of the move in the
            // first frame, peaking at frame 6, i.e. ease-in on entry) with the
            // app ramp, and carries the reduced-motion equivalent so those users
            // get a substitute rather than a hard cut. See the sonner motion
            // block in `app/globals.css`.
            toast:
              'app-toast rounded-full border bg-[color:var(--color-panel)] px-3.5 py-2 text-body text-[color:var(--color-text-primary)] shadow-[var(--shadow-elevation-1)]',
            success:
              'border-[color:var(--color-success-a35)] text-[color:var(--color-text-primary)]',
            info: 'border-[color:var(--color-indigo-line-a35)] text-[color:var(--color-text-primary)]',
            error:
              'border-[color:var(--color-danger-a32)] text-[color:var(--color-text-primary)]',
            // Close affordance — token-styled so it reads as our dark chrome,
            // never sonner's default light chip.
            closeButton:
              'border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]',
            // Deliberately a quiet ghost, not filled indigo: a toast dismisses
            // itself, so an action loud enough to pull the eye competes with the
            // real attention winner on screen. The label does the work.
            //
            // The ink is `--color-indigo-text-soft`, not `--color-indigo-accent`,
            // because the hover state puts an indigo tint behind it: accent ink on
            // that tint measures 4.27:1, below AA, while soft measures 8.39:1.
            // Found 2026-08-22 — the `accent-ink-contrast` gate had been blind to
            // this pairing because it parsed comment text as code, so its tag
            // extraction never saw the two literals in one tag.
            actionButton:
              'border border-[color:var(--color-indigo-line-a35)] bg-transparent text-[color:var(--color-indigo-text-soft)] hover:bg-[color:var(--color-indigo-a16)]',
          },
        }}
      />
    </>
  );
}

/**
 * Thin wrapper over sonner's imperative API. No out-of-provider branch is needed:
 * sonner keeps its own store, so a call made outside the provider still works.
 */
export function useToast(): ToastApi {
  return {
    show: (message: string, tone: ToastTone = 'success', action?: ToastAction) => {
      // Without an action, pass no options object at all, so existing call
      // sites behave exactly as before.
      const options = action
        ? { action: { label: action.label, onClick: action.onClick } }
        : undefined;
      switch (tone) {
        case 'error':
          sonnerToast.error(message, options);
          return;
        case 'info':
          sonnerToast.info(message, options);
          return;
        case 'success':
        default:
          sonnerToast.success(message, options);
      }
    },
  };
}
