/**
 * 글자 무게 램프의 **JS 거울** — `app/globals.css` 의 `--font-weight-*` 를
 * 그대로 복사한다.
 *
 * ## 왜 복사인가
 *
 * 캔버스는 `ctx.font = "650 12px …"` 처럼 **문자열 하나**로 무게와 크기를 받고,
 * 그 문자열은 `var()` 를 해석하지 않는다(2D 컨텍스트에는 캐스케이드가 없다).
 * 그래서 값을 옮겨 적을 수밖에 없고, 옮겨 적은 값은 게이트가 없으면 반드시
 * 드리프트한다 — `ICON_SIZE`(숫자 prop 채널) · `MOTION`(framer 채널)과 **같은
 * 구조이고 이유도 같다**.
 *
 * ## 무엇이 잘못돼 있었나 (2026-08-05 실측)
 *
 * 무게 축을 DOM 에서 전부 닫은 뒤에도 **캔버스가 `600` 으로 그리고 있었다** —
 * `cluster-chips.ts` 3곳 · `node-shapes.ts` 1곳. 600 은 이 저장소의 어느
 * 램프 단도 아니고, `globals.css` 가 *"Tailwind 기본(500/600/700)이 아니라 이
 * 셋만 쓴다"* 고 명시적으로 배제한 값이다.
 *
 * 그리고 **같은 캔버스 층 안에서 이미 갈라져 있었다**: `footprint-glyph.ts` 는
 * `650` 을 쓰고 있었다. 형제 하나는 램프 위, 넷은 밖 — 아무도 못 봤다.
 *
 * **왜 아무 게이트도 못 봤나**: lint 셀렉터는 className 문자열을 보고, 램프
 * 래칫은 `.tsx` 의 유틸리티 클래스를 센다. 캔버스는 `.ts` 안에서 **숫자를
 * 템플릿 문자열에 끼워 넣는다** — 두 사정거리 어디에도 안 걸린다. 그리기
 * 표면(캔버스 · 인라인 SVG)은 DOM 스윕으로도 안 보인다.
 *
 * 게이트: `tests/contract/font-weight-mirror.contract.test.ts` 가 CSS 를 파싱해
 * 이 값과 대조하고, 캔버스 소스에 남은 램프 밖 무게 리터럴을 잡는다.
 */
export const FONT_WEIGHT = {
  /** 본문 위 기본 강조. `--font-weight-signature`. */
  signature: 510,
  /** 행 안의 인라인 강조. `--font-weight-emphasis`. */
  emphasis: 560,
  /** 제목 역할 · 수치 강조 · **캔버스 글자**. `--font-weight-strong`. */
  strong: 650,
} as const;

export type FontWeightStep = keyof typeof FONT_WEIGHT;
