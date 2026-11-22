"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/** A CSS `@media` rule cannot reach inline motion styles, so reduced motion is set here. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
