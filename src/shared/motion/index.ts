/**
 * 모션 토큰의 **JS 거울** — `app/globals.css` 의 `--motion-*` 램프를 그대로 복사한다.
 *
 * ## 왜 복사인가
 *
 * framer-motion 은 `transition` 의 숫자 필드에서 CSS `var()` 를 읽지 못한다.
 * 그래서 값을 옮겨 적을 수밖에 없고, 옮겨 적은 값은 **반드시 드리프트한다** —
 * 게이트가 없으면. 그 게이트가 `tests/contract/motion-token-mirror.contract.test.ts`
 * 다: CSS 를 파싱해 이 파일의 값과 대조하고, 램프 밖 이름이 생기면 실패한다.
 *
 * ## 무엇이 잘못돼 있었나 (2026-07-28 디자인 카운슬 「체계」 실측)
 *
 * 이 파일은 4단(`instant/fast/medium/slow` = 0.12/0.18/**0.28/0.42**)을 갖고
 * 있었는데, **0.28 과 0.42 는 CSS 램프 어디에도 없는 값**이었다. 사용 22건 중
 * **15건이 램프 밖 duration 으로 렌더 중**이었다.
 *
 * 왜 아무 게이트도 안 잡았나: lint 셀렉터(`duration-<숫자>`)는 Tailwind 클래스
 * 문자열만 본다. framer 의 `transition={{ duration: 0.28 }}` 과 이 상수 객체는
 * **어떤 게이트의 사정거리에도 없었다.** 값이 게이트가 안 보는 곳에 살아서
 * 갈라진 것이다.
 *
 * ## 이름은 쓰임이지 크기가 아니다
 *
 * `design.md` 의 3단 램프를 그대로 쓴다 — 값이 아니라 **무엇을 하는 모션인지**로
 * 고른다:
 *
 * - `fast` (120ms) = **확인**. 이미 일어난 상태의 확인(호버·포커스·색·칩 전환).
 * - `base` (180ms) = **이동**. 표면이 자리를 바꾸는 일(패널·시트·카드·드로어의
 *   등장/퇴장).
 * - `settle` (240ms) = **확정**. 일이 끝났다는 서명(FLIP 재배치·커밋 수렴).
 *
 * 구 `medium`/`slow` 콜사이트는 전부 "표면이 등장한다" 였으므로 `base` 로
 * 재배정했다 — 0.42 짜리 카드 등장은 "확인" 도 "확정" 도 아니고 그냥 느렸다.
 */

/** `--motion-ease` 의 값 복사 (cubic-bezier(0.25, 0.1, 0.25, 1)). */
export const MOTION_EASE = [0.25, 0.1, 0.25, 1] as const;

export const MOTION = {
  /** 확인 — 호버·포커스·색. `--motion-fast`. */
  fast: { duration: 0.12, ease: MOTION_EASE },
  /** 이동 — 표면이 자리를 바꾼다. `--motion-base`. */
  base: { duration: 0.18, ease: MOTION_EASE },
  /** 확정 — 일이 끝났다는 서명. `--motion-settle`. */
  settle: { duration: 0.24, ease: MOTION_EASE },
} as const;

/**
 * 리스트 엔트런스 스태거 — 아이템당 누적 딜레이(초).
 *
 * `--git-row-stagger`(14ms) 와 값이 다른 것은 의도다: 저쪽은 기록 표면의 조밀한
 * 행이고 이쪽은 카드다. 하나로 스냅시키면 두 표면의 리듬이 같아져 "같은 것" 으로
 * 읽힌다(카운슬 「체계」: 문맥이 진짜 다르면 스냅 금지).
 */
export const STAGGER = 0.035;

/**
 * DOM 오버레이 3종(GlobalSearch·SearchPalette·NewDocKindDialog, 설계협의회
 * batch B1 rank2) 전용 임계감쇠 스프링 — 오버슈트/바운스 0. `app/globals.css`
 * 의 `--overlay-spring-response`(0.30)/`--overlay-spring-damping`(1.0) 토큰과
 * 값을 맞춘 JS 복사본이다 — framer 는 CSS `var()` 를 숫자 트랜지션 필드에서
 * 읽지 못해 값을 복사한다(캔버스 2-param 물리 모델과는 별도 튜닝, "동일
 * 스프링 상속" 아님 — globals.css 쪽 주석의 변환식 참조). `duration` =
 * response(초), `bounce: 0` 이 damping 1.0(오버슈트 0)의 framer 표현.
 *
 * **이것이 DOM 의 유일한 스프링이다.** 구 `SPRING.sheet`(stiffness 280/damping
 * 30 — 약감쇠라 오버슈트가 있었다)는 소비처 1곳(ProjectDrawer)뿐이었고 등록도
 * 게이트도 없는 미등록 예외였다. 절제가 정체성인 앱에서 오버슈트는 명시 승인
 * 사항이므로, 그 하나를 여기로 이관하고 삭제했다. 정말로 튕겨야 한다는 판정이
 * 나오면 그때 제품 이유와 함께 `bounce > 0` 토큰을 등록한다.
 */
export const OVERLAY_SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;

/**
 * reduced-motion 사용자용 오버레이 트랜지션 — translate/scale 없이 opacity
 * 크로스페이드만, 120ms. globals.css 의 `.overlay-fade-only` 및
 * `--topology-v2-tip-fade-ms`(120) 값 복사와 동일 duration(그 토큰은
 * topology-v2 스코프라 여기서 var() 직접 참조 금지 — 값만 맞춘다).
 */
export const OVERLAY_SPRING_REDUCED = { duration: 0.12, ease: "linear" } as const;

/**
 * 모달 스크림의 페이드 — **오버레이가 뒤를 가리는 그 전이 하나.**
 *
 * 왜 상수인가: 이 값이 네 곳에 `transition={{ duration: reducedMotion ? 0.12 :
 * 0.18 }}` 리터럴로 복제돼 있었다. 값 자체는 램프 위였지만 **`motion-token-mirror`
 * 계약의 사정거리 밖**이라 게이트가 없었고, 이징은 framer 기본이라 "duration 을
 * 받는 원소는 이징도 같은 패밀리" 규율의 반쪽만 지켜졌다.
 *
 * 2026-07-28 에 JS 측 duration 이 CSS 램프 밖으로 두 단(0.28·0.42) 흘러간 사고와
 * **성립 조건이 같다** — 리터럴이 복제되면 언젠가 하나만 바뀐다. 상수로 올리면
 * 그 계약이 자동으로 이 값을 덮는다.
 *
 * 스크림은 표면이 자리를 바꾸는 일(**이동**)이라 `base` 다.
 */
export const SCRIM_FADE = MOTION.base;

/** reduced-motion 등가물 — 오버레이 규율과 같은 120ms 선형. */
export const SCRIM_FADE_REDUCED = OVERLAY_SPRING_REDUCED;
