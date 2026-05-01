"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MousePointerClick, Plug, Save, X } from "lucide-react";

// 기존 사용자의 dismissed 상태 보존 — key 는 그대로 ("atlas" 단어가 들어있어도
// 동작 무관, 호환만 유지). 새 사용자는 onboarding 다시 보임.
const STORAGE_KEY = "demo:atlas-onboarding:dismissed:v1";

/**
 * Builder onboarding coach mark — 첫 진입 + 빈 캔버스일 때 3-step 안내 노출.
 *
 * localStorage 로 dismissed 추적. '다시 보지 않기' 또는 첫 노드 추가 후 자동 닫힘.
 *
 * 헌장 §11 호환:
 * - opacity / y offset 만 motion (scale X)
 * - 인디고 alpha + 무채색 alpha
 * - motion-reduce 자동 존중 (framer-motion)
 */
export interface BuilderOnboardingProps {
  /** 캔버스가 비어 있는지 — true 일 때만 노출 검토. */
  empty: boolean;
}

export function BuilderOnboarding({ empty }: BuilderOnboardingProps) {
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
                도메인 지도 빌더
              </p>
              <h2 className="mt-1 text-[15px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                ERD 이상 — 우리 도메인의 *지도* 를 만들어요
              </h2>
              <p className="mt-1 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                코드/DB 스키마가 아니라 *기능·관계·역할* 의 시각 지도. 비개발자 (PM·디자이너·운영) 도 직접 그릴 수 있어요. AI agent (Claude Code 등) 도 같은 지도에 노드 추가.
              </p>
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
                  왼쪽 종류 클릭
                </strong>{" "}
                — 프로젝트 · 도메인 · 역량 · 요소 4 종류. 가운데에 임시 노드가 떠요. (코드 식별자: project / domain / capability / element)
              </p>
            </li>
            <li className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] text-[color:var(--color-indigo-accent)]">
                <Plug size={12} />
              </span>
              <p>
                <strong className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  노드 가장자리 점을 끌어
                </strong>{" "}
                다른 노드 위에 놓으면 — 둘 사이에 *관계 (의존 / 포함 / 묘사)* 가 그려져요.
              </p>
            </li>
            <li className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] text-[color:var(--color-indigo-accent)]">
                <Save size={12} />
              </span>
              <p>
                <strong className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  저장
                </strong>{" "}
                — vault 모드면 `.md` 로 디스크에 직접, cloud 모드면 Firestore 에. 같은 지도를 AI agent 도 MCP 로 read/write.
              </p>
            </li>
          </ol>
          <footer className="mt-5 flex items-center justify-between gap-3 border-t border-[color:var(--color-border-soft)] pt-3">
            <p className="font-mono text-[10px] tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              빠른 키 — N 새 노드 · Del 지우기 · Esc 취소
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
                시작하기
              </button>
            </div>
          </footer>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
