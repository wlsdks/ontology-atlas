"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { MousePointerClick, Plug, Save, X } from "lucide-react";

// 기존 사용자의 dismissed 상태 보존 — key 는 그대로 ("atlas" 단어가 들어있어도
// 동작 무관, 호환만 유지). 새 사용자는 onboarding 다시 보임.
const STORAGE_KEY = "demo:atlas-onboarding:dismissed:v1";

/**
 * Builder onboarding coach mark — 첫 진입 + 실제 graph 가 비었을 때만
 * 3-step 안내 노출. Persisted vault graph 가 있으면 지도를 먼저 보여준다.
 *
 * localStorage 로 dismissed 추적. '다시 보지 않기' 또는 첫 노드 추가 후 자동 닫힘.
 *
 * 헌장 §11 호환:
 * - opacity / y offset 만 motion (scale X)
 * - 인디고 alpha + 무채색 alpha
 * - motion-reduce 자동 존중 (framer-motion)
 */
export interface BuilderOnboardingProps {
  /** persisted graph + draft canvas 가 모두 비어 있는지 — true 일 때만 노출 검토. */
  empty: boolean;
  /** true 면 데스크톱 앱 런타임이라 read-only 해소 CTA 가 folder picker 로 향함. */
  isDesktopRuntime?: boolean;
}

export function BuilderOnboarding({
  empty,
  isDesktopRuntime = false,
}: BuilderOnboardingProps) {
  const t = useTranslations("ontologyPages.edit.onboarding");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!empty) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    // 캔버스가 mount 직후 잠깐 빈 상태 → 200ms 후 노출 (flash 회피).
    const id = window.setTimeout(() => setVisible(true), 200);
    return () => window.clearTimeout(id);
  }, [empty]);

  const dismiss = (persist: boolean) => {
    setVisible(false);
    if (persist && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* private mode — UX 막지 않음 */
      }
    }
  };

  return (
    <AnimatePresence>
      {empty && visible ? (
        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.22, ease: [0.42, 0, 0.58, 1] }}
          role="dialog"
          aria-label={t("dialogAriaLabel")}
          className="pointer-events-auto absolute left-4 top-4 z-20 w-[min(430px,calc(100%-2rem))] rounded-xl border border-[color:rgba(94,106,210,0.28)] bg-[color:var(--color-panel)] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.34)]"
        >
          <header className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-indigo-accent)]">
                {t("eyebrow")}
              </p>
              <h2 className="mt-1 text-[15px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {t("title")}
              </h2>
              <p className="mt-1 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                {t("intro")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(false)}
              aria-label={t("closeAriaLabel")}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
            >
              <X size={13} />
            </button>
          </header>
          <ol className="space-y-2.5 text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
            <li className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] text-[color:var(--color-indigo-accent)]">
                <MousePointerClick size={12} />
              </span>
              <p>
                <strong className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {t("stepPaletteStrong")}
                </strong>
                {t("stepPaletteBody")}
              </p>
            </li>
            <li className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] text-[color:var(--color-indigo-accent)]">
                <Plug size={12} />
              </span>
              <p>
                <strong className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {t("stepConnectStrong")}
                </strong>
                {t("stepConnectBody")}
              </p>
            </li>
            <li className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] text-[color:var(--color-indigo-accent)]">
                <Save size={12} />
              </span>
              <p>
                <strong className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {t("stepSaveStrong")}
                </strong>
                {t(
                  isDesktopRuntime
                    ? "stepSaveBodyPicker"
                    : "stepSaveBodyDownload",
                )}
              </p>
            </li>
          </ol>
          <footer className="mt-4 flex flex-col items-stretch gap-3 border-t border-[color:var(--color-border-soft)] pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="break-keep font-mono text-[10px] tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              {t("shortcutsHint")}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => dismiss(true)}
                className="whitespace-nowrap break-keep rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                {t("dontShowAgain")}
              </button>
              <button
                type="button"
                onClick={() => dismiss(false)}
                className="whitespace-nowrap break-keep rounded-md border border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.18)] px-3 py-1.5 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:rgba(94,106,210,0.26)]"
              >
                {t("getStarted")}
              </button>
            </div>
          </footer>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
