"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderCog, Settings } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LocaleSwitch } from "@/features/locale-switch";
import { cn } from "@/shared/lib/cn";

/**
 * Topology utility-rail settings gear (`docs/prototypes/chrome-datasheet-final.html`
 * — the RIGHT rail's "설정" icon next to fit-view). Opens a compact machined
 * popover with the three settings an owner needs without leaving the map:
 * 언어 (real locale switch, `LocaleSwitch` — `@/i18n/navigation` locale
 * routing under the hood) and INDEX 기본 상태 (expanded/collapsed — writes the SAME
 * localStorage key `HomePage.tsx`'s INDEX panel reads via
 * `useLocalStorageBoolean(INDEX_PANEL_COLLAPSED_KEY, …)`, wired through
 * `onChangeIndexDefaultCollapsed`).
 *
 * Transient-surface contract: this is a self-closing anchored popover, not a
 * modal — no dim/backdrop (`.claude/rules/design.md` reserves scrim for
 * blocking composers). It owns its OWN Escape handling and stops the
 * keypress from reaching the window so the topology's global Esc ladder
 * (`resolveTopologyEscLadderAction`) never also acts on the same keypress —
 * the same "one overlay owns one Escape" contract `SearchPalette` and the
 * global search dialog already rely on (see that ladder's `searchOpen`
 * tier's doc comment). Outside-click follows the SAME pattern as
 * `OperationsNav`'s `AppSettingsMenu` (document `mousedown` + a ref check).
 *
 * M-4 — two fixes to the transient contract the UX round caught:
 *   1. Escape must close the popover even when focus has left it (the persona
 *      opened the gear, then clicked the graph toggle, then pressed Escape —
 *      focus was no longer inside the gear so the old focus-scoped React
 *      `onKeyDown` never fired). The Escape listener is now a WINDOW capture
 *      listener installed while open, so it fires regardless of focus and
 *      still `stopPropagation`s so the global ladder doesn't double-act.
 *   2. Opening another transient surface (search palette, node/edge popover,
 *      docs drawer, create composer, context menu) must demote this popover.
 *      The caller passes `suppressed` = "some other transient is open"; when
 *      it flips true the gear closes itself. Outside-click already covered
 *      pointer-driven surfaces; `suppressed` covers keyboard-opened ones.
 */

export interface TopologyV2SettingsGearLabels {
  /** Gear trigger button aria-label/title. */
  trigger: string;
  /** Popover heading. */
  heading: string;
  locale: string;
  indexDefault: string;
  indexDefaultExpanded: string;
  indexDefaultCollapsed: string;
  /** "Switch vault" row label — a revisit-friendly path back to `/docs` to
   *  open a different local folder without leaving the map to hunt for it. */
  changeVault: string;
  changeVaultAriaLabel: string;
  /**
   * 슬라이스 C (개발/비개발 모드 토글) — "보기 모드" 행. `audience` 는 행
   * 라벨, `audienceDev`/`audiencePlain` 은 2-세그먼트 토글의 두 옵션 라벨.
   */
  audience: string;
  audienceDev: string;
  audiencePlain: string;
  /**
   * P2 결함③ (사용성 전수 검수 2026-07-23) — "보기 모드" 토글 자체엔 존재
   * 발견성이 있어도(기어 안), 무엇을 바꾸는지 설명이 0 이었다. 행 아래
   * caption 한 줄. 생략하면 렌더하지 않는다(하위호환).
   */
  audienceCaption?: string;
}

