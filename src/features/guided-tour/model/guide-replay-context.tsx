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
 * The wiring for "replay this screen's guidance".
 *
 * Guidance rightly does not reappear once seen (do not disturb), but with no way at
 * all to see it again it becomes information that vanishes when you pass it. The map
 * has the compass tile at its top right for that, but the other destinations have no
 * such permanent chrome — and adding a help button per screen reinvites the defect
 * where the icon count differs from screen to screen.
 *
 * So re-entry gathers into **the one settings menu that already exists on every
 * screen**. The current screen registers the function that opens its own guidance
 * here, and the settings menu reads only that function to draw a row (no
 * registration, no row). The shell owns the provider, so a page only registers, and
 * a settings menu rendered outside the provider quietly falls to "not registered".
 */
interface GuideReplayValue {
  /** The function that opens the current screen's guidance — `null` when none is registered. */
  replay: (() => void) | null;
  register: (fn: (() => void) | null) => void;
}

const GuideReplayContext = createContext<GuideReplayValue>({
  replay: null,
  register: () => {},
});

export function GuideReplayProvider({ children }: { children: ReactNode }) {
  const [replay, setReplay] = useState<(() => void) | null>(null);
  // A function argument to setState is interpreted as an updater, so storing a
  // function as a value needs one wrapping layer — otherwise the registered function
  // runs immediately and the guidance opens by itself.
  const register = useCallback((fn: (() => void) | null) => {
    setReplay(() => fn);
  }, []);
  const value = useMemo<GuideReplayValue>(() => ({ replay, register }), [replay, register]);
  return <GuideReplayContext.Provider value={value}>{children}</GuideReplayContext.Provider>;
}

/** The side the settings menu reads. */
export function useGuideReplay(): (() => void) | null {
  return useContext(GuideReplayContext).replay;
}

/**
 * The side where a screen registers its own guidance. `fn` may be recreated on every
 * render, so it is mirrored in a ref and the registered value is fixed as a single
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
