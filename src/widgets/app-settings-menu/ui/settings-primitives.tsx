import { type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { SegmentedControl } from '@/shared/ui/segmented-control';

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
  'justify-self-start border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

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

/**
 * 설정 시트의 **절 이름** 한 벌 — 루트 시트의 그룹 헤더와 드릴인의 절 헤더가 같은 것.
 *
 * ⚠️ **셋이 따로 자랐고, 그중 하나만 한 단 작았다** (2026-08-09, 소유자 지적 2차).
 * 루트 시트의 `SettingsGroup` 은 `text-label`(11), `AiConnectionPanel` 의
 * `SupportingSection` 도 `text-label`, 그런데 `VaultAgentSetupPanel` 의
 * `SectionLabel` 만 **`text-caption`(9.5)** 이었다. 네 자리(연결 파일 상태 ·
 * 에이전트가 이 폴더를 쓰는 방식 · 확인 · 연결)가 전부 그것이라, 그 절들만
 * 이름이 내용보다 작았다.
 *
 * **「아이브로우는 9.5px 이어도 된다」는 내 면제가 틀렸다.** 근거로 든 것은 램프의
 * 정의("마이크로 라벨")와 `uppercase` 였는데, **한글에는 `uppercase` 가 아무 일도
 * 하지 않는다** — 대문자 마이크로 라벨이라는 타이포 장치 자체가 성립하지 않고
 * 남는 건 그냥 9.5px 흐린 글자다. 게다가 루트 시트가 같은 역할에 이미 11px 을
 * 쓰고 있었으니, 면제는 **아무도 쓰지 않는 규격**이었다.
 *
 * 그래서 값을 여기 한 곳에 두고 소비처가 가리킨다 — 사본이 셋이면 어긋나는 쪽이
 * 기본값이다(Carbon).
 */
export const SETTINGS_SECTION_LABEL =
  'font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]';

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
        <h3 className={`px-1 ${SETTINGS_SECTION_LABEL}`}>{label}</h3>
      ) : null}
      <div className={`${label ? 'mt-1.5 ' : ''}divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]`}>
        {children}
      </div>
    </section>
  );
}

/**
 * 번들된 마크 경로만 통과시킨다. 이 값은 CSS `url()` 안으로 들어가므로,
 * 따옴표가 섞이면 거기서 스타일을 지어낼 수 있다. 지금 오는 값은 우리 빌드
 * 스크립트가 만든 `/acp-icons/<id>.svg` 뿐이라 **모양으로 잠그는 것이 공짜**다 —
 * 나중에 이 자리에 다른 출처가 붙어도 구멍이 열리지 않는다.
 */
const BUNDLED_MARK = /^\/acp-icons\/[a-z0-9-]+\.svg$/;

/**
 * 남의 제품 마크 한 장.
 *
 * ## 왜 `<img>` 가 아닌가 (2026-08-16, 소유자 지적으로 발견)
 *
 * 레지스트리 아이콘 38개는 **전부 `fill="currentColor"`** 다(등록 규칙이 색
 * 박은 SVG 를 거부한다). 그걸 `<img>` 로 그리면 그 지시가 닿을 글자색이 없어서
 * 초기값인 **검정**이 되고, 어두운 판 위에서 검은 판에 검은 그림이 된다.
 * 화면에는 아이콘이 있는데 안 보였고, 코드에는 아무 잘못도 안 보였다.
 *
 * 그래서 그림을 **마스크**로 쓰고 색은 우리가 칠한다 — 벤더가 브랜드 색을
 * 공표한 것은 그 색으로, 아닌 것은 무채색으로. 덤으로 SVG 안의 내용이 화면에
 * 그려지지 않으므로 남의 파일이 우리 화면에서 할 수 있는 일이 없어진다.
 *
 * ## 왜 판이 밝은가
 *
 * 이 앱은 어두운 화면 하나지만, 여기 놓이는 것은 우리 것이 아니라 그 벤더의
 * 것이고 대부분 밝은 바탕 기준으로 그려져 있다(색을 확인한 11개 중 6개가
 * 검정~#2D2D2D). 참고 제품(Buzz)도 어두운 마크에는 흰 판을 따로 깔아 준다.
 */
function VendorMark({ src, ink }: { src: string | null; ink: string | null }) {
  const safe = src && BUNDLED_MARK.test(src) ? src : null;
  return (
    <span
      data-vendor-mark={safe ? 'true' : 'empty'}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-chip border',
        safe
          ? 'border-[color:var(--color-vendor-plate-edge)] bg-[color:var(--color-vendor-plate)]'
          : // 그림이 없으면 판도 깔지 않는다 — 빈 흰 네모가 이름보다 눈에 띈다.
            'border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]',
      )}
    >
      {safe ? (
        <span
          aria-hidden
          data-vendor-mark-ink={ink ? 'brand' : 'neutral'}
          className="size-5"
          style={{
            backgroundColor: ink ?? 'var(--color-vendor-mark-ink)',
            maskImage: `url("${safe}")`,
            WebkitMaskImage: `url("${safe}")`,
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskPosition: 'center',
            maskSize: 'contain',
            WebkitMaskSize: 'contain',
          }}
        />
      ) : null}
    </span>
  );
}