export interface TopologyV2SettingsGearProps {
  /** Current INDEX-panel-collapsed-by-default preference. */
  indexDefaultCollapsed: boolean;
  onChangeIndexDefaultCollapsed: (next: boolean) => void;
  /**
   * 슬라이스 C (개발/비개발 모드 토글) — 현재 "비개발(plain)" 모드인가. true 면
   * element 티어 상시 숨김 + plain 어휘 + 개발자 크롬 숨김(HomePage 가 적용).
   */
  audiencePlain: boolean;
  onChangeAudiencePlain: (next: boolean) => void;
  /** `/docs` href that lets the user pick a different vault folder. */
  changeVaultHref: string;
  labels: TopologyV2SettingsGearLabels;
  className?: string;
  /**
   * Which edge the popover anchors to (default `"right"`, the original
   * right-utility-rail placement — the popover's right edge aligns with the
   * trigger's and it opens LEFTWARD into the canvas). feat/chrome-system
   * relocates the trigger to the left nav rail, where opening leftward would
   * push the popover off-screen — pass `"left"` there so it opens
   * RIGHTWARD instead. Only the anchor edge changes; nothing else about the
   * popover moves.
   */
  popoverAlign?: "left" | "right";
  /**
   * M-4 — "some other transient surface is now open, demote me". When this
   * flips to `true` while the gear popover is open, the gear closes itself so
   * two transient surfaces never stack. Keyboard-opened surfaces (⌘K palette,
   * the `D` docs drawer) don't fire the `mousedown` the outside-click handler
   * relies on, so the caller signals them here instead.
   */
  suppressed?: boolean;
  /**
   * Trigger surface family (default `"floating"`, the original 36px
   * floating-control tile). `"chrome-tile"` renders the trigger with the
   * top-chrome ChromeChip/ChromeTile contract (`--chrome-tile-size` 44px ·
   * `--chrome-radius` · `--chrome-surface/border/shadow`) so it can sit
   * inside the top-right utility lane without breaking the row's uniform
   * control height (겹침 소탕 2026-07-23 — <lg 에서 내비 레일이 사라져 설정
   * 접근이 끊기던 결함의 진입점).
   *
   * `"rail-tile"` renders the trigger with the nav-rail utility-tile contract
   * (`--app-nav-rail-tile-width/height` geometry · borderless overlay hover ·
   * 1px active press · `--app-nav-rail-utility-icon-size` icon) so the rail's
   * bottom stack (활동·발자취·설정) sits on ONE tile grammar — 소유자 실보고
   * 2026-07-23: the floating 36px bordered tile + 16px icon made the gear a
   * third, mismatched surface family inside the rail.
   */
  triggerVariant?: "floating" | "chrome-tile" | "rail-tile";
  /**
   * Which side of the trigger the popover opens toward (default `"bottom"`,
   * the original placement — plenty of canvas below the right utility
   * rail's top-anchored gear). feat/chrome-system's nav-rail placement sits
   * the trigger at the very BOTTOM of the screen, so opening downward pushes
   * the popover off-screen (caught in 1920 live QA) — pass `"top"` there to
   * open upward instead.
   */
  popoverSide?: "top" | "bottom";
}

