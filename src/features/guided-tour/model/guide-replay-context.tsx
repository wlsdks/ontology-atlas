"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * "Replay this screen's guidance" through the settings menu present on every screen, instead
 * of a help button per screen. A screen registers its opener; no registration, no row. The
 * shell owns the provider, and a menu outside it falls back to not registered.
 */
interface GuideReplayValue {
  /** `null` when none is registered. */
  replay: (() => void) | null;
  register: (fn: (() => void) | null) => void;
}

const GuideReplayContext = createContext<GuideReplayValue>({
  replay: null,
  register: () => {},
});

export function GuideReplayProvider({ children }: { children: ReactNode }) {
  const [replay, setReplay] = useState<(() => void) | null>(null);
  // setState treats a function argument as an updater, so the stored function is wrapped, or
  // it would run immediately and open the guidance.
  const register = useCallback((fn: (() => void) | null) => {
    setReplay(() => fn);
  }, []);
  const value = useMemo<GuideReplayValue>(() => ({ replay, register }), [replay, register]);
  return <GuideReplayContext.Provider value={value}>{children}</GuideReplayContext.Provider>;
}

/** Read by the settings menu. */
export function useGuideReplay(): (() => void) | null {
  return useContext(GuideReplayContext).replay;
}

/**
 * Registers a screen's guidance. `fn` may change every render, so a ref mirrors it behind a
 * wrapper that is stable until unmount.
 */
export function useRegisterGuideReplay(fn: (() => void) | null): void {
  const { register } = useContext(GuideReplayContext);
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  }, [fn]);
  const enabled = fn !== null;
  useEffect(() => {
    if (!enabled) {
      register(null);
      return undefined;
    }
    register(() => latest.current?.());
    return () => register(null);
  }, [enabled, register]);
}
