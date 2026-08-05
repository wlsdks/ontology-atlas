import { type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * 설정 시트의 원시 요소 셋 — 그룹 · 행 · 값 슬라이더 · 라디오 칩 · 2세그먼트 토글.
 *
 * `AppSettingsMenu` 안에 사적으로 살았는데, 절이 늘면서 두 번째 소비처
 * (`AgentActivitySettings`)가 생겼다. 사본을 만들면 그 순간부터 두 설정 칸이
 * 다른 높이·다른 캡션 색으로 자란다 — 규격이 두 곳에 적히면 이미 드리프트가
 * 시작된 것이다(Carbon). 그래서 한 파일로 내린다.
 *
 * ## 이 시트의 타입 방언은 하나다 (2026-08-02 실측)
 *
 * 한동안 둘이었다. 절별 폰트 센서스가 그것을 그대로 보여줬다 —
 * 화면 `12.5×10 · 11×5`, 작업 공간 `12.5×5 · 11×1` 인데
 * **확장 `9.5×10 · 11×4` (12.5 가 0개)**, 발자국 `9.5×1 · 11×4`.
 * 같은 시트 안에서 같은 종류의 내용(라벨 + 컨트롤 + 한 줄 설명)이 절에 따라
 * **램프 한 단 아래**로 그려지고 있었다.
 *
 * 아무도 그렇게 정하지 않았다. `Slider`/`Choice` 는 `FootprintSettings` 의
 * **접힌 세부** 안에서 태어나 그 자리의 작은 치수를 갖고 있었고, 공용
 * 프리미티브로 승격되며 `ExpandSettings` 의 **주 결정 컨트롤**이 될 때 그
 * 치수를 그대로 데려왔다. 소유자가 본 것이 이것이다(*"이 버튼도 너무 작고?
 * 뭔가 설정 자체가 좀 작아"*).
 *
 * 그래서 방언을 하나로 접는다. 이 시트의 규격:
 *
 * | 무엇 | 스텝 |
 * |---|---|
 * | 행·컨트롤 라벨, 누르는 글자 | `text-body` (12.5px) |
 * | 한 줄 설명·보조 캡션·수치 읽기 | `text-label` (11px) |
 * | `text-caption` (9.5px) | **쓰지 않는다** |
 *
 * 9.5px 을 뺀 이유는 크기 취향이 아니라 램프의 정의다 — `--text-caption` 은
 * "마이크로 라벨·범례·타임스탬프" 의 단이다. 라디오 버튼의 이름은 그 셋 중
 * 무엇도 아니다. 게이트: `settings-sheet-type-dialect.contract.test.ts`.
 */

/**
 * 「자세히」 토글의 잉크 — `FootprintSettings` 와 `ExpandSettings` 가 **같은
 * 컨트롤을 두 벌** 갖고 있었다(문자열 바이트 동일). 사본이 둘이면 한쪽만
 * 고쳐지는 날이 온다 — 이 파일이 존재하는 바로 그 이유라 여기로 내린다.
 * 모양·크기·톤은 값 층(`Chip size="lg" tone="secondary"`)이 내고, 여기 남는
 * 것은 램프가 안 내는 층(테두리색 · 호버 · 포커스 · 그리드 자리잡기)뿐이다.
 */
export const DETAIL_TOGGLE_CHIP =
  'justify-self-start border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]';

/**
 * 「초기화」 — 글자만으로 눌리는 것 = `link`(실측 85). 같은 두 파일이 역시
 * 두 벌 갖고 있었다.
 *
 * **`size: 'md'` 인 이유**는 이 시트의 방언이다. `link/sm` 은 `text-caption`
 * (9.5px)이고 위 표가 그것을 루트 시트에서 금지한다 — 히트 영역을 고치자고
 * 타입 방언을 되돌리지 않는다.
 *
 * 히트 영역은 값 층이 2026-08-03 에 `min-h-11` 을 갖게 되며 24 → 44px 로
 * 올라간다(WCAG 2.5.8). 글자 크기는 그대로다. 종전의 `px-1 py-1` 은 그 24px
 * 상자를 만들던 값이라 함께 사라진다.
 *
 * **호출은 자리마다 인라인이다** — 완성 문자열을 상수로 뽑아 `className={RESET_LINK}`
 * 로 쓰면 채택 래칫이 그것을 손으로 쓴 컨트롤로 센다. 래칫은 여는 태그 안의
 * 리터럴 `controlClass(` 만 보기 때문이다(상수·헬퍼 함수는 못 본다). 그래서
 * 여기서는 **잉크만** 공유하고 램프 호출은 소비처가 쓴다.
 */
export const RESET_LINK_INK = 'justify-self-start hover:text-[color:var(--color-text-primary)]';

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
        <h3 className="px-1 font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          {label}
        </h3>
      ) : null}
      <div className={`${label ? 'mt-1.5 ' : ''}divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]`}>
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
              'mt-0.5 break-keep text-label leading-label',
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