/** 한 행 = 라벨(+필요시 1줄 설명) 좌측, 현재값+조작 우측. */
export function SettingsRow({
  label,
  caption,
  captionTone = 'neutral',
  control,
  testId,
  icon,
  iconInk,
}: {
  label: string;
  caption?: string;
  captionTone?: 'neutral' | 'warning' | 'danger';
  control: ReactNode;
  testId?: string;
  /**
   * 행 왼쪽의 그림 — **번들된 이미지 경로**만 받는다(2026-08-16, 실행기 목록).
   *
   * 목록이 길고 항목이 서로 다른 **제품**일 때, 이름만으로는 훑기가 안 된다.
   * 그 제품의 마크가 있으면 눈이 이름을 읽기 전에 먼저 찾는다. 자리를 항상
   * 잡아 두는 이유는 아이콘이 없는 줄에서 글자가 왼쪽으로 밀리면 목록이
   * 들쭉날쭉해지기 때문이다.
   */
  icon?: string | null;
  /**
   * 그 마크를 칠할 브랜드 색. 없으면 무채색으로 그린다 — 확인 안 된 브랜드에
   * 색을 지어 붙이지 않는다.
   */
  iconInk?: string | null;
}) {
  /*
   * **마크가 있는 행은 자연히 커진다** — 키를 고르는 축을 새로 만들지 않는다.
   *
   * 제품 마크가 붙는 행은 「설정 값 한 줄」이 아니라 「그 제품 한 줄」이다.
   * 마크를 12px 짜리로 우겨 넣으면 알아볼 수 없어서 훑기 채널이 안 되고,
   * 32px 마크를 48px 행에 넣으면 위아래가 숨이 막힌다. 그래서 높이는 취향이
   * 아니라 **내용이 정한다**: 마크가 있으면 64px, 없으면 종전 48px.
   *
   * 참고 제품(Buzz)의 같은 목록을 실측하면 행 65px · 마크 36px 이다. 그쪽이
   * 「예뻐」 보이는 이유는 색이나 장식이 아니라 이 두 값이었다.
   */
  const hasMarkSlot = icon !== undefined;
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-3',
        hasMarkSlot ? 'min-h-16 py-2.5' : 'min-h-12 py-2',
      )}
      data-testid={testId}
    >
      {hasMarkSlot ? <VendorMark src={icon ?? null} ink={iconInk ?? null} /> : null}
      <div className="min-w-0 flex-1">
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
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[color:var(--color-indigo-accent)]"
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
 * **2026-08-15 — 껍데기만 남았다.** 실체는 `SegmentedControl variant="chips"`
 * 다(`SegmentSwitch` 와 같은 운명). 종전엔 `role="radiogroup"` 을 손으로 걸고
 * **roving tabindex 도 화살표 이동도 없었다** — role 이 보조기술에게 약속만
 * 하고 아무 일도 안 일어났고, 그건 프리미티브 창립 전수가 결함으로 지목한 바로
 * 그 문장이다. 이 어댑터가 진 것은 설정 시트의 **행 문법**(`w-28` 라벨 + 행
 * 인셋)뿐이고, 그건 설정 밖 소비가 0이라 승격 대상이 아니다(2026-08-15 (2) 의
 * `Switch` 반려 기준 그대로). **승격된 단위는 컴포넌트가 아니라 그릇이다.**
 *
 * 이주는 **픽셀 0** 이다 — 손 오버라이드 `h-8 px-3 text-body` 가 값 층
 * `chip lg`(`min-h-8 px-3 py-1 text-body`)와 기하 동등이다. 움직인 것은 선택
 * 표현 색 하나뿐이고, 그것도 손 조합(`indigo-accent` 보더 + `indigo-line-a13`)
 * 에서 램프 active 로 **수렴**한 것이다.
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
      <SegmentedControl
        ariaLabel={label}
        variant="chips"
        value={value}
        onChange={onChange}
        options={options.map((option) => ({
          value: option.value,
          label: option.label,
          testId: optionTestId?.(option.value),
        }))}
        testId={testId}
      />
    </div>
  );
}

/** 2-세그먼트 토글 — LocaleSwitch 와 같은 표면 문법(구 설정 기어에서 승계). */
/**
 * 2026-08-15 — 껍데기만 남았다. 실체는 `SegmentedControl`(shared/ui) 이다:
 * aria-pressed 병렬 걸기(배타성이 접근성 트리에 안 실림) · roving 없는 그룹 ·
 * 손 조합 선택 표현(bg-panel — 잉크 대비 1.17:1 착시) 전부 프리미티브의
 * radiogroup + roving + 값 층 active 로 대체됐다. 이 어댑터는 설정 시트의
 * boolean 시그니처를 보존할 뿐이다.
 */
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
    <SegmentedControl
      ariaLabel={ariaLabel}
      value={value}
      onChange={onChange}
      options={options}
      testId={testId}
    />
  );
}
