/**
 * 움직이는 캔버스 배경 3종 — 흐름장 · 근접 성좌 · 중력장.
 *
 * ## 왜 정적 배경을 대체하나 (소유자 확정 2026-07-29)
 *
 * 구 배경 세트(도트 · 성좌 · 등고선)는 전부 **정적 타일**이었다. 소유자 판정:
 * *"도트 빼고는 다 별로"* · *"등고선 이런게 왜필요할까"* — 등고선은 이 그래프에
 * 없는 **지형(높이)** 을 암시해 거짓 정보에 가깝고, 정적 성좌는 도트가 이미 하는
 * 일(좌표계가 있다)을 더 비싸게 반복했다. 그래서 둘을 **지우고** 커서에 반응하는
 * 셋을 넣는다 — 옵션 3 → 4 지만 렌더러는 3 → 3 이다(순증 0).
 *
 * ## 배경은 여전히 데이터에 진다
 *
 * 잉크 상한은 그대로 `--canvas-bg-ink-max` 다. 세 배경 모두 그 값을 넘지 않으며,
 * 커서 근처에서만 상한까지 올라간다. Tufte 의 data-ink 규율은 "배경이 움직이면
 * 안 된다"가 아니라 "배경이 데이터를 이기면 안 된다"이고, 여기서 지켜지는 것은
 * 후자다. 헌장이 금지하는 **움직이는 그라디언트 · 오로라 · 글로우**는 여전히
 * 금지이고 셋 중 무엇도 그것이 아니다 — 전부 1px 선/점의 알파 합성이다.
 *
 * ## 유휴 연소를 새로 만들지 않는다
 *
 * 이 모듈은 자기 타이머를 갖지 않는다. `ambientFactor`(`model/ambient-sleep.ts`)
 * 를 그대로 곱해 쓰므로, 손을 놓으면 입자가 **감속해 멎고** 마지막 프레임이
 * 남는다. 2026-07-28 「작업대」가 잡은 유휴 100% 소모 결함을 배경이 다시 열지
 * 않게 하는 유일한 배선이다. 정지 프레임이 흉하지 않은 것은 세 배경 모두 어느
 * 순간을 잘라도 **그 자체로 정지 텍스처**이기 때문이다(등고선/도트와 같은 종류의
 * 그림이 된다).
 *
 * ## reduced-motion 은 빈 화면이 아니라 정착한 화면이다
 *
 * 스텝을 0 으로 만들면 트레일 버퍼가 비어 캔버스가 **아무것도 없는 검정**이 된다 —
 * 모션을 줄이려다 배경을 삭제하는 셈이다. 그래서 마운트 시 `SETTLE_STEPS` 만큼
 * 미리 굴려 정지 텍스처를 만들고 거기서 멈춘다. WCAG 2.3.3 의 취지(움직임 제거)를
 * 지키면서 화면은 남는다.
 *
 * ## 시차는 버퍼 이동으로 만든다
 *
 * 입자는 스크린 좌표에 살지만 매 프레임 **카메라 델타만큼 함께 옮긴다** — 그래서
 * 팬을 하면 배경도 따라 흐른다(2026-07-20 「B3」이 잡은 "모니터에 용접된 격자"
 * 결함의 재발 방지). 트레일 버퍼도 같은 델타로 블릿한다. 새로 들어온 가장자리는
 * 1초 안쪽에 입자가 채운다.
 */

/** 커서 반응 반경(px) — 이 밖에서는 배경이 완전히 조용하다. */
const CURSOR_RADIUS = 220;

/** 화면 면적당 입자 하나 기준(px²) — 클수록 성글다. 1920×1080 에서 약 1,400개. */
const AREA_PER_PARTICLE = 1480;

/** 근접 성좌의 씨앗 밀도 — 선을 O(n²) 로 잇기 때문에 입자보다 훨씬 성글다. */
const AREA_PER_SEED = 26_000;

/** 근접 성좌에서 선이 이어지는 최대 거리(px). */
const WEB_LINK_RADIUS = 110;

/** reduced-motion 일 때 정지 텍스처를 만들기 위해 미리 굴리는 프레임 수. */
const SETTLE_STEPS = 90;

/** 프레임 dt 상한(ms) — 탭 복귀 시 한 프레임에 입자가 화면 밖으로 튀는 것을 막는다. */
const MAX_STEP_MS = 50;

