import { type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * 설정 시트의 원시 요소 셋 — 그룹 · 행 · 2세그먼트 토글.
 *
 * `AppSettingsMenu` 안에 사적으로 살았는데, 절이 늘면서 두 번째 소비처
 * (`AgentActivitySettings`)가 생겼다. 사본을 만들면 그 순간부터 두 설정 칸이
 * 다른 높이·다른 캡션 색으로 자란다 — 규격이 두 곳에 적히면 이미 드리프트가
 * 시작된 것이다(Carbon). 그래서 한 파일로 내린다.
 */

/** 그룹 헤더 + 행 컨테이너 — Toss 식 "그룹 헤더 + 즉시 조작 행" 문법의 뼈대. */
/**
 * 한 무리의 설정 행. `label` 은 **선택**이다 — LNB 가 이미 그 칸의 이름을 말하는
 * 자리에서는 제목을 다시 쓰지 않는다(같은 단어가 왼쪽과 오른쪽에 나란히 서면
 * 둘 중 하나는 잉크 낭비다). 한 칸에 무리가 둘 이상일 때만 이름을 준다.
 */
export function SettingsGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section aria-label={label}>
      {label ? (
        <h3 className="px-1 font-mono text-label uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {label}
        </h3>
      ) : null}
      <div className={`${label ? 'mt-1.5 ' : ''}divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]`}>
        {children}
      </div>
    </section>
  );
}

/** 한 행 = 라벨(+필요시 1줄 설명) 좌측, 현재값+조작 우측. */
export function SettingsRow({
  label,
  caption,
  captionTone = 'neutral',
  control,
  testId,
}: {
  label: string;
  caption?: string;
  captionTone?: 'neutral' | 'warning' | 'danger';
  control: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="flex min-h-12 items-center justify-between gap-3 px-3 py-2"
      data-testid={testId}
    >
      <div className="min-w-0">
        <p className="text-body text-[color:var(--color-text-secondary)]">{label}</p>
        {caption ? (
          <p
            className={cn(
              'mt-0.5 break-keep text-label leading-4',
              captionTone === 'danger'
                ? 'text-[color:var(--color-status-danger)]'
                : captionTone === 'warning'
                  ? 'text-[color:var(--color-status-warning)]'
                  : 'text-[color:var(--color-text-quaternary)]',
            )}
          >
            {caption}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{control}</div>
    </div>
  );
}

/** 2-세그먼트 토글 — LocaleSwitch 와 같은 표면 문법(구 설정 기어에서 승계). */
export function SegmentSwitch({
  ariaLabel,
  value,
  options,
  onChange,
  testId,
}: {
  ariaLabel: string;
  value: boolean;
  options: ReadonlyArray<{ value: boolean; label: string }>;
  onChange: (next: boolean) => void;
  testId?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-testid={testId}
      className="inline-flex items-center gap-px rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-px text-body"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'flex h-8 items-center justify-center rounded-chip px-2 font-medium transition-colors',
              active
                ? 'bg-[color:var(--color-panel)] text-[color:var(--color-text-primary)]'
                : 'text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
