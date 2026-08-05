import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import boundaries from 'eslint-plugin-boundaries';

// FSD 레이어 경계를 lint 단계에서 강제. boundaries v6 (2026~)의 공식
// `boundaries/dependencies` + object-form selectors로 작성.
//   문서: https://www.jsboundaries.dev/docs/rules/dependencies/

// ── 디자인 헌장 §11 (기존): scale hover · 보라핑크 그라디언트 금지 ──────
// 아래 셀렉터 배열은 여러 config object 에서 재사용된다. flat config 는 같은
// rule 을 여러 번 선언하면 마지막이 "덮어쓰기"(배열 병합 아님)라, size 램프
// 룰을 추가하는 config 도 이 셀렉터를 함께 실어야 scale/gradient 가드가 그
// 파일에서 유실되지 않는다.
const scaleGradientSelectors = [
  {
    selector: "Literal[value=/(^|\\s)(hover|active|focus|group-hover):scale-/]",
    message: '디자인 헌장 §11 — scale hover 금지. bg/border 변경 또는 색 alpha 로 대체.',
  },
  {
    selector:
      "TemplateElement[value.raw=/(^|\\s)(hover|active|focus|group-hover):scale-/]",
    message: '디자인 헌장 §11 — scale hover 금지 (template literal). bg/border 변경으로 대체.',
  },
  {
    selector: "Literal[value=/from-(purple|fuchsia|pink)-\\d+.*to-(pink|fuchsia|purple)-\\d+/]",
    message: '디자인 헌장 §11 — 보라핑크 그라디언트 금지. 단일 인디고 또는 무채색만.',
  },
  {
    selector:
      "TemplateElement[value.raw=/from-(purple|fuchsia|pink)-\\d+.*to-(pink|fuchsia|purple)-\\d+/]",
    message: '디자인 헌장 §11 — 보라핑크 그라디언트 금지 (template literal).',
  },
  {
    // canvas 2D 의 글로우 — `ctx.shadowBlur = n`. 헌장(forbidden.md)은
    // glow/neon/헤일로를 앱 전역에서 금지하고, 예외는 **발자국 트레일 번짐
    // 1건**(정적 · opt-in · 기본 0 · 상한 6px)뿐이다. 그 한 건은
    // `shared/lib/footprint-glyph.ts` 에만 살고, 이 셀렉터가 그 사실을 강제한다.
    //
    // 왜 룰이 필요한가: 캔버스 글로우는 **클래스 문자열이 아니라 API 호출**이라
    // 기존 값 룰(shadow-[…] 기하 허용목록)의 시야 밖이다. 새 캔버스 표면이
    // shadowBlur 를 한 줄 쓰면 아무 게이트도 안 걸리고 조용히 들어온다.
    selector: 'MemberExpression[property.name="shadowBlur"]',
    message:
      'canvas 글로우 금지 (forbidden.md). 유일한 예외는 발자국 트레일 번짐이고 shared/lib/footprint-glyph.ts 안에서만 산다.',
  },
];

// ── 인디고 잉크 라이선스 (2026-08-03 체계석) ────────────────────────
// `tone accent`(#7170ff, 표식 인디고)는 맨 어두운 바탕까지만 AA(4.5:1)다 —
// 인디고/앰버 틴트 채움이 깔리면 합성 대비 3.5~4.4 로 떨어진다(실측:
// tests/contract/accent-ink-contrast.contract.test.ts). 틴트를 지는 컨트롤의
// 잉크는 `accentOnTint`(--color-indigo-text-soft, 전 표면 6.46+)다.
// 이 셀렉터는 **같은 호출/원소 안의 리터럴 페어링**만 본다 — 파일 상수로
// 우회된 className 은 위 계약 테스트의 소스 스캔이 맡는다.
/*
 * 인라인 `style={{ boxShadow }}` — className 셀렉터가 **원리적으로 못 보는** 층.
 *
 * ## 왜 필요했나 (2026-08-04 디자인 감사)
 *
 * 위의 고도 사다리 가드는 `shadow-[…]` 라는 **클래스 문자열**을 본다. 그런데
 * 그림자를 JSX 인라인 스타일로 쓰면 클래스가 아예 안 생기므로 셀렉터에 걸릴
 * 것이 없다. 그 틈에서 공방(`StudioCompass.tsx`)이 **평행 사다리**를 돌리고
 * 있었다 — 손으로 쓴 그림자 8건, 모양 3종:
 *
 *   0 -12px 30px  ×1  하단 도킹 패널      → 이미 `-dock-bottom` 이 있다 (0 -12px 32px)
 *   0 12px 34px   ×6  앵커된 팝오버들      → 이미 `elevation-2`(popover) 가 있다
 *   0 18px 48px   ×1  스크림 동반 중앙 모달 → 이미 `elevation-3`(dialog) 가 있다
 *
 * 셋 다 **없던 층이 아니라 이름이 이미 있는 층**이었다. 사다리 정의부 주석이
 * 기록한 "등재되지 않은 6번째 층" 사건과 같은 모양이고, 다른 점은 이번엔
 * 값이 아니라 **문법**이 게이트를 피했다는 것뿐이다.
 *
 * ## 왜 램프 블록이 아니라 전역 블록에 싣나
 *
 * `StudioCompass.tsx` 는 `rampDebtExemptions` 에 있어서 램프 블록에서 빠진다.
 * 이 셀렉터를 램프 배열에 넣으면 **정작 위반이 사는 파일만 면제된다.** 그래서
 * 전역 블록(`src/**`+`app/**`)과 램프 블록 **양쪽**에 싣는다 — flat config 는
 * 룰 옵션을 병합하지 않고 교체하므로 한쪽만 넣으면 다른 쪽에서 유실된다.
 *
 * ## 허용 판정은 className 쪽과 **같은 목록**이다
 *
 * 색만 토큰이고 기하는 손으로 쓰는 것이 사다리를 무너뜨린 방식이었으므로,
 * 여기서도 «var( 가 있으면 통과» 로 하지 않는다. 사다리·도킹·눌림·표면 전용
 * 토큰·inset 중 하나를 참조해야 한다.
 *
 * ⚠️ 켜기 전 전수: 인라인 boxShadow 9건 중 위반 8건(전부 한 파일) · 정상 1건
 * (`GuidedTourOverlay` 의 `0 0 0 9999px var(--topology-tour-scrim-surface)` —
 * 거대 spread 로 만든 스크림이라 고도 그림자가 아니고, 표면 전용 토큰을 쓴다).
 * 8건을 먼저 수렴시키고 켰다.
 */
const ALLOWED_SHADOW_TOKEN =
  'var\\(--shadow-elevation-|var\\(--shadow-control-press|var\\(--topology|var\\(--chrome|var\\(--git|inset';

const inlineShadowSelectors = [
  {
    selector: `Property[key.name="boxShadow"] > Literal[value=/^(?!.*(?:${ALLOWED_SHADOW_TOKEN})).+/]`,
    message:
      '고도 사다리 이탈 (인라인 style) — 그림자의 **기하**도 토큰이 정한다. --shadow-elevation-1/2/3 (coach-mark < popover < dialog), 가장자리 도킹은 -dock-bottom/-dock-side, 눌린 컨트롤은 --shadow-control-press. 인라인 스타일은 클래스 셀렉터에 안 걸리므로 여기서 막는다.',
  },
  {
    selector: `Property[key.name="boxShadow"] TemplateElement[value.raw=/^(?!.*(?:${ALLOWED_SHADOW_TOKEN})).+/]`,
    message:
      '고도 사다리 이탈 (인라인 style, template literal) — --shadow-elevation-* / -dock-* / --shadow-control-press 를 참조한다.',
  },
];

/*
 * 중복 `cursor-pointer` — 중앙 규칙이 이미 정한 것을 다시 적는 것.
 *
 * ## 왜 (2026-08-05 소유자 확정)
 *
 * `app/globals.css` 의 base 레이어가 «비활성이 아닌 `button` 과 `summary` 는
 * pointer» 를 정한다. 그 뒤로 `<button className="… cursor-pointer">` 는
 * **아무것도 바꾸지 않는 중복**이고, 중복이 쌓이면 다음 사람이 «여기만 특별한가»
 * 를 매번 다시 판단해야 한다. 실제로 그렇게 22곳이 쌓였고 버튼끼리 5:56 으로
 * 서로 모순이었다.
 *
 * ## 사정거리를 일부러 좁혔다
 *
 * `cursor-pointer` 를 통째로 금지하지 **않는다**. 중앙 규칙이 안 닿는 자리가
 * 실제로 8곳 있다(`li[role=option]` · `label` · cmdk 항목 · 클릭되는 카드 ·
 * SVG `<g>` · 체크박스). 그것까지 막으면 정상 사용을 죽이는 룰이 된다.
 * `cursor-default` 도 마찬가지로 안 막는다 — 스크림 3곳이 정당하게 쓴다
 * (누르면 닫히지만 컨트롤이 아니라 표면이다).
 *
 * 그래서 판정은 **«태그가 button/summary 인데 그 위에 또 적었는가»** 하나다.
 * 이 셀렉터는 리터럴 태그 + 리터럴 className 조합만 본다 — `cn()` 으로 조립된
 * 것이나 컴포넌트 래퍼는 못 본다. 그쪽은 **렌더 결과를 재는**
 * `tests/e2e/cursor-affordance.spec.ts` 가 맡는다(lint 가 못 보는 층은 계약이
 * 맡는다는 이 저장소의 분업 그대로).
 *
 * ⚠️ 켜기 전 전수: 13건을 먼저 걷어내고 켰다(위반 0 · lint 총계 불변).
 */
