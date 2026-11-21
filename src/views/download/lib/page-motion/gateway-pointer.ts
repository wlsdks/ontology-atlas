/**
 * The download page's own pointer: an exact dot, a ring that follows it and wraps whatever it can
 * press, nearby stars of the background field linking to it like concepts on a map, and a click
 * that sets down a small node with a ripple and sparks. Off under reduced motion, while the page's
 * motion is paused and on touch screens; then the system pointer is the pointer.
 */

export interface Star {
  x: number;
  y: number;
}

export interface PointerInk {
  line: readonly [number, number, number];
  glow: readonly [number, number, number];
  spark: readonly [number, number, number];
}

/** How far a star may be and still link to the pointer, and how many link at once. */
export const LINK_RADIUS_PX = 150;
const LINK_MAX = 7;
const NODE_STAR_RADIUS_PX = 220;
const NODE_NODE_RADIUS_PX = 320;
const NODE_STARS = 3;
const NODE_MAX = 6;
const NODE_LIFE_MS = 1700;
const NODE_DRAW_MS = 380;
const WAVE_LIFE_MS = 640;
const WAVE_RADIUS_PX = 58;
const SPARKS = 8;
const SPARK_LIFE_MS = 680;
/** The ring trails the dot by this time constant; the dot itself never lags. */
const RING_LAG_MS = 70;
/** After the pointer stops, the links fade over this long, then the loop sleeps. */
const LINGER_MS = 900;
const FADE_MS = 520;
/** A pressable this small is wrapped by the ring; anything larger only fills it. */
const WRAP_MAX = { width: 360, height: 96 };
const WRAP_PAD_PX = 6;

const PRESSABLE = 'a,button:not([data-moru-companion]),[role="button"],summary,label,select';
const TEXT_ENTRY = 'input,textarea,[contenteditable="true"]';

