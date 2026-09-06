'use client';

import { type CSSProperties, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { toast as sonnerToast, Toaster } from 'sonner';

import { ICON_SIZE } from './icon-size';

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
interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastApi {
  /** `action` is optional so the ~50 existing `useToast()` call sites are untouched. */
  show: (message: string, tone?: ToastTone, action?: ToastAction) => void;
  /**
   * Clears every toast on screen.
   *
   * For the one case a toast cannot handle: a **blocking** surface is about to open. A
   * toast is a dismissible aside, so it sits above the scrim with nothing to dismiss it
   * but time, and a person reading a dialog is asked to read two things at once — the
   * "floating box soup" the design charter refuses. The caller clears before it opens
   * rather than the dialog reaching out to hide things it does not own.
   */
  dismiss: () => void;
}

/**
 * The app's one notification popup, on sonner. No screen builds its own — they
 * all go through `useToast().show()`.
 *
 * **Top centre, not bottom right** (owner, 2026-09-06: *"the right has a panel, so
 * nobody looks there; under the icons at the top centre is better"*). The map's
 * toolbar is centred and the agent dock stands on the right, so a corner toast was
 * either under the dock or behind the person's attention. The toaster sits under
 * the top toolbar (`--app-toast-top-offset`, planted by the map; 16px elsewhere) and
 * is centred over the area left of the right dock (`--right-dock-width`, see the
 * rule in `app/globals.css`), which is where the toolbar itself is centred.
 *
 * **Unstyled on purpose.** sonner's stock box (rounded pill, its own close chip at
 * the top-left corner, grey icon) read as a foreign widget beside our chrome. The
 * whole box is drawn from this repository's tokens: elevated surface, soft hairline,
 * one 16px status icon in the tone's ink, the message in `text-body`, one quiet
 * indigo action, and a close button that lives at the right end and shows on hover
 * or focus. `app-toast` stays as the motion hook (`app/globals.css`).
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
        position="top-center"
        offset={{ top: 'var(--app-toast-top-offset, 16px)', right: 16, bottom: 16, left: 16 }}
        gap={8}
        // The box width is ours, not sonner's 356px default: wide enough for one
        // Korean sentence plus an action without wrapping at 1512, and never wider
        // than the viewport less the edge gaps (sonner reads `--width`).
        style={{ '--width': 'min(440px, calc(100vw - 32px))' } as CSSProperties}
        containerAriaLabel={notificationsLabel}
        // sonner's default hotkey (Alt+T) gets appended to the region label,
        // which reads as ambiguous in a screen reader. Disabled so the label is
        // only the locale-aware name.
        hotkey={[]}
        icons={{
          success: <CircleCheck size={ICON_SIZE.md} aria-hidden />,
          info: <Info size={ICON_SIZE.md} aria-hidden />,
          error: <CircleAlert size={ICON_SIZE.md} aria-hidden />,
          close: <X size={ICON_SIZE.sm} aria-hidden />,
        }}
        toastOptions={{
          unstyled: true,
          classNames: {
            // `app-toast` is a motion hook, not styling: it replaces sonner's
            // stock 400ms `ease` (measured 2026-07-28 — 2.5% of the move in the
            // first frame, peaking at frame 6, i.e. ease-in on entry) with the
            // app ramp, and carries the reduced-motion equivalent so those users
            // get a substitute rather than a hard cut. See the sonner motion
            // block in `app/globals.css`.
            //
            // `group` lets the close button reveal on hover of the whole box;
            // `pr-9` reserves its seat so the message never runs under it.
            toast:
              'app-toast group relative flex w-full items-center gap-2.5 rounded-[var(--radius-card)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] py-2.5 pl-3 pr-9 text-body leading-body text-[color:var(--color-text-primary)] shadow-[var(--shadow-elevation-2)]',
            content: 'flex min-w-0 flex-1 items-center',
            title: 'min-w-0 flex-1 break-keep',
            // The icon carries the tone; the box itself stays neutral so three
            // toasts in a row read as one family, not three coloured cards.
            icon: 'flex shrink-0 items-center [&>svg]:block',
            success: '[&_[data-icon]]:text-[color:var(--color-status-success)]',
            info: '[&_[data-icon]]:text-[color:var(--color-indigo-text-soft)]',
            error: '[&_[data-icon]]:text-[color:var(--color-danger-text)]',
            // Deliberately a quiet ghost, not filled indigo: a toast dismisses
            // itself, so an action loud enough to pull the eye competes with the
            // real attention winner on screen. The label does the work.
            //
            // The ink is `--color-indigo-text-soft`, not `--color-indigo-accent`,
            // because the hover state puts an indigo tint behind it: accent ink on
            // that tint measures 4.27:1, below AA, while soft measures 8.39:1
            // (2026-08-22).
            actionButton:
              'ml-1 h-7 shrink-0 rounded-[var(--radius-chip)] px-2.5 text-label leading-label font-[var(--font-weight-signature)] text-[color:var(--color-indigo-text-soft)] hover:bg-[color:var(--color-indigo-a16)] focus-visible:bg-[color:var(--color-indigo-a16)]',
            // Geometry, ink and the hover reveal of the close button live in
            // `app/globals.css` (`.app-toast [data-close-button]`): sonner's runtime
            // stylesheet loads after ours and its dark-theme rule outranks a utility
            // class, so only the box's size and shape are set here.
            closeButton: 'flex size-6 items-center justify-center rounded-[var(--radius-chip)]',
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
      // The id is the message itself: sonner updates a visible toast that carries
      // the same id instead of stacking a twin under it. Two edits in one agent turn
      // used to raise two identical "capability edited" boxes (owner screenshot,
      // 2026-09-06); now the second refreshes the first. Different messages still
      // stack, and a repeat after the first has gone shows again.
      const options = {
        id: `${tone}:${message}`,
        ...(action ? { action: { label: action.label, onClick: action.onClick } } : {}),
      };
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
    dismiss: () => sonnerToast.dismiss(),
  };
}