const cursorAffordanceSelectors = [
  {
    selector:
      'JSXOpeningElement[name.name=/^(button|summary)$/] JSXAttribute[name.name="className"] Literal[value=/(^|[^-\\w])(enabled:)?cursor-pointer([^-\\w]|$)/]',
    message:
      'button/summary 의 pointer 커서는 app/globals.css 의 base 규칙이 이미 정한다 — 여기 다시 적으면 중복이고, 중복이 쌓이면 다음 사람이 «여기만 특별한가» 를 매번 다시 판단한다. 지워라. 중앙 규칙이 안 닿는 원소(li[role=option] · label · 클릭되는 카드 등)에서는 정당하다.',
  },
  {
    selector:
      'JSXOpeningElement[name.name=/^(button|summary)$/] JSXAttribute[name.name="className"] TemplateElement[value.raw=/(^|[^-\\w])(enabled:)?cursor-pointer([^-\\w]|$)/]',
    message:
      'button/summary 의 pointer 커서는 base 규칙이 정한다 (template literal). 중복을 지워라.',
  },
];

/*
 * 자간 · 무게 · Tailwind 팔레트 — 2026-08-05 에 닫은 세 축.
 *
 * ## 자간 (`tracking-[…em]`)
 *
 * 램프는 **있었는데 아무도 안 썼다.** 실측: 토큰 9종을 13개 파일이 쓰는 동안
 * 146개 파일이 `tracking-[Nem]` 을 손으로 적었고, 값은 21종이었다 — `0.1em` 과
 * `0.10em` 처럼 **같은 값을 두 표기로** 적은 것만 31건이다. 원인은 취향이
 * 아니라 **없는 층**이었다: 자간이 실제로 필요한 자리는 거의 전부 `uppercase`
 * 마이크로 라벨(실측 194건)인데, 램프의 caption/label(0.04/0.02em)은 본문용
 * 값이라 그 자리에 줄 스텝이 없었다. `--tracking-caps-08~16` 다섯을 등재해
 * 213곳이 픽셀 0으로 옮겨갔다.
 *
 * ## 무게 (`font-[NNN]`)
 *
 * 토큰은 `--font-weight-signature`(510) 하나뿐인데 `560`·`650` 이 13곳에 손으로
 * 적혀 있었다. 가변 폰트라 Tailwind 기본 3단(500/600/700)을 안 쓰는 것이 의도지만,
 * 그 의도가 **이름 없이** 살고 있었다. 둘 다 값 그대로 등재했다.
 *
 * ## Tailwind 팔레트 유틸리티
 *
 * `text-white` 3곳 + `border-white/35` 1곳. 적은 수지만 **무채색+인디고 하나**
 * 헌장의 정확한 반대다. 그리고 여기엔 함정이 있었다 — `text-white` 를 «토큰이
 * 아니니까» `--color-text-primary` 로 바꿨다면 인디고 면 위 대비가 4.70 → 4.42
 * 로 **AA 미달이 됐을 것**이다. 올바른 목적지는 이미 있던
 * `--color-text-on-accent`(#ffffff) 였다. 값이 아니라 **자리**가 토큰을 정한다.
 *
 * ⚠️ 켜기 전 전수: 세 축 모두 먼저 0으로 만들고 켰다(lint 총계 불변).
 */
const typographyAxisSelectors = [
  {
    selector: 'Literal[value=/tracking-\\[-?[0-9.]+(em|px|rem)\\]/]',
    message:
      '자간도 램프다. 대문자 마이크로 라벨은 --tracking-caps-08/10/12/14/16, 본문 짝은 --tracking-caption/label/body/body-lg/title, 큰 제목은 --tracking-display/hero/section/card 를 쓴다. 램프 밖 값이 필요하면 스텝을 등재하는 PR 을 먼저 낸다.',
  },
  {
    selector: 'TemplateElement[value.raw=/tracking-\\[-?[0-9.]+(em|px|rem)\\]/]',
    message: '자간도 램프다 (template literal). --tracking-* 토큰을 쓴다.',
  },
  {
    selector: 'Literal[value=/font-\\[[0-9]+\\]/]',
    message:
      '글자 무게도 램프다. --font-weight-signature(510) · -emphasis(560) · -strong(650) 셋뿐이다. 숫자를 직접 적으면 그 의도가 이름 없이 산다.',
  },
  {
    selector: 'TemplateElement[value.raw=/font-\\[[0-9]+\\]/]',
    message: '글자 무게도 램프다 (template literal). --font-weight-* 를 쓴다.',
  },
  /*
   * ## 이름 있는 무게 스텝 — 대괄호만 막던 것의 나머지 절반 (2026-08-05)
   *
   * 위 두 셀렉터는 `font-[560]` 처럼 **대괄호에 숫자를 적은 것**만 봤다. 그런데
   * 실제 다수파는 `font-medium`/`font-semibold` 였다 — 어느 룰도, 어느 래칫도
   * 안 보는 채로 **216곳**. `globals.css` 의 무게 블록이 스스로 *"Tailwind
   * 기본(500/600/700)이 아니라 이 셋만 쓴다"* 고 적어 둔 바로 그 값들이다.
   * `text-sm`/`rounded-md` 268건이 램프를 통째로 우회하던 것과 같은 모양이고,
   * 같은 병이 축 하나에서 재발했다: **값이 아니라 문법이 게이트를 피한다.**
   *
   * `font-normal`(400)은 **막지 않는다.** 400 은 램프의 스텝이 아니라 문서의
   * 기본 무게이고, `font-normal` 은 「강조를 끈다」는 뜻이다 — 실측 6곳 전부가
   * 그 용법이었다(그중 둘은 브라우저가 700 으로 그리는 `<b>` 를 되돌린다).
   * 램프는 그 기본 위에 얹는 강조 3단이다.
   *
   * ⚠️ 켜기 전 전수: 216곳을 전부 램프로 옮긴 뒤 켰다 — 위반 0.
   */
  {
    selector:
      'Literal[value=/(^|[^-\\w])font-(thin|extralight|light|medium|semibold|bold|extrabold|black)([^-\\w]|$)/]',
    message:
      '이름 있는 Tailwind 무게 스텝 금지 — 램프는 --font-weight-signature(510) · -emphasis(560) · -strong(650) 셋뿐이다. 제목 역할(h1~h6 · <b>/<strong> · 다이얼로그 제목 · display 이상 크기)은 strong, 그 밖의 인라인 강조는 emphasis 를 쓴다. 강조를 끄는 자리는 font-normal 이 맞다.',
  },
  {
    selector:
      'TemplateElement[value.raw=/(^|[^-\\w])font-(thin|extralight|light|medium|semibold|bold|extrabold|black)([^-\\w]|$)/]',
    message:
      '이름 있는 Tailwind 무게 스텝 금지 (template literal). --font-weight-signature/-emphasis/-strong 을 쓴다.',
  },
  {
    selector:
      'Literal[value=/(^|[^-\\w])(?:text|bg|border|ring|fill|stroke|from|to|via)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\\d{2,3})?(?:\\/\\d+)?([^-\\w]|$)/]',
    message:
      'Tailwind 기본 팔레트 금지 — 헌장은 무채색 + 인디고 하나다. --color-* 토큰을 쓴다. ⚠️ 값이 아니라 **자리**가 토큰을 정한다: 인디고 면 위 흰 글자는 --color-text-primary 가 아니라 --color-text-on-accent 다(전자는 4.42:1 로 AA 미달).',
  },
  {
    selector:
      'TemplateElement[value.raw=/(^|[^-\\w])(?:text|bg|border|ring|fill|stroke|from|to|via)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\\d{2,3})?(?:\\/\\d+)?([^-\\w]|$)/]',
    message: 'Tailwind 기본 팔레트 금지 (template literal). --color-* 토큰을 쓴다.',
  },
];