interface Wave {
  x: number;
  y: number;
  born: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
}
interface PinNode {
  x: number;
  y: number;
  born: number;
  stars: Star[];
  links: PinNode[];
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** The `max` stars nearest to a point within `radiusPx`, nearest first. O(n log n) on n stars. */
export function nearestStars(stars: readonly Star[], x: number, y: number, width: number, height: number, radiusPx: number, max: number) {
  const near: { star: Star; distance: number }[] = [];
  for (const star of stars) {
    const distance = Math.hypot(star.x * width - x, star.y * height - y);
    if (distance < radiusPx) near.push({ star, distance });
  }
  return near.sort((a, b) => a.distance - b.distance).slice(0, max);
}

export interface GatewayPointerParts {
  host: HTMLElement;
  ring: HTMLElement;
  dot: HTMLElement;
  canvas: HTMLCanvasElement;
  stars: readonly Star[];
  ink: PointerInk;
}

export interface GatewayPointer {
  setModal: (open: boolean) => void;
  stop: () => void;
}

export function startGatewayPointer({ host, ring, dot, canvas, stars, ink }: GatewayPointerParts): GatewayPointer {
  const ctx = canvas.getContext('2d');
  const root = document.documentElement;
  let width = innerWidth;
  let height = innerHeight;
  let scale = 1;
  const size = () => {
    width = innerWidth;
    height = innerHeight;
    scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  };
  size();

  let px = width / 2;
  let py = height / 2;
  let rx = px;
  let ry = py;
  let seen = false;
  let visible = false;
  let lastMove = -Infinity;
  let wrapped: Element | null = null;
  let modal = false;
  let frame = 0;
  let lastT = 0;
  let presence = 0;
  const waves: Wave[] = [];
  const sparks: Spark[] = [];
  const pins: PinNode[] = [];

  const show = (on: boolean) => {
    if (on === visible) return;
    visible = on;
    host.classList.toggle('is-on', on);
    if (on) root.setAttribute('data-gateway-cursor', '');
    else root.removeAttribute('data-gateway-cursor');
  };

  const wrap = (target: Element | null) => {
    if (target === wrapped) return;
    wrapped = target;
    const box = target?.getBoundingClientRect();
    if (target && box && box.width <= WRAP_MAX.width && box.height <= WRAP_MAX.height) {
      const radius = Number.parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0;
      ring.style.width = `${box.width + WRAP_PAD_PX * 2}px`;
      ring.style.height = `${box.height + WRAP_PAD_PX * 2}px`;
      ring.style.borderRadius = `${Math.min(radius + WRAP_PAD_PX, (box.height + WRAP_PAD_PX * 2) / 2)}px`;
      ring.dataset.state = 'wrap';
    } else {
      ring.style.width = '';
      ring.style.height = '';
      ring.style.borderRadius = '';
      ring.dataset.state = target ? 'fill' : 'rest';
    }
  };

  const ringGoal = () => {
    if (wrapped && ring.dataset.state === 'wrap') {
      const box = wrapped.getBoundingClientRect();
      // Concentric with what it wraps: any pull toward the pointer reads as a misaligned outline.
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }
    return { x: px, y: py };
  };

  const draw = (t: number) => {
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    if (presence > 0.001) {
      for (const { star, distance } of nearestStars(stars, rx, ry, width, height, LINK_RADIUS_PX, LINK_MAX)) {
        const near = (1 - distance / LINK_RADIUS_PX) ** 1.5 * presence;
        const sx = star.x * width;
        const sy = star.y * height;
        ctx.strokeStyle = rgba(ink.line, 0.34 * near);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.fillStyle = rgba(ink.glow, 0.8 * near);
        ctx.beginPath();
        ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const pin of pins) {
      const age = t - pin.born;
      const fade = clamp01(age / 160) * clamp01((NODE_LIFE_MS - age) / 520);
      const reach = easeOut(clamp01(age / NODE_DRAW_MS));
      const alive = pin.links.filter((other) => pins.includes(other));
      for (const target of [...pin.stars.map((s) => ({ x: s.x * width, y: s.y * height })), ...alive]) {
        ctx.strokeStyle = rgba(ink.line, 0.5 * fade);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pin.x, pin.y);
        ctx.lineTo(pin.x + (target.x - pin.x) * reach, pin.y + (target.y - pin.y) * reach);
        ctx.stroke();
      }
      const halo = ctx.createRadialGradient(pin.x, pin.y, 0, pin.x, pin.y, 18);
      halo.addColorStop(0, rgba(ink.glow, 0.55 * fade));
      halo.addColorStop(1, rgba(ink.glow, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(pin.x - 18, pin.y - 18, 36, 36);
      ctx.fillStyle = rgba(ink.spark, 0.9 * fade);
      ctx.beginPath();
      ctx.arc(pin.x, pin.y, 2.4 * (0.6 + 0.4 * reach), 0, Math.PI * 2);
      ctx.fill();
    }

    for (const wave of waves) {
      const k = clamp01((t - wave.born) / WAVE_LIFE_MS);
      ctx.strokeStyle = rgba(ink.glow, 0.5 * (1 - k) ** 2);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, 4 + (WAVE_RADIUS_PX - 4) * easeOut(k), 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const spark of sparks) {
      const k = clamp01((t - spark.born) / SPARK_LIFE_MS);
      ctx.fillStyle = rgba(ink.spark, 0.9 * (1 - k) ** 2);
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, 1.4 * (1 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  const step = (t: number) => {
    const dt = lastT ? Math.min(t - lastT, 64) : 16;
    lastT = t;
    const goal = ringGoal();
    const follow = 1 - Math.exp(-dt / RING_LAG_MS);
    rx += (goal.x - rx) * follow;
    ry += (goal.y - ry) * follow;
    host.style.transform = `translate3d(${rx}px,${ry}px,0)`;

    const idle = t - lastMove;
    // Over a control the links step aside, so no line crosses the label being pressed.
    const want = visible && idle < LINGER_MS && !wrapped ? 1 : 0;
    presence += (want - presence) * (1 - Math.exp(-dt / (want ? 160 : FADE_MS / 3)));

    const drag = Math.exp(-dt / 220);
    for (const spark of sparks) {
      spark.x += (spark.vx * dt) / 1000;
      spark.y += (spark.vy * dt) / 1000;
      spark.vx *= drag;
      spark.vy *= drag;
    }
    prune(waves, (w) => t - w.born < WAVE_LIFE_MS);
    prune(sparks, (s) => t - s.born < SPARK_LIFE_MS);
    prune(pins, (p) => t - p.born < NODE_LIFE_MS);

    draw(t);
    const settled = Math.hypot(goal.x - rx, goal.y - ry) < 0.3;
    const busy = !settled || presence > 0.002 || waves.length + sparks.length + pins.length > 0;
    frame = busy ? requestAnimationFrame(step) : 0;
    if (!busy) {
      lastT = 0;
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };
  const wake = () => {
    if (!frame) frame = requestAnimationFrame(step);
  };

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    px = event.clientX;
    py = event.clientY;
    if (!seen) {
      seen = true;
      rx = px;
      ry = py;
    }
    dot.style.transform = `translate3d(${px}px,${py}px,0)`;
    lastMove = performance.now();
    const target = event.target as Element | null;
    const ownPointer = Boolean(target?.closest?.('[data-own-pointer]'));
    const typing = Boolean(target?.closest?.(TEXT_ENTRY));
    show(!modal && !ownPointer && !typing);
    wrap(target?.closest?.(PRESSABLE) ?? null);
    wake();
  };

  const onDown = (event: PointerEvent) => {
    if (!visible || event.button !== 0) return;
    const t = performance.now();
    host.classList.add('is-pressed');
    waves.push({ x: px, y: py, born: t });
    for (let index = 0; index < SPARKS; index += 1) {
      const angle = (index / SPARKS) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 150 + Math.random() * 120;
      sparks.push({ x: px, y: py, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, born: t });
    }
    const pin: PinNode = {
      x: px,
      y: py,
      born: t,
      stars: nearestStars(stars, px, py, width, height, NODE_STAR_RADIUS_PX, NODE_STARS).map((near) => near.star),
      links: pins.filter((other) => Math.hypot(other.x - px, other.y - py) < NODE_NODE_RADIUS_PX).slice(-2),
    };
    pins.push(pin);
    if (pins.length > NODE_MAX) pins.shift();
    wake();
  };
  const onUp = () => host.classList.remove('is-pressed');
  const onLeave = () => {
    show(false);
    wrap(null);
  };
  const onResize = () => size();
  const onScroll = () => {
    // The page scrolls under a still pointer: what it points at changes, so the ring re-wraps.
    if (!seen || !visible) return;
    wrap(document.elementFromPoint(px, py)?.closest?.(PRESSABLE) ?? null);
    wake();
  };

  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerdown', onDown, { passive: true });
  addEventListener('pointerup', onUp, { passive: true });
  addEventListener('blur', onLeave);
  addEventListener('resize', onResize);
  addEventListener('scroll', onScroll, { passive: true, capture: true });
  root.addEventListener('mouseleave', onLeave);

  const stop = () => {
    cancelAnimationFrame(frame);
    show(false);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerdown', onDown);
    removeEventListener('pointerup', onUp);
    removeEventListener('blur', onLeave);
    removeEventListener('resize', onResize);
    removeEventListener('scroll', onScroll, { capture: true });
    root.removeEventListener('mouseleave', onLeave);
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };
  const setModal = (open: boolean) => {
    modal = open;
    if (open) onLeave();
  };
  return { setModal, stop };
}

function prune<T>(list: T[], keep: (item: T) => boolean) {
  let write = 0;
  for (const item of list) if (keep(item)) list[write++] = item;
  list.length = write;
}
