"use client";

import { useEffect, useRef } from "react";

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
  exit: string;
  dialogAria: string;
}

export function StudioEntryChoice({
  labels,
  onEnhance,
  onCreate,
  onExit,
}: {
  labels: StudioEntryChoiceLabels;
  onEnhance: () => void;
  onCreate: () => void;
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
        <h1 className="text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] [word-break:keep-all]">
          {labels.title}
        </h1>
      </div>

      <div className="mt-7 grid w-full max-w-[640px] gap-4 sm:grid-cols-2">
        <EntryCard
          ref={enhanceRef}
          testId="studio-entry-enhance"
          onClick={onEnhance}
          title={labels.enhanceTitle}
          desc={labels.enhanceDesc}
          footnote={labels.enhanceRecommend}
          staggerMs={40}
          illustration={<EnhanceGlyph />}
        />
        <EntryCard
          testId="studio-entry-create"
          onClick={onCreate}
          title={labels.createTitle}
          desc={labels.createDesc}
          footnote={null}
          staggerMs={80}
          illustration={<CreateGlyph />}
        />
      </div>

      <button
        type="button"
        data-testid="studio-entry-exit"
        onClick={onExit}
        className="studio-stage-in mt-6 rounded-lg px-3 py-1.5 text-label text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
        style={{ ["--studio-stagger" as string]: "120ms" }}
      >
        {labels.exit}
      </button>
    </main>
  );
}

const EntryCard = ({
  ref,
  testId,
  onClick,
  title,
  desc,
  footnote,
  staggerMs,
  illustration,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  testId: string;
  onClick: () => void;
  title: string;
  desc: string;
  footnote: string | null;
  staggerMs: number;
  illustration: React.ReactNode;
}) => (
  <button
    ref={ref}
    type="button"
    data-testid={testId}
    onClick={onClick}
    style={{ ["--studio-stagger" as string]: `${staggerMs}ms` }}
    className="studio-stage-in group flex flex-col items-start gap-3 rounded-[16px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-5 py-6 text-left transition-colors hover:border-[color:var(--color-indigo-a46)] hover:bg-[color:var(--color-indigo-a06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
  >
    <span className="grid h-12 w-12 place-items-center rounded-[12px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-tertiary)] transition-colors group-hover:border-[color:var(--color-indigo-a46)] group-hover:text-[color:var(--color-indigo-text-soft)]">
      {illustration}
    </span>
    <span className="flex flex-col gap-1">
      <span className="text-body-lg font-medium text-[color:var(--color-text-primary)] [word-break:keep-all]">
        {title}
      </span>
      <span className="text-caption leading-[1.5] text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
        {desc}
      </span>
    </span>
    {footnote ? (
      <span
        data-testid={`${testId}-recommend`}
        className="mt-auto inline-flex max-w-full items-center gap-1.5 truncate rounded-[6px] bg-[color:var(--color-overlay-1)] px-2 py-1 text-label text-[color:var(--color-text-secondary)]"
      >
        <span aria-hidden className="h-1 w-1 flex-none rounded-full bg-[color:var(--color-indigo-brand)]" />
        <span className="truncate">{footnote}</span>
      </span>
    ) : null}
  </button>
);

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
