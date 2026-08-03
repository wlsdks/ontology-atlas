"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Footprints, X } from "lucide-react";

import {
  CHROME_STATUS_CHIP_CLASS,
  CompactCopyButton,
  Surface,
  TopologyV2KindGlyph,
  controlClass,
} from "@/shared/ui";
import type { FootprintTrailEntry } from "../lib/footprint-trail";

export interface TopologyTrailChipLabels {
  /** 팝오버 제목 — "걸어온 길". */
  heading: string;
  /** 트리거 aria — "걸어온 길 열기". */
  triggerAriaLabel: string;
  /** 현재 위치 캡션 — "지금 여기". 팝오버 안 유일한 채색 텍스트. */
  currentLabel: string;
  /** 현재 포커스가 없을 때 최상단(가장 최근 방문) 캡션 — "방금 전". */
  justNowLabel: string;
  /** 상대 걸음 캡션 — "{count}걸음 전". */
  stepsAgoLabel: (count: number) => string;
  /** 각 행 클릭 aria 접두 — "{title}(으)로 이동". */
  rowAriaLabel: (title: string) => string;
  /** "AI에게 이어서 맡기기". */
  copyLabel: string;
  copyAriaLabel: string;
  copyCopiedAriaLabel: string;
  /** 푸터 "지우기". */
  clearLabel: string;
  /** 칩 ✕ aria — "걸어온 길 지우기". */
  clearAriaLabel: string;
  /** 1층 헤더 우측 링크 — "지난 길 {count}". 보관이 있을 때만 보인다. */
  pastLinkLabel: string;
  /** 2층 제목 — "지난 길". */
  pastHeading: string;
  /** 2층 ‹ aria — "걸어온 길로 돌아가기". */
  pastBackAriaLabel: string;
  /** 행 ✕ aria — "이 길 지우기". */
  pastDeleteAriaLabel: string;
  /** 2층 푸터 "모두 지우기". */
  pastClearAllLabel: string;
  /** 2단 확인 라벨 — "한 번 더 누르면 지워요". */
  pastClearAllConfirmLabel: string;
  /** 상한 고지 캡션 — "최근 10개까지". */
  pastCapCaption: string;
  /** 빈 상태 본문. */
  pastEmptyBody: string;
}

/** 2층 목록의 한 행 — 문자열 포맷은 HomePage(i18n 소유)가 끝내서 내려보낸다. */
export interface TopologyPastWalkRow {
  id: string;
  /** 1줄 — "처음 → 끝". 가운데 화살표는 길의 방향을 나르는 데이터다. */
  routeLabel: string;
  /** 2줄 — "오늘 · 12곳", 또는 다시 펼 수 없는 길이면 "지금 지도에 없어요". */
  metaLabel: string;
  /**
   * 지금 지도에 이 길을 다시 펼 수 있는가. false 면 행이 버튼이 아니라 글이
   * 된다 — 눌러도 아무 일이 없는 컨트롤을 두는 것보다 못 누른다고 보이는 편이
   * 정직하다. 지우기(✕)는 그대로 남는다.
   */
  replayable: boolean;
  /**
   * 행 버튼 aria — "이 길 다시 펴기 — 오늘, 12곳". 다시 펼 수 없는 길은 버튼이
   * 없으므로 라벨도 없다(null) — 쓰이지 않는 문자열을 계산해 들고 있으면
   * "0곳 다시 펴기" 같은 거짓말이 조용히 다른 표면으로 샌다.
   */
  ariaLabel: string | null;
}

/** `모두 지우기` 2단 확인이 첫 상태로 돌아가는 시간. */
const CLEAR_ALL_CONFIRM_RESET_MS = 4000;

