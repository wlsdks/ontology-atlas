"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * 전역 Framer Motion 설정.
 * prefers-reduced-motion: reduce 사용자에 대해 모든 motion component 가
 * 자동으로 transition 을 즉시(near-instant) 처리한다. CSS @media 로는
 * 인라인 motion style 이 우회되기 때문에 이 Provider 가 필요.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
