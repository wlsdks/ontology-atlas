/**
 * 히어로 오브젝트 엔진 — **실제 볼트 그래프의 심도 투영** (canvas 2D 전용).
 *
 * 논지: 히어로 오브젝트가 곧 제품이다. 저작 가능한 네 kind 가 z 축의 평면으로
 * 쌓이고(project / domain / capability / element), `contains` 엣지가 평면
 * 사이를 가로지르고, `depends` 엣지가 capability 평면 위에서 호를 그린다.
 * 모든 노드가 `docs/ontology` 에서 온다 — 계기 스트립·캡션이 세는 그래프와
 * **같은 객체**다(관문의 정직성 계약).
 *
 * 심도 문법 (3D 라이브러리 없음):
 *   - 약한 원근 나눗셈  s = f / (f + z)
 *   - 깊이에 따른 잉크 감쇠(먼 평면이 물러난다)
 *   - 선 굵기 감쇠
 *   - 화가의 순서: 먼 것 → 가까운 것, 엣지는 노드 아래
 *
 * 색은 마운트 시점에 CSS 커스텀 프로퍼티에서 읽는다 — 악센트 토큰이 바뀌면
 * (인디고 ↔ 엠버 전환) 오브젝트가 자동으로 따라간다. hex 를 코드에 박지 않는다.
 *
 * 모션 예산: 48s/1회전 자율 요(yaw) + 드래그 관성(평면별 비틀림 스프링).
 * reduced-motion 에서는 조립이 끝난 정지 1프레임만 그린다 — 드래그(사용자
 * 개시 이동, WCAG 2.3.3 예외)만 다시 그린다.
 *
 * 프레임은 관문 공용 루프(`gateway-frame-loop.ts`)가 공급한다 — 전류장과
 * 같은 rAF 하나이고, 무입력 30s 뒤 2s 램프로 감속해 잠든다(지도의
 * `ambient-sleep.ts` 계약 그대로). 어떤 입력이든 다음 프레임에 복귀한다.
 *
 * 목업 실측(scratchpad `hero-engine.js`, 2026-08-18): draw p50 0.4ms /
 * p95 0.5ms, 프레임 드랍 0. 이 포트는 그 코드의 타입판이고 시각 문법을
 * 바꾸지 않는다.
 */

import { registerGatewayFrameClient } from './gateway-frame-loop';

const TAU = Math.PI * 2;

export interface HeroGraphNode {
  /** slug — 안정 정렬·지터 시드로만 쓴다. */
  s: string;
  k: 'project' | 'domain' | 'capability' | 'element';
  /** 레이아웃이 채운다(월드 좌표). */
  px?: number;
  py?: number;
  pz?: number;
}

export interface HeroGraphEdge {
  a: string;
  b: string;
  y: 'contains' | 'depends';
}

export interface HeroGraphData {
  nodes: HeroGraphNode[];
  edges: HeroGraphEdge[];
}

export interface HeroEngineOptions {
  /** CSS 토큰을 읽을 원소 — 기본 document.documentElement. */
  tokenEl?: Element;
  /** 한 바퀴(ms). 기본 48000 — 응시용 자전이지 회전목마가 아니다. */
  periodMs?: number;
  /** 전체 잉크 배율(무대 위 겹침 보정). */
  inkScale?: number;
  /** 월드가 이 px 안에 맞는다(짧은 변 기준). */
  fitPx?: number;
  /** reduced-motion 강제(테스트용). 기본은 matchMedia. */
  forceReduced?: boolean;
}

export interface HeroEngineHandle {
  dispose: () => void;
}

/** 결정적 해시 → [0,1) — 노드별 안정 지터. */
function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function cssVar(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function hexRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ];
}

interface PlaneSpec {
  y: number;
  r: number;
}

const PLANE: Record<HeroGraphNode['k'], PlaneSpec> = {
  /**
   * project 꼭짓점 y: 148 → 104 (2026-08-18 소유자: *"윗공백이 너무 심한데"*).
   *
   * 실측(1512, 캔버스 303px): 잉크 상단 1/3(95px)이 전체 잉크의 25%만 들고
   * 있었다 — 꼭짓점에서 돔까지 내려가는 원뿔이 가는 스파인뿐이라, bbox 는
   * 정중앙에 앉아 있는데(상하 여백 12px 씩) 눈에는 「위가 비고 돔이 아래로
   * 몰린」 물체였다. 원인은 배치도 투영도 아니고 **형상의 헛공간**이므로
   * 꼭짓점을 돔 쪽으로 44 유닛 내려 원뿔을 조인다. 봉투가 짧아진 만큼
   * 클램프가 배율을 키워 돔 자체가 커진다(잉크 폭 290→324px 실측) — 문법
   * (꼭짓점·링·부챗살·돔)은 그대로다.
   */
  project: { y: 104, r: 0 },
  domain: { y: 56, r: 148 },
  capability: { y: -48, r: 192 },
  element: { y: -150, r: 224 },
};