export type AnimatedBackgroundVariant = "flow" | "web" | "gravity";

export interface AnimatedBackgroundTokens {
  /** `--canvas-bg-ink-max` — 어떤 배경도 넘지 못하는 알파 상한. */
  inkMax: number;
  /** 배경 잉크 RGB(알파 없이) — `"150, 165, 220"` 형태. 알파는 코드가 상한 안에서 정한다. */
  particleRgb: string;
  /** 캔버스 바탕색 — 트레일을 만드는 반투명 덮기에 쓴다(합성이 아니라 감쇠). */
  canvasRgb: string;
}

export interface AnimatedBackgroundAttractor {
  x: number;
  y: number;
  /** 상대 질량 — 허브가 크다. */
  m: number;
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
  /** 중력장 전용 — 노드 스크린 좌표. 다른 변형은 무시한다. */
  attractors: readonly AnimatedBackgroundAttractor[];
  /** 지난 프레임 이후 경과(ms). */
  dtMs: number;
  reducedMotion: boolean;
}

interface Particle {
  x: number;
  y: number;
  life: number;
}

interface Seed {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/* ── 값 노이즈 (의존 0, 고정 시드라 세션/기기 불변) ───────────────────────── */

const PERM = new Uint8Array(512);
(() => {
  const p = [...Array(256).keys()];
  let s = 1337;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 255; i > 0; i -= 1) {
    const j = (rnd() * (i + 1)) | 0;
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i += 1) PERM[i] = p[i & 255];
})();

const fade = (x: number): number => x * x * x * (x * (x * 6 - 15) + 10);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const gradAt = (h: number, x: number, y: number): number => {
  const u = h & 1 ? x : y;
  const v = h & 2 ? y : x;
  return (h & 4 ? -u : u) + (h & 8 ? -v : v);
};

/**
 * 화면이 담아야 할 노이즈 셀 수 — **1 이면 큰 덩어리 하나가 통째로 보인다.**
 *
 * 처음 주파수(0.0022)는 845px 높이에 셀 1.7개만 얹혀서, 그 하나의 발산선이
 * 화면을 가로지르는 **가로 띠**로 읽혔다(소유자 실보고: *"하얗게 중앙에 가로로
 * 선이 생긴것같다"*). 실측: 경계 위 평균 9.19 → 아래 7.17. 도트 배경에서는
 * 같은 자리에 계단이 없어 배경 고유 결함으로 확정됐다.
 *
 * 셀을 여러 개 담으면 큰 흐름 하나가 아니라 **여러 소용돌이**가 되고, 어느 한
 * 발산선도 화면을 가로지르지 못한다.
 */
const FLOW_CELLS_ACROSS = 4.5;

/** 기준 변(px) — 이 길이에 위 셀 수가 담기도록 주파수를 잡는다. */
const FLOW_REFERENCE_SPAN = 900;

/** 흐름장 노이즈 주파수. */
const FLOW_FREQ = FLOW_CELLS_ACROSS / FLOW_REFERENCE_SPAN;

/**
 * 2옥타브 값 노이즈 — 큰 흐름 위에 절반 진폭의 잔결을 얹는다. 한 옥타브만
 * 쓰면 어느 배율에서든 같은 크기의 덩어리만 보여 "장 하나"로 읽힌다.
 */
function fieldNoise2(x: number, y: number): number {
  return fieldNoise(x, y) + fieldNoise(x * 2.17, y * 2.17) * 0.5;
}

