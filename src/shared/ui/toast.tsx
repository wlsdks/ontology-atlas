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
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { toast as sonnerToast, Toaster, useSonner } from 'sonner';

import { ICON_SIZE } from './icon-size';
import {
  publishToastLane,
  TOAST_BOTTOM_WALL_VAR,
  TOAST_LEFT_WALL_VAR,
  TOAST_RIGHT_WALL_VAR,
} from './toast-walls';

/**
 * Four tones, one box (2026-09-24). `info` is the **neutral** tone — the name every
 * existing caller already uses — and it is what a toast is unless it reports an outcome:
 * `success` for a write or copy that landed, `warning` for something done with a caveat,
 * `error` for something that did not happen.
 */
type ToastTone = 'success' | 'info' | 'warning' | 'error';

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
 * Where a toast stands — **the bottom of the free lane, with one exception.**
 *
 * `bottom-center` is the default (owner, 2026-09-24: *"the toast at the top — the design
 * is poor, the colour too, and the position"*). Top-centre under the map's toolbar was
 * the 2026-09-06 answer; measured on 2026-09-24 it covered the INDEX panel at 1040
 * (310–730 over 88–388), the open dock at 1040 (by 114px), and the agent status line at
 * 1512. The bottom of the lane between the declared walls (`toast-walls.ts`) is where
 * the map has nothing standing, and it is not the corner the 2026-09-06 record rejected:
 * that one was bottom-**right**, behind the dock.
 *
 * `bottom-right` is the Library's claim (2026-09-12): a notice about the reading pane
 * stands in that pane's corner.
 */
export type ToastAnchor = 'bottom-center' | 'bottom-right';

const DEFAULT_ANCHOR: ToastAnchor = 'bottom-center';

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
 * **Keeps the lane current while a toast stands.**
 *
 * `show()` measures once before the toast mounts, so it arrives in the right place. A
 * wall can still move under a standing toast — the dock animating open, INDEX folding,
 * the window resizing — so while anything is on screen the walls are observed and the
 * lane republished on the next frame. With nothing on screen nothing is observed.
 */
function useToastLane(active: boolean): void {
  useEffect(() => {
    if (!active || typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;
    const observed = new Set<Element>();
    const resize = new ResizeObserver(() => schedule());
    const measure = () => {
      frame = 0;
      for (const element of publishToastLane()) {
        if (observed.has(element)) continue;
        observed.add(element);
        resize.observe(element);
      }
    };
    function schedule() {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    }
    measure();
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      // A wall appears, leaves, or steps aside (the readout fades by class and marks
      // itself `aria-hidden`).
      attributeFilter: ['data-toast-wall', 'aria-hidden', 'class'],
    });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [active]);
}

/**
 * The toast's tone glyph: small, in the tone's ink, on no fill (2026-09-24). The box
 * stays one neutral surface for every tone so a run of toasts reads as one family, and
 * the glyph's **shape** carries the tone as well as its colour — check, triangle,
 * circled bang, circled i — so the tone survives without colour.
 *
 * Ink on `--color-elevated` (#191a1b), WCAG ratio: success `--color-status-success`
 * 6.95:1, warning `--color-status-warning` 9.68:1, error `--color-danger-text` 5.32:1
 * (not `--color-status-danger`, 4.45:1), neutral `--color-text-tertiary` 5.36:1 — all
 * past the 3:1 a status glyph needs and the 4.5:1 of text. Gate: `tests/contract/toast-surface.contract.test.ts`.
 */
const TONE_GLYPH_SIZE = ICON_SIZE.md;

/** 16px above the higher of the tab bar's top and the highest declared floor wall. */
const TOAST_FLOOR = `calc(max(var(--app-toast-bottom-reserve, 0px), var(${TOAST_BOTTOM_WALL_VAR}, 0px)) + 16px)`;

/**
 * The app's one notification popup, on sonner. No screen builds its own — they
 * all go through `useToast().show()`.
 *
 * **The bottom of the free lane by default** (see `ToastAnchor` above). The toaster is
 * centred between the walls the screen declares (`--app-toast-left-wall` /
 * `--app-toast-right-wall`, published by `toast-walls.ts`; the rule in `app/globals.css`)
 * and stands 16px above the floor — the bottom tab bar's top below `lg`
 * (`--app-toast-bottom-reserve`).
 *
 * **Every edge is a variable** (2026-09-12). A surface that anchors to a pane's
 * bottom-right corner needs the right and bottom gaps, because the wall on that side is
 * a dock's edge or a tab bar's top rather than the window's.
 *
 * **Unstyled on purpose.** sonner's stock box read as a foreign widget beside our chrome.
 * The box is drawn from this repository's ramps: `--color-elevated` surface, the strong
 * hairline, `--radius-card` (a medium surface, not a panel), `--shadow-elevation-1` (the
 * ladder names the toast on tier 1 — it had been on tier 2, the anchored-popover shadow),
 * a small tone glyph, the message on one `text-body` line (two at most) with an optional
 * one-line `text-label` detail, one quiet outlined action, and a close button at the right end.
 * `app-toast` stays as the motion hook (`app/globals.css`).
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
  const [anchor, setAnchor] = useState<ToastAnchor>(DEFAULT_ANCHOR);
  const claim = useCallback((next: ToastAnchor | null) => {
    setAnchor(next ?? DEFAULT_ANCHOR);
  }, []);
  const { toasts } = useSonner();
  useToastLane(toasts.length > 0);
  /*
   * **The narrow band reads its own variables, and they are not the same numbers.**
   * sonner stops reading `offset` at 600px of viewport and switches to `mobileOffset`; a
   * surface that stacks chrome against one edge of its pane therefore has two clearances
   * to state. Unplanted, the floor is the higher of the bottom tab bar's top (below `lg`)
   * and the highest floor wall a screen declares (the map's readout and first-visit
   * hint), plus 16px.
   */
  const offset = useMemo(
    () => ({
      top: 16,
      right: 'var(--app-toast-right-offset, 16px)',
      bottom: `var(--app-toast-bottom-offset, ${TOAST_FLOOR})`,
      left: 16,
    }),
    [],
  );
  const mobileOffset = useMemo(
    () => ({
      top: 16,
      right: 'var(--app-toast-mobile-right-offset, 16px)',
      bottom: `var(--app-toast-mobile-bottom-offset, ${TOAST_FLOOR})`,
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
        // The widest a box may grow, not its width: each box hugs its sentence
        // (`w-fit` below) up to `--dialog-w-md`, and never past the free lane less
        // its two 16px gutters (sonner reads `--width`).
        style={
          {
            '--width': `min(var(--dialog-w-md), calc(100vw - var(${TOAST_LEFT_WALL_VAR}, 0px) - var(${TOAST_RIGHT_WALL_VAR}, 0px) - 32px))`,
          } as CSSProperties
        }
        containerAriaLabel={notificationsLabel}
        // Keep Sonner's explicit Alt+T shortcut. An empty array does not disable
        // it: `hotkey.every(...)` matches every key and steals Enter from file
        // receipts whenever a folder-change notification is present.
        icons={{
          success: <CircleCheck size={TONE_GLYPH_SIZE} aria-hidden />,
          info: <Info size={TONE_GLYPH_SIZE} aria-hidden />,
          warning: <TriangleAlert size={TONE_GLYPH_SIZE} aria-hidden />,
          error: <CircleAlert size={TONE_GLYPH_SIZE} aria-hidden />,
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
            //
            // The box hugs its sentence (`w-fit`) up to the lane's width, centred in
            // the toaster, or flush right when the surface claimed that corner: a
            // four-word notice in a 420px slab read as an empty banner.
            toast:
              'app-toast group inset-x-0 mx-auto flex w-fit max-w-full items-center data-[x-position=right]:mr-0 gap-2.5 rounded-[var(--radius-card)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] py-2.5 pl-3 pr-10 text-body leading-body text-[color:var(--color-text-primary)] shadow-[var(--shadow-elevation-1)] [@media(pointer:coarse)]:pr-14',
            content: 'flex min-w-0 flex-1 flex-col items-stretch',
            // Designed for one line; a sentence longer than the widest box wraps to a
            // second line rather than losing its end to an ellipsis (the longest
            // message today, `startChecklist.scaffoldToast`, is 49 characters plus
            // counts). The detail is one line: it names a document, not a sentence.
            title:
              'min-w-0 font-[var(--font-weight-signature)] line-clamp-2 [overflow-wrap:anywhere] [word-break:keep-all]',
            description:
              'min-w-0 truncate text-label leading-label text-[color:var(--color-text-tertiary)]',
            // The glyph alone carries the tone: no tile, no fill (2026-09-24).
            icon: 'flex shrink-0 items-center justify-center self-start pt-[calc((var(--leading-body)-var(--icon-md))/2)] [&>svg]:block',
            success: '[&_[data-icon]]:text-[color:var(--color-status-success)]',
            info: '[&_[data-icon]]:text-[color:var(--color-text-tertiary)]',
            warning: '[&_[data-icon]]:text-[color:var(--color-status-warning)]',
            error: '[&_[data-icon]]:text-[color:var(--color-danger-text)]',
            // A quiet outlined action: a toast dismisses
            // itself, so an action loud enough to pull the eye competes with the
            // real attention winner on screen. The label does the work.
            //
            // The ink is `--color-indigo-text-soft`, not `--color-indigo-accent`,
            // because the hover state puts an indigo tint behind it: accent ink on
            // that tint measures 4.27:1, below AA, while soft measures 8.39:1
            // (2026-08-22).
            actionButton:
              'ml-0 h-7 shrink-0 rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 text-label leading-label font-[var(--font-weight-signature)] text-[color:var(--color-indigo-text-soft)] hover:bg-[color:var(--color-indigo-a16)] focus-visible:bg-[color:var(--color-indigo-a16)] [@media(pointer:coarse)]:min-h-[var(--touch-target-min)]',
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
      // The lane is measured before the box mounts, so it arrives where it will stay.
      publishToastLane();
      const options = {
        id,
        ...(action ? { action: { label: action.label, onClick: action.onClick } } : {}),
        ...(metadata?.description ? { description: metadata.description } : {}),
      };
      switch (tone) {
        case 'error':
          sonnerToast.error(message, options);
          return;
        case 'warning':
          sonnerToast.warning(message, options);
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
