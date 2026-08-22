'use client';

import { useEffect, useRef } from 'react';

import { registerGatewayFrameClient } from '../lib/gateway-frame-loop';

/**
 * The gateway's effect layer — **the current field, the grain, and the custom cursor ring.**
 *
 * This is the one explicit exception to the charter's ban on animated gradient backgrounds
 * (`.claude/rules/forbidden.md`, the design section — same form as the footprint bloom). Four
 * conditions: ① it lives only inside `.gateway-fx-stage` (the gateway) ② its alpha ceilings are
 * locked by `--gateway-fx-*` tokens (light 0.14, grain 0.05, motes 0.28) ③ the first second paints
 * in a still state and only then does ambient motion begin (the first-three-seconds rule — the
 * background must not disturb the headline's entrance) ④ under reduced-motion the rAF loop does
 * not run at all (one still frame).
 *
 * Frames come from the gateway's shared loop (`gateway-frame-loop.ts`) — the same single rAF as
 * the hero object, decelerating over a 2s ramp and sleeping after 30s of no input (the map's
 * `ambient-sleep.ts` contract verbatim). Any input restores it on the next frame.
 * Gates: `tests/contract/gateway-fx-exception.contract.test.ts` plus the gateway-fx scope selector
 * in `eslint.config.mjs`.
 *
 * ## The cursor ring
 *
 * It **does not remove** the native cursor — there is no `cursor: none`, and the pointer
 * affordance contract (`tests/e2e/cursor-affordance.spec.ts`) is untouched. The ring carries one
 * piece of information: "expanded plus accent tint = what is under the pointer is pressable".
 * 28px at rest, 44px over an interactive target. Under `pointer: coarse` CSS hides it entirely (a
 * finger has no cursor). Under reduced-motion it attaches instantly with no lerp.
 *
 * ## The accent
 *
 * The light's colour reads the computed `--color-indigo-brand` at mount — the token is named
 * indigo but its value follows the accent switch (indigo ↔ amber). No hex is written into the code.
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

    /**
     * A low-resolution buffer (0.5×, dpr pinned to 1) — this layer's ink is **inherently blurred
     * radial light**, so pixel density adds no information. Drawing at full resolution every frame
     * makes compositing cost slow the whole page where there is no GPU (headless e2e, low-end
     * machines) — measured, the hover audit hit a 60s timeout. The motes (1–3px) soften slightly
     * under upscaling, which if anything makes them more mote-like.
     */
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

    // Three low-luminance lights — relative weights (1 / .64 / .5) used only multiplied by the alpha ceiling.
    const blobs = [
      { w: 1, r: 0.46, cx: 0.26, cy: 0.34, sp: 1.0, ph: 0 },
      { w: 0.64, r: 0.52, cx: 0.76, cy: 0.22, sp: 0.66, ph: 2.2 },
      { w: 0.5, r: 0.6, cx: 0.52, cy: 0.92, sp: 0.5, ph: 4.4 },
    ];
    const dust = Array.from({ length: 110 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: 0.3 + Math.random() * 1.1,
      a: 0.2 + Math.random() * 0.8, // relative weight — used only multiplied by the alpha ceiling
      vx: -0.008 - Math.random() * 0.012,
      vy: -0.004 - Math.random() * 0.01,
      tw: Math.random() * 6.28,
    }));
    // Target intensity per section — bright in the hero, subdued in the body, up slightly again lower down.
    const KEY = [1, 0.42, 0.3, 0.36, 0.55];
    let intensity = 1;
    let ambient = 0; // 0→1 after 1000ms (the first-three-seconds rule)

    /**
     * This page's scroller is not `window` but **the app shell's body slot** (an `overflow-y: auto`
     * div) — reading `scrollY` always gives 0, pinning the per-section intensity at the hero's value
     * (measured 2026-08-18). The canvas's scrolling ancestor is found once, falling back to `window`
     * if the structure changes.
     */
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
      const i = Math.min(Math.floor(p), KEY.length - 1);
      const f = Math.min(p - i, 1);
      const next = KEY[Math.min(i + 1, KEY.length - 1)];
      return KEY[i] + (next - KEY[i]) * f;
    }

    function draw(t: number): void {
      ctx!.clearRect(0, 0, W, H);
      intensity += (targetIntensity() - intensity) * 0.06;
      const T = t / 24000;
      ctx!.globalCompositeOperation = 'lighter';
      for (const b of blobs) {
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
      draw(0); // a background, but permanently still
    } else {
      draw(0); // 0–150ms: paint in the still state
      startTimer = window.setTimeout(() => {
        let ampTime = 0;
        let lastPaint = 0;
        // Ride the gateway's shared loop — the same single rAF as the hero object. Ambient sleep
        // (after 30s of no input, decelerate over a 2s ramp → stop → skip frames) is owned by the
        // driver. See the `gateway-frame-loop.ts` doc-block.
        unregisterFrame = registerGatewayFrameClient(({ t, dtMs, factor }) => {
          if (disposed) return;
          ambient = Math.min(ambient + dtMs / 1500, 1); // 1.5s ease-in
          // An accumulated clock with no phase jump — the sleep factor multiplies «speed», so drift
          // and twinkle decelerate to a stop and any input returns the factor to 1 on the next frame.
          ampTime += dtMs * ambient * factor;
          fxLoopLive = true;
          // 30fps is enough for the ambient layer — for drift with a period of tens of seconds,
          // 60fps is power rather than information. Only the cursor follows every frame (that is the hand's work).
          if (t - lastPaint >= 33) {
            lastPaint = t;
            draw(ampTime);
          }
          cursorTick?.(); // cursor lerp — the same rAF, no separate loop
        });
      }, 1000); // 1000ms: ambient motion eases in (the first-three-seconds rule)
    }

    // ── The cursor ring — pointer: fine only, hidden on blur or leave, translate3d only ──
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
        // With no loop (reduced-motion, or the first second) or before it starts, it attaches
        // instantly — a laggy cursor is not an equivalent for a reduced-motion user, it is a defect.
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
