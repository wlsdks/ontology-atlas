"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { MOTION } from "@/shared/motion";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  label: string;
}

const SECTIONS: { title: string; rows: ShortcutRow[] }[] = [
  {
    title: "탐색",
    rows: [
      { keys: ["⌘", "K"], label: "프로젝트 검색 팔레트 열기" },
      { keys: ["⇧", "⌘", "K"], label: "ontology / 문서 / 프로젝트 통합 검색" },
      { keys: ["D"], label: "문서 볼트 빠른 보기 드로어 토글 (편집 권한 시)" },
      { keys: ["F"], label: "프레젠테이션 모드 토글" },
      { keys: ["?"], label: "키보드 단축키 보기·닫기" },
      { keys: ["Esc"], label: "드로어·오버레이 단계적 닫기" },
    ],
  },
  {
    title: "토폴로지 지도",
    rows: [
      { keys: ["드래그"], label: "노드 위치 이동 (스프링 반사)" },
      { keys: ["더블클릭"], label: "선택 노드 주변만 보기 (Local graph)" },
      { keys: ["우클릭"], label: "컨텍스트 메뉴 (포커스 / Local / URL 복사)" },
      { keys: ["Shift", "클릭"], label: "두 노드 사이 최단 경로 하이라이트" },
      { keys: ["Tab"], label: "선택 노드의 이웃으로 이동" },
      { keys: ["/"], label: "그래프 검색창 포커스" },
      { keys: ["0"], label: "Depth 필터 해제" },
      { keys: ["1–6"], label: "Depth N hop 제한" },
    ],
  },
  {
    title: "검색 팔레트",
    rows: [
      { keys: ["↑", "↓"], label: "결과 간 이동" },
      { keys: ["↵"], label: "선택한 프로젝트 열기" },
      { keys: ["Esc"], label: "닫기" },
    ],
  },
  {
    title: "허브 레일",
    rows: [
      { keys: ["↑", "↓"], label: "이전·다음 허브 선택" },
      { keys: ["Home"], label: "첫 허브로" },
      { keys: ["End"], label: "마지막 허브로" },
    ],
  },
  {
    title: "Docs Vault · 통합 팔레트 (/docs)",
    rows: [
      { keys: ["⌘", "K"], label: "팔레트 열기 (검색 · 명령 · 태그)" },
      { keys: ["⌘", "P"], label: "팔레트 열기 (별명)" },
      { keys: ["⌘", "O"], label: "팔레트 열기 (별명)" },
      { keys: ["⌘", "⇧", "P"], label: "명령 모드로 바로 열기 (> 접두)" },
      { keys: ["/"], label: "팔레트 열기" },
      { keys: ["> "], label: "쿼리 앞에 넣어 명령 모드" },
      { keys: ["#"], label: "쿼리 앞에 넣어 태그 모드" },
      { keys: ["Tab"], label: "팔레트 내 모드 순환 전환" },
      { keys: ["↑", "↓", "↵", "Esc"], label: "이동 · 실행 · 닫기" },
      { keys: ["스크롤"], label: "목차 사이드바 현재 heading 자동 추적" },
      { keys: ["클릭"], label: "목차·역참조·태그 칩 → 해당 위치로" },
    ],
  },
  {
    title: "Docs Vault · 그래프 뷰",
    rows: [
      { keys: ["클릭"], label: "노드 선택 → 문서로 이동" },
      { keys: ["드래그"], label: "노드 위치 수동 재배치" },
      { keys: ["hover"], label: "1-hop 이웃만 살리고 나머지 dim" },
      { keys: ["전체/이웃"], label: "전체 그래프 ↔ 선택 2-hop 토글" },
      { keys: ["문서/그래프"], label: "상단 pill 로 뷰 전환" },
    ],
  },
  {
    title: "Docs Vault · 소스·볼트",
    rows: [
      { keys: ["서버"], label: "git 번들 docs/ 열람 (기본)" },
      { keys: ["로컬"], label: "내 PC 폴더를 볼트로 (File System Access)" },
      { keys: ["↻"], label: "로컬 볼트 수동 새로고침" },
      { keys: ["focus"], label: "로컬 볼트 탭 포커스 복귀 시 자동 새로고침" },
    ],
  },
  {
    title: "Docs Vault · 문서 액션",
    rows: [
      { keys: ["⭐"], label: "고정 / 고정 해제 (고정 섹션 상단 고정)" },
      { keys: ["🔗"], label: "현재 문서 URL 클립보드 복사" },
      { keys: ["#태그"], label: "태그 칩 클릭 → 트리 필터" },
      { keys: ["기획자/개발자"], label: "모드 토글 — 해당 모드 문서만" },
    ],
  },
  {
    title: "가이드 투어",
    rows: [
      { keys: ["→"], label: "다음 단계" },
      { keys: ["←"], label: "이전 단계" },
      { keys: ["Esc"], label: "투어 닫기" },
    ],
  },
  {
    title: "포트폴리오 모드",
    rows: [
      { keys: ["→"], label: "다음 장면" },
      { keys: ["←"], label: "이전 장면" },
      { keys: ["Esc"], label: "포트폴리오 닫기" },
    ],
  },
];