/** 2D 값 노이즈 [-0.5, 0.5]. 순수 함수 — 같은 (x,y) 는 항상 같은 값(테스트 대상). */
export function fieldNoise(x: number, y: number): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);
  const a = PERM[xi] + yi;
  const b = PERM[xi + 1] + yi;
  return (
    mix(
      mix(gradAt(PERM[a], xf, yf), gradAt(PERM[b], xf - 1, yf), u),
      mix(gradAt(PERM[a + 1], xf, yf - 1), gradAt(PERM[b + 1], xf - 1, yf - 1), u),
      v,
    ) * 0.5
  );
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
 * 변형 하나를 위한 상태 + 오프스크린 버퍼를 만든다. 캔버스를 직접 만드므로
 * jsdom 에서는 `createCanvas` 를 주입해 테스트한다(순수 헬퍼는 위에서 별도 검증).
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
  let particles: Particle[] = [];
  let seeds: Seed[] = [];
  let prevOriginX: number | null = null;
  let prevOriginY: number | null = null;
  let time = 0;
  let settled = false;

  const baseAlpha = Math.min(tokens.inkMax * 0.7, 0.055);
  const hotAlpha = tokens.inkMax;

  const reseed = (): void => {
    const pCount = variant === "web" ? 0 : populationFor(bw, bh, AREA_PER_PARTICLE, 2600);
    const sCount = variant === "web" ? populationFor(bw, bh, AREA_PER_SEED, 140) : 0;
    particles = Array.from({ length: pCount }, () => ({
      x: Math.random() * bw,
      y: Math.random() * bh,
      life: Math.random() * 140,
    }));
    seeds = Array.from({ length: sCount }, () => ({
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

  /** 트레일 감쇠 — 바탕색을 낮은 알파로 덮는다. 지우기가 아니라 **잔상**이다. */
  const decay = (ctx: CanvasRenderingContext2D, alpha: number): void => {
    ctx.fillStyle = `rgba(${tokens.canvasRgb}, ${alpha})`;
    ctx.fillRect(0, 0, bw, bh);
  };

  /**
   * 카메라 델타 반영 — **씨앗만** 옮긴다. 트레일 버퍼도 입자도 옮기지 않는다.
   *
   * ## 왜 버퍼 이동을 걷어냈나 (설치 앱 실측 2026-07-29)
   *
   * 처음엔 버퍼를 카메라 델타만큼 블릿해 시차를 만들었다. 그런데 카메라가 크게
   * 움직이면(핏 애니메이션·줌) 한 프레임에 버퍼의 절반이 밀려 나가고 **빈 영역이
   * 하드한 가로선**으로 남는다 — 소유자가 본 *"하얗게 중앙에 가로로 선"* 의 정체다.
   * 입자가 다시 채우기까지 초 단위가 걸리는데, 그동안 화면에는 있지도 않은 경계가
   * 그려진다.
   *
   * 그래서 흐름장·중력장은 **화면에 붙인다**. 2026-07-20 「B3」이 청사진 격자에서
   * 잡은 "모니터에 용접" 결함이 여기엔 적용되지 않는다 — 그 결함이 보였던 이유는
   * 격자가 **규칙적 격자**여서 눈이 기준점을 잡을 수 있었기 때문이고, 난수 흐름
   * 텍스처에는 따라갈 지형지물이 없다. 즉 시차가 나를 정보가 애초에 없다. 반면
   * 빈 영역의 하드 경계는 **없는 정보를 만든다.** 하나는 못 보는 것이고 하나는
   * 잘못 보는 것이라, 후자를 없애는 쪽이 옳다.
   *
   * 중력장은 이것과 무관하게 이미 월드를 따른다 — 벡터장을 **노드 스크린 좌표**가
   * 정하므로 카메라가 움직이면 장도 함께 움직인다.
   *
   * 근접 성좌만 씨앗을 옮긴다. 그쪽은 점과 선이라 **지형지물이 있고**(눈이 개별
   * 점을 따라간다), 매 프레임 지우고 다시 그리므로 빌 영역 자체가 없다.
   */
  const shift = (dx: number, dy: number): void => {
    if (variant !== "web") return;
    if (dx === 0 && dy === 0) return;
    for (const s of seeds) {
      s.x += dx;
      s.y += dy;
    }
  };

  const recycle = (p: Particle, margin: number): void => {
    if (p.life > 0 && p.x >= -margin && p.x <= bw + margin && p.y >= -margin && p.y <= bh + margin) return;
    p.x = Math.random() * bw;
    p.y = Math.random() * bh;
    p.life = 70 + Math.random() * 160;
  };

  const stepFlow = (ctx: CanvasRenderingContext2D, a: AnimatedBackgroundStepArgs, speed: number): void => {
    decay(ctx, 0.085);
    ctx.lineWidth = 1;
    for (const p of particles) {
      const k = cursorFalloff(p.x, p.y, a.pointerX, a.pointerY);
      // 시간은 **대각선**으로 흘린다. y 축으로만 밀면 장 전체가 세로로 표류해
      // 입자가 특정 높이에 쌓이고, 그게 다시 가로줄이 된다.
      let ang =
        fieldNoise2(p.x * FLOW_FREQ + time * 0.035, p.y * FLOW_FREQ + time * 0.045) * Math.PI * 4;
      if (k > 0) {
        // 커서를 **감싸고 돈다**(향하지 않는다) — 빨려 들어가면 커서가 블랙홀로
        // 읽혀 지도의 주인공(노드)과 주목을 다툰다.
        ang = ang * (1 - k) + (Math.atan2(p.y - (a.pointerY ?? 0), p.x - (a.pointerX ?? 0)) + Math.PI / 2) * k;
      }
      const sp = (0.9 + k * 2.2) * speed;
      const nx = p.x + Math.cos(ang) * sp;
      const ny = p.y + Math.sin(ang) * sp;
      ctx.strokeStyle = `rgba(${tokens.particleRgb}, ${baseAlpha + k * (hotAlpha - baseAlpha) * 3})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      p.x = nx;
      p.y = ny;
      p.life -= 1;
      recycle(p, 0);
    }
  };

  const stepGravity = (ctx: CanvasRenderingContext2D, a: AnimatedBackgroundStepArgs, speed: number): void => {
    decay(ctx, 0.09);
    ctx.lineWidth = 1;
    const wells = a.attractors;
    for (const p of particles) {
      let ax = 0;
      let ay = 0;
      for (const n of wells) {
        const dx = n.x - p.x;
        const dy = n.y - p.y;
        const d2 = dx * dx + dy * dy + 900;
        const f = (n.m * 260) / d2;
        ax += dx * f;
        ay += dy * f;
      }
      // 인력에 **수직** = 공전 방향. 노드로 빨려 들어가면 노드가 가려진다.
      let ang = Math.atan2(ay, ax) + Math.PI / 2;
      ang += fieldNoise2(p.x * FLOW_FREQ * 0.8 + time * 0.03, p.y * FLOW_FREQ * 0.8 + time * 0.035) * 1.4;
      const k = cursorFalloff(p.x, p.y, a.pointerX, a.pointerY);
      if (k > 0) {
        ang = ang * (1 - k) + (Math.atan2(p.y - (a.pointerY ?? 0), p.x - (a.pointerX ?? 0)) + Math.PI / 2) * k;
      }
      const sp = (0.85 + k * 2) * speed;
      const nx = p.x + Math.cos(ang) * sp;
      const ny = p.y + Math.sin(ang) * sp;
      ctx.strokeStyle = `rgba(${tokens.particleRgb}, ${baseAlpha * 0.9 + k * (hotAlpha - baseAlpha) * 2.6})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      p.x = nx;
      p.y = ny;
      p.life -= 1;
      recycle(p, 24);
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

  const runOne = (ctx: CanvasRenderingContext2D, a: AnimatedBackgroundStepArgs, speed: number): void => {
    if (variant === "flow") stepFlow(ctx, a, speed);
    else if (variant === "gravity") stepGravity(ctx, a, speed);
    else stepWeb(ctx, a, speed);
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
        // 정착 텍스처를 한 번만 만들고 그 뒤로는 멈춘다 — 움직임 0, 화면은 남는다.
        if (settled) return;
        for (let i = 0; i < SETTLE_STEPS; i += 1) {
          time += 1 / 60;
          runOne(ctx, { ...a, pointerX: null, pointerY: null }, 1);
        }
        settled = true;
        return;
      }

      // 휴면 계수가 0 이면 **한 프레임도 굴리지 않는다** — 마지막 그림이 그대로
      // 남아 정지 텍스처가 된다. 유휴 래스터 비용은 이 조기 반환이 막는다.
      if (a.ambientFactor <= 0) return;
      const dt = Math.min(MAX_STEP_MS, Math.max(0, a.dtMs)) / 16.667;
      time += dt / 60;
      runOne(ctx, a, a.ambientFactor * dt);
    },
    paint(ctx, width, height) {
      if (bw <= 0 || bh <= 0) return;
      ctx.drawImage(buffer, 0, 0, width, height);
    },
    dispose() {
      buffer.width = 0;
      buffer.height = 0;
      particles = [];
      seeds = [];
      bctx = null;
    },
  };
}
