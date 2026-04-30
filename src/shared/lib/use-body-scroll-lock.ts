"use client";

import { useEffect } from "react";

let lockCount = 0;
let previousOverflow = "";
let previousTouchAction = "";
let previousOverscrollBehavior = "";

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") {
      return;
    }

    const { body } = document;

    if (lockCount === 0) {
      previousOverflow = body.style.overflow;
      previousTouchAction = body.style.touchAction;
      previousOverscrollBehavior = body.style.overscrollBehavior;
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
      body.style.overscrollBehavior = "none";
    }

    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        body.style.overflow = previousOverflow;
        body.style.touchAction = previousTouchAction;
        body.style.overscrollBehavior = previousOverscrollBehavior;
      }
    };
  }, [active]);
}