/**
 * 값 슬라이더 — 라벨 · 트랙 · 현재값 한 줄.
 *
 * 트랙을 직접 칠한다. `accent-color` 만 쓰면 **채워지지 않은 쪽이 브라우저 기본
 * 밝은 회색**이라, 다크 패널 위에서 슬라이더가 라벨보다 밝아진다(소유자:
 * *"너무 못생겼잖아"*). 채운 만큼만 인디고, 나머지는 표면 토큰.
 *
 * `FootprintSettings` 안에 사적으로 살다가 두 번째 소비처(`ExpandSettings`)가
 * 생겨 여기로 내려왔다 — 사본을 만들면 두 설정 칸이 다른 트랙 색으로 자란다.
 */
export function Slider({
  label,
  value,
  range,
  format,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  range: { min: number; max: number; step: number };
  format: (v: number) => string;
  onChange: (v: number) => void;
  testId: string;
}) {
  const filled = ((value - range.min) / (range.max - range.min)) * 100;
  return (
    <label className="flex min-h-11 items-center gap-3 px-1 py-2">
      <span className="w-28 shrink-0 text-body text-[color:var(--color-text-secondary)]">{label}</span>
      <input
        type="range"
        data-testid={testId}
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, var(--color-indigo-accent) ${filled}%, var(--color-overlay-3) ${filled}%)`,
        }}
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[color:var(--color-indigo-accent)]"
      />
      <span className="w-12 shrink-0 text-right font-mono text-label text-[color:var(--color-text-tertiary)]">
        {format(value)}
      </span>
    </label>
  );
}

/**
 * 값 몇 개 중 하나 고르기 — 라디오 칩 한 줄. `Slider` 와 같은 행 문법.
 *
 * 칩의 높이(32px)와 글자(12.5px)는 이 시트의 다른 주 컨트롤인 `SegmentSwitch`
 * 와 **같은 값**이다 — 둘 다 "값 하나 고르기" 라서 다를 이유가 없다. 종전엔
 * 24px / 9.5px 이라 자기 라벨(11px)보다 작았다: 누르는 것이 화면에서 가장
 * 작은 글자였다(위계 역전). 24px 은 WCAG 2.5.8(AA) 최소 타깃 24×24 에 여유
 * 0으로 걸쳐 있기도 했고, 「고리」·「기둥」은 폭 38.4px 이었다.
 */
export function Choice<T extends string | boolean>({
  label,
  value,
  options,
  onChange,
  testId,
  optionTestId,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  testId: string;
  /** 항목별 testId — 어느 값이 골라졌는지 계약 테스트가 재야 하는 자리에서 쓴다. */
  optionTestId?: (value: T) => string;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3 px-1 py-2">
      <span className="w-28 shrink-0 text-body text-[color:var(--color-text-secondary)]">{label}</span>
      <div role="radiogroup" aria-label={label} data-testid={testId} className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={optionTestId?.(option.value)}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex h-8 items-center rounded-chip border px-3 text-body transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]',
                active
                  ? 'border-[color:var(--color-indigo-accent)] bg-[color:var(--color-indigo-line-a13)] text-[color:var(--color-indigo-text-soft)]'
                  : 'border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-border-strong)]',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
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
      className="inline-flex items-center gap-px rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-px text-body"
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
              'flex h-8 items-center justify-center rounded-chip px-2 font-[var(--font-weight-signature)] transition-colors',
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
