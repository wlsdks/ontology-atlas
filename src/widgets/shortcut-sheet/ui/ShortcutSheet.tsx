"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { MOTION } from "@/shared/motion";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/shared/lib/cn";
import {
  SHORTCUT_SCOPES,
  sectionVisible,
  sectionVisibleForCurrent,
  surfaceForPathname,
  type ShortcutScope,
  type ShortcutSurface,
} from "../lib/shortcut-scope";

interface Props {
  open: boolean;
  onClose: () => void;
}

type ShortcutKey = string | { i18nKey: string };

interface ShortcutRow {
  keys: ShortcutKey[];
  labelKey: string;
}

interface ShortcutSection {
  titleKey: string;
  /** 이 섹션이 유효한 표면 — 문맥 탭 분류의 진실원(#67). */
  surface: ShortcutSurface;
  rows: ShortcutRow[];
}

const k = (i18nKey: string): ShortcutKey => ({ i18nKey });

/**
 * P1a-2 (persona 실측 N8 — 도메인/역량/요소 정의가 작업 UI 0곳): 지도의 "?"
 * 도움말이 이미 있는 유일한 상시 도움말 표면이라 새 표면을 만들지 않고
 * 여기 footer 에 한 줄 정의 3개를 덧붙인다. kind 순서는 지도의 계층 순서
 * (도메인 → 역량 → 요소)와 같다.
 */
const GLOSSARY_TERMS = ["domain", "capability", "element"] as const;

const SECTIONS: ShortcutSection[] = [
  {
    titleKey: "navigation",
    surface: "global",
    rows: [
      { keys: ["⌘", "K"], labelKey: "openProjectPalette" },
      { keys: ["⇧", "⌘", "K"], labelKey: "openGlobalPalette" },
      { keys: ["D"], labelKey: "toggleDocsDrawer" },
      { keys: ["?"], labelKey: "showShortcuts" },
      { keys: ["Esc"], labelKey: "stepCloseOverlays" },
    ],
  },
  {
    // W2-C — rewritten against ACTUAL topology-map-v2 canvas behavior
    // (`use-topology-loop.ts` / `topology-pointer-handlers.ts`). The previous
    // rows (더블클릭 로컬 · Shift+클릭 경로 · Tab 이웃 · / 검색 · 0 깊이)
    // described interactions the v2 canvas never implemented — stale
    // carryover from an earlier design that never shipped. Kept: 클릭 선택 ·
    // 드래그(팬/노드 이동) · 휠 줌 · ⌘K 검색 · Esc 사다리 · 우클릭 메뉴(W2-B,
    // now real).
    titleKey: "topology",
    surface: "topology",
    rows: [
      { keys: [k("click")], labelKey: "clickSelect" },
      { keys: [k("drag")], labelKey: "dragPan" },
      { keys: [k("scroll")], labelKey: "wheelZoom" },
      { keys: ["⌘", "K"], labelKey: "openProjectPalette" },
      { keys: ["Esc"], labelKey: "stepCloseOverlays" },
      { keys: [k("rightClick")], labelKey: "rightClickContext" },
    ],
  },
  {
    titleKey: "searchPalette",
    surface: "global",
    rows: [
      { keys: ["↑", "↓"], labelKey: "moveBetweenResults" },
      { keys: ["↵"], labelKey: "openSelectedProject" },
      { keys: ["Esc"], labelKey: "close" },
    ],
  },
  {
    titleKey: "hubRail",
    surface: "topology",
    rows: [
      { keys: ["↑", "↓"], labelKey: "prevHub" },
      { keys: ["Home"], labelKey: "firstHub" },
      { keys: ["End"], labelKey: "lastHub" },
    ],
  },
  {
    titleKey: "docsPalette",
    surface: "docs",
    rows: [
      { keys: ["⌘", "K"], labelKey: "openPaletteSearchCmdTag" },
      { keys: ["⌘", "P"], labelKey: "openPaletteAlias" },
      { keys: ["⌘", "O"], labelKey: "openPaletteAlias" },
      { keys: ["⌘", "⇧", "P"], labelKey: "openCommandMode" },
      { keys: ["/"], labelKey: "openPalette" },
      { keys: [k("queryCommandPrefix")], labelKey: "queryCommandPrefix" },
      { keys: ["#"], labelKey: "queryTagPrefix" },
      { keys: ["Tab"], labelKey: "cyclePaletteMode" },
      { keys: ["↑", "↓", "↵", "Esc"], labelKey: "moveExecuteClose" },
      { keys: [k("scroll")], labelKey: "scrollHeading" },
      { keys: [k("click")], labelKey: "clickToc" },
    ],
  },
  {
    titleKey: "docsGraph",
    surface: "docs",
    rows: [
      { keys: [k("click")], labelKey: "clickGraphNode" },
      { keys: [k("drag")], labelKey: "dragGraphNode" },
      { keys: [k("hover")], labelKey: "hoverNeighbor" },
      { keys: [k("fullNeighbor")], labelKey: "toggleFullNeighbor" },
      { keys: [k("pillView")], labelKey: "togglePillView" },
    ],
  },
  {
    titleKey: "docsSource",
    surface: "docs",
    rows: [
      { keys: [k("server")], labelKey: "serverBundle" },
      { keys: [k("local")], labelKey: "localVault" },
      { keys: ["↻"], labelKey: "manualRefresh" },
      { keys: [k("focus")], labelKey: "focusRefresh" },
    ],
  },
  {
    titleKey: "docsActions",
    surface: "docs",
    rows: [
      { keys: ["⭐"], labelKey: "pinDoc" },
      { keys: ["🔗"], labelKey: "copyDocUrl" },
      { keys: ["#"], labelKey: "tagFilter" },
      { keys: [k("modeToggle")], labelKey: "modeToggle" },
    ],
  },
  // 'tour' / 'portfolio' 섹션은 R10 정리에서 해당 오버레이가 제거되며
  // 단축키도 함께 사라졌으나 ShortcutSheet 항목과 i18n 키가 stale 로
  // 남아 있어 cycle 22 에서 정리.
];