interface HeroModel {
  nodes: HeroGraphNode[];
  edges: HeroGraphEdge[];
  bySlug: Map<string, HeroGraphNode>;
}

/** kind → 평면, 자식은 부모의 각 구간 아래로 부챗살. */
export function layoutHeroGraph(data: HeroGraphData): HeroModel {
  const nodes = data.nodes;
  const edges = data.edges;
  const byKind: Record<HeroGraphNode['k'], HeroGraphNode[]> = {
    project: [],
    domain: [],
    capability: [],
    element: [],
  };
  const bySlug = new Map<string, HeroGraphNode>();
  for (const n of nodes) {
    byKind[n.k].push(n);
    bySlug.set(n.s, n);
  }

  const parentOf = new Map<string, string>();
  for (const e of edges) {
    if (e.y !== 'contains') continue;
    const parent = bySlug.get(e.a);
    const child = bySlug.get(e.b);
    if (!parent || !child) continue;
    // element 는 capability 부모를 우선한다(부챗살이 더 촘촘해진다).
    if (child.k === 'element') {
      const prior = parentOf.get(e.b);
      if (prior && bySlug.get(prior)?.k === 'capability') continue;
    }
    parentOf.set(e.b, e.a);
  }

  const doms = byKind.domain.slice().sort((a, b) => (a.s < b.s ? -1 : 1));
  const angle = new Map<string, number>();
  doms.forEach((d, i) => {
    angle.set(d.s, (i / Math.max(1, doms.length)) * TAU - Math.PI / 2);
  });

  function fan(kids: HeroGraphNode[], ringR: number, sectorW: number): void {
    const groups = new Map<number, HeroGraphNode[]>();
    for (const k of kids) {
      const p = parentOf.get(k.s);
      const viaParent = p !== undefined ? angle.get(p) : undefined;
      const grandparent = p !== undefined ? parentOf.get(p) : undefined;
      const viaGrandparent =
        grandparent !== undefined ? angle.get(grandparent) : undefined;
      const a = viaParent ?? viaGrandparent ?? hash01(k.s) * TAU;
      const group = groups.get(a);
      if (group) group.push(k);
      else groups.set(a, [k]);
    }
    for (const [a0, group] of groups) {
      const g = group.sort((x, y) => (x.s < y.s ? -1 : 1));
      g.forEach((k, i) => {
        const t = g.length === 1 ? 0 : i / (g.length - 1) - 0.5;
        const a = a0 + t * sectorW;
        // 붐비는 부챗살은 보조 링 둘로 갈라 앉힌다.
        const r =
          ringR + (g.length > 4 ? (i % 2 ? 26 : -12) : 0) + (hash01(k.s) - 0.5) * 10;
        angle.set(k.s, a);
        k.px = Math.cos(a) * r;
        k.pz = Math.sin(a) * r;
      });
    }
  }

  for (const p of byKind.project) {
    p.px = 0;
    p.pz = 0;
    p.py = PLANE.project.y;
  }
  for (const d of doms) {
    const a = angle.get(d.s) ?? 0;
    d.px = Math.cos(a) * PLANE.domain.r;
    d.pz = Math.sin(a) * PLANE.domain.r;
    d.py = PLANE.domain.y;
  }
  const sector = TAU / Math.max(1, doms.length);
  fan(byKind.capability, PLANE.capability.r, sector * 0.62);
  for (const c of byKind.capability) c.py = PLANE.capability.y;
  fan(byKind.element, PLANE.element.r, sector * 0.78);
  for (const el of byKind.element) el.py = PLANE.element.y;

  return { nodes, edges, bySlug };
}

const NODE_R: Record<HeroGraphNode['k'], number> = {
  project: 10.5,
  domain: 4.6,
  capability: 3.1,
  element: 2.05,
};