export interface TopologyTrailChipProps {
  /** 미리 포맷된 칩 라벨 — "걸어온 길 · {count}" (i18n 은 HomePage 소유, 칩은 순수 크롬). */
  label: string;
  /**
   * 방문 순서(오래된 → 최근) — 모델이 주는 순서 그대로. 팝오버는 이걸 **뒤집어**
   * 최근이 맨 위로 그린다(§4-1: 앱 안 시간 목록이 전부 최신순이고, 되돌아갈
   * 대상은 대개 1~3걸음 전이라 스크롤 없이 초기 화면에 들어온다).
   */
  entries: readonly FootprintTrailEntry[];
  /** 현재 포커스 노드 id — 타임라인에서 인디고 점으로 표시. 없으면 없음. */
  currentId: string | null;
  labels: TopologyTrailChipLabels;
  /** 행 클릭 → 그 노드로 포커스. */
  onFocusEntry: (id: string) => void;
  /** "AI에게 이어서 맡기기" — 방문 체인 인계 패킷을 클립보드로. */
  onCopyPacket: () => void;
  copied: boolean;
  /** 세션 트레일 소거(칩 ✕ · 푸터 "지우기" 공용). 보관 없이 버린다. */
  onClear: () => void;
  /**
   * 팝오버 열림 = **걸어온 길 렌즈** on/off. 지도는 이 신호 하나로 관계 읽기를
   * 잠시 접고 궤적 읽기에 양보한다(방문 노드만 값·라벨 유지, 나머지·엣지 전부
   * dim). 새 모드·토글·URL 상태가 아니라 이 팝오버의 수명과 동치다.
   */
  onLensChange?: (active: boolean) => void;
  /**
   * 행 hover/focus ↔ 지도 노드 브러싱. "2걸음 전이 어느 노드지"를 노드 위
   * 숫자가 아니라 **가리켜서** 답한다(지도는 그 노드에 기존 호버 프리뷰 링).
   */
  onHoverEntry?: (id: string | null) => void;
  /** 보관된 지난 길 — 최근이 앞. */
  pastWalks: readonly TopologyPastWalkRow[];
  /**
   * 지금 길이 남지 않는 이유(읽기 전용 볼트 등). null 이면 정상 보관 중.
   * 보관도 0이고 알릴 것도 없으면 1층 헤더 링크 자체가 나타나지 않는다.
   */
  pastNotice: string | null;
  /**
   * 지난 길 한 줄을 지금 걷는 길로 **다시 편다**. 호출부가 지금 걷던 길을 먼저
   * 보관하고, 고른 길을 살아있는 지도 기준으로 정제해 적재한 뒤 끝 걸음을
   * 포커스한다. 칩은 층만 1층으로 되돌린다 — 방금 편 길이 거기 있으므로.
   */
  onReplayPastWalk: (id: string) => void;
  /** 지난 길 한 줄 삭제. */
  onDeletePastWalk: (id: string) => void;
  /** 지난 길 전체 삭제(2단 확인을 거친 뒤 호출된다). */
  onClearPastWalks: () => void;
}

/**
 * "걸어온 길" 트레일 칩 (fable 설계 — 소유자 요청) — 상단 중앙 크롬 열의 상태
 * 칩(`TopologyPathChip`/`TopologyRealmChip` 과 같은 문법). 클릭하면 **미니
 * 타임라인** 팝오버가 열린다: 세로 점-연결선으로 방문 순서를 **최근이 맨 위로**
 * 보여주고, 각 점은 kind 글리프(현재 위치는 인디고 점), 행 클릭 = 그 노드 포커스.
 * 하단에 "AI에게 이어서 맡기기"(방문 체인 인계 패킷) + "지우기". 칩 ✕ 도 세션
 * 트레일을 소거한다.
 *
 * 왜 최신이 위인가 — 소유자가 "위에가 1인지 맨 아래가 1인지 구분하기 쉽지 않다"고
 * 지적했다. 방향을 은유(선)에 맡기지 않고 ① 앱 안 다른 시간 목록(기록 커밋 ·
 * 신선도 · INDEX 최근 필터)과 같은 최신순으로 맞추고 ② **행마다 상대 걸음 캡션**
 * ("지금 여기" / "n걸음 전")으로 방향을 자체 내장한다. 어느 행부터 읽어도 거리가
 * 즉답되므로 절대 번호(1·2·3)가 남기던 "위가 1인가" 질문이 사라진다. 방향 장식
 * (화살표·그라데이션)은 더하지 않는다 — 잉크만 늘고 이 대비에서 읽히지 않는다.
 *
 * transient-surface 계약(설정 기어와 동일): dim/backdrop 없는 self-closing 앵커
 * 팝오버, 자기 Escape 를 소유해 전역 Esc 사다리와 이중 발화하지 않는다.
 *
 * 같은 셸의 **2층**이 「지난 길」 — 보관된 지난 궤적 목록이다. 새 라우트도 새
 * 팝업도 만들지 않는다: 기능이 사는 곳에서 그 기능의 과거를 본다. 2층에는
 * 인디고가 없다 — "지금 여기"가 없는 목록이라 주의 계층 승자도 없는 게 정직하다.
 * 행을 누르면 그 길이 **다시 펴져** 1층으로 돌아온다(지금 걷던 길은 그 전에
 * 보관되므로 아무것도 잃지 않는다).
 */
