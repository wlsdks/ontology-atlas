'use client';

import type { FirstWordsChip } from '@/features/vault-agent';

/**
 * 빈 대화의 **첫 마디** — 이 폴더의 실제 상태에서 뽑은 문장 최대 3개.
 *
 * ## 두 얼굴, 한 문장
 *
 * 키가 있으면 누를 수 있는 칩이고, 키·폴더가 없으면 **평문 목록**이다.
 * 완결할 수 없는 순간에 버튼을 그리면 누르는 사람이 생기고 그게 곧 함정이라
 * (`AgentLockedState` 가 같은 이유로 컨트롤을 하나로 줄였다), 여기서는 같은
 * 문장을 두 가지로만 그린다. 문장 자체는 `buildFirstWords` 한 곳이 만든다.
 *
 * ## 치수 규칙성
 *
 * 칩 하나의 높이는 **글자 수로 정해지지 않는다** — 두 줄 자리를 잡고 넘치면
 * 자른다. 문장 길이가 행 높이를 정하게 두면 세 칩이 삐뚤빼뚤해지고, 그건
 * 이 목록이 "한 벌" 로 읽히는 것을 깬다. 대신 칩 **개수**는 폴더 상태를
 * 정직하게 따른다: 지목할 개념이 없는데 빈 상자를 예약하면 아무것도 아닌
 * 자리가 컨트롤처럼 보인다.
 *
 * ## 모션
 *
 * 칩은 눌러도 사라지지 않는다(상태 없는 컨트롤 — 다시 누르면 다시 프리필).
 * 그래서 여기에는 전이가 없다. 등장은 패널의 상태 교체
 * (`.agent-panel-stage-swap`)가 이미 한 프레임에 함께 데려온다.
 */
export function AgentFirstWords({
  chips,
  title,
  hint,
  onPrefill,
}: {
  chips: readonly FirstWordsChip[];
  title: string;
  /** 칩을 누르면 무엇이 일어나는지 — 누를 수 있을 때만 준다. */
  hint?: string;
  /** 없으면 평문 목록. 있으면 칩 버튼. */
  onPrefill?: (text: string) => void;
}) {
  if (chips.length === 0) return null;

  const interactive = typeof onPrefill === 'function';

  return (
    <section
      aria-label={title}
      data-testid="agent-first-words"
      data-interactive={interactive ? 'true' : 'false'}
      className="flex flex-col gap-1.5"
    >
      <p className="text-label tracking-label text-[color:var(--color-text-quaternary)]">
        {title}
      </p>
      <ul className="flex list-none flex-col gap-1.5">
        {chips.map((chip) => (
          <li key={chip.id} className="min-w-0">
            {interactive ? (
              <button
                type="button"
                data-testid="agent-first-words-chip"
                data-first-words-slot={chip.slot}
                data-first-words-intent={chip.intent.kind}
                onClick={() => onPrefill?.(chip.text)}
                className="flex min-h-11 w-full items-center rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2.5 py-2 text-left text-caption leading-caption text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-accent)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]"
              >
                {/* 두 줄까지. 넘치는 문장이 칩의 키를 정하게 두지 않는다. */}
                <span className="line-clamp-2 [word-break:keep-all]">{chip.text}</span>
              </button>
            ) : (
              <p
                data-testid="agent-first-words-line"
                data-first-words-slot={chip.slot}
                data-first-words-intent={chip.intent.kind}
                className="line-clamp-2 text-caption leading-caption text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
              >
                {chip.text}
              </p>
            )}
          </li>
        ))}
      </ul>
      {interactive && hint ? (
        <p className="text-label tracking-label text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
          {hint}
        </p>
      ) : null}
    </section>
  );
}