/*
 * 층위(z-index) — **20 이상은 앱 전역 계약이다.**
 *
 * 실측(2026-08-05): 11단이 규칙적으로 쓰이고 있었는데 어느 것이 어느 것 위인지
 * 코드 어디에도 적혀 있지 않았다. z-index 충돌은 «안 보이니까 숫자를 올린다»로
 * 번지는 대표적 버그원이고, 이름이 없으면 다음 사람은 또 올린다.
 * `--z-*` 로 사다리를 등재하고(값은 쓰이던 그대로) 전역 대역 17곳을 옮겼다.
 *
 * ⚠️ **사정거리를 20 이상으로 좁혔다.** 공방 나침 무대 안의 1~13 처럼 «한 표면
 * 안에서만 유효한 지역 쌓임»까지 막으면, 지역 문맥이 전역 계약인 척하게 되고
 * 룰은 소음이 된다. 그 11곳은 그대로 둔다.
 *
 * ⚠️ 켜기 전 전수: 20 이상 arbitrary 는 17곳이었고 전부 선치환했다(위반 0).
 */
const layerSelectors = [
  {
    selector: 'Literal[value=/z-\\[(?:[2-9][0-9]|[1-9][0-9]{2,})\\]/]',
    message:
      '층위 20 이상은 앱 전역 계약이다 — 숫자를 직접 적지 말고 --z-* 사다리를 쓴다(surface-sticky < map-hint < map-scrim < map-popover < overlay-chrome < dialog-scrim < dialog < tour < tour-card < tooltip < skip-link). 한 표면 안에서만 유효한 지역 쌓임은 20 미만으로 쓴다.',
  },
  {
    selector: 'TemplateElement[value.raw=/z-\\[(?:[2-9][0-9]|[1-9][0-9]{2,})\\]/]',
    message: '층위 20 이상은 --z-* 사다리를 쓴다 (template literal).',
  },
];

const accentTintPairingSelectors = [
  {
    selector:
      'CallExpression[callee.name="controlClass"] ObjectExpression:has(Property[key.name="tone"] > Literal[value="accent"]):has(Property[key.name="className"] :matches(Literal[value=/bg-\\[color:var\\(--color-(indigo|amber)/], TemplateElement[value.raw=/bg-\\[color:var\\(--color-(indigo|amber)/]))',
    message:
      '인디고/앰버 틴트 채움 위 잉크는 tone accent(#7170ff, 합성 대비 3.5~4.4:1 — AA 미달)가 아니라 accentOnTint 다. 근거: tests/contract/accent-ink-contrast.contract.test.ts',
  },
  {
    selector:
      'JSXOpeningElement:has(JSXAttribute[name.name="tone"] > Literal[value="accent"]):has(JSXAttribute[name.name="className"] :matches(Literal[value=/bg-\\[color:var\\(--color-(indigo|amber)/], TemplateElement[value.raw=/bg-\\[color:var\\(--color-(indigo|amber)/]))',
    message:
      '인디고/앰버 틴트 채움 위 잉크는 tone="accent"(#7170ff, AA 미달)가 아니라 tone="accentOnTint" 다. 근거: tests/contract/accent-ink-contrast.contract.test.ts',
  },
];

