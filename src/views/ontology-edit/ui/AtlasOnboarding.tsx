"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MousePointerClick, Plug, Save, X } from "lucide-react";

const STORAGE_KEY = "demo:atlas-onboarding:dismissed:v1";

/**
 * Atlas onboarding coach mark — C-17.
 *
 * 첫 진입 + 빈 캔버스 (approved 0 + ephemeral 0) 일 때 3-step 안내 노출.
 * localStorage 로 dismissed 추적. '다시 보지 않기' 또는 첫 노드 추가 후 자동 닫힘.
 *
 * 헌장 §11 호환:
 * - opacity / y offset 만 motion (scale X)
 * - 인디고 alpha + 무채색 alpha
 * - motion-reduce 자동 존중 (framer-motion)
 */
export interface AtlasOnboardingProps {
  /** 캔버스가 비어 있는지 — true 일 때만 노출 검토. */
  empty: boolean;
}

export function AtlasOnboarding({ empty }: AtlasOnboardingProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!empty) {
      setVisible(false);
      return;
    }
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
      {visible ? (
        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.22, ease: [0.42, 0, 0.58, 1] }}
          role="dialog"
          aria-label="빌더 시작 안내"
          className="pointer-events-auto absolute left-1/2 top-1/2 z-20 w-[min(440px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[color:rgba(94,106,210,0.32)] bg-[color:var(--color-panel)] p-5 shadow-[0_24px_48px_rgba(0,0,0,0.42)]"
        >
          <header className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-indigo-accent)]">
                Ontology Builder — 시작
              </p>
              <h2 className="mt-1 text-[15px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                3 단계로 첫 그래프를 그려요
              </h2>
            </div>
            <button
              type="button"
              onClick={() => dismiss(false)}
              aria-label="안내 닫기"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
            >
              <X size={13} />
            </button>
          </header>
          <ol className="space-y-3 text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
            <li className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] text-[color:var(--color-indigo-accent)]">
                <MousePointerClick size={12} />
              </span>
              <p>
                <strong className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  왼쪽 palette
                </strong>{" "}
                에서 종류 (프로젝트 / 도메인 / 역량 / 요소) 를 클릭하면 캔버스 가운데에 새 노드가 생겨요.
              </p>
            </li>
            <li className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] text-[color:var(--color-indigo-accent)]">
                <Plug size={12} />
              </span>
              <p>
                노드 위·아래의{" "}
                <strong className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  핸들에서 drag
                </strong>{" "}
                해 다른 노드로 drop 하면 관계가 그려져요.
              </p>
            </li>
            <li className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] text-[color:var(--color-indigo-accent)]">
                <Save size={12} />
              </span>
              <p>
                노드를 클릭해 인스펙터에서{" "}
                <strong className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  이름 입력 → 저장
                </strong>{" "}
                하면 영구 그래프에 추가돼요.
              </p>
            </li>
          </ol>
          <footer className="mt-5 flex items-center justify-between gap-3 border-t border-[color:var(--color-border-soft)] pt-3">
            <p className="font-mono text-[10px] tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              단축키 N · Del · Esc
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => dismiss(true)}
                className="rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 py-1.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                다시 보지 않기
              </button>
              <button
                type="button"
                onClick={() => dismiss(false)}
                className="rounded-md border border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.18)] px-3 py-1.5 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:rgba(94,106,210,0.26)]"
              >
                시작
              </button>
            </div>
          </footer>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
