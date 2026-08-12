"use client";

import { useEffect, useRef } from "react";
import { controlClass } from "@/shared/ui";
import { EntryChoiceCard } from "@/shared/ui/entry-choice-card";
import { PAGE_COLUMN_STAGE } from "@/shared/ui/page-frame";

/**
 * 공방 진입 선택 모먼트 (#1, 2026-07-25) — `/ontology/studio` 를 딥링크
 * (`?node=`/`?mode=`/`?from=`/`?edit=`) 없이 열면, 예전엔 곧장 강화(enhance)로
 * 떨어져 "지금 뭘 하는 화면인지" 가 모호했다(소유자 보고). 대신 가운데 두 개의
 * 큰 카드로 의도를 먼저 고른다: 기존 노드 강화 vs 새 노드 만들기.
 *
 * 헌장 준수 — 무채색 + 단일 인디고, glow/gradient/particle 없음. 일러스트는
 * 이미지가 아니라 라인아트 인라인 SVG(kind 글리프 모티프). 등장은
 * .studio-stage-in(opacity + 8px 상승) 스태거, reduced-motion 은 전역 규칙이
 * 즉시 등장으로 무력화. 딥링크 진입은 이 표면을 아예 건너뛴다(호출부 게이트).
 */
export interface StudioEntryChoiceLabels {
  title: string;
  enhanceTitle: string;
  enhanceDesc: string;
  /** 추천 시작 노드 이름 미리보기 — 노드가 없으면 호출부가 null 을 준다. */
  enhanceRecommend: string | null;
  createTitle: string;
  createDesc: string;
  /** 실습 진입 한 줄 — 두 카드 아래 평문 링크. */
  practice: string;
  exit: string;
  dialogAria: string;
}

export function StudioEntryChoice({
  labels,
  onEnhance,
  onCreate,
  onPractice,
  onExit,
}: {
  labels: StudioEntryChoiceLabels;
  onEnhance: () => void;
  onCreate: () => void;
  /**
   * 실습 시작 — 세 번째 **카드**가 아니라 한 줄이다. 카드로 만들면 세 갈래가
   * 대등해 보여서 "매번 셋 중 고르는 화면" 이 되는데, 실습은 평생 한 번 쓰는
   * 문이다. 격자의 리듬(2열)도 지킨다.
   */
  onPractice: () => void;
  onExit: () => void;
}) {
  const enhanceRef = useRef<HTMLButtonElement | null>(null);

  // 첫 카드로 포커스 착지 + Esc = 그만하기(지도로).
  useEffect(() => {
    enhanceRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  return (
    <main
      id="main"
      tabIndex={-1}
      data-testid="studio-entry-choice"
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialogAria}
      className="relative flex h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[color:var(--color-canvas)] px-6"
    >
      <div
        className="studio-stage-in flex flex-col items-center"
        style={{ ["--studio-stagger" as string]: "0ms" }}
      >
        {/*
         * 제목은 **대화상자 제목 관례**를 따른다 (2026-08-08 위계 판정).
         *
         * 종전엔 14px 칸(`--text-body-lg`) + `--color-text-secondary` 라, 아래
         * 입구 카드 라벨(같은 14px + `--color-text-primary`)에게 크기는 **동률**
         * 이고 색은 **졌다** — 제목이 본문 급인 것이 결함이다(원장 2026-08-08 (3) ①).
         *
         * 새 값은 발명하지 않았다: 이 앱에서 대화상자·패널 제목이 쓰는 칸을
         * 실측해 그대로 쓴다 — 16px 칸(`--text-title`; `DocsVaultAuditModal` 모달
         * 제목 · `TopologyEmptyState` · `VaultStartChecklist` · `EmptyState`
         * 프리미티브 기본값이 쓰는 칸)에 잉크는 `--color-text-primary`(설정 시트 ·
         * `VaultOpenGuideSheet` · `NewDocKindDialog` · `GuidedTourCard` 가 전부
         * 이것). 관례의 요점은 절대 크기가 아니라 **그 표면의 본문보다 한 단
         * 위**라는 것이다: 설정 시트는 12.5px 행 위의 14px 제목이고, 여기 본문은
         * 카드 라벨 14px 이므로 16px 이 된다. 행간은 램프가 짝
         * (`--leading-title` 24px)을 같이 싣는다.
         */}
        <h1 className="text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
          {labels.title}
        </h1>
      </div>

      {/* 이 640 은 규격의 「무대 칸」이다 — 스킬 빈 상태가 같은 값을 쓰게 되면서
          한 곳으로 모았다(`PAGE_COLUMN_STAGE`). `mx-auto` 는 이 부모가 이미
          `items-center` 로 세우므로 중복이지만 무해하고, 값의 출처가 하나인 것이
          더 중요하다. */}
      <div className={`${PAGE_COLUMN_STAGE} mt-7 grid gap-4 sm:grid-cols-2`}>
        <EntryChoiceCard
          ref={enhanceRef}
          className="studio-stage-in"
          style={{ ["--studio-stagger" as string]: "40ms" }}
          testId="studio-entry-enhance"
          onClick={onEnhance}
          title={labels.enhanceTitle}
          desc={labels.enhanceDesc}
          footnote={labels.enhanceRecommend}
          illustration={<EnhanceGlyph />}
        />
        <EntryChoiceCard
          className="studio-stage-in"
          style={{ ["--studio-stagger" as string]: "80ms" }}
          testId="studio-entry-create"
          onClick={onCreate}
          title={labels.createTitle}
          desc={labels.createDesc}
          footnote={null}
          illustration={<CreateGlyph />}
        />
      </div>

      <button
        type="button"
        data-testid="studio-entry-practice"
        onClick={onPractice}
        className={controlClass({
          shape: "link",
          size: "sm",
          className:
            "touch-hit-expand studio-stage-in mt-5 underline underline-offset-4 hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]",
        })}
        style={{ ["--studio-stagger" as string]: "120ms" }}
      >
        {labels.practice}
      </button>

      <button
        type="button"
        data-testid="studio-entry-exit"
        onClick={onExit}
        className={controlClass({
          shape: "link",
          tone: "muted",
          className:
            "studio-stage-in mt-3 hover:text-[color:var(--color-text-secondary)]",
        })}
        style={{ ["--studio-stagger" as string]: "160ms" }}
      >
        {labels.exit}
      </button>
    </main>
  );
}

/*
 * EntryCard 는 `@/shared/ui/entry-choice-card` 로 승격됐다(2026-08-13) —
 * 스킬 빈 화면이 같은 문법을 골라 두 번째 소비처가 생겼기 때문이다. 등장
 * 모션(studio-stage-in + 스태거)은 이 화면의 계약이라 여기서 className 으로 준다.
 */

/** 라인아트 — 강화: 헥사곤 아이템 + 방위 소켓(공방 나침 모티프). */
function EnhanceGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4.5 18 8v8l-6 3.5L6 16V8l6-3.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M12 4.5V2M18 8l2-1M18 16l2 1M6 16l-2 1M6 8 4 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

/** 라인아트 — 생성: 빈 노드 + 조립되는 관계(＋). */
function CreateGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4.5" y="4.5" width="15" height="15" rx="4" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 2.6" />
      <path d="M12 8.5v7M8.5 12h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