// ── Geometry & Type Codex (R5) 봉쇄 ─────────────────────────────────
// text-[Npx] / rounded-[Npx] arbitrary 클래스 금지 — docs/DESIGN-SYSTEM.md
// "Geometry & Type Codex" 램프(text-caption…text-hero / rounded-chip…panel)
// 로만 표현한다. 램프 밖의 의도적 예외는 `// eslint-disable-next-line
// no-restricted-syntax -- <사유>` 로 명시. 마이그레이션 완료 디렉토리 = error,
// 미완(topology-map-v2 · views/home) = warn.
export const arbitrarySizeSelectors = [
  /*
   * ── 이름 있는 Tailwind 기본 스텝도 램프 밖이다 (2026-08-03 전수조사) ──────
   *
   * 아래 대괄호 셀렉터들은 `text-[13px]` 같은 **arbitrary 문법만** 본다. 그런데
   * Tailwind v4 는 우리 램프를 *추가*했을 뿐 자기 기본 스케일을 덮어쓰지 않아서,
   * `text-sm`(14) · `rounded-md`(6) 같은 **이름 있는 클래스는 어떤 룰도 안 거치고
   * 렌더된다**. 실측 268건 — 램프를 통째로 우회하는 두 번째 시스템이었다.
   *
   * 값이 같은 것부터(md=chip 6px · xl=panel 12px · sm=body-lg 14px) 전부 램프
   * 이름으로 치환한 뒤 이 셀렉터를 켰다. 켤 때 위반 0.
   *
   * `rounded-full` 은 제외한다 — 완전 원형(점·아바타·필)은 선형 3단 램프가
   * 답할 질문이 아니다.
   *
   * 2026-08-03 체계석 처방으로 위 구멍의 게이트가 섰다:
   *
   * - `rounded-sm`(4px, 59건)과 무접미 `rounded`(4px, 37건)는 **드리프트가
   *   아니라 램프에 없던 스텝**이었다 — 96번 반복되는 값은 예외가 아니다.
   *   `--radius-micro`(4px) 등재 + 전량 기계 치환(픽셀 이동 0) 후 아래
   *   셀렉터를 켰다(켤 때 위반 0).
   * - `rounded-2xl`(19) · `text-base|lg|xl|2xl|3xl`(계 8)은 치환이 픽셀을
   *   움직여 자리마다 판정이 필요하다 — per-family 래칫
   *   (`tests/contract/named-offramp-utility-ratchet.contract.test.ts`)이
   *   기준선 아래로만 움직이게 붙든다. 이 래칫은 이름 유틸리티를 세고
   *   **eslint 커버 디렉토리를 건너뛰지 않는다** — `ARBITRARY_SIZE` 래칫이
   *   대괄호 패턴만 보고 커버 디렉토리를 건너뛰어 이 문단이 오래 거짓이었던
   *   (12건이라 적은 뒤 20건으로 자라도 아무것도 안 빨개진) 구멍의 정정이다.
   */
  {
    selector: 'Literal[value=/(^|[^-\\w])text-(xs|sm)([^-\\w]|$)/]',
    message:
      'Geometry Codex — Tailwind 기본 타입 스텝 금지(램프 우회). text-caption/label/body/body-lg/title/display/hero 로.',
  },
  {
    selector: 'TemplateElement[value.raw=/(^|[^-\\w])text-(xs|sm)([^-\\w]|$)/]',
    message:
      'Geometry Codex — Tailwind 기본 타입 스텝 금지 (template literal). text-* 램프로.',
  },
  /*
   * 2026-08-04 — 방향 접미 꼴(`rounded-t-*` 등)을 사정거리에 넣었다. 종전
   * 패턴은 `rounded-(sm|…)` 만 봐서 `rounded-r-md`(HubRail) · `rounded-t-[28px]`
   * (ProjectDrawer 모바일 시트)가 **아무 룰도 안 거치고** 살아 있었다 — 룰이
   * 있어도 사정거리가 짧으면 룰이 없는 것과 같다(화살표 게이트 전례). 켜기 전
   * 전수: 방향 이름 스텝 1건 + 방향 arbitrary 2건, 전부 같은 PR 에서 치환.
   */
  {
    selector:
      'Literal[value=/(^|[^-\\w])rounded-((t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee)-)?(sm|md|lg|xl)([^-\\w]|$)/]',
    message:
      'Geometry Codex — Tailwind 기본 radius 스텝 금지(램프 우회). rounded-micro/chip/card/panel/sheet 로.',
  },
  {
    selector:
      'TemplateElement[value.raw=/(^|[^-\\w])rounded-((t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee)-)?(sm|md|lg|xl)([^-\\w]|$)/]',
    message:
      'Geometry Codex — Tailwind 기본 radius 스텝 금지 (template literal). rounded-* 램프로.',
  },
  /*
   * 무접미 `rounded`(4px) — Tailwind v4 가 살려 둔 별칭이라 이름 스텝 셀렉터에
   * 안 걸린다. 2026-08-03 `--radius-micro` 등재와 함께 37건 전량 치환 후 켬
   * (켤 때 위반 0). 변형 접두 꼴(`[&_code]:rounded`)까지 잡도록 `:` 를
   * 구획자에 포함한다.
   */
  {
    selector: 'Literal[value=/(^|[^-\\w])rounded([^-\\w]|$)/]',
    message:
      'Geometry Codex — 무접미 rounded(4px) 금지(램프 우회). 같은 4px 은 rounded-micro 다.',
  },
  {
    selector: 'TemplateElement[value.raw=/(^|[^-\\w])rounded([^-\\w]|$)/]',
    message:
      'Geometry Codex — 무접미 rounded(4px) 금지 (template literal). rounded-micro 로.',
  },
  {
    selector: 'Literal[value=/text-\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex — text-[Npx] 하드코딩 금지. text-caption/label/body/body-lg/title/display/hero 램프로. 램프 밖이면 eslint-disable + 사유.',
  },
  {
    selector: 'TemplateElement[value.raw=/text-\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex — text-[Npx] 하드코딩 금지 (template literal). text-* 램프로.',
  },
  {
    selector:
      'Literal[value=/rounded-((t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee)-)?\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex — rounded-[Npx] 하드코딩 금지(방향 접미 포함). rounded-chip/card/panel/sheet 램프로. 램프 밖이면 eslint-disable + 사유.',
  },
  {
    selector:
      'TemplateElement[value.raw=/rounded-((t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee)-)?\\[[0-9.]+px\\]/]',
    message:
      'Geometry Codex — rounded-[Npx] 하드코딩 금지 (template literal). rounded-* 램프로.',
  },
  // 2026-07-26 — 소유자 질문("박스 모양이나 모서리나 테두리 규격 ... **md말고
  // 코드로도**")에서 드러난 구멍. `text`/`rounded` 는 잡고 있었는데 **그림자는
  // 룰이 없었다** — `design.md` 가 `--shadow-elevation-1/2/3` 사다리를 정의해
  // 놨는데도 하드코딩 rgba 섀도가 5건 살아 있었다(치환 완료).
  //
  // **`var(` 가 없는 것만 잡는다.** `shadow-[var(--chrome-shadow)]` 는 Tailwind
  // 에서 CSS 변수를 참조하는 **정상 문법**이지 위반이 아니다 — 초안에서 `shadow-\[`
  // 를 통째로 금지했다가 정상 토큰 사용 90여 건까지 경고해 lint 출력이 144 →
  // 548 로 뛰었다. 노이즈가 신호를 덮으면 게이트는 무력해진다.
  // ⚠️ 메시지에 **리터럴 유틸리티 문법을 쓰지 말 것.** Tailwind v4 의 소스
  // 스캐너가 이 파일의 문자열도 훑기 때문에, 예시로 적은 클래스명이 실제
  // 클래스로 생성된다 — 2026-07-26 에 예시 하나가 `--tw-shadow: var(--...)`
  // 라는 파싱 불가 CSS 를 만들어 프로덕션 빌드를 깨뜨렸다(Playwright 전체 실패).
  // 2026-07-28 재수렴 — **`var(` 만 보던 면제를 기하 허용목록으로 좁힌다.**
  //
  // 종전 룰은 값 안에 `var(` 가 있으면 통과시켰다. 그 면제는 정상 토큰 사용을
  // 살리려던 것인데(초안이 90여 건을 오탐했다) 부작용이 컸다: **색만 토큰이고
  // 기하는 자유**인 상태가 되어, 사다리가 3단으로 수렴시켰다던 손 튜닝이
  // 23종으로 재확산했다. 그 안에 광원 역전 2건(하단 탭바 y 음수 · 우측 패널
  // y=0)과 계층 역전 1건(blur 90 > dialog 80)이 있었다.
  //
  // 그래서 "토큰을 썼는가" 가 아니라 **"어느 토큰을 썼는가"** 를 본다. 허용은
  // 사다리(elevation-*/dock-*) · 눌림(control-press) · 표면별 전용 토큰
  // (topology/chrome/git) · inset 헤어라인(광원이 아니라 재질). 23건을 먼저
  // 수렴시키고 켰으므로 켜는 순간 위반 0 · lint 총계 불변.
  // ⚠️ 메시지에 리터럴 유틸리티 문법 금지 — Tailwind v4 스캐너가 이 파일을 훑는다.
  {
    selector:
      'Literal[value=/shadow-\\[(?![^\\]]*(?:var\\(--shadow-elevation-|var\\(--shadow-control-press|var\\(--topology|var\\(--chrome|var\\(--git|inset))[^\\]]+\\]/]',
    message:
      '고도 사다리 이탈 — 그림자의 **기하**도 토큰이 정한다. --shadow-elevation-1/2/3 (coach-mark < popover < dialog), 가장자리 도킹은 -dock-bottom/-dock-side, 눌린 컨트롤은 --shadow-control-press 를 쓴다. 색만 토큰이고 기하는 손으로 쓰는 것이 사다리를 무너뜨린 방식이다.',
  },
  {
    selector:
      'TemplateElement[value.raw=/shadow-\\[(?![^\\]]*(?:var\\(--shadow-elevation-|var\\(--shadow-control-press|var\\(--topology|var\\(--chrome|var\\(--git|inset))[^\\]]+\\]/]',
    message:
      '고도 사다리 이탈 (template literal) — --shadow-elevation-* / -dock-* / --shadow-control-press 를 쓴다.',
  },
  // 2026-07-26 hex — **현재 위반 0건인 예방 게이트다.** 전수 측정 결과 Tailwind
  // arbitrary value 안에 hex 를 박은 곳은 src/app 전체에 하나도 없었고, 남은
  // hex 127건은 전부 정당한 예외였다: 테스트 픽스처 83 · PR 번호 주석 16 ·
  // CSS-var 가 닿지 않는 표면 16(next/og Satori · viewport.themeColor ·
  // standalone HTML) · JS 측 토큰 진실원 7 · 토큰 리더 fallback 3 · 마스크
  // 알파 스텐실 2.
  //
  // 그래서 "모든 hex 금지" 는 27건의 소음만 만들고 잡을 신호가 0 이었다.
  // **Tailwind arbitrary value 안**으로 좁히면 오늘 0건 · 미래 유입만 차단한다.
  // (shadow 룰에서 배운 것과 같은 교정 — 넓은 룰은 정상 사용을 위반으로 센다.)
  {
    selector: 'Literal[value=/-\\[(?:color:)?#[0-9a-fA-F]{3,8}/]',
    message:
      '디자인 헌장 — Tailwind arbitrary value 안 hex 금지. --color-* 토큰을 var() 로 참조한다. CSS 변수가 닿지 않는 표면(Canvas·next/og·standalone HTML)은 eslint-disable + 사유.',
  },
  {
    selector: 'TemplateElement[value.raw=/-\\[(?:color:)?#[0-9a-fA-F]{3,8}/]',
    message:
      '디자인 헌장 — Tailwind arbitrary value 안 hex 금지 (template literal). --color-* 토큰을 var() 로.',
  },
  // 2026-07-27 모션 duration — 그림자 사다리와 **똑같은 실패 모드**였다. 램프
  // (--motion-fast/base/settle)를 정의해 놓고 룰이 없어, 참조하는 컴포넌트는
  // 하나뿐인데 리터럴 30건이 그 옆에 살아 있었다.
  //
  // 켜기 전 측정(design.md 4단계): 위반은 tsx 30건뿐이고 정상 사용으로 오인될
  // 부류가 없다 — 토큰 참조형은 대괄호가 뒤따라서 이 정규식(뒤에 숫자)에 애초에
  // 안 걸린다. 그림자 룰이 필요했던 `var(` 예외 협소화가 여기선 불필요하다.
  // 30건을 **먼저 치환하고** 룰을 켰으므로 켜는 순간 위반 0, lint 총계 불변.
  //
  // 앞쪽 `(?:^|[^-\w])` 는 `transition-duration-…` 같은 CSS 속성명 문자열이
  // 오탐되는 것을 막는다.
  // ⚠️ 메시지에 리터럴 유틸리티 문법 금지 — Tailwind v4 스캐너가 이 파일을
  // 훑는다(2026-07-26 에 예시 하나가 프로덕션 빌드를 깨뜨렸다).
  // 2026-07-28 모션 예산 — **빈도가 예산을 깎는다.** 호버/포커스로 트리거되는
  // 표면은 하루 수십 번 만난다: 객관적으로 빠른 곡선도 그 빈도에선 느리게
  // 느껴지고, 답은 곡선 조정이 아니라 예산 축소다. 램프의 이동/확정 스텝은
  // 하루 몇 번의 사건(모드 전환·커밋 수렴·표면 교체)의 것이다.
  //
  // 켜기 전 전수 측정(design.md 4단계): 램프 참조 21건 중 호버/포커스와 같은
  // className 에 공존하는 것은 **6건**(info-hint · 복사 버튼 · 크롬 칩 2 ·
  // 클러스터 확장 · 프로젝트 카드). 한 PR 치환 가능 규모이고, 대조군으로 잰
  // 정상 크롬 칩(0.12s 선언 · 램프 124ms · 피크 3프레임)이 이미 이상적이라
  // 정상 사용을 위반으로 세는 부류가 없다. 6건을 **먼저 치환하고** 룰을
  // 켰으므로 켜는 순간 위반 0 · lint 총계 불변.
  //
  // 판별은 "같은 className 문자열에 공존" 으로 한다 — AST 룰이 볼 수 있는 것이
  // 그것뿐이고, 실제로 그 6건 전부가 한 문자열 안에 있었다. 순서는 양쪽 다.
  // ⚠️ 메시지에 리터럴 유틸리티 문법 금지 — Tailwind v4 스캐너가 이 파일을 훑는다.
  {
    selector:
      'Literal[value=/(?:hover|focus-within|focus-visible):[^"]*duration-\\[var\\(--motion-(?:base|settle)\\)\\]|duration-\\[var\\(--motion-(?:base|settle)\\)\\][^"]*(?:hover|focus-within|focus-visible):/]',
    message:
      '모션 예산 — 호버/포커스로 트리거되는 고빈도 표면에 이동(base)/확정(settle) 예산을 쓰지 않는다. fast 램프 토큰으로 강등하거나, 고빈도가 아니라는 근거를 eslint-disable 주석에 남긴다.',
  },
  {
    selector:
      'TemplateElement[value.raw=/(?:hover|focus-within|focus-visible):[^`]*duration-\\[var\\(--motion-(?:base|settle)\\)\\]|duration-\\[var\\(--motion-(?:base|settle)\\)\\][^`]*(?:hover|focus-within|focus-visible):/]',
    message:
      '모션 예산 — 호버/포커스 고빈도 표면에 이동/확정 예산 금지 (template literal). fast 램프로 강등한다.',
  },
  {
    selector: 'Literal[value=/(?:^|[^-\\w])duration-\\d/]',
    message:
      '모션 duration 하드코딩 금지. 기본(--motion-fast, 확인)이면 duration 클래스를 생략하고, 표면 이동은 --motion-base, 확정은 --motion-settle 을 duration 유틸리티 안에서 var() 로 참조한다.',
  },
  // 2026-07-28 — duration 룰의 **사정거리 구멍**. 위 셀렉터는 duration 유틸리티만
  // 보는데, 키프레임을 쓰는 표면은 duration 을 애니메이션 단축 문법 안에 싣는다:
  // 거기 박힌 ms 는 어떤 게이트에도 안 걸렸다. 전수 측정 결과 3건(150/180/220ms)
  // 이 살아 있었고 그중 220 은 램프에 아예 없는 값이었다. 3건을 먼저 치환하고
  // 룰을 켰으므로 켜는 순간 위반 0 · lint 총계 불변.
  //
  // 토큰 참조형(`var(--motion-base)`)은 숫자로 시작하지 않아 이 정규식에 안 걸린다.
  // ⚠️ 메시지에 리터럴 유틸리티 문법 금지 — Tailwind v4 스캐너가 이 파일을 훑는다.
  {
    selector: 'Literal[value=/animate-\\[[^\\]]*_[0-9.]+m?s/]',
    message:
      '모션 duration 하드코딩 금지 — 애니메이션 단축 문법 안의 시간도 램프를 탄다. --motion-fast/base/settle 와 --motion-ease 를 var() 로 참조한다.',
  },
  {
    selector: 'TemplateElement[value.raw=/animate-\\[[^\\]]*_[0-9.]+m?s/]',
    message:
      '모션 duration 하드코딩 금지 — 애니메이션 단축 문법 안의 시간 (template literal). --motion-* 토큰을 var() 로.',
  },
  // 2026-07-28 duration 의 **대괄호형** — `duration-<숫자>` 룰은 유틸리티의
  // 숫자 접미사만 본다. `duration-[180ms]` 는 대괄호 안이라 그 정규식 밖이고,
  // 램프 우회 룰(램프 토큰을 arbitrary length 로 참조)에도 안 걸린다. 전수
  // 측정 1건(문서함 사이드바 폭 전이)을 치환하고 켰다 — 위반 0, 총계 불변.
  // 토큰 참조형(`duration-[var(--motion-base)]`)은 숫자로 시작하지 않아
  // 이 정규식에 안 걸린다.
  {
    selector: 'Literal[value=/duration-\\[[0-9.]+m?s\\]/]',
    message:
      '모션 duration 하드코딩 금지 — 대괄호 안의 시간도 램프를 탄다. --motion-fast/base/settle 을 var() 로 참조한다.',
  },
  {
    selector: 'TemplateElement[value.raw=/duration-\\[[0-9.]+m?s\\]/]',
    message:
      '모션 duration 하드코딩 금지 — 대괄호 안의 시간 (template literal). --motion-* 토큰을 var() 로.',
  },
  // 2026-07-28 Tailwind **명명 그림자** — 고도 사다리(`--shadow-elevation-1/2/3`)
  // 를 정의해 놓고 룰이 arbitrary value 만 봐서, `shadow-2xl` 같은 프레임워크
  // 기본값이 사다리 밖에서 살아 있었다. 전수 측정 6건이 전부 시트/다이얼로그
  // (= dialog 단)여서 한 PR 로 치환 가능했고, 치환 후 위반 0 · 총계 불변.
  // `shadow-none` 은 "그림자 없음" 이라는 정당한 선언이라 목록에서 뺀다.
  // ⚠️ 메시지에 리터럴 유틸리티 문법 금지 — Tailwind v4 스캐너가 이 파일을 훑는다.
  {
    selector: 'Literal[value=/(?:^|[^-\\w])shadow-(?:2xs|xs|sm|md|lg|xl|2xl)(?![-\\w])/]',
    message:
      '고도 사다리 이탈 — Tailwind 기본 그림자 대신 --shadow-elevation-1/2/3 (coach-mark < popover < dialog) 을 shadow 유틸리티 안에서 var() 로 참조한다.',
  },
  {
    selector: 'TemplateElement[value.raw=/(?:^|[^-\\w])shadow-(?:2xs|xs|sm|md|lg|xl|2xl)(?![-\\w])/]',
    message:
      '고도 사다리 이탈 (template literal) — --shadow-elevation-* 토큰을 var() 로 참조한다.',
  },
  // 2026-07-28 색 있는 헤일로 — `design.md` 가 「glow-like boxShadow `0 0 ...` ring」
  // 을 이름으로 금지해 놨는데, 그림자 룰이 `var(` 있는 값을 통째로 면제해서
  // 하단 탭바의 활성 표시가 `0 0 12px` 인디고 헤일로를 달고 살아 있었다.
  // **면제가 정당했던 이유가 여기서는 반대로 작동한다** — 정상 토큰 참조를
  // 살리려던 예외가 토큰으로 쓴 글로우까지 살려 줬다.
  //
  // 판별은 색으로 한다: 무채색 그림자 토큰(`--color-shadow-*`)의 `0 0` 확산은
  // 측면 서랍 같은 큰 표면의 정당한 앰비언트 그림자다(측정: 2건, 둘 다 서랍).
  // 그 외 색 토큰의 `0 0` 은 마크 둘레의 헤일로 — 금지 대상이다(측정: 1건, 치환
  // 완료). 좁힌 뒤 위반 0 · lint 총계 불변.
  // ⚠️ 메시지에 리터럴 유틸리티 문법 금지 — Tailwind v4 스캐너가 이 파일을 훑는다.
  {
    selector: 'Literal[value=/shadow-\\[0_0_(?!0[_\\]])[^\\]]*var\\(--color-(?!shadow-)/]',
    message:
      '디자인 헌장 — 마크 둘레의 색 있는 헤일로 금지 (glow ring). 대비가 부족하면 헤일로가 아니라 선/면의 값을 올린다. 무채색 그림자 토큰의 확산 그림자는 예외.',
  },
  {
    selector: 'TemplateElement[value.raw=/shadow-\\[0_0_(?!0[_\\]])[^\\]]*var\\(--color-(?!shadow-)/]',
    message:
      '디자인 헌장 — 마크 둘레의 색 있는 헤일로 금지 (template literal). 무채색 그림자 토큰의 확산 그림자는 예외.',
  },
  {
    selector: 'TemplateElement[value.raw=/(?:^|[^-\\w])duration-\\d/]',
    message:
      '모션 duration 하드코딩 금지 (template literal). --motion-fast/base/settle 토큰으로.',
  },
  // 2026-07-27 행간 — 글자 크기는 규격이 있는데 줄 사이 간격은 없었다. 전수
  // 측정 결과 arbitrary 19종 75건이 네 클러스터로 갈렸고, 클러스터 **안**의
  // 값 차이(같은 패널에서 1.5·1.55·1.6·1.65)는 전부 드리프트였다.
  //
  // 켜기 전 측정(design.md 4단계): 정상 사용으로 오인될 부류 0 — 램프 스텝은
  // 대괄호를 안 쓰고, 기존 named 유틸리티(leading-4/relaxed 등 199건)는 이
  // 정규식이 요구하는 숫자-대괄호 형태가 아니라 애초에 안 걸린다. named 쪽을
  // 룰로 잡지 않는 이유: 199 warning 은 베이스라인 143 을 덮는 소음이고,
  // 대세인 leading-4/5/6 의 값(16/20/24px)은 램프 짝과 동일해 위반도 아니다.
  // 74건을 **먼저 치환하고** 룰을 켰으므로 켜는 순간 위반 0, 총계 불변.
  // ⚠️ 메시지에 리터럴 유틸리티 문법 금지 — Tailwind v4 스캐너가 이 파일을 훑는다.
  {
    selector: 'Literal[value=/leading-\\[[0-9.]+\\]/]',
    message:
      '행간 하드코딩 금지. --leading-caption 부터 --leading-prose 까지 9단 램프가 만드는 유틸리티로 쓴다 (크기 스텝과 1:1 짝). 램프 밖이면 eslint-disable + 사유.',
  },
  {
    selector: 'TemplateElement[value.raw=/leading-\\[[0-9.]+\\]/]',
    message:
      '행간 하드코딩 금지 (template literal). --leading-* 램프 토큰이 만드는 유틸리티로.',
  },
  // 2026-07-27 램프 우회 — 행간 companion 결합(B2) 이후 새로 생긴 실패 모드다.
  // 크기 스텝이 행간을 함께 싣게 되면서, **램프 토큰을 arbitrary length 로
  // 우회 참조**하면 크기만 얻고 그 단의 행간은 못 얻는다. 같은 원소에 다른
  // 단의 램프 클래스가 있으면 그 단의 행간이 그대로 남아, 아무도 고른 적 없는
  // 비율이 만들어진다 — 실측: /git 헤드라인이 23px 글자에 title 짝 24px 행간
  // (1.04)이었고 이 저장소에서 가장 큰 이탈이었다.
  //
  // 켜기 전 측정(design.md 4단계): 위반 3건(전부 램프 토큰을 가리키는 것),
  // 정상 사용으로 오인될 부류 0 — 램프 밖 크기 토큰(레일 라벨·크롬 타이틀 등
  // 5건)은 `--text-` 접두가 아니라 정규식에 애초에 안 걸린다. 3건을 먼저
  // 치환하고 룰을 켰으므로 켜는 순간 위반 0, lint 총계 불변.
  //
  // 짝이 어긋나는 **일반형**(램프 클래스 + 반응형 arbitrary px)은 이 룰이 못
  // 잡는다 — 판정에 한 원소의 클래스 전체가 필요한데 cn() 인자로 쪼개지면
  // 셀렉터 하나에 안 담긴다. 그 층은 계약 테스트가 맡는다
  // (tests/contract/type-ramp-leading-pair.contract.test.ts).
  // ⚠️ 메시지에 리터럴 유틸리티 문법 금지 — Tailwind v4 스캐너가 이 파일을 훑는다.
  {
    selector: 'Literal[value=/text-\\[length:var\\(--text-/]',
    message:
      '타입 램프 토큰을 arbitrary length 로 우회 참조 금지. 램프 유틸리티(text-<스텝>)를 직접 쓴다 — 우회하면 크기만 얻고 그 단이 싣는 행간 짝을 잃는다. 램프 밖 크기 토큰(레일·크롬 전용)은 이 룰에 걸리지 않는다.',
  },
  {
    selector: 'TemplateElement[value.raw=/text-\\[length:var\\(--text-/]',
    message:
      '타입 램프 토큰을 arbitrary length 로 우회 참조 금지 (template literal). 램프 유틸리티를 직접 쓴다.',
  },
  // framer-motion 리터럴 (2026-07-28 디자인 카운슬 「체계」).
  //
  // 기존 duration 룰은 Tailwind 클래스 문자열(`duration-<숫자>`)만 본다. framer 의
  // `transition={{ duration: 0.28 }}` 은 **어떤 게이트의 사정거리에도 없었고**,
  // 그래서 JS 쪽 모션 상수가 CSS 램프와 갈라진 채(0.28·0.42) 22건 중 15건이 램프
  // 밖으로 렌더되고 있었다. 값이 게이트가 안 보는 곳에 살면 반드시 갈라진다.
  {
    selector:
      'JSXAttribute[name.name="transition"] ObjectExpression > Property[key.name="duration"] > Literal',
    message:
      'framer transition duration 리터럴 금지 — `@/shared/motion` 의 램프 거울(MOTION.fast/base/settle)을 import 한다. 램프 밖 값이 필요하면 먼저 CSS 램프에 등재하고 거울 계약 테스트를 넓힌다.',
  },
  {
    selector:
      'JSXAttribute[name.name="transition"] ObjectExpression > Property[key.name="ease"] > :matches(ArrayExpression, Literal)',
    message:
      'framer transition ease 리터럴 금지 — `MOTION_EASE`(= --motion-ease 의 값 복사)를 쓴다. 램프 duration 을 받는 원소는 이징도 같은 패밀리로 간다.',
  },
];

