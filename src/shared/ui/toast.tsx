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
 * The `info` tone is neutral; `success` is a write or copy that landed, `warning` is done with
 * a caveat, `error` did not happen.
 */
type ToastTone = 'success' | 'info' | 'warning' | 'error';

/**
 * At most one follow-up action: a toast dismisses itself, so it must not ask for a choice, and
 * missing the action must cost nothing.
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
  show: (
    message: string,
    tone?: ToastTone,
    action?: ToastAction,
    metadata?: ToastMetadata,
  ) => void;
  /**
   * Clears every toast before a blocking surface opens, so a dialog is never read with a toast
   * floating above its scrim.
   */
  dismiss: () => void;
}

/**
 * The `bottom-center` anchor sits in the free lane between the declared walls
 * (`toast-walls.ts`), where the map has nothing standing; `bottom-right` is a reading pane
 * claiming its corner.
 */
export type ToastAnchor = 'bottom-center' | 'bottom-right';

const DEFAULT_ANCHOR: ToastAnchor = 'bottom-center';

const ToastAnchorContext = createContext<((anchor: ToastAnchor | null) => void) | null>(null);

/**
 * Claims a corner while mounted; `null` keeps the default. Outside a `ToastProvider` it does
 * nothing, as `useToast` promises.
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
 * Republishes the lane on the next frame while a toast stands, because a wall can move under it
 * (dock opening, INDEX folding, resize). Nothing is observed with no toast shown.
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
      // A wall appears, leaves, or steps aside (fades by class and sets `aria-hidden`).
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
 * The tone glyph: small, in its tone's ink on no fill, its shape carrying the tone without colour
 * on one neutral box. Each ink clears 4.5:1 on `--color-elevated`, error's `--color-danger-text`
 * included (tests/contract/toast-surface.contract.test.ts).
 */
const TONE_GLYPH_SIZE = ICON_SIZE.md;

/** 16px above the higher of the tab bar's top and the highest declared floor wall. */
const TOAST_FLOOR = `calc(max(var(--app-toast-bottom-reserve, 0px), var(${TOAST_BOTTOM_WALL_VAR}, 0px)) + 16px)`;

/**
 * The app's one notification popup. Unstyled sonner drawn from our ramps and centred in the
 * free lane (`toast-walls.ts`, `app/globals.css`). `theme="dark"` is required or sonner falls
 * back to its light theme; client-only because sonner's store is.
 */
export function ToastProvider({
  children,
  /**
   * Injected rather than read so the provider runs without this app's next-intl setup; the
   * English default still leaves no unnamed region.
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
  // sonner reads `mobileOffset` below 600px, so each band states its own clearance.
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
        // The widest a box may grow (sonner reads `--width`); each box hugs its sentence.
        style={
          {
            '--width': `min(var(--dialog-w-md), calc(100vw - var(${TOAST_LEFT_WALL_VAR}, 0px) - var(${TOAST_RIGHT_WALL_VAR}, 0px) - 32px))`,
          } as CSSProperties
        }
        containerAriaLabel={notificationsLabel}
        // Keep Sonner's default hotkey: an empty array matches every key and steals Enter.
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
            // `app-toast` is the motion hook (sonner's ease-in replaced by the app ramp and its
            // reduced-motion equivalent, `app/globals.css`); `pr-10` seats the close button.
            toast:
              'app-toast group inset-x-0 mx-auto flex w-fit max-w-full items-center data-[x-position=right]:mr-0 gap-2.5 rounded-[var(--radius-card)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] py-2.5 pl-3 pr-10 text-body leading-body text-[color:var(--color-text-primary)] shadow-[var(--shadow-elevation-1)] [@media(pointer:coarse)]:pr-14',
            content: 'flex min-w-0 flex-1 flex-col items-stretch',
            // A long sentence wraps to a second line instead of losing its end to an ellipsis.
            title:
              'min-w-0 font-[var(--font-weight-signature)] line-clamp-2 [overflow-wrap:anywhere] [word-break:keep-all]',
            description:
              'min-w-0 truncate text-label leading-label text-[color:var(--color-text-tertiary)]',
            icon: 'flex shrink-0 items-center justify-center self-start pt-[calc((var(--leading-body)-var(--icon-md))/2)] [&>svg]:block',
            success: '[&_[data-icon]]:text-[color:var(--color-status-success)]',
            info: '[&_[data-icon]]:text-[color:var(--color-text-tertiary)]',
            warning: '[&_[data-icon]]:text-[color:var(--color-status-warning)]',
            error: '[&_[data-icon]]:text-[color:var(--color-danger-text)]',
            // Quiet on purpose: a self-dismissing toast must not pull the eye. Soft indigo ink
            // keeps AA on the hover tint, where accent ink does not.
            actionButton:
              'ml-0 h-7 shrink-0 rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 text-label leading-label font-[var(--font-weight-signature)] text-[color:var(--color-indigo-text-soft)] hover:bg-[color:var(--color-indigo-a16)] focus-visible:bg-[color:var(--color-indigo-a16)] [@media(pointer:coarse)]:min-h-[var(--touch-target-min)]',
            // Close-button ink and hover live in `app/globals.css`: sonner's stylesheet loads
            // later and outranks a utility class.
            closeButton: 'flex size-7 items-center justify-center rounded-[var(--radius-chip)] [@media(pointer:coarse)]:size-[var(--touch-target-min)]',
          },
        }}
      />
    </ToastAnchorContext.Provider>
  );
}

/** sonner keeps its own store, so a call outside the provider still works. */
export function useToast(): ToastApi {
  return {
    show: (
      message: string,
      tone: ToastTone = 'success',
      action?: ToastAction,
      metadata?: ToastMetadata,
    ) => {
      // A repeat of the same tone, message and description refreshes the visible toast; a
      // description keeps two documents' toasts (and their Undo actions) apart.
      const id = metadata?.description
        ? JSON.stringify([tone, message, metadata.description])
        : `${tone}:${message}`;
      // Measured before the box mounts, so it arrives where it will stay.
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
