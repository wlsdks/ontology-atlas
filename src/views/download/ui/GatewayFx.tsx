'use client';

import { useEffect, useRef } from 'react';

import { registerGatewayFrameClient } from '../lib/gateway-frame-loop';

/**
 * The gateway's light field, grain and cursor ring. Only inside `.gateway-fx-stage`, alpha capped
 * by `--gateway-fx-*` tokens, still for the first second so the headline enters undisturbed, one
 * still frame under reduced motion (`tests/contract/gateway-fx-reduced-motion.contract.test.ts`).
 * The ring never hides the native cursor (`tests/e2e/cursor-affordance.spec.ts`); it grows over
 * pressable targets.
 */
export function GatewayFx() {
  const fieldRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = fieldRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    const styles = getComputedStyle(document.documentElement);
    const readAlpha = (name: string, fallback: number): number => {
      const v = Number.parseFloat(styles.getPropertyValue(name));
      return Number.isFinite(v) ? v : fallback;
    };
    const blobAlphaCeiling = readAlpha('--gateway-fx-blob-alpha', 0.14);
    const dustAlphaCeiling = readAlpha('--gateway-fx-dust-alpha', 0.28);
    const accentRaw = styles.getPropertyValue('--color-indigo-brand').trim() || '#5e6ad2';
    const hexRgb = (hex: string): [number, number, number] => {
      const m = hex.replace('#', '');
      const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
      return [
        parseInt(n.slice(0, 2), 16),
        parseInt(n.slice(2, 4), 16),
        parseInt(n.slice(4, 6), 16),
      ];
    };
    const accent = accentRaw.startsWith('#') ? hexRgb(accentRaw) : ([94, 106, 210] as const);
    const dustRaw = styles.getPropertyValue('--gateway-fx-dust').trim() || '#ececf0';
    const dustInk = dustRaw.startsWith('#') ? hexRgb(dustRaw) : ([236, 236, 240] as const);

    /** Blurred light gains nothing from density, and full resolution slows GPU-less pages to a crawl. */
    const BUFFER_SCALE = 0.5;
    let W = 0;
    let H = 0;
    function size(): void {
      W = innerWidth;
      H = innerHeight;
      canvas!.width = Math.max(1, Math.round(W * BUFFER_SCALE));
      canvas!.height = Math.max(1, Math.round(H * BUFFER_SCALE));
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      ctx!.setTransform(BUFFER_SCALE, 0, 0, BUFFER_SCALE, 0, 0);
    }
    size();

    // Weights are relative, only ever multiplied by the alpha ceiling.
    const blobs = [
      { w: 1, r: 0.46, cx: 0.26, cy: 0.34, sp: 1.0, ph: 0, follow: false },
      { w: 0.64, r: 0.52, cx: 0.76, cy: 0.22, sp: 0.66, ph: 2.2, follow: false },
      { w: 0.5, r: 0.6, cx: 0.52, cy: 0.92, sp: 0.5, ph: 4.4, follow: false },
      /* Trails a fine pointer with inertia so it reads as weather, not a cursor. */
      { w: 0.5, r: 0.3, cx: 0.5, cy: 0.45, sp: 0, ph: 0, follow: true },
    ];
    let handX = 0.5;
    let handY = 0.45;
    let handSeen = false;
    const finePointer =
      typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
    const onHand = (e: PointerEvent): void => {
      handX = e.clientX / Math.max(1, innerWidth);
      handY = e.clientY / Math.max(1, innerHeight);
      handSeen = true;
    };
    if (finePointer && !reduced) addEventListener('pointermove', onHand, { passive: true });
    const dust = Array.from({ length: 110 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: 0.3 + Math.random() * 1.1,
      a: 0.2 + Math.random() * 0.8,
      vx: -0.008 - Math.random() * 0.012,
      vy: -0.004 - Math.random() * 0.01,
      tw: Math.random() * 6.28,
    }));
    const SECTION_INTENSITY = [1, 0.42, 0.3, 0.36, 0.55];
    let intensity = 1;
    let ambient = 0;

    /** The scroller is the app shell's body slot, where `scrollY` is always 0; `window` is the fallback. */
    let scrollHost: HTMLElement | null | undefined;
    const readScrollTop = (): number => {
      if (scrollHost === undefined) {
        scrollHost = null;
        for (let n = canvas!.parentElement; n; n = n.parentElement) {
          const o = getComputedStyle(n).overflowY;
          if (o === 'auto' || o === 'scroll') {
            scrollHost = n;
            break;
          }
        }
      }
      return scrollHost ? scrollHost.scrollTop : scrollY;
    };

    function targetIntensity(): number {
      const p = readScrollTop() / Math.max(1, innerHeight);
      const i = Math.min(Math.floor(p), SECTION_INTENSITY.length - 1);
      const f = Math.min(p - i, 1);
      const next = SECTION_INTENSITY[Math.min(i + 1, SECTION_INTENSITY.length - 1)];
      return SECTION_INTENSITY[i] + (next - SECTION_INTENSITY[i]) * f;
    }

    let lastT = 0;
    function draw(t: number): void {
      ctx!.clearRect(0, 0, W, H);
      intensity += (targetIntensity() - intensity) * 0.06;
      const T = t / 24000;
      ctx!.globalCompositeOperation = 'lighter';
      for (const b of blobs) {
        if (b.follow) {
          if (!handSeen) continue;
          // Time-based, so it eases the same on 60Hz and 120Hz panels.
          const k = 1 - Math.exp(-(t - lastT) / 370);
          b.cx += (handX - b.cx) * k;
          b.cy += (handY - b.cy) * k;
        }
        const x = (b.cx + 0.07 * Math.sin(T * 6.283 * b.sp + b.ph)) * W;
        const y = (b.cy + 0.05 * Math.cos(T * 6.283 * b.sp * 0.8 + b.ph)) * H;
        const r = b.r * Math.max(W, H);
        const g = ctx!.createRadialGradient(x, y, 0, x, y, r);
        const alpha = b.w * blobAlphaCeiling * intensity;
        g.addColorStop(0, `rgba(${accent[0]},${accent[1]},${accent[2]},${alpha})`);
        g.addColorStop(1, `rgba(${accent[0]},${accent[1]},${accent[2]},0)`);
        ctx!.fillStyle = g;
        ctx!.fillRect(0, 0, W, H);
      }
      for (const d of dust) {
        if (t > 0) {
          d.x += d.vx / 100;
          d.y += d.vy / 100;
        }
        if (d.x < 0) d.x += 1;
        if (d.y < 0) d.y += 1;
        const tw = 0.6 + 0.4 * Math.sin(t / 1400 + d.tw);
        const alpha = d.a * dustAlphaCeiling * tw * (0.4 + 0.6 * intensity);
        ctx!.fillStyle = `rgba(${dustInk[0]},${dustInk[1]},${dustInk[2]},${alpha})`;
        ctx!.fillRect(d.x * W, d.y * H, d.s, d.s);
      }
      ctx!.globalCompositeOperation = 'source-over';
      lastT = t;
    }

    let startTimer = 0;
    let disposed = false;
    let cursorTick: (() => void) | null = null;
    let fxLoopLive = false;
    let unregisterFrame: (() => void) | null = null;

    const onResize = (): void => {
      size();
      draw(0);
    };
    addEventListener('resize', onResize);

    if (reduced) {
      draw(0);
    } else {
      draw(0);
      startTimer = window.setTimeout(() => {
        let ampTime = 0;
        let lastPaint = 0;
        unregisterFrame = registerGatewayFrameClient(({ t, dtMs, factor }) => {
          if (disposed) return;
          ambient = Math.min(ambient + dtMs / 1500, 1);
          // The sleep factor scales speed, so idle decelerates to a stop without a phase jump.
          ampTime += dtMs * ambient * factor;
          fxLoopLive = true;
          // 30fps for drift with a period of tens of seconds; only the cursor follows every frame.
          if (t - lastPaint >= 33) {
            lastPaint = t;
            draw(ampTime);
          }
          cursorTick?.();
        });
      }, 1000);
    }

    // The cursor ring: fine pointers only, translate3d only.
    const cur = cursorRef.current;
    let cleanupCursor: (() => void) | null = null;
    if (cur && typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches) {
      const ring = cur.firstElementChild as HTMLElement | null;
      cur.classList.add('is-live');
      let tx = innerWidth / 2;
      let ty = innerHeight / 2;
      let cx = tx;
      let cy = ty;
      const HOT =
        'a,button,[role="button"],video,summary,input,select,textarea,label';
      const put = (): void => {
        cur.style.transform = `translate3d(${cx}px,${cy}px,0)`;
      };
      const onPointerMove = (e: PointerEvent): void => {
        tx = e.clientX;
        ty = e.clientY;
        // Without the loop it attaches instantly: a lagging cursor under reduced motion is a defect.
        if (!fxLoopLive || reduced) {
          cx = tx;
          cy = ty;
          put();
        }
        cur.classList.add('is-on');
        const target = e.target as Element | null;
        ring?.classList.toggle('is-hot', Boolean(target?.closest?.(HOT)));
      };
      cursorTick = () => {
        cx += (tx - cx) * 0.3;
        cy += (ty - cy) * 0.3;
        put();
      };
      const onBlur = (): void => cur.classList.remove('is-on');
      const onLeave = (): void => cur.classList.remove('is-on');
      addEventListener('pointermove', onPointerMove, { passive: true });
      addEventListener('blur', onBlur);
      document.documentElement.addEventListener('mouseleave', onLeave);
      cleanupCursor = () => {
        removeEventListener('pointermove', onPointerMove);
        removeEventListener('blur', onBlur);
        document.documentElement.removeEventListener('mouseleave', onLeave);
      };
    }

    return () => {
      disposed = true;
      window.clearTimeout(startTimer);
      unregisterFrame?.();
      removeEventListener('resize', onResize);
      removeEventListener('pointermove', onHand);
      cleanupCursor?.();
    };
  }, []);

  return (
    <>
      <canvas ref={fieldRef} className="gateway-fx-field" aria-hidden="true" />
      <div className="gateway-fx-grain" aria-hidden="true" />
      <div ref={cursorRef} className="gateway-cursor" aria-hidden="true">
        <i />
      </div>
    </>
  );
}