/*
 * ── 램프 커버리지는 **거부목록**이다 (2026-08-04) ───────────────────────────
 *
 * 여기 있던 것은 허용목록(`codexMigratedGlobs`)이었다 — 「치환이 끝난 디렉터리
 * 만 error 로 막는다」. 부채를 한 번에 못 치우던 시절에는 정직한 설계였지만,
 * 부작용이 목적을 뒤집었다: **새로 생긴 디렉터리는 어느 목록에도 없어서
 * 아무 규격도 안 받는다.**
 *
 * 2026-08-04 실사용 시험 실측 — 새 `src/views/<name>/ui/*.tsx` 한 줄에
 *
 *     text-[13px]  rounded-[5px]  leading-[1.9]  duration-300
 *
 * 네 위반을 심고 `pnpm exec eslint` 를 돌리니 **0 errors, 0 warnings.**
 * `calculateConfigForFile` 로 재보니 그 경로가 받는 `no-restricted-syntax`
 * 셀렉터는 **7개**(scale/gradient 5 + accent 틴트 2)뿐이고 램프 셀렉터는
 * **0개**였다. 소유자 목표가 "명령만 하면 디자인 시스템 기반으로 화면이
 * 나온다" 인데, **새 화면이야말로 규격이 하나도 강제되지 않는 자리**였다.
 *
 * 그래서 뒤집는다. 기본값은 「덮인다」이고, 예외는 **파일 단위로 등재**한다.
 *
 * ⚠️ 켜기 전 전수 측정(`design.md` "룰을 켜기 전 반드시 측정한다"):
 * `src/**` + `app/**` 전체에 램프 셀렉터를 강제로 걸어 재니 위반 **125건**
 * 이었고, 그 125건은 **파일 12개**에 몰려 있었다. 디렉터리 8곳이 사각지대
 * 였는데 실제 부채는 12개 파일이다 — 그래서 뒤집는 비용이 「12줄의 예외」다.
 * 125건을 이 PR 에서 치우지 않는 이유는 규모가 아니라 **성격**이다: 대부분이
 * 램프에 없는 값(13 · 27 · 11.5px …)이라 치환이 곧 렌더 픽셀 변경이고 자리
 * 마다 디자인 판정이 필요하다. 그 판정은 lint PR 이 아니라 디자인 패스의
 * 일이다. 그동안 부채는 래칫이 붙든다.
 */
