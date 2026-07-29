/**
 * 움직이는 캔버스 배경 — **근접 성좌 하나뿐**이다.
 *
 * ## 왜 하나만 남았나 (카운슬 2026-07-29 + 소유자 확정)
 *
 * 배경 후보 열한 개가 전량 기각된 뒤 실측으로 원인이 나왔다. 잉크 **양**이
 * 문제가 아니었다 — 도트 0.645 vs 흐름장 0.601 로 거의 같은데 한쪽만 기각됐다.
 * 변수는 **형태**였다: 기각된 것들이 전부 선이거나 닫힌 도형이라 노드·관계선과
 * **같은 문법**을 써서 "누가 주인공인가"를 다퉜다. 그리고 상시 입자는 프레임당
 * 바뀌는 픽셀의 78%가 정보를 나르지 않았다(흐름장 38,928px vs 도트 8,457px).
 *
 * 그래서 흐름장·중력장은 렌더러째 지웠다 — 탭만 숨기면 다음 사람이 "아직
 * 후보"로 읽는다. 근접 성좌만 소유자가 남기라고 했다.
 *
 * ## 배경은 여전히 데이터에 진다
 *
 * 잉크 상한은 `--canvas-bg-ink-max` 다. 커서 근처에서만 상한까지 올라간다.
 *
 * ## 유휴 연소를 새로 만들지 않는다
 *
 * 자기 타이머를 갖지 않는다. `ambientFactor`(`model/ambient-sleep.ts`)를 그대로
 * 곱하므로 손을 놓으면 감속해 멎는다. 2026-07-28 「작업대」가 잡은 유휴 100%
 * 소모 결함을 배경이 다시 열지 않게 하는 유일한 배선이다.
 *
 * ## reduced-motion 은 빈 화면이 아니라 정착한 화면이다
 *
 * 스텝을 0 으로 만들면 캔버스가 비어 배경이 **삭제**된다. 그래서 마운트 시
 * `SETTLE_STEPS` 만큼 미리 굴려 정지 그림을 만들고 거기서 멈춘다.
 */

/** 커서 반응 반경(px) — 이 밖에서는 배경이 완전히 조용하다. */
const CURSOR_RADIUS = 220;

/** 씨앗 밀도(px²/개) — 선을 O(n²) 로 잇기 때문에 성글다. */
const AREA_PER_SEED = 26_000;

/** 선이 이어지는 최대 거리(px). */
const WEB_LINK_RADIUS = 110;

/** reduced-motion 일 때 정지 그림을 만들기 위해 미리 굴리는 프레임 수. */
const SETTLE_STEPS = 90;

/** 프레임 dt 상한(ms) — 탭 복귀 시 한 프레임에 씨앗이 튀는 것을 막는다. */
const MAX_STEP_MS = 50;

export type AnimatedBackgroundVariant = "web";

export interface AnimatedBackgroundTokens {
  /** `--canvas-bg-ink-max` — 어떤 배경도 넘지 못하는 알파 상한. */
  inkMax: number;
  /** 배경 잉크 RGB(알파 없이) — `"150, 165, 220"` 형태. */
  particleRgb: string;
}

export interface AnimatedBackgroundStepArgs {
  width: number;
  height: number;
  dpr: number;
  /** 카메라 원점의 스크린 좌표 — 프레임 간 델타가 시차를 만든다. */
  originX: number;
  originY: number;
  /** 앰비언트 휴면 계수 [0,1]. 0 이면 스텝하지 않고 마지막 프레임을 유지한다. */
  ambientFactor: number;
  /** 커서 스크린 좌표. 캔버스 밖이면 null. */
  pointerX: number | null;
  pointerY: number | null;
  /** 지난 프레임 이후 경과(ms). */
  dtMs: number;
  reducedMotion: boolean;
}

