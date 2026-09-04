"use client";

import { useEffect, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Hand, Pointer, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { EXIT_TRANSITION, MOTION } from "@/shared/motion";
import { IconButton } from "@/shared/ui";

const STORAGE_KEY = "demo:gesture-hint:dismissed:v1";

export function GestureHint({ disabled = false }: { disabled?: boolean }) {
  const t = useTranslations("searchWidgets.gestureHint");
  const [visible, setVisible] = useState(false);
  // Shown on touch environments only. SSR compatible — initializeWithValue:false
  // avoids a hydration mismatch (static export compatible).
  const isCoarsePointer = useMediaQuery("(pointer: coarse)", {
    initializeWithValue: false,
  });

  useEffect(() => {
    if (disabled) return;
    if (!isCoarsePointer) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    const id = window.setTimeout(() => setVisible(true), 800);
    return () => window.clearTimeout(id);
  }, [disabled, isCoarsePointer]);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // A storage failure must not block the UX.
    }
  };

  useEffect(() => {
    if (!visible) return;
    // Auto-dismiss after 10 seconds — a "read it and it's gone" experience.
    const id = window.setTimeout(dismiss, 10_000);
    return () => window.clearTimeout(id);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          data-interactive-overlay="true"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12, pointerEvents: "none", transition: EXIT_TRANSITION }}
          transition={MOTION.base}
          className="pointer-events-auto fixed left-1/2 top-[calc(max(0.85rem,env(safe-area-inset-top))+4rem)] z-30 flex w-[min(320px,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-sheet border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3.5 py-3 shadow-[var(--shadow-elevation-1)] md:hidden"
          role="status"
          aria-live="polite"
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-indigo-accent-a32)] bg-[color:var(--color-indigo-a14)] text-[color:var(--color-indigo-text-soft)]">
            <Hand size={ICON_SIZE.md} />
          </span>
          <div className="flex-1">
            <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
              {t("eyebrow")}
            </p>
            <p className="mt-1 text-body leading-body text-[color:var(--color-text-secondary)]">
              {t("body")}
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <Pointer size={ICON_SIZE.sm} className="text-[color:var(--color-text-quaternary)]" />
              <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
                {t("tapDetail")}
              </span>
            </div>
          </div>
          <IconButton
            onClick={dismiss}
            label={t("closeAriaLabel")}
            size="md"
            className="hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]"
          >
            <X size={ICON_SIZE.sm} />
          </IconButton>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