const TIER_DELAY: Record<HeroGraphNode['k'], number> = {
  project: 0,
  domain: 180,
  capability: 380,
  element: 600,
};

const KINDS: readonly HeroGraphNode['k'][] = [
  'project',
  'domain',
  'capability',
  'element',
];

/** 드래그 시 깊은 평면일수록 살짝 늦게 따라온다(탄성 비틀림) — 그리고 복원된다. */
const LAG_WEIGHT: Record<HeroGraphNode['k'], number> = {
  project: 0,
  domain: -0.1,
  capability: -0.2,
  element: -0.3,
};

export function mountHeroObject(
  canvas: HTMLCanvasElement,
  data: HeroGraphData,
  opts: HeroEngineOptions = {},
): HeroEngineHandle | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null; // jsdom · 컨텍스트 고갈 — 무대만 비워 둔다.

  const reduced =
    opts.forceReduced ??
    (typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches);
  const model = layoutHeroGraph(data);

  const rootEl = opts.tokenEl ?? document.documentElement;
  // 악센트는 토큰으로만 — 이름은 indigo 지만 값은 전환을 따라간다.
  const accent = hexRgb(cssVar(rootEl, '--color-indigo-brand', '#5e6ad2'));
  const accent2 = hexRgb(cssVar(rootEl, '--color-indigo-accent', '#7170ff'));
  const ink = hexRgb(cssVar(rootEl, '--color-text-primary', '#f7f8f8'));
  const fill = hexRgb(cssVar(rootEl, '--color-panel', '#0f1011'));

  const PERIOD = opts.periodMs ?? 48000;
  const PITCH = 0.34;
  const F = 1050;
  const ASSEMBLE = 1600;
  const inkScale = opts.inkScale ?? 1;

  const cosP0 = Math.cos(PITCH);
  const sinP0 = Math.sin(PITCH);

  /**
   * 잉크 봉투(단위 공간) — `scaleFit` 을 곱하기 **전**의 투영 좌표 범위.
   *
   * 왜 필요한가 (2026-08-18 소유자: *"밑에 가려지는 부분 개선해야하고"*):
   * 종전에는 무대 중앙(H/2)에 월드 원점을 놓았는데, 이 오브젝트의 잉크 질량은
   * 원점 대칭이 아니다 — project 꼭짓점(y=148)보다 element 돔(y=-150 · r=224)이
   * 훨씬 넓어서, 실측(1512)에서 위 39px 이 비고 **아래는 0px**, 돔 하단이
   * 계기 괘선에 잘렸다. 요(yaw)를 한 바퀴 샘플링해 회전·드래그 어느 각도에서도
   * 성립하는 봉투를 얻고, ① 세로 중심을 봉투 중심으로 옮기고 ② 봉투가 상자를
   * 넘으면 `fitPx` 가 아니라 봉투가 배율을 정한다(클램프). depends 호의 들림
   * (+46)은 capability 평면과 project 꼭짓점 사이라 봉투 안이다.
   */
  const envelope = (() => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const consider = (px: number, py: number, pz: number, cy: number, sy: number, pad: number): void => {
      const x = px * cy - pz * sy;
      const z = px * sy + pz * cy;
      const y2 = py * cosP0 + z * sinP0;
      const z2 = -py * sinP0 + z * cosP0;
      const s = F / (F + z2);
      const ux = x * s;
      const uy = -y2 * s;
      const r = pad * s;
      if (ux - r < x0) x0 = ux - r;
      if (ux + r > x1) x1 = ux + r;
      if (uy - r < y0) y0 = uy - r;
      if (uy + r > y1) y1 = uy + r;
    };
    const YAW_SAMPLES = 24;
    for (let k = 0; k < YAW_SAMPLES; k += 1) {
      const yawS = (k / YAW_SAMPLES) * TAU;
      const cy = Math.cos(yawS);
      const sy = Math.sin(yawS);
      for (const n of model.nodes) {
        consider(n.px ?? 0, n.py ?? 0, n.pz ?? 0, cy, sy, NODE_R[n.k] * 2.1);
      }
      // 평면 원반 테 — 노드가 안 앉은 각도에서도 링 선이 그려진다.
      for (const kind of ['element', 'capability', 'domain'] as const) {
        const P = PLANE[kind];
        for (let i = 0; i < 24; i += 1) {
          const a = (i / 24) * TAU;
          consider(Math.cos(a) * P.r, P.y, Math.sin(a) * P.r, cy, sy, 0);
        }
      }
    }
    return { x0, y0, x1, y1 };
  })();

  let W = 0;
  let H = 0;
  let dpr = 1;
  let scaleFit = 1;
  let centerX = 0;
  let centerY = 0;
  function size(): void {
    dpr = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    // `fitPx` 는 «원하는 크기», 아래 클램프는 «잘리지 않음» — 봉투가 상자를
    // 넘는 배율은 여백 4% 를 남기고 잘라낸다(위 봉투 독블록).
    const MARGIN = 0.04;
    const envW = Math.max(1, envelope.x1 - envelope.x0);
    const envH = Math.max(1, envelope.y1 - envelope.y0);
    scaleFit = Math.min(
      Math.min(W, H) / (opts.fitPx ?? 620),
      (W * (1 - MARGIN * 2)) / envW,
      (H * (1 - MARGIN * 2)) / envH,
    );
    // 무대 중앙에 놓는 것은 월드 원점이 아니라 **잉크 봉투의 중심**이다.
    centerX = W / 2 - ((envelope.x0 + envelope.x1) / 2) * scaleFit;
    centerY = H / 2 - ((envelope.y0 + envelope.y1) / 2) * scaleFit;
  }
  size();

  let userYaw = 0;
  let userVel = 0;
  let dragging = false;
  let lastX = 0;
  const lag: Record<HeroGraphNode['k'], number> = {
    project: 0,
    domain: 0,
    capability: 0,
    element: 0,
  };

  const onPointerDown = (e: PointerEvent): void => {
    dragging = true;
    lastX = e.clientX;
    userVel = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    const d = dx * 0.006;
    userYaw += d;
    userVel = d;
    for (const k of KINDS) lag[k] += d * LAG_WEIGHT[k];
    if (reduced) drawAt(lastT); // 사용자 개시 이동만 다시 그린다.
  };
  const onPointerUp = (): void => {
    dragging = false;
    canvas.style.cursor = 'grab';
  };
  canvas.style.touchAction = 'pan-y';
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  const onResize = (): void => {
    size();
    drawAt(lastT);
  };
  addEventListener('resize', onResize);

  const cosP = cosP0;
  const sinP = sinP0;
  interface Projected {
    x: number;
    y: number;
    s: number;
    z: number;
  }
  function project(px: number, py: number, pz: number, cy: number, sy: number): Projected {
    const x = px * cy - pz * sy;
    const z = px * sy + pz * cy;
    const y2 = py * cosP + z * sinP;
    const z2 = -py * sinP + z * cosP;
    const s = F / (F + z2);
    // W/2·H/2 가 아니라 봉투 중심(`size()` 의 centerX/centerY) — 위 독블록.
    return { x: x * s * scaleFit + centerX, y: -y2 * s * scaleFit + centerY, s, z: z2 };
  }

  function tierAlpha(kind: HeroGraphNode['k'], t: number): number {
    if (reduced || t >= ASSEMBLE + 600) return 1;
    const dt = (t - TIER_DELAY[kind]) / 520;
    if (dt <= 0) return 0;
    if (dt >= 1) return 1;
    return 1 - (1 - dt) ** 3;
  }

  const dependsEdges = model.edges.filter((e) => e.y === 'depends');
  const containsEdges = model.edges.filter((e) => e.y === 'contains');

  let lastT = 0;
  let disposed = false;
  let unregisterFrame: (() => void) | null = null;

  function drawAt(t: number): void {
    if (disposed) return;
    lastT = t;
    ctx!.clearRect(0, 0, W, H);
    ctx!.globalAlpha = inkScale;
    const yaw = (reduced ? 0.55 : (t / PERIOD) * TAU) + userYaw + 0.55;
    const trig: Record<HeroGraphNode['k'], [number, number]> = {
      project: [0, 0],
      domain: [0, 0],
      capability: [0, 0],
      element: [0, 0],
    };
    for (const k of KINDS) {
      lag[k] *= 0.9;
      const yk = yaw + lag[k];
      trig[k] = [Math.cos(yk), Math.sin(yk)];
    }
    const [cy, sy] = trig.capability;

    // 전부 먼저 투영하고 프레임마다 깊이를 정규화 — 안개가 정직해진다.
    const projected = new Map<string, Projected>();
    let zMin = Infinity;
    let zMax = -Infinity;
    for (const n of model.nodes) {
      const p = project(n.px ?? 0, n.py ?? 0, n.pz ?? 0, trig[n.k][0], trig[n.k][1]);
      projected.set(n.s, p);
      if (p.z < zMin) zMin = p.z;
      if (p.z > zMax) zMax = p.z;
    }
    const zSpan = Math.max(1, zMax - zMin);
    // 가까움 → 1, 멂 → 0.09 (2제곱 계열) — 이 대비가 곧 3D 다.
    const fog = (z: number): number => {
      const u = (z - zMin) / zSpan;
      return 0.09 + 0.91 * (1 - u) ** 1.8;
    };
    const lw = (z: number): number => {
      const u = (z - zMin) / zSpan;
      return 0.45 + 1.15 * (1 - u);
    };

    // 1 · 평면 원반 + 깊이 음영 테 — 스택의 재질.
    for (const kind of ['element', 'capability', 'domain'] as const) {
      const P = PLANE[kind];
      const a = tierAlpha(kind, t);
      if (a <= 0.01) continue;
      const pts: Projected[] = [];
      for (let i = 0; i <= 48; i += 1) {
        const ang = (i / 48) * TAU;
        pts.push(
          project(Math.cos(ang) * P.r, P.y, Math.sin(ang) * P.r, trig[kind][0], trig[kind][1]),
        );
      }
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of pts) {
        if (p.x < x0) x0 = p.x;
        if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.y > y1) y1 = p.y;
      }
      ctx!.beginPath();
      pts.forEach((p, i) => (i ? ctx!.lineTo(p.x, p.y) : ctx!.moveTo(p.x, p.y)));
      ctx!.closePath();
      const lg = ctx!.createLinearGradient(x0, y0, x1, y1); // 좌상단 광원
      lg.addColorStop(0, `rgba(${ink[0]},${ink[1]},${ink[2]},${0.034 * a})`);
      lg.addColorStop(1, `rgba(${ink[0]},${ink[1]},${ink[2]},${0.004 * a})`);
      ctx!.fillStyle = lg;
      ctx!.fill();
      for (let i = 0; i < 48; i += 1) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const f = fog((p0.z + p1.z) / 2);
        ctx!.strokeStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${0.3 * f * a})`;
        ctx!.lineWidth = lw((p0.z + p1.z) / 2) * 0.8;
        ctx!.beginPath();
        ctx!.moveTo(p0.x, p0.y);
        ctx!.lineTo(p1.x, p1.y);
        ctx!.stroke();
      }
    }

    // 2 · contains 엣지, 먼 것 → 가까운 것.
    const eSorted = containsEdges
      .map((e) => {
        const A = projected.get(e.a)!;
        const B = projected.get(e.b)!;
        return { e, A, B, z: (A.z + B.z) / 2 };
      })
      .sort((a, b) => b.z - a.z);
    for (const it of eSorted) {
      const ka = model.bySlug.get(it.e.a)!.k;
      const kb = model.bySlug.get(it.e.b)!.k;
      const a = Math.min(tierAlpha(ka, t), tierAlpha(kb, t));
      if (a <= 0.01) continue;
      const f = fog(it.z);
      const spine = ka === 'project' || kb === 'project';
      ctx!.strokeStyle = spine
        ? `rgba(${accent[0]},${accent[1]},${accent[2]},${(0.2 + 0.28 * f) * a})`
        : `rgba(${ink[0]},${ink[1]},${ink[2]},${0.24 * f * a})`;
      ctx!.lineWidth = lw(it.z) * 0.85;
      ctx!.beginPath();
      ctx!.moveTo(it.A.x, it.A.y);
      ctx!.lineTo(it.B.x, it.B.y);
      ctx!.stroke();
    }

    // 3 · depends 엣지 — capability 평면 위로 들린 악센트 호 + 느린 대시 전류
    //     (지도 절의 .flow 펄스와 같은 문법 — glow 가 아니라 대시 이동이다).
    for (const e of dependsEdges) {
      const na = model.bySlug.get(e.a);
      const nb = model.bySlug.get(e.b);
      if (!na || !nb) continue;
      const a = tierAlpha('capability', t);
      if (a <= 0.01) continue;
      const mx = ((na.px ?? 0) + (nb.px ?? 0)) / 2;
      const mz = ((na.pz ?? 0) + (nb.pz ?? 0)) / 2;
      const my = (na.py ?? 0) + 46;
      ctx!.beginPath();
      let zSum = 0;
      const STEPS = 22;
      for (let i = 0; i <= STEPS; i += 1) {
        const u = i / STEPS;
        const v = 1 - u;
        const px = v * v * (na.px ?? 0) + 2 * v * u * mx + u * u * (nb.px ?? 0);
        const py = v * v * (na.py ?? 0) + 2 * v * u * my + u * u * (nb.py ?? 0);
        const pz = v * v * (na.pz ?? 0) + 2 * v * u * mz + u * u * (nb.pz ?? 0);
        const p = project(px, py, pz, cy, sy);
        zSum += p.z;
        if (i) ctx!.lineTo(p.x, p.y);
        else ctx!.moveTo(p.x, p.y);
      }
      const f = fog(zSum / (STEPS + 1));
      ctx!.strokeStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${Math.min(0.9, 0.75 * f) * a})`;
      ctx!.lineWidth = 1.1;
      ctx!.stroke();
      if (!reduced) {
        ctx!.save();
        ctx!.setLineDash([3, 150]);
        ctx!.lineDashOffset = -((t / 14) % 153);
        ctx!.strokeStyle = `rgba(${accent2[0]},${accent2[1]},${accent2[2]},${Math.min(1, 1.1 * f) * a})`;
        ctx!.lineWidth = 1.6;
        ctx!.stroke();
        ctx!.restore();
      }
    }

    // 4 · 노드, 먼 것 → 가까운 것.
    const nSorted = model.nodes
      .slice()
      .sort((a, b) => projected.get(b.s)!.z - projected.get(a.s)!.z);
    for (const n of nSorted) {
      const p = projected.get(n.s)!;
      const a = tierAlpha(n.k, t);
      if (a <= 0.01) continue;
      const f = fog(p.z);
      const r = NODE_R[n.k] * p.s * scaleFit * 2.1;
      if (n.k === 'project') {
        // 악센트 스트로크 육각형 — 지도 절과 같은 어휘.
        ctx!.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const ang = (i / 6) * TAU - Math.PI / 2;
          const hx = p.x + Math.cos(ang) * r;
          const hy = p.y + Math.sin(ang) * r * 0.92;
          if (i) ctx!.lineTo(hx, hy);
          else ctx!.moveTo(hx, hy);
        }
        ctx!.closePath();
        ctx!.fillStyle = `rgba(${fill[0]},${fill[1]},${fill[2]},${0.94 * a})`;
        ctx!.fill();
        ctx!.strokeStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${Math.min(1, 0.4 + 0.6 * f) * a})`;
        ctx!.lineWidth = 1.5;
        ctx!.stroke();
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, 1.6, 0, TAU);
        ctx!.fillStyle = `rgba(${accent2[0]},${accent2[1]},${accent2[2]},${0.9 * a})`;
        ctx!.fill();
      } else {
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, Math.max(0.8, r), 0, TAU);
        ctx!.fillStyle = `rgba(${fill[0]},${fill[1]},${fill[2]},${0.92 * a})`;
        ctx!.fill();
        const sA = n.k === 'domain' ? 0.95 : n.k === 'capability' ? 0.8 : 0.65;
        ctx!.strokeStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${Math.min(0.95, sA * f) * a})`;
        ctx!.lineWidth = lw(p.z) * 0.9;
        ctx!.stroke();
      }
    }
  }

  if (reduced) {
    drawAt(ASSEMBLE + 601); // 조립이 끝난 정지 1프레임.
  } else {
    // 관문 공용 루프에 탑승한다 — 전류장과 같은 rAF 하나. 자율 요(yaw)는
    // 누적 시계에 휴면 계수를 곱해 전진하므로, 무입력 30s 뒤 2s 램프로
    // 감속해 멎고(스텝 컷 없음) 잠들면 프레임 자체가 스킵된다. 드래그·관성은
    // 입력 직후라 계수가 항상 1 인 구간에 산다. `gateway-frame-loop.ts` 독블록.
    let animT = 0;
    unregisterFrame = registerGatewayFrameClient(({ dtMs, factor }) => {
      if (disposed) return;
      if (!dragging) {
        userVel *= 0.94;
        userYaw += userVel;
      }
      animT += dtMs * factor;
      drawAt(animT);
    });
  }

  return {
    dispose(): void {
      disposed = true;
      unregisterFrame?.();
      removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    },
  };
}