interface Seed {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * 커서 근접도 [0,1] — 반경 밖은 0, 중심은 1, 사이는 제곱 감쇠.
 * 순수 함수(테스트 대상).
 */
export function cursorFalloff(
  x: number,
  y: number,
  px: number | null,
  py: number | null,
  radius: number = CURSOR_RADIUS,
): number {
  if (px === null || py === null || radius <= 0) return 0;
  const d = Math.hypot(x - px, y - py);
  if (d >= radius) return 0;
  const t = 1 - d / radius;
  return t * t;
}

/** 면적에 비례한 개체 수 — 최소 1, 상한으로 저사양/초광폭 화면을 함께 막는다. */
export function populationFor(width: number, height: number, areaPer: number, cap: number): number {
  if (width <= 0 || height <= 0 || areaPer <= 0) return 0;
  return Math.max(1, Math.min(cap, Math.round((width * height) / areaPer)));
}

export interface AnimatedBackground {
  readonly variant: AnimatedBackgroundVariant;
  /** 한 프레임 진행 + 자체 버퍼에 그리기. */
  step(args: AnimatedBackgroundStepArgs): void;
  /** 버퍼를 대상 컨텍스트에 얹는다(CSS 픽셀 좌표계 기준). */
  paint(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  /** 오프스크린 캔버스 해제 — 언마운트 시 호출. */
  dispose(): void;
}

/**
 * 근접 성좌 상태 + 오프스크린 버퍼를 만든다. 캔버스를 직접 만들므로 jsdom
 * 에서는 `createCanvas` 를 주입해 테스트한다(순수 헬퍼는 위에서 별도 검증).
 */
export function createAnimatedBackground(
  variant: AnimatedBackgroundVariant,
  tokens: AnimatedBackgroundTokens,
  createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
): AnimatedBackground {
  const buffer = createCanvas();
  let bctx = buffer.getContext("2d");
  let bw = 0;
  let bh = 0;
  let bdpr = 1;
  let seeds: Seed[] = [];
  let prevOriginX: number | null = null;
  let prevOriginY: number | null = null;
  let settled = false;

  const baseAlpha = Math.min(tokens.inkMax * 0.7, 0.055);
  const hotAlpha = tokens.inkMax;

  const reseed = (): void => {
    seeds = Array.from({ length: populationFor(bw, bh, AREA_PER_SEED, 140) }, () => ({
      x: Math.random() * bw,
      y: Math.random() * bh,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
    }));
    settled = false;
  };

  const ensureSize = (width: number, height: number, dpr: number): void => {
    if (bw === width && bh === height && bdpr === dpr) return;
    bw = width;
    bh = height;
    bdpr = dpr;
    buffer.width = Math.max(1, Math.round(width * dpr));
    buffer.height = Math.max(1, Math.round(height * dpr));
    bctx = buffer.getContext("2d");
    bctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    reseed();
  };

  /**
   * 카메라 델타만큼 씨앗을 옮긴다 — 배경이 월드를 따른다.
   *
   * 트레일 버퍼를 함께 블릿하지 않는 이유는 폐기된 흐름장에서 배운 것이다:
   * 큰 카메라 이동에 버퍼 절반이 밀려 나가 **빈 영역의 하드 경계**가 남았다.
   * 근접 성좌는 매 프레임 지우고 다시 그리므로 그 문제가 애초에 없다.
   */
  const shift = (dx: number, dy: number): void => {
    if (dx === 0 && dy === 0) return;
    for (const s of seeds) {
      s.x += dx;
      s.y += dy;
    }
  };

  const stepWeb = (ctx: CanvasRenderingContext2D, a: AnimatedBackgroundStepArgs, speed: number): void => {
    // 트레일 없음 — 매 프레임 새로 그린다. 잔상이 없어야 "연결"이 읽힌다.
    ctx.clearRect(0, 0, bw, bh);
    for (const s of seeds) {
      s.x += s.vx * speed;
      s.y += s.vy * speed;
      if (s.x < 0 || s.x > bw) s.vx *= -1;
      if (s.y < 0 || s.y > bh) s.vy *= -1;
      const k = cursorFalloff(s.x, s.y, a.pointerX, a.pointerY);
      if (k > 0 && a.pointerX !== null && a.pointerY !== null) {
        s.x += (a.pointerX - s.x) * 0.004 * k;
        s.y += (a.pointerY - s.y) * 0.004 * k;
      }
      ctx.fillStyle = `rgba(${tokens.particleRgb}, ${baseAlpha * 2.6 + k * hotAlpha * 4})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1 + k * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < seeds.length; i += 1) {
      for (let j = i + 1; j < seeds.length; j += 1) {
        const p = seeds[i];
        const q = seeds[j];
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d > WEB_LINK_RADIUS) continue;
        const k = Math.max(
          cursorFalloff(p.x, p.y, a.pointerX, a.pointerY),
          cursorFalloff(q.x, q.y, a.pointerX, a.pointerY),
        );
        ctx.strokeStyle = `rgba(${tokens.particleRgb}, ${(1 - d / WEB_LINK_RADIUS) * baseAlpha * 1.8 + k * hotAlpha * 2})`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    }
  };

  return {
    variant,
    step(a) {
      ensureSize(a.width, a.height, a.dpr);
      const ctx = bctx;
      if (!ctx || bw <= 0 || bh <= 0) return;

      const dx = prevOriginX === null ? 0 : a.originX - prevOriginX;
      const dy = prevOriginY === null ? 0 : a.originY - prevOriginY;
      prevOriginX = a.originX;
      prevOriginY = a.originY;
      shift(dx, dy);

      if (a.reducedMotion) {
        // 정착 그림을 한 번만 만들고 그 뒤로는 멈춘다 — 움직임 0, 화면은 남는다.
        if (settled) return;
        for (let i = 0; i < SETTLE_STEPS; i += 1) {
          stepWeb(ctx, { ...a, pointerX: null, pointerY: null }, 1);
        }
        settled = true;
        return;
      }

      // 휴면 계수가 0 이면 **한 프레임도 굴리지 않는다** — 마지막 그림이 남는다.
      if (a.ambientFactor <= 0) return;
      const dt = Math.min(MAX_STEP_MS, Math.max(0, a.dtMs)) / 16.667;
      stepWeb(ctx, a, a.ambientFactor * dt);
    },
    paint(ctx, width, height) {
      if (bw <= 0 || bh <= 0) return;
      ctx.drawImage(buffer, 0, 0, width, height);
    },
    dispose() {
      buffer.width = 0;
      buffer.height = 0;
      seeds = [];
      bctx = null;
    },
  };
}