export function TopologyTrailChip({
  label,
  entries,
  currentId,
  labels,
  onFocusEntry,
  onCopyPacket,
  copied,
  onClear,
  onLensChange,
  onHoverEntry,
  pastWalks,
  pastNotice,
  onReplayPastWalk,
  onDeletePastWalk,
  onClearPastWalks,
}: TopologyTrailChipProps) {
  const [open, setOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  // 파괴적·복구 불가 삭제라 인라인 2단 확인을 거친다(대화상자는 이 규모에 과잉).
  const [clearAllArmed, setClearAllArmed] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pastLinkRef = useRef<HTMLButtonElement | null>(null);

  // 렌더만 뒤집는다 — 모델(`appendFootprintVisit`)과 인계 패킷은 오래된 → 최근
  // 순서 그대로다(패킷은 기계 재생용이라 시간순이 맞다).
  const recentFirstEntries = useMemo(() => [...entries].reverse(), [entries]);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    // 닫으면 항상 1층부터 — 다음에 열 때 어느 층이었는지 기억하게 하면
    // 같은 트리거가 매번 다른 화면을 여는 셈이 된다.
    setShowPast(false);
    setClearAllArmed(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // 렌즈 수명 = 팝오버 수명. 언마운트(트레일 소거로 칩이 사라지는 경우 포함)
  // 에도 반드시 꺼야 지도가 dim 인 채로 굳지 않는다. 2층(지난 길)에 있는 동안에도
  // 렌즈는 켜둔다 — 팝오버가 열려 있는 한 지도는 여전히 궤적을 읽는 화면이다.
  useEffect(() => {
    onLensChange?.(open);
    if (!open) {
      onHoverEntry?.(null);
      return;
    }
    return () => {
      onLensChange?.(false);
      onHoverEntry?.(null);
    };
  }, [open, onLensChange, onHoverEntry]);

  // 층이 바뀌면 반대편 행이 통째로 사라진다 — 포인터가 행 밖으로 나가는 이벤트
  // 없이 언마운트되므로 브러싱을 층 전환 자리에서 **양방향으로** 명시적으로
  // 푼다. 특히 1층으로 되돌아올 때(지난 길을 다시 편 직후 포함) 목록 내용이
  // 통째로 갈리는데, 멈춰 있는 포인터 밑에 새로 그려진 행은 mouseenter 를
  // 내지 않아 옛 브러싱이 지도에 남는다.
  useEffect(() => {
    onHoverEntry?.(null);
  }, [showPast, onHoverEntry]);

  // 2단 확인은 스스로 풀린다 — 무장 상태를 계속 들고 있으면 나중의 무심한
  // 클릭 한 번이 삭제가 된다.
  useEffect(() => {
    if (!clearAllArmed) return;
    const timer = window.setTimeout(() => setClearAllArmed(false), CLEAR_ALL_CONFIRM_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [clearAllArmed]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      close(false);
    };
    // 설정 기어와 같은 계약 — WINDOW capture Escape 로 포커스가 밖에 있어도 닫고
    // stopPropagation 으로 전역 Esc 사다리가 같은 키를 또 소비하지 않게 한다.
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

  return (
    <div ref={rootRef} className="relative" data-testid="topology-trail-chip">
      <div className={CHROME_STATUS_CHIP_CLASS}>
        <Footprints size={14} aria-hidden className="shrink-0 text-[color:var(--color-text-tertiary)]" />
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            if (open) close(false);
            else setOpen(true);
          }}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={labels.triggerAriaLabel}
          data-testid="topology-trail-chip-trigger"
          className={controlClass({
            shape: "link",
            tone: "strong",
            inline: true,
            truncate: true,
            className: "min-w-0 font-medium",
          })}
        >
          {label}
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label={labels.clearAriaLabel}
          data-testid="topology-trail-chip-clear"
          className={controlClass({
            shape: "icon",
            size: "sm",
            tone: "muted",
            className: "-mr-1 hover:text-[color:var(--color-text-primary)]",
          })}
        >
          <X size={13} aria-hidden />
        </button>
      </div>
      {/* 칩의 오른쪽 아래에 매달린다 — 등장도 그 모서리에서 자란다. */}
      <Surface
        open={open}
        origin="top right"
        role="group"
        aria-label={labels.heading}
        data-testid="topology-trail-chip-popover"
        className="absolute right-0 top-[calc(100%+8px)] z-30 w-[248px] rounded-chip border border-[color:var(--topology-floating-panel-border)] bg-[color:var(--topology-floating-panel-surface)] shadow-[var(--topology-floating-panel-shadow)]"
      >
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-2 font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {showPast ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setShowPast(false);
                    setClearAllArmed(false);
                    pastLinkRef.current?.focus();
                  }}
                  aria-label={labels.pastBackAriaLabel}
                  data-testid="topology-trail-past-back"
                  className="-ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                >
                  <ChevronLeft size={14} aria-hidden />
                </button>
                <span className="min-w-0 flex-1 truncate">{labels.pastHeading}</span>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate">{labels.heading}</span>
                {/* 보여줄 게 있을 때만 나타나는 조용한 진입점 — 없는 과거를
                    가리키는 링크는 잉크만 늘린다. */}
                {pastWalks.length > 0 || pastNotice !== null ? (
                  <button
                    ref={pastLinkRef}
                    type="button"
                    onClick={() => setShowPast(true)}
                    data-testid="topology-trail-past-link"
                    className="shrink-0 rounded-chip px-1 py-0.5 text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                  >
                    {labels.pastLinkLabel}
                  </button>
                ) : null}
              </>
            )}
          </div>
          {showPast ? (
            <>
              {/* 왜 안 남는지를 먼저 말한다 — 조용한 실패가 가장 나쁘다.
                  정상 보관 중이면 이 줄 자체가 없다(무소음이 기본). */}
              {pastNotice !== null ? (
                <p
                  data-testid="topology-trail-past-notice"
                  className="border-b border-[color:var(--topology-floating-panel-divider)] px-3 py-2 text-caption leading-relaxed text-[color:var(--color-text-tertiary)]"
                >
                  {pastNotice}
                </p>
              ) : null}
              {/* 지난 길 목록 — 행 높이는 내용이 아니라 해부구조(2줄)가 정한다.
                  제목이 길든 짧든 격자는 같은 리듬으로 읽힌다. */}
              {pastWalks.length > 0 ? (
                <ul
                  data-testid="topology-trail-past-list"
                  className="flex max-h-[280px] flex-col overflow-y-auto px-2 py-1.5"
                >
                  {pastWalks.map((walk) => (
                    <li
                      key={walk.id}
                      data-testid="topology-trail-past-row"
                      data-replayable={walk.replayable ? "true" : "false"}
                      className="flex h-[47px] shrink-0 items-center gap-1"
                    >
                      {/* 다시 펼 수 있는 길만 버튼이다. 지도에서 사라진 길은 같은
                          해부구조를 유지한 채 글로 남아 왜 못 누르는지 2줄이
                          답한다 — 눌러도 아무 일 없는 컨트롤은 만들지 않는다. */}
                      {walk.replayable ? (
                        <button
                          type="button"
                          onClick={() => {
                            onReplayPastWalk(walk.id);
                            // 방금 편 길은 1층에 있다 — 그 자리로 되돌린다.
                            setShowPast(false);
                            setClearAllArmed(false);
                          }}
                          aria-label={walk.ariaLabel ?? undefined}
                          data-testid="topology-trail-past-replay"
                          // 어포던스는 배경이 아니라 **텍스트 리프트**가 나른다 —
                          // overlay-1 hover 는 이 표면에서 1.03:1 이라 사실상 안
                          // 보인다. 1층 행이 이미 secondary→primary 리프트로
                          // "눌린다"를 말하고 있어 같은 문법을 그대로 쓴다.
                          // 텍스트가 자식 span 이라 캐스케이드가 막히므로 group 경유.
                          className="group flex min-w-0 flex-1 flex-col justify-center gap-0.5 self-stretch rounded-chip px-1.5 text-left transition-colors hover:bg-[color:var(--color-overlay-1)]"
                        >
                          {/* 리프트는 1줄만 — 2줄까지 올리면 2줄 위계가 무너지고
                              "승자 없음"이던 2층에 승자가 생긴다. */}
                          <span className="w-full truncate text-body text-[color:var(--color-text-secondary)] transition-colors group-hover:text-[color:var(--color-text-primary)]">
                            {walk.routeLabel}
                          </span>
                          <span className="w-full truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                            {walk.metaLabel}
                          </span>
                        </button>
                      ) : (
                        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-1.5">
                          {/* 강등하되 바닥까지 내리지는 않는다 — 이 행에서 사용자가
                              해야 할 유일한 일이 "어느 길을 지울지 읽는 것"이라
                              그 텍스트를 램프 최하단에 두면 역방향이다. 살아있는
                              행(secondary)보다 확실히 아래, 캡션(quaternary)보다
                              위 — 3단이어야 2줄이 1줄을 설명하는 관계가 읽힌다. */}
                          <span className="truncate text-body text-[color:var(--color-text-tertiary)]">
                            {walk.routeLabel}
                          </span>
                          <span className="truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                            {walk.metaLabel}
                          </span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeletePastWalk(walk.id)}
                        aria-label={labels.pastDeleteAriaLabel}
                        data-testid="topology-trail-past-delete"
                        className={controlClass({
                          shape: "icon",
                          size: "lg",
                          tone: "muted",
                          className: "hover:text-[color:var(--color-text-primary)]",
                        })}
                      >
                        <X size={13} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p
                  data-testid="topology-trail-past-empty"
                  className="px-3 py-4 text-caption leading-relaxed text-[color:var(--color-text-quaternary)]"
                >
                  {labels.pastEmptyBody}
                </p>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-[color:var(--topology-floating-panel-divider)] px-2 py-1.5">
                {pastWalks.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!clearAllArmed) {
                        setClearAllArmed(true);
                        return;
                      }
                      setClearAllArmed(false);
                      onClearPastWalks();
                    }}
                    data-testid="topology-trail-past-clear-all"
                    className={controlClass({
                      shape: "segment",
                      tone: clearAllArmed ? "strong" : "muted",
                      // 호버는 소비처 몫 — 무장 전에만 잉크가 깨어난다.
                      className: clearAllArmed
                        ? undefined
                        : "hover:text-[color:var(--color-text-primary)]",
                    })}
                  >
                    {clearAllArmed ? labels.pastClearAllConfirmLabel : labels.pastClearAllLabel}
                  </button>
                ) : (
                  <span />
                )}
                {/* 상한을 숨기지 않는다 — 축적이 아니라 회전 버퍼임을 먼저 말한다. */}
                <span className="shrink-0 font-mono text-caption text-[color:var(--color-text-quaternary)]">
                  {labels.pastCapCaption}
                </span>
              </div>
            </>
          ) : (
          <>
          {/* 미니 타임라인 — 세로 점-연결선. 최근이 맨 위(위=최신 → 아래=과거).
              i 가 곧 "최근 방문으로부터 몇 걸음 전"이라 캡션 계산이 인덱스 하나로 끝난다. */}
          <ol className="flex max-h-[280px] flex-col overflow-y-auto px-3 py-2.5">
            {recentFirstEntries.map((entry, i) => {
              const isCurrent = entry.id === currentId;
              // 맨 윗행만 "지금 여기"(현재 포커스가 있을 때) 또는 "방금 전"(빈
              // 캔버스 클릭 등으로 선택이 없을 때 — 인디고 점 없는 정직한 상태).
              const stepLabel =
                i === 0
                  ? isCurrent
                    ? labels.currentLabel
                    : labels.justNowLabel
                  : labels.stepsAgoLabel(i);
              return (
                <li
                  key={entry.id}
                  // 브러싱은 행 전체(레일 글리프 + 제목 + 걸음 캡션)를 가리키는
                  // 대상으로 삼는다 — 사용자가 읽는 단위가 행이지 버튼이 아니다.
                  onMouseEnter={() => onHoverEntry?.(entry.id)}
                  onMouseLeave={() => onHoverEntry?.(null)}
                  onFocus={() => onHoverEntry?.(entry.id)}
                  onBlur={() => onHoverEntry?.(null)}
                  className="flex items-stretch gap-2"
                >
                  {/* 좌측 레일 — 점 + 위아래 연결선 세그먼트(첫/끝 행은 반쪽만). */}
                  <span className="relative flex w-4 shrink-0 flex-col items-center">
                    <span
                      aria-hidden
                      className={`w-px flex-1 ${i === 0 ? "bg-transparent" : "bg-[color:var(--color-divider)]"}`}
                    />
                    {isCurrent ? (
                      <span
                        aria-hidden
                        data-testid="topology-trail-current-dot"
                        className="my-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--color-indigo-accent)]"
                      />
                    ) : (
                      <TopologyV2KindGlyph kind={entry.kind} size={13} className="my-0.5 shrink-0" />
                    )}
                    <span
                      aria-hidden
                      className={`w-px flex-1 ${i === recentFirstEntries.length - 1 ? "bg-transparent" : "bg-[color:var(--color-divider)]"}`}
                    />
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onFocusEntry(entry.id);
                      close(false);
                    }}
                    aria-label={labels.rowAriaLabel(entry.title)}
                    aria-current={isCurrent ? "true" : undefined}
                    data-testid="topology-trail-row"
                    className="min-w-0 flex-1 truncate rounded-chip px-1.5 py-1.5 text-left text-body text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                  >
                    {entry.title}
                  </button>
                  {/* 상대 걸음 캡션 — 버튼 **밖**에 둬야 행 aria-label 에 먹히지 않고
                      스크린 리더에도 거리가 읽힌다. 현재 행만 인디고(주의 계층 승자). */}
                  <span
                    data-testid="topology-trail-step-label"
                    className={`shrink-0 self-center font-mono text-caption tabular-nums ${
                      i === 0 && isCurrent
                        ? "text-[color:var(--color-indigo-accent)]"
                        : "text-[color:var(--color-text-quaternary)]"
                    }`}
                  >
                    {stepLabel}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="flex items-center justify-between gap-2 border-t border-[color:var(--topology-floating-panel-divider)] px-2 py-1.5">
            <CompactCopyButton
              data-testid="topology-trail-copy-packet"
              copied={copied}
              label={labels.copyLabel}
              ariaLabel={copied ? labels.copyCopiedAriaLabel : labels.copyAriaLabel}
              onClick={onCopyPacket}
              className="min-h-0 py-1"
            />
            <button
              type="button"
              onClick={onClear}
              data-testid="topology-trail-clear-footer"
              className={controlClass({
                shape: "segment",
                tone: "muted",
                className: "hover:text-[color:var(--color-text-primary)]",
              })}
            >
              {labels.clearLabel}
            </button>
          </div>
          </>
          )}
      </Surface>
    </div>
  );
}
