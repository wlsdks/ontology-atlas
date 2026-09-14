'use client';

import {
  type CSSProperties,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
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

interface ToastMetadata {
  /** A quieter second line for context such as the affected document title. */
  description?: string;
}

interface ToastApi {
  /** Optional trailing arguments keep the existing `useToast()` call sites untouched. */
  show: (
    message: string,
    tone?: ToastTone,
    action?: ToastAction,
    metadata?: ToastMetadata,
  ) => void;
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
 * Where a toast stands — **the surface's own answer, with one default.**
 *
 * `top-center` is the default and the map's answer (owner, 2026-09-06: *"the right has
 * a panel, so nobody looks there; under the icons at the top centre is better"*, and
 * 2026-09-07, centred on the viewport rather than on the map area). A surface whose
 * chrome makes that the wrong corner claims a different one with `useToastAnchor`, the
 * same way the map and the Library already plant their own offsets.
 */
export type ToastAnchor = 'top-center' | 'bottom-right';

const ToastAnchorContext = createContext<((anchor: ToastAnchor | null) => void) | null>(null);

/**
 * **Claim a corner for as long as this surface is mounted.**
 *
 * `null` keeps the default. Rendered outside a `ToastProvider` — a project that took
 * only the design system — it does nothing, which is the same promise `useToast` makes.
 */
export function useToastAnchor(anchor: ToastAnchor | null): void {
  const claim = useContext(ToastAnchorContext);
  useEffect(() => {
    if (claim === null || anchor === null) return undefined;
    claim(anchor);
    return () => claim(null);
  }, [anchor, claim]);
}

/**
 * The app's one notification popup, on sonner. No screen builds its own — they
 * all go through `useToast().show()`.
 *
 * **Top centre by default, and the corner is the surface's to name** (see
 * `ToastAnchor` above). The toaster sits under the top toolbar
 * (`--app-toast-top-offset`, planted by the map; 16px elsewhere) and is centred on the
 * viewport (owner, 2026-09-07; the rule in `app/globals.css`). Below 1480px of window it
 * crosses the edge of an open 520px dock; measured 26px of painted panel at 1400, none
 * at the app's opening 1512, and accepted as a transient drawn above.
 *
 * **Every edge is a variable** (2026-09-12). A top-anchored toaster only ever needed the
 * top gap; a surface that anchors to a pane's bottom-right corner needs the other two,
 * because the wall on that side is a dock's edge or a tab bar's top rather than the
 * window's. The defaults are sonner's own 16px, so a surface that plants nothing is
 * unchanged.
 *
 * **Unstyled on purpose.** sonner's stock box (rounded pill, its own close chip at
 * the top-left corner, grey icon) read as a foreign widget beside our chrome. The
 * whole box is drawn from this repository's tokens: elevated surface, soft hairline,
 * one status tile in the tone's ink, the message in `text-body`, one quiet
 * outlined action, and a close button visible at the right end. `app-toast` stays as the motion hook (`app/globals.css`).
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
  const [anchor, setAnchor] = useState<ToastAnchor>('top-center');
  const claim = useCallback((next: ToastAnchor | null) => {
    setAnchor(next ?? 'top-center');
  }, []);
  /*
   * **The narrow band reads its own variables, and they are not the same numbers.**
   * sonner stops reading `offset` at 600px of viewport and switches to `mobileOffset`; a
   * surface that stacks chrome against one edge of its pane therefore has two clearances
   * to state, because below that width its own rows stack differently. Left unplanted
   * both are sonner's own 16px.
   */
  const offset = useMemo(
    () => ({
      top: 'var(--app-toast-top-offset, 16px)',
      right: 'var(--app-toast-right-offset, 16px)',
      bottom: 'var(--app-toast-bottom-offset, 16px)',
      left: 16,
    }),
    [],
  );
  const mobileOffset = useMemo(
    () => ({
      top: 'var(--app-toast-mobile-top-offset, 16px)',
      right: 'var(--app-toast-mobile-right-offset, 16px)',
      bottom: 'var(--app-toast-mobile-bottom-offset, 16px)',
      left: 16,
    }),
    [],
  );
  return (
    <ToastAnchorContext.Provider value={claim}>
      {children}
      <Toaster
        theme="dark"
        closeButton
        position={anchor}
        offset={offset}
        mobileOffset={mobileOffset}
        gap={8}
        // The box width is ours, not sonner's 356px default: wide enough for one
        // Korean sentence plus an action without wrapping at 1512, and never wider
        // than the viewport less the edge gaps (sonner reads `--width`).
        style={{ '--width': 'min(var(--dialog-w-sm), calc(100vw - 32px))' } as CSSProperties}
        containerAriaLabel={notificationsLabel}
        // Keep Sonner's explicit Alt+T shortcut. An empty array does not disable
        // it: `hotkey.every(...)` matches every key and steals Enter from file
        // receipts whenever a folder-change notification is present.
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
            // The dismiss control has a reserved seat, including on touch screens.
            toast:
              'app-toast group relative flex w-full items-center gap-3 rounded-[var(--radius-panel)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] py-3 pl-3 pr-10 text-body leading-body text-[color:var(--color-text-primary)] shadow-[var(--shadow-elevation-2)] [@media(pointer:coarse)]:pr-14',
            content: 'flex min-w-0 flex-1 flex-col items-start gap-0.5',
            title:
              'min-w-0 w-full font-[var(--font-weight-signature)] [overflow-wrap:anywhere] [word-break:keep-all]',
            description:
              'min-w-0 w-full text-caption leading-caption text-[color:var(--color-text-tertiary)] [overflow-wrap:anywhere] [word-break:keep-all]',
            // The icon carries the tone; the box itself stays neutral so three
            // toasts in a row read as one family, not three coloured cards.
            icon: 'flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-card)] [&>svg]:block',
            success: '[&_[data-icon]]:bg-[color:var(--color-success-a12)] [&_[data-icon]]:text-[color:var(--color-status-success)]',
            info: '[&_[data-icon]]:bg-[color:var(--color-indigo-a16)] [&_[data-icon]]:text-[color:var(--color-indigo-text-soft)]',
            error: '[&_[data-icon]]:bg-[color:var(--color-danger-a12)] [&_[data-icon]]:text-[color:var(--color-danger-text)]',
            // A quiet outlined action: a toast dismisses
            // itself, so an action loud enough to pull the eye competes with the
            // real attention winner on screen. The label does the work.
            //
            // The ink is `--color-indigo-text-soft`, not `--color-indigo-accent`,
            // because the hover state puts an indigo tint behind it: accent ink on
            // that tint measures 4.27:1, below AA, while soft measures 8.39:1
            // (2026-08-22).
            actionButton:
              'ml-0 h-8 shrink-0 rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 text-label leading-label font-[var(--font-weight-signature)] text-[color:var(--color-indigo-text-soft)] hover:bg-[color:var(--color-indigo-a16)] focus-visible:bg-[color:var(--color-indigo-a16)] [@media(pointer:coarse)]:min-h-[var(--touch-target-min)]',
            // Geometry, ink and hover feedback of the close button live in
            // `app/globals.css` (`.app-toast [data-close-button]`): sonner's runtime
            // stylesheet loads after ours and its dark-theme rule outranks a utility
            // class, so only the box's size and shape are set here.
            closeButton: 'flex size-7 items-center justify-center rounded-[var(--radius-chip)] [@media(pointer:coarse)]:size-[var(--touch-target-min)]',
          },
        }}
      />
    </ToastAnchorContext.Provider>
  );
}

/**
 * Thin wrapper over sonner's imperative API. No out-of-provider branch is needed:
 * sonner keeps its own store, so a call made outside the provider still works.
 */
export function useToast(): ToastApi {
  return {
    show: (
      message: string,
      tone: ToastTone = 'success',
      action?: ToastAction,
      metadata?: ToastMetadata,
    ) => {
      // Existing calls keep the tone + message id exactly. A description adds the
      // affected subject to the identity: two documents may share a short outcome
      // title and must retain separate Undo actions, while a repeat for the same
      // document should still refresh its visible toast. Two edits in one agent turn
      // used to raise two identical "capability edited" boxes (owner screenshot,
      // 2026-09-06); now the second refreshes the first. Different messages still
      // stack, and a repeat after the first has gone shows again.
      const id = metadata?.description
        ? JSON.stringify([tone, message, metadata.description])
        : `${tone}:${message}`;
      const options = {
        id,
        ...(action ? { action: { label: action.label, onClick: action.onClick } } : {}),
        ...(metadata?.description ? { description: metadata.description } : {}),
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