export function ShortcutSheet({ open, onClose }: Props) {
  const t = useTranslations("searchWidgets.shortcuts");
  const pathname = usePathname() ?? "/";
  const currentSurface = surfaceForPathname(pathname);
  // #67 — 문맥 탭. 기본은 "지금 화면" — 40여 행을 한 번에 쏟는 대신 지금 실제로
  // 누를 수 있는 것부터 보여준다. `전체` 탭이 종전 목록을 그대로 유지하므로
  // 단축키를 숨겨서 과밀을 회피하는 것이 아니다.
  const [scope, setScope] = useState<ShortcutScope>("current");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useBodyScrollLock(open);

  const visibleSections = useMemo(
    () =>
      SECTIONS.filter((section) =>
        scope === "current"
          ? sectionVisibleForCurrent(currentSurface, section.surface)
          : sectionVisible(scope, section.surface),
      ),
    [scope, currentSurface],
  );
  /** 지금 화면 탭인데 전역 섹션밖에 없을 때 — 그 사실을 조용히 알려준다. */
  const currentHasOwnSections =
    scope !== "current" || visibleSections.some((s) => s.surface !== "global");

  useEffect(() => {
    if (!open) return;
    setScope("current");
  }, [open]);

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
          data-shortcut-sheet-responsive-contract="mobile-sheet-sm-floating"
          data-shortcut-sheet-floating-width-token="--topology-shortcut-sheet-floating-width"
          data-shortcut-sheet-radius-token="--topology-shortcut-sheet-radius"
          data-shortcut-sheet-mobile-bottom-reserve-token="--topology-mobile-bottom-tab-reserve"
          className="pointer-events-auto fixed inset-0 z-50 flex items-stretch justify-center bg-[color:var(--color-backdrop-medium)] sm:items-center sm:p-6"
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
            aria-label={t("dialogAriaLabel")}
            aria-modal="true"
            aria-describedby="shortcut-sheet-help"
            className="flex h-[calc(100dvh-var(--topology-mobile-bottom-tab-reserve))] w-full flex-col overflow-hidden border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-2xl sm:h-auto sm:max-h-[calc(100vh-3rem)] sm:max-w-[var(--topology-shortcut-sheet-floating-width)] sm:rounded-[var(--topology-shortcut-sheet-radius)]"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-[color:var(--color-border-soft)] px-5 py-4">
              <div>
                <p className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
                  {t("title")}
                </p>
                <p className="mt-1 text-body text-[color:var(--color-text-secondary)]">
                  {t("subtitle")}
                </p>
                <p id="shortcut-sheet-help" className="sr-only">
                  {t("help")}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("closeAriaLabel")}
                data-testid="shortcut-sheet-close"
                data-shortcut-sheet-close-contract="touch-visible"
                data-shortcut-sheet-close-size-token="--topology-shortcut-sheet-close-size"
                className="flex h-[var(--topology-shortcut-sheet-close-size)] w-[var(--topology-shortcut-sheet-close-size)] items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]"
              >
                <X size={15} />
              </button>
            </header>

            {/* #67 — 문맥 탭. 헤더와 함께 고정(shrink-0)이라 스크롤해도 항상
                보인다: 지금 어느 범위를 보고 있고 어디로 갈 수 있는지. */}
            <div
              role="tablist"
              aria-label={t("scope.ariaLabel")}
              data-testid="shortcut-sheet-scope-tabs"
              className="flex shrink-0 items-center gap-1 border-b border-[color:var(--color-border-soft)] px-5 py-2.5"
            >
              {SHORTCUT_SCOPES.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={scope === key}
                  data-testid={`shortcut-sheet-scope-${key}`}
                  onClick={() => setScope(key)}
                  className={cn(
                    "h-[var(--control-h-sm)] rounded-md px-2.5 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]",
                    scope === key
                      ? "bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]"
                      : "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-secondary)]",
                  )}
                >
                  {t(`scope.${key}`)}
                </button>
              ))}
            </div>

            {/* #67 — 목록 영역. 스크롤이 남았을 때 아래쪽에 한 단계 페이드를
                깔아 "여기서 끝" 이 아니라 "더 있다" 로 읽히게 한다. */}
            <div className="relative min-h-0 flex-1">
              <div className="h-full overflow-y-auto" data-testid="shortcut-sheet-scroll">
              {/* sm+ 는 2-column grid 로 펼쳐 세로 길이 줄임. 작은 뷰포트는
                  단일 컬럼 + 내부 스크롤로 넘침 방지. */}
              <div className="grid grid-cols-1 gap-x-6 divide-y divide-[color:var(--color-overlay-2)] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                {visibleSections.map((section, idx) => (
                  <section
                    key={section.titleKey}
                    className={
                      idx % 2 === 1
                        ? "px-5 py-4 sm:border-t sm:border-t-[color:var(--color-overlay-2)]"
                        : "px-5 py-4"
                    }
                  >
                    <p className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                      {t(`sections.${section.titleKey}`)}
                    </p>
                    <dl className="mt-3 space-y-2.5">
                      {section.rows.map((row, rowIdx) => (
                        <div
                          // 같은 label 의 alias 단축키가 같은 섹션에 여러 개 있는
                          // 케이스 (e.g. "팔레트 열기 (별명)" ⌘P / ⌘O) 가 있어
                          // index 도 key 에 포함해 React duplicate key 회피.
                          key={`${section.titleKey}-${rowIdx}-${row.labelKey}`}
                          className="flex items-center justify-between gap-4"
                        >
                          <dt className="text-body text-[color:var(--color-text-secondary)]">
                            {t(`rows.${row.labelKey}`)}
                          </dt>
                          <dd className="flex shrink-0 items-center gap-1">
                            {row.keys.map((key, i) => (
                              <kbd
                                key={`${row.labelKey}-${i}`}
                                className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-1.5 font-mono text-label tabular-nums text-[color:var(--color-text-secondary)]"
                              >
                                {typeof key === "string" ? key : t(`keys.${key.i18nKey}`)}
                              </kbd>
                            ))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
                {!currentHasOwnSections ? (
                  <p
                    data-testid="shortcut-sheet-current-empty"
                    className="px-5 pb-4 text-label leading-[1.6] text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
                  >
                    {t("scope.emptyCurrent")}
                  </p>
                ) : null}
              </div>
              <div
                aria-hidden
                data-testid="shortcut-sheet-scroll-fade"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[var(--topology-shortcut-sheet-scroll-fade)]"
                style={{
                  background:
                    "linear-gradient(to top, var(--color-panel), transparent)",
                }}
              />
            </div>

            <footer className="shrink-0 border-t border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-5 py-3">
              <p className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                {t("glossary.title")}
              </p>
              <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {GLOSSARY_TERMS.map((term) => (
                  <div key={term} className="flex items-baseline gap-1.5 text-body">
                    <dt className="shrink-0 font-medium text-[color:var(--color-text-secondary)]">
                      {t(`glossary.${term}Term`)}
                    </dt>
                    <dd className="text-[color:var(--color-text-tertiary)]">
                      {t(`glossary.${term}Definition`)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2.5 font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                <kbd className="rounded border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">
                  ?
                </kbd>{" "}
                {t("footer")}
              </p>
            </footer>
          </motion.section>
          <div
            aria-hidden="true"
            data-testid="shortcut-sheet-bottom-reserve-scrim"
            data-bottom-reserve-scrim-contract="opaque-sheet-continuation"
            data-bottom-reserve-token="--topology-mobile-bottom-tab-reserve"
            className="fixed inset-x-0 bottom-0 h-[var(--topology-mobile-bottom-tab-reserve)] border-t border-[color:var(--color-divider)] bg-[color:var(--color-panel)] sm:hidden"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