export const rampCoveredGlobs = ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'];

/**
 * 램프 봉쇄에서 **한시적으로 빠지는 파일**. 디렉터리가 아니라 **파일**인 것이
 * 핵심이다 — 유산 파일 옆에 새로 생기는 파일은 첫날부터 덮인다.
 *
 * 옆 숫자는 2026-08-04 실측 위반 수이고, 정본 장부는
 * `tests/contract/type-ramp-coverage.contract.test.ts` 다. 그 계약이 (1) 여기
 * 적힌 경로가 실재하는지 (2) 부채가 장부를 넘지 않는지 (3) 0이 된 파일이
 * 남아 있지 않은지 (4) **커버 글롭이 다시 허용목록으로 좁혀지지 않았는지**
 * 를 잰다.
 *
 * ⚠️ 이 목록에 **디렉터리 글롭을 넣지 마라.** 계약이 거부한다 — 디렉터리로
 * 빼면 그 안의 새 파일까지 같이 빠지고, 그게 이 블록이 뒤집힌 원인이다.
 */
export const rampDebtExemptions = [
  // **2026-08-05: 비었다.** 이 목록은 «램프가 생기기 전에 쓰인 파일» 의 한시적
  // 유예였고, 마지막 7개 파일 93건(text 68 · radius 25)을 램프로 옮기면서 0이
  // 됐다. 이제 `rampCoveredGlobs` 가 정말로 전부를 덮는다.
  //
  // ⚠️ **여기에 파일을 다시 넣는 것은 규격을 끄는 것이다.** 새 값이 필요하면
  // 예외를 만들지 말고 램프에 스텝을 등재하고(「체계」 소집) 같은 PR 에 lint 도
  // 넣는다 — 그것이 이 저장소가 `--radius-micro` 로 이미 한 번 한 일이다.
  // 목록이 비어 있어도 계약은 헛돌지 않는다: `type-ramp-coverage` 가
  // ESLint 자신을 돌려 «존재하지 않는 새 경로도 램프 셀렉터를 전부 받는가» 를
  // 잰다.
];

