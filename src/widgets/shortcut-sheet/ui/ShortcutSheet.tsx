"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { MOTION, OVERLAY_SPRING_REDUCED } from "@/shared/motion";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui/control-class";
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
 * 여기 footer 에 한 줄 정의를 덧붙인다. kind 순서는 지도의 계층 순서
 * (도메인 → 역량 → 요소)와 같다.
 *
 * 맨 앞의 `ontology` 는 제품 이름에 박혀 있으면서도 정의되는 자리가 앱
 * 어디에도 없던 단어다 — 투어에서 한 번 이름을 붙이고 나면 "그게 뭐였지"
 * 를 되찾을 곳이 필요하고, 그 자리는 이미 존재하는 pull-only 도움말이지
 * 새 버튼이 아니다. 나머지 세 단어와 같은 줄 형식이라 IA 추가는 0.
 */
// 이 시트와 투어 1단계가 낱말 정의의 유일한 두 집이다 — 새 표면을 만들어
// 가르치지 않는다. `nodeNumber` 는 지도의 각인 숫자(285)가 화면 위쪽 개념
// 총수(296)와 다른 이유를 여기서 한 번만 말한다: 세는 범위가 다르다.
const GLOSSARY_TERMS = [
  "ontology",
  "domain",
  "capability",
  "element",
  "evidence",
  "nodeNumber",
] as const;

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
    /**
     * **`<body>` 를 복원 대상으로 기록하지 않는다** (2026-07-29 실측).
     *
     * 이 시트를 여는 버튼은 시트가 켜지는 순간 언마운트된다 — 시트가 세우는
     * `topologyBlockingOverlayActive` 가 그 버튼의 렌더 조건을 끄기 때문이다.
     * 그래서 이 효과가 도는 시점에는 이미 `document.activeElement === body`
     * 이고, 종전 코드는 그걸 "이전 포커스" 로 기록했다.
     *
     * `body.isConnected` 는 언제나 `true` 라 복원 분기는 성공한 것처럼 보이고,
     * 실제로는 **포커스를 body 에 다시 꽂는다.** 프로브 로그가 그대로 말해
     * 줬다: `[SHEET-CLEANUP] true BODY`. 겉보기 증상("닫으면 body 로 간다")과
     * 원인("열 때 이미 body 였다")이 반대편에 있어서, 닫는 쪽만 고치는 시도는
     * 전부 빗나갔다.
     */
    const active = document.activeElement;
    previousFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
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
      /**
       * **여는 컨트롤이 사라졌어도 `body` 로 떨어뜨리지 않는다**
       * (2026-07-29 키보드 실측).
       *
       * 이 시트를 여는 버튼은 시트가 켜지면 **언마운트된다** — 시트가 세우는
       * `topologyBlockingOverlayActive` 가 그 버튼의 렌더 조건을 끄기
       * 때문이다. 그래서 닫을 때 돌려줄 원소가 이미 없고 포커스가 `body` 로
       * 갔다. 그 다음 Tab 은 문서 처음(건너뛰기 링크)부터 다시 시작한다 —
       * 실측으로 원래 자리에서 29 정거장 뒤였다.
       *
       * 같은 시트를 **살아남는 원소**(자동 정렬 타일)에서 `?` 로 열면 복원이
       * 정상이었다. 즉 트랩의 결함이 아니라 "돌아갈 곳이 사라지는 경우" 의
       * 미처리다. `<main>` 은 건너뛰기 링크 수정으로 이미 포커스를 받으므로,
       * 페이지 처음이 아니라 **본문 시작**으로 돌려준다.
       */
      const previous = previousFocusRef.current;
      if (previous?.isConnected) {
        previous.focus();
      } else {
        // 돌아갈 컨트롤이 없으면 **본문 시작**으로. `<main>` 은 건너뛰기 링크
        // 수정으로 이미 포커스를 받는다 — 페이지 처음부터 다시 걷는 것보다 낫다.
        document.querySelector<HTMLElement>("main#main")?.focus({ preventScroll: true });
      }
      /**
       * 한 프레임 뒤 재확인 — 복원한 원소가 곧바로 언마운트되는 경쟁이 남아
       * 있다(실측 타임라인: 0ms BUTTON · 50ms BUTTON · **150ms BODY**).
       * 닫는 시점만 보는 복원은 그걸 못 이긴다.
       */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (document.activeElement && document.activeElement !== document.body) return;
          document.querySelector<HTMLElement>("main#main")?.focus({ preventScroll: true });
        });
      });
    };
  }, [open]);

  /*
   * reduced-motion 동등물 (2026-07-28 프레임 실측). 여기는 **절반만** 스왑돼
   * 있었다: 전역 kill 규칙이 CSS 애니메이션만 자르는데 이 시트는 framer 가
   * 그리므로 불투명도 이징(200ms)은 살아남고, 같은 구간의
   * `scale(.985) translateY(12px) → none` 만 **1프레임**으로 잘려
   * `y 96.2 → 79` · `h 684.6 → 695` 가 순간이동했다 — 남길 축(밝기)과 없앨
   * 축(기하)이 정확히 뒤바뀐 상태다.
   *
   * 검색 팔레트·새 문서 대화가 쓰는 것과 **같은** 동등물(`OVERLAY_SPRING_REDUCED`,
   * 120ms opacity 전용)로 통일하고, 흔들리는 축은 시작값 자체를 0 으로 둔다 —
   * 시간이 0 이 아니라 **여행 거리**가 0 이라야 순간이동이 아니다. 새 값 0.
   */
  const reducedMotion = useReducedMotion();
  const surfaceMotion = reducedMotion
    ? {
        initial: { opacity: 0, y: 0, scale: 1 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 0, scale: 1 },
        transition: OVERLAY_SPRING_REDUCED,
      }
    : {
        initial: { opacity: 0, y: 12, scale: 0.985 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 12, scale: 0.985 },
        transition: MOTION.base,
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-interactive-overlay="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reducedMotion ? OVERLAY_SPRING_REDUCED : MOTION.base}
          data-shortcut-sheet-responsive-contract="mobile-sheet-sm-floating"
          data-shortcut-sheet-floating-width-token="--topology-shortcut-sheet-floating-width"
          data-shortcut-sheet-radius-token="--radius-sheet"
          data-shortcut-sheet-mobile-bottom-reserve-token="--topology-mobile-bottom-tab-reserve"
          className="pointer-events-auto fixed inset-0 z-50 flex items-stretch justify-center bg-[color:var(--color-backdrop-medium)] sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.section
            ref={dialogRef}
            initial={surfaceMotion.initial}
            animate={surfaceMotion.animate}
            exit={surfaceMotion.exit}
            transition={surfaceMotion.transition}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label={t("dialogAriaLabel")}
            aria-modal="true"
            aria-describedby="shortcut-sheet-help"
            className="flex h-[calc(100dvh-var(--topology-mobile-bottom-tab-reserve))] w-full flex-col overflow-hidden border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-3)] sm:h-auto sm:max-h-[calc(100vh-3rem)] sm:max-w-[var(--topology-shortcut-sheet-floating-width)] sm:rounded-sheet"
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
                className="flex h-[var(--topology-shortcut-sheet-close-size)] w-[var(--topology-shortcut-sheet-close-size)] items-center justify-center rounded-chip text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]"
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
                  /**
                   * **이 자리가 2026-08-03 수렴의 유일한 미흡수 소비처였다.**
                   * 삭제된 `fixedHeight: "sm"` 이 여기서만 28px 을 냈는데, 28은
                   * 사다리에는 있어도(`--control-h-sm`) **세그먼트 단**에는
                   * 없다 — 다른 세그먼트 탭 8개가 전부 24px(`md`)이다. 혼자
                   * 28을 지키려면 축이 다시 필요하고, 그건 이 정리가 없앤 바로
                   * 그 축이다. 그래서 다수와 같은 24로 내렸다(−4px). 24는 WCAG
                   * 2.5.8 (AA) 최소 타깃이라 바닥 아래로 내려간 것이 아니다.
                   */
                  className={controlClass({
                    shape: "segment",
                    active: scope === key,
                    className: cn(
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]",
                      scope !== key &&
                        "hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-secondary)]",
                    ),
                  })}
                >
                  {t(`scope.${key}`)}
                </button>
              ))}
            </div>

            {/* #67 — 목록 영역. 스크롤이 남았을 때 아래쪽에 한 단계 페이드를
                깔아 "여기서 끝" 이 아니라 "더 있다" 로 읽히게 한다. */}
            {/* #67 후속 — 스크롤 영역 높이 계약.
                이 다이얼로그는 sm+ 에서 **콘텐츠 기반 높이**(`sm:h-auto` +
                `sm:max-h-[...]`)다. 그래서
                  · `h-full`(=height:100%) → 래퍼 높이가 아니라 콘텐츠 높이로
                    해석돼 `scrollHeight === clientHeight`, 스크롤이 죽고 마지막
                    섹션이 뷰포트 밖으로 잘림(영문 `전체` 탭 실측 1112px).
                  · `absolute inset-0` → 스크롤 자식이 흐름에서 빠져 래퍼가 0
                    높이가 되고 다이얼로그가 232px 로 무너짐.
                둘 다 실측으로 확인했다. 정답은 **흐름 안에서 flex 로 제한**하는
                것: 래퍼도 flex 컬럼이고, 스크롤 자식이 `min-h-0 flex-1` 로
                남는 공간만 먹는다. 페이드는 래퍼(relative) 하단에 앵커. */}
            <div className="relative flex min-h-0 flex-1 flex-col">
              <div
                className="min-h-0 flex-1 overflow-y-auto"
                data-testid="shortcut-sheet-scroll"
              >
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
                                className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-chip border border-[color:var(--color-overlay-3)] bg-[color:var(--color-elevated)] px-1.5 font-mono text-label tabular-nums text-[color:var(--color-text-secondary)]"
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
                    className="px-5 pb-4 text-label leading-label text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
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
                <kbd className="rounded-micro border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">
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
