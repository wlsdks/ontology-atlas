"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Global Framer Motion configuration.
 *
 * For users with `prefers-reduced-motion: reduce`, every motion component resolves its
 * transition near-instantly. This provider is required because a CSS `@media` rule cannot
 * reach inline motion styles.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
