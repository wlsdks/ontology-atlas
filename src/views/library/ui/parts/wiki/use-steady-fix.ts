import { useLayoutEffect, useMemo, useRef } from "react";

import type { WikiProblemFix } from "./WikiTemplateProblems";

/**
 * The page's Fix action as one object while what it shows stays the same. The hook that builds it
 * depends on the agent, which is a new object on every Library render, so without this a scroll
 * redrew a long page's whole problem list; the press still runs the latest action.
 */
export function useSteadyFix(fix: WikiProblemFix | null): WikiProblemFix | null {
  const latest = useRef(fix);
  useLayoutEffect(() => {
    latest.current = fix;
  });
  const mode = fix?.mode;
  const disabled = fix?.disabled;
  const askEveryWrite = fix?.askEveryWrite;
  return useMemo(
    () => (mode ? { mode, disabled, askEveryWrite, onPress: () => latest.current?.onPress() } : null),
    [mode, disabled, askEveryWrite],
  );
}
