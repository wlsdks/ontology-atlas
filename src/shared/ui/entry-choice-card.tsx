"use client";

import { controlClass } from "@/shared/ui/control-class";

/**
 * **입구 카드** — 빈 무대가 내미는 갈림길 한 장.
 *
 * 스튜디오 입구(`StudioEntryChoice`)가 혼자 쓰던 문법이었는데, 스킬 빈 화면이
 * 같은 구조를 골랐다(2026-08-13 소유자: 스킬 무대 갈래 중 *"B로 가자"* — 그
 * 갈래의 근거가 「스튜디오 입구가 스킬 무대와 다른 점은 딱 셋: 48px 아이콘 ·
 * 갈림길 2장 · 글의 양」이었다). 두 번째 소비처가 생기는 순간이 이름을 붙일
 * 때라는 이 저장소의 규율대로 여기로 올렸다 — 사본이 둘이면 어긋나는 쪽이
 * 기본값이 된다.
 *
 * 값은 전부 기존 것: `controlClass({shape:"card",size:"lg"})` + panel 라운드 +
 * 48px(h-12) 글리프 타일. 등장 모션은 **소비처가 className 으로 준다**
 * (스튜디오는 `studio-stage-in` + 스태거 변수를 쓰고, 억제 계약도 그 화면의
 * 것이다 — 여기 박으면 다른 소비처가 남의 계약을 상속한다).
 */
export const EntryChoiceCard = ({
  ref,
  testId,
  onClick,
  title,
  desc,
  footnote,
  className,
  style,
  illustration,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  testId: string;
  onClick: () => void;
  title: string;
  desc: string;
  footnote: string | null;
  className?: string;
  style?: React.CSSProperties;
  illustration: React.ReactNode;
}) => (
  <button
    ref={ref}
    type="button"
    data-testid={testId}
    onClick={onClick}
    style={style}
    /* 2026-08-04 체계석 판정 — 이 카드는 인플로우 콘텐츠라 시트 단이 아니라
     * panel(12) 라운드다(스튜디오 입구에서 확정된 그 판정을 그대로 상속). */
    className={controlClass({
      shape: "card",
      size: "lg",
      className: `group flex-col items-start gap-3 rounded-panel bg-[color:var(--color-elevated)] px-5 py-6 text-left hover:border-[color:var(--color-indigo-a46)] hover:bg-[color:var(--color-indigo-a06)] ${className ?? ""}`,
    })}
  >
    <span className="grid h-12 w-12 place-items-center rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-tertiary)] transition-colors group-hover:border-[color:var(--color-indigo-a46)] group-hover:text-[color:var(--color-indigo-text-soft)]">
      {illustration}
    </span>
    <span className="flex flex-col gap-1">
      <span className="text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
        {title}
      </span>
      <span className="text-label leading-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
        {desc}
      </span>
    </span>
    {footnote ? (
      <span
        data-testid={`${testId}-recommend`}
        className="mt-auto inline-flex max-w-full items-center gap-1.5 truncate rounded-chip bg-[color:var(--color-overlay-1)] px-2 py-1 text-label text-[color:var(--color-text-secondary)]"
      >
        <span aria-hidden className="h-1 w-1 flex-none rounded-full bg-[color:var(--color-indigo-brand)]" />
        <span className="truncate">{footnote}</span>
      </span>
    ) : null}
  </button>
);