export function TopologyV2SettingsGear({
  indexDefaultCollapsed,
  onChangeIndexDefaultCollapsed,
  audiencePlain,
  onChangeAudiencePlain,
  changeVaultHref,
  labels,
  className,
  suppressed = false,
  triggerVariant = "floating",
  popoverAlign = "right",
  popoverSide = "bottom",
}: TopologyV2SettingsGearProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      close(false);
    };
    // M-4 (1) — WINDOW capture keydown so Escape closes the gear even when
    // focus has moved out of it (the persona case). Capture phase runs before
    // the global ladder's bubble-phase window listener, and stopPropagation
    // halts the event there so the ladder never also acts on this press.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, close]);

  // M-4 (2) — another transient surface opened; demote this popover. Handled
  // as a set-state-DURING-render off a previous-value latch (React's official
  // "adjusting state when a prop changes" pattern), NOT an effect — so it
  // demotes in the same render `suppressed` flips true without a cascading
  // effect pass. Latching on the transition (not `suppressed` alone) lets the
  // user re-open the gear while a suppressor is still up if they choose to.
  const [prevSuppressed, setPrevSuppressed] = useState(suppressed);
  if (suppressed !== prevSuppressed) {
    setPrevSuppressed(suppressed);
    if (suppressed && open) setOpen(false);
  }

  // Two wrappers on purpose — outer takes the CALLER's page-level position
  // classes (e.g. `absolute right-6 top-[...]` for the utility rail), inner
  // is always `relative` so the popover can anchor to it. Putting both
  // "relative" and a caller-supplied "absolute" on the SAME element is a
  // cascade footgun: Tailwind's generated stylesheet order (not the class
  // list order in JSX) decides which position wins, so it can silently pick
  // "relative" and leave the whole thing unpositioned (regression found in
  // live QA — the gear rendered off-screen at x:-32).
  return (
    <div className={className ?? "inline-block"}>
      <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={labels.trigger}
        title={labels.trigger}
        data-testid="topology-v2-settings-gear-trigger"
        data-trigger-variant={triggerVariant}
        className={cn(
          "flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset",
          triggerVariant === "chrome-tile"
            ? // 상단 utility lane 의 ChromeChip/ChromeTile 표면 계약 —
              // 같은 행의 44px 타일들과 높이·radius·표면이 일치해야 한다.
              "size-[var(--chrome-tile-size)] rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
            : triggerVariant === "rail-tile"
              ? // 내비 레일 유틸리티 타일 계약 — 활동(AppNavRail)·발자취
                // (GitStatusTile)와 같은 지오메트리·상태 안무(rest → hover
                // 색-웨이크 → active 1px 눌림 + overlay-3 → focus 링).
                "h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] rounded-card text-[color:var(--color-text-tertiary)] transition-[color,background-color,transform] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] active:translate-y-px active:bg-[color:var(--color-overlay-3)]"
              : "h-9 w-9 rounded-md border border-[color:var(--topology-floating-control-border)] bg-[color:var(--topology-floating-control-surface)] text-[color:var(--topology-floating-control-icon)] shadow-[var(--topology-floating-control-shadow)] hover:bg-[color:var(--topology-floating-control-hover-surface)] hover:text-[color:var(--topology-floating-control-icon-hover)]",
        )}
      >
        <Settings
          className={
            triggerVariant === "rail-tile"
              ? // 유틸리티 티어 아이콘 사다리 — 활동·발자취 타일과 동일 토큰.
                "h-[var(--app-nav-rail-utility-icon-size)] w-[var(--app-nav-rail-utility-icon-size)]"
              : "h-4 w-4"
          }
          aria-hidden
        />
      </button>
      {open ? (
        <div
          role="group"
          aria-label={labels.heading}
          data-testid="topology-v2-settings-gear-popover"
          className={cn(
            "absolute z-30 w-[228px] rounded-md border border-[color:var(--topology-floating-panel-border)] bg-[color:var(--topology-floating-panel-surface)] shadow-[var(--topology-floating-panel-shadow)]",
            popoverSide === "top" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]",
            popoverAlign === "left" ? "left-0" : "right-0",
          )}
        >
          <div className="border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {labels.heading}
          </div>
          <div className="flex flex-col gap-3 p-3">
            <SettingsRow label={labels.locale}>
              <LocaleSwitch />
            </SettingsRow>
            {/* 슬라이스 C (개발/비개발 모드 토글) — "INDEX 기본 상태" 바로 위,
                같은 SettingsRow + 2-세그먼트 토글 패턴. */}
            <SettingsRow label={labels.audience}>
              <div
                role="group"
                aria-label={labels.audience}
                data-testid="topology-v2-settings-gear-audience"
                className="inline-flex items-center gap-px rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-px text-[11px]"
              >
                {(
                  [
                    { value: false, label: labels.audienceDev },
                    { value: true, label: labels.audiencePlain },
                  ] as const
                ).map((option) => {
                  const active = option.value === audiencePlain;
                  return (
                    <button
                      key={String(option.value)}
                      type="button"
                      onClick={() => onChangeAudiencePlain(option.value)}
                      aria-pressed={active}
                      className={[
                        "flex h-8 items-center justify-center rounded-[4px] px-2 font-medium transition-colors",
                        active
                          ? "bg-[color:var(--color-panel)] text-[color:var(--color-text-primary)]"
                          : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </SettingsRow>
            {labels.audienceCaption ? (
              <p
                data-testid="topology-v2-settings-gear-audience-caption"
                className="-mt-2 text-[10.5px] leading-[1.5] text-[color:var(--color-text-quaternary)]"
              >
                {labels.audienceCaption}
              </p>
            ) : null}
            <SettingsRow label={labels.indexDefault}>
              <div
                role="group"
                aria-label={labels.indexDefault}
                className="inline-flex items-center gap-px rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-px text-[11px]"
              >
                {(
                  [
                    { value: false, label: labels.indexDefaultExpanded },
                    { value: true, label: labels.indexDefaultCollapsed },
                  ] as const
                ).map((option) => {
                  const active = option.value === indexDefaultCollapsed;
                  return (
                    <button
                      key={String(option.value)}
                      type="button"
                      onClick={() => onChangeIndexDefaultCollapsed(option.value)}
                      aria-pressed={active}
                      className={[
                        "flex h-8 items-center justify-center rounded-[4px] px-2 font-medium transition-colors",
                        active
                          ? "bg-[color:var(--color-panel)] text-[color:var(--color-text-primary)]"
                          : "text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </SettingsRow>
            <Link
              href={changeVaultHref}
              data-testid="topology-v2-settings-gear-change-vault"
              aria-label={labels.changeVaultAriaLabel}
              className="flex items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] px-2.5 py-2 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
            >
              <FolderCog size={13} aria-hidden />
              {labels.changeVault}
            </Link>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-[color:var(--color-text-tertiary)]">{label}</span>
      {children}
    </div>
  );
}