// 테스트는 렌더된 className 문자열을 assert 하므로 램프 룰에서 제외.
const codexTestIgnores = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'];

// local-first 첫 paint firebase 0 약속 회귀 방지 (PR #99 이후).
//
// `@/entities/<x>` 메인 barrel 은 firebase 의존이 없어야 한다 (type / lib /
// pure helper 만). firestore 구독·mutation 함수는 `@/entities/<x>/api` 로
// 직접 import 해서 cloud-mode 진입 시점에만 chunk 가 다운로드되게.
//
// 메인 barrel 에서 아래 names 를 import 하면 "api 경로 사용해" 메시지로
// 막는다. 새 api 함수 추가 시 메인 barrel 에 export 도 절대 X — 추가하면
// 이 목록에 names 도 같이 추가해 회귀 차단.
//
// **공유 배열인 이유**: flat config 는 같은 rule 을 뒤에서 다시 정의하면
// option 을 병합하지 않고 **교체**한다. 더 좁은 스코프 블록이 자기 제한만
// 적으면 이 firestore 가드가 그 경로에서 조용히 사라진다. 스코프 블록은
// 반드시 이 배열을 스프레드한 뒤 자기 항목을 더한다.
//
// 자세히: `@.claude/rules/architecture.md`.
const firestoreApiRestrictedPaths = [
  {
    name: '@/entities/project',
    importNames: [
      'listProjects',
      'getProject',
      'upsertProject',
      'upsertProjectPositions',
      'deleteProject',
      'deleteProjects',
      'subscribeProjects',
      'fetchAllProjectsAtBuild',
      'uploadScreenshot',
      'deleteScreenshot',
    ],
    message:
      "firestore api 는 '@/entities/project/api' 로 직접 import 하세요 (local-first 첫 paint 청크 firebase 0 보장).",
  },
  {
    name: '@/entities/category',
    importNames: [
      'subscribeCategories',
      'upsertCategory',
      'deleteCategory',
      'seedDefaultCategoriesIfEmpty',
    ],
    message: "firestore api 는 '@/entities/category/api' 로 직접 import 하세요.",
  },
  {
    name: '@/entities/status',
    importNames: [
      'subscribeStatuses',
      'upsertStatus',
      'deleteStatus',
      'seedDefaultStatusesIfEmpty',
    ],
    message: "firestore api 는 '@/entities/status/api' 로 직접 import 하세요.",
  },
  {
    name: '@/entities/admin',
    importNames: ['isAdmin'],
    message: "firestore api 는 '@/entities/admin/api' 로 직접 import 하세요.",
  },
  {
    name: '@/entities/ontology-class',
    importNames: [
      'subscribeOntologyClasses',
      'upsertOntologyClass',
      'seedDefaultOntologyClassesIfEmpty',
    ],
    message: "firestore api 는 '@/entities/ontology-class/api' 로 직접 import 하세요.",
  },
  {
    name: '@/entities/ontology-relation',
    importNames: [
      'subscribeOntologyRelations',
      'upsertOntologyRelation',
      'seedDefaultOntologyRelationsIfEmpty',
    ],
    message: "firestore api 는 '@/entities/ontology-relation/api' 로 직접 import 하세요.",
  },
  {
    name: '@/entities/knowledge-graph',
    importNames: [
      'listKnowledgeProjectInsight',
      'subscribeKnowledgeProjectInsight',
      'subscribeKnowledgePublicGraph',
      'subscribeKnowledgeApprovedGraph',
      'subscribeKnowledgePublicMeta',
      'addManualKnowledgeNode',
      'addManualKnowledgeEdge',
    ],
    message:
      "firestore api 는 '@/entities/knowledge-graph/api' 로 직접 import 하세요. (lazy hook `useKnowledgePublic*` 은 메인 barrel 그대로 OK.)",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next 16.2.4 부터 React Compiler 기반 새 규칙이 error
    // 로 승격됐는데, setState-in-effect / refs-during-render / 수동
    // memoization 등은 우리가 의도적으로 쓰는 유효 패턴이라 error 로
    // 막으면 과도. 경고 레벨로 낮춰 lint 는 통과시키고 점진적 개선.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'app-layer', pattern: 'src/app/**' },
        { type: 'views', pattern: 'src/views/**' },
        { type: 'widgets', pattern: 'src/widgets/**' },
        { type: 'features', pattern: 'src/features/**' },
        { type: 'entities', pattern: 'src/entities/**' },
        { type: 'shared', pattern: 'src/shared/**' },
      ],
      'boundaries/include': ['src/**/*'],
    },
    rules: {
      'boundaries/dependencies': [
        2,
        {
          default: 'disallow',
          rules: [
            // 값 import — 표준 FSD 레이어 방향.
            {
              from: { type: 'app-layer' },
              allow: {
                to: {
                  type: ['views', 'widgets', 'features', 'entities', 'shared'],
                },
              },
            },
            {
              from: { type: 'views' },
              allow: {
                to: { type: ['widgets', 'features', 'entities', 'shared'] },
              },
            },
            {
              from: { type: 'widgets' },
              allow: { to: { type: ['features', 'entities', 'shared'] } },
            },
            {
              from: { type: 'features' },
              allow: { to: { type: ['entities', 'shared'] } },
            },
            {
              from: { type: 'entities' },
              allow: { to: { type: ['shared'] } },
            },
            {
              from: { type: 'shared' },
              allow: { to: { type: ['shared'] } },
            },
            // 타입 전용 import (`import type ...`) 은 모든 방향에서 허용.
            // 컴파일 시 소멸되므로 런타임 의존성이 없고, 아키텍처 결합도를
            // 만들지 않는다. shared/mocks/demo-data 가 entity shape 을 type
            // 으로 참조하거나, feature 가 다른 feature 의 타입을 참조하는
            // 합리적 케이스를 허용. `dependency.kind` 는 selector 레벨 필드.
            {
              from: {
                type: [
                  'app-layer',
                  'views',
                  'widgets',
                  'features',
                  'entities',
                  'shared',
                ],
              },
              allow: {
                to: {
                  type: [
                    'app-layer',
                    'views',
                    'widgets',
                    'features',
                    'entities',
                    'shared',
                  ],
                },
                dependency: { kind: 'type' },
              },
            },
          ],
        },
      ],
    },
  },
  // firestore api 경로 가드 — 목록은 `firestoreApiRestrictedPaths` 가 단일 출처.
  {
    files: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: firestoreApiRestrictedPaths }],
    },
  },
  // 도메인 용량 막대는 kind 팔레트를 쓰지 않는다 (소유자 확정 2026-07-26,
  // `.qa-scratch/domain-bar-color-2026-07-26.md`).
  //
  // 이 막대의 두 조각은 순서(역량이 늘 왼쪽) + 단위어 + 바로 옆 숫자가 이미
  // 정체를 나른다. 거기에 kind 색을 얹으면 중복 잉크인데, 하필 그 쌍(앰버
  // rgba(211,159,73) · 유칼립투스 rgba(124,166,141))은 트랙 위 합성 대비가
  // 1.14:1 이라 밝기로는 갈리지 않고 hue 로만 갈렸다 — 적록 색약이 가장 못
  // 가르는 축이다. 그래서 앱 공통 막대 문법(무채색 + 인디고 하나 + 1px 심)
  // 으로 내려왔다.
  //
  // 룰이 없으면 이 규격은 지켜지지 않는다 — `getOntologyKindTone` 은 한 줄
  // import 로 되돌아온다. kind 팔레트는 색이 정체를 나르는 **유일한** 채널인
  // 자리(종류 센서스의 무라벨 스택, 지도 점, 트리 칩)에만 남는다.
  //
  // ⚠️ flat config 는 rule option 을 병합하지 않고 **교체**한다 — 위 블록의
  // firestore 가드가 이 경로에서 사라지지 않도록 같은 배열을 스프레드한다.
  {
    files: ['src/widgets/domain-capacity-bar/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: firestoreApiRestrictedPaths,
          patterns: [
            {
              group: ['@/entities/ontology-class', '@/entities/ontology-class/**'],
              message:
                '도메인 용량 막대는 kind 팔레트를 쓰지 않습니다 — 조각의 정체는 순서·단위어·숫자가 나르고, 채색은 `--color-indigo-brand` + `--color-text-quaternary` + 1px 심입니다. 근거: `.qa-scratch/domain-bar-color-2026-07-26.md`.',
            },
          ],
        },
      ],
    },
  },
  // 디자인 헌장 §11 (CLAUDE.md) 자동 차단 — Track E-13 (자율 루프).
  // - scale hover 금지 (`hover:scale-*` `active:scale-*` etc)
  // - 보라핑크 그라디언트 금지 (`from-purple-*` `to-pink-*` 조합)
  // - glassmorphism: 별도 Track 으로 처리 (현재 코드 사용 0).
  // 위반 시 lint error — 코드 PR 통과 못 함.
  {
    files: ['src/**/*.{ts,tsx,jsx,js}', 'app/**/*.{ts,tsx,jsx,js}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...scaleGradientSelectors,
        ...accentTintPairingSelectors,
        // 램프 부채 파일도 이 블록은 받는다 — 인라인 그림자는 램프가 아니라
        // 사다리 문제라 부채 면제와 함께 빠지면 안 된다.
        ...inlineShadowSelectors,
        ...cursorAffordanceSelectors,
      ],
    },
  },
  // 램프 봉쇄 — `src/**` + `app/**` **전부** error, 유산 부채 파일만 제외.
  // scale/gradient 셀렉터도 함께 실어 flat config 덮어쓰기로 그 가드가
  // 유실되지 않게 한다.
  //
  // 제외된 파일이 무방비가 되는 것은 아니다 — 바로 위 블록(`src/**`+`app/**`
  // 전역)의 scale/gradient · accent 틴트 가드는 그대로 받는다. 빠지는 것은
  // 램프(타입·반경·행간·모션·그림자) 셀렉터뿐이고, 그 부채는
  // `tests/contract/type-ramp-coverage.contract.test.ts` 래칫이 붙든다.
  {
    files: rampCoveredGlobs,
    ignores: [...codexTestIgnores, ...rampDebtExemptions],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...scaleGradientSelectors,
        ...arbitrarySizeSelectors,
        ...accentTintPairingSelectors,
        ...inlineShadowSelectors,
        ...cursorAffordanceSelectors,
        ...typographyAxisSelectors,
        ...layerSelectors,
      ],
    },
  },
  // 헌장 예외 1건 — 발자국 트레일 번짐(정적 · opt-in · 기본 0 · 상한 6px).
  //
  // ⚠️ **이 블록은 위 두 램프 블록보다 반드시 뒤에 온다.** flat config 는 rule
  // option 배열을 병합하지 않고 교체하므로, 앞에 두면 `rampCoveredGlobs`(이
  // 파일을 포함한다)가 shadowBlur 셀렉터를 되살려 예외가 무력화된다 — 실측으로
  // 경고 1건이 늘어 발견했다.
  //
  // 예외를 **파일 하나로 좁혀** 두면 두 번째 소비처가 생기는 순간 lint 가 먼저
  // 말한다. 예외가 관례로 번지는 것이 이 배치가 막는 부패다.
  {
    files: ['src/shared/lib/footprint-glyph.ts'],
    rules: {
      'no-restricted-syntax': [
        /*
         * ⚠️ **`error` 다 — 종전엔 `warn` 이었고 그건 게이트가 아니었다.**
         *
         * 예외는 이미 아래 `.filter(…shadowBlur)` 한 줄이 정확히 낸다. 그런데
         * 레벨까지 `warn` 으로 내려 두면 **남은 셀렉터 전부**(arbitrary 크기 ·
         * accent 틴트 · scale/gradient)가 이 파일에서만 무력해진다. 게다가
         * `pnpm lint` 는 `--max-warnings` 가 없어 경고가 몇 개든 exit 0 이다.
         *
         * 2026-08-04 감사 실측: 이 파일에 `text-[13px] rounded-[7px]` 를 심고
         * `pnpm lint` 를 돌리니 «94 problems (0 errors, 94 warnings)» 로
         * **통과했다.** 예외 하나를 여느라 문 전체를 열어 둔 것이다.
         *
         * 켜기 전 전수: 이 파일의 위반은 **0** 이라 승격 비용이 0이다.
         */
        'error',
        ...scaleGradientSelectors.filter((rule) => !rule.selector.includes('shadowBlur')),
        ...arbitrarySizeSelectors,
        ...accentTintPairingSelectors,
        // 2026-08-05: 아래 넷이 빠져 있었다 — 위 주석이 경고한 그 함정을 이
        // 블록 자신이 밟고 있었다. 예외는 `shadowBlur` 한 줄이어야 하는데
        // 타입 축·층위·인라인 그림자·커서까지 같이 꺼져 있었다. 전수 0 이라
        // 켜는 비용은 0.
        ...inlineShadowSelectors,
        ...cursorAffordanceSelectors,
        ...typographyAxisSelectors,
        ...layerSelectors,
      ],
    },
  },
  // 설정 시트에서 `--color-amber-docs-*` 격리 토큰 금지 (2026-08-02, 디자인
  // 카운슬 S3 · 체계석).
  //
  // `VaultAgentSetupPanel` 은 **같은 배지 안에서** 두 앰버 계보를 섞고 있었다:
  // 면은 `--color-amber-source-a12`(경고 사다리, 정상)인데 글자는
  // `--color-amber-docs-a92`(문서 표면 장식용 quarantine)였다. `globals.css`
  // 의 그 토큰 블록 주석이 스스로 *"확장 금지 · 후속 강등 검토 대기"* 라고
  // 적어 뒀는데, 실제로는 이 파일이 15건으로 **최대 소비처**였다.
  //
  // ⚠️ **켜기 전 전수 측정**(`design.md` "룰을 켜기 전 반드시 측정한다"):
  // 치환 후 이 경로의 위반은 0이다. 사정거리를 이 디렉터리로 좁힌 이유도
  // 같다 — 전역으로 켜면 문서함 표면(그 토큰의 정당한 집)과 `ProjectDrawer` ·
  // `LiveActivityIndicator` 의 유산 17건이 한꺼번에 빨개져 강제가 아니라
  // 소음이 된다. 그 둘은 이 카운슬의 표면이 아니라서 다음 순서다.
  //
  // ⚠️ **flat config 는 rule option 배열을 병합하지 않고 교체한다.** 그래서
  // 이 블록은 램프 셀렉터를 **다시 실어야** 한다 — 안 실으면
  // `rampCoveredGlobs`(`src/**` 전부)가 이 디렉터리에 걸어 둔 램프
  // 가드가 조용히 사라진다. 뒤에 오는 블록 중 이 글롭을 다시 덮는 것은 없다.
  {
    files: ['src/widgets/app-settings-menu/**/*.{ts,tsx}'],
    ignores: codexTestIgnores,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...scaleGradientSelectors,
        ...arbitrarySizeSelectors,
        ...accentTintPairingSelectors,
        // 2026-08-05: 이 블록도 같은 함정을 밟고 있었다. 위 주석이 램프
        // 셀렉터를 «다시 실어야 한다» 고 정확히 경고해 놓고 `arbitrarySize`
        // 까지만 실었고, 그래서 이 디렉터리에서는 무게·자간·팔레트·층위가
        // **한 번도 강제된 적이 없다**(#940 이 켠 세 축 포함). 프로브로 확인:
        // 이 경로의 `font-semibold`·`tracking-[…]`·`text-white` 는 0 error 로
        // 통과했다. 전수 0 이라 켜는 비용은 0.
        ...inlineShadowSelectors,
        ...cursorAffordanceSelectors,
        ...typographyAxisSelectors,
        ...layerSelectors,
        {
          selector: 'Literal[value=/color-amber-docs-/]',
          message:
            '설정 시트에서 docs 표면 장식용 quarantine 앰버를 쓰지 않는다. 경고 신호는 --color-amber-source-* (면·보더) 와 --color-amber-source-text-* (글자) 사다리를 쓴다 — 한 배지 안에서 두 앰버 계보가 섞이면 신호가 아니라 장식으로 읽힌다.',
        },
        {
          selector: 'TemplateElement[value.raw=/color-amber-docs-/]',
          message:
            '설정 시트에서 docs 표면 장식용 quarantine 앰버를 쓰지 않는다 (template literal). --color-amber-source-* / --color-amber-source-text-* 사다리를 쓴다.',
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    // 에이전트 병렬 작업용 임시 git worktree — 자기 lint는 각 워크트리에서
    // 돈다. 메인 lint가 이 안까지 스캔하면 타 세션 진행 중 코드가 노이즈로 섞임.
    '.claude/worktrees/**',
    // QA 에이전트 산출물 전용 디렉토리 (gitignored) — 조사 스크립트 잔여물이
    // 메인 lint 게이트를 깨는 재발 방지.
    '.qa-scratch/**',
    'out/**',
    'build/**',
    'src-tauri/target/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
