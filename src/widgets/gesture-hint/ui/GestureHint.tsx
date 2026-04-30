"use client";

import { useEffect, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import { AnimatePresence, motion } from "framer-motion";
import { Hand, Pointer, X } from "lucide-react";
import { MOTION } from "@/shared/motion";

const STORAGE_KEY = "aslan:gesture-hint:dismissed:v1";

export function GestureHint({ disabled = false }: { disabled?: boolean }) {
  const [visible, setVisible] = useState(false);
  // 터치 환경에서만 보여준다. SSR 호환 — initializeWithValue:false 로
  // hydration mismatch 회피 (정적 export 호환).
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
      // storage 실패해도 UX 를 막지 않음.
    }
  };

  useEffect(() => {
    if (!visible) return;
    // 10 초 후 자동 해제 — "읽고 사라짐" 경험.
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
          exit={{ opacity: 0, y: 12 }}
          transition={MOTION.medium}
          className="pointer-events-auto fixed left-1/2 top-[calc(max(0.85rem,env(safe-area-inset-top))+4rem)] z-30 flex w-[min(320px,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-[18px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3.5 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.28)] md:hidden"
          role="status"
          aria-live="polite"
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:rgba(113,112,255,0.32)] bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-indigo-accent)]">
            <Hand size={14} />
          </span>
          <div className="flex-1">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              지도 조작
            </p>
            <p className="mt-1 text-[12px] leading-[1.45] text-[color:var(--color-text-secondary)]">
              두 손가락으로 확대·축소, 드래그로 이동. 노드를 탭하면 상세가 열려요.
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <Pointer size={10} className="text-[color:var(--color-text-quaternary)]" />
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                탭 = 상세
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="힌트 닫기"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]"
          >
            <X size={13} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