export function ShortcutSheet({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus trap — 모달이 열리면 다이얼로그 내부 첫 포커스 요소로 이동,
  // Tab 이 바깥으로 빠져나가지 않게 순환. 닫힐 때 이전 활성 요소 복원.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusables[0]?.focus();

    const trapHandler = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", trapHandler);
    return () => {
      window.removeEventListener("keydown", trapHandler);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-interactive-overlay="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MOTION.fast}
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-backdrop-medium)] p-4 sm:p-6"
          onClick={onClose}
        >
          <motion.section
            ref={dialogRef}
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={MOTION.medium}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="키보드 단축키"
            aria-modal="true"
            aria-describedby="shortcut-sheet-help"
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-[720px] flex-col overflow-hidden rounded-[22px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-2xl sm:max-h-[calc(100vh-3rem)]"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-[color:var(--color-border-soft)] px-5 py-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
                  키보드 단축키
                </p>
                <p className="mt-1 text-[13px] text-[color:var(--color-text-secondary)]">
                  마우스 없이도 맵을 훑을 수 있습니다.
                </p>
                <p id="shortcut-sheet-help" className="sr-only">
                  탐색, 가이드 투어, 포트폴리오 모드에서 사용할 수 있는 키보드 단축키 목록입니다.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="단축키 안내 닫기"
                className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]"
              >
                <X size={15} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto">
              {/* sm+ 는 2-column grid 로 펼쳐 세로 길이 줄임. 작은 뷰포트는
                  단일 컬럼 + 내부 스크롤로 넘침 방지. */}
              <div className="grid grid-cols-1 gap-x-6 divide-y divide-[color:var(--color-overlay-2)] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                {SECTIONS.map((section, idx) => (
                  <section
                    key={section.title}
                    className={
                      idx % 2 === 1
                        ? "px-5 py-4 sm:border-t sm:border-t-[color:var(--color-overlay-2)]"
                        : "px-5 py-4"
                    }
                  >
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                      {section.title}
                    </p>
                    <dl className="mt-3 space-y-2.5">
                      {section.rows.map((row, rowIdx) => (
                        <div
                          // 같은 label 의 alias 단축키가 같은 섹션에 여러 개 있는
                          // 케이스 (e.g. "팔레트 열기 (별명)" ⌘P / ⌘O) 가 있어
                          // index 도 key 에 포함해 React duplicate key 회피.
                          key={`${section.title}-${rowIdx}-${row.label}`}
                          className="flex items-center justify-between gap-4"
                        >
                          <dt className="text-[13px] text-[color:var(--color-text-secondary)]">
                            {row.label}
                          </dt>
                          <dd className="flex shrink-0 items-center gap-1">
                            {row.keys.map((key, i) => (
                              <kbd
                                key={`${row.label}-${i}`}
                                className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-1.5 font-mono text-[11px] tabular-nums text-[color:var(--color-text-secondary)]"
                              >
                                {key}
                              </kbd>
                            ))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            </div>

            <footer className="shrink-0 border-t border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-5 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                <kbd className="rounded border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">
                  ?
                </kbd>{" "}
                를 다시 눌러도 닫힙니다
              </p>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
