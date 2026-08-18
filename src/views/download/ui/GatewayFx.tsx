'use client';

import { useEffect, useRef } from 'react';

/**
 * 관문 랜딩의 효과층 — **전류장(field) · 그레인 · 커스텀 커서 링.**
 *
 * 헌장의 「움직이는 그라디언트 배경」 금지에 대한 명문 예외 1건이다
 * (`.claude/rules/forbidden.md` 「디자인」절 — 발자국 번짐과 같은 형식).
 * 조건 넷: ① `.gateway-fx-stage`(관문 랜딩) 안에서만 산다 ② 알파 상한이
 * `--gateway-fx-*` 토큰으로 잠겨 있다(광원 0.14 · 그레인 0.05 · 성진 0.28)
 * ③ 첫 1초는 정지 상태로 페인트하고 그 뒤에야 분위기 모션이 개입한다
 * (첫 3초 규칙 — 배경은 헤드라인의 등장을 방해하지 않는다) ④ reduced-motion
 * 에서는 rAF 루프 자체를 돌리지 않는다(정지 1프레임).
 * 게이트: `tests/contract/gateway-fx-exception.contract.test.ts` +
 * `eslint.config.mjs` 의 gateway-fx 스코프 셀렉터.
 *
 * ## 커서 링
 *
 * 네이티브 커서를 **지우지 않는다** — `cursor: none` 없음, pointer 어포던스
 * 계약(`tests/e2e/cursor-affordance.spec.ts`)은 그대로다. 링이 나르는 정보
 * 하나: 「확장 + 악센트 착색 = 포인터 아래가 지금 눌리는 대상」. 쉼 28px →
 * 상호작용 위 44px. `pointer: coarse` 에서는 CSS 가 통째로 숨긴다(손가락에는
 * 커서가 없다). reduced-motion 에서는 지연 추종(lerp) 없이 즉시 붙는다.
 *
 * ## 악센트
 *
 * 광원 색은 마운트 시점에 `--color-indigo-brand` 계산값을 읽는다 — 토큰
 * 이름은 indigo 지만 값은 악센트 전환(인디고 ↔ 엠버)을 따라간다. hex 를
 * 코드에 박지 않는다.
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

    /**
     * 저해상 버퍼 (0.5×, dpr 1 고정) — 이 층의 잉크는 **본질적으로 흐린
     * 라디얼 광원**이라 화소 밀도가 정보를 더하지 않는다. 전체 해상도로 매
     * 프레임 그리면 GPU 없는 환경(헤드리스 e2e · 저사양)에서 합성 비용이
     * 페이지 전체를 굼뜨게 만든다(실측: hover 감사가 60s 타임아웃에 닿았다).
     * 성진(1~3px)은 업스케일로 살짝 부드러워지는데, 그게 오히려 성진답다.
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

    // 저휘도 광원 3 — 상대 무게(1 / .64 / .5)에 상한 알파를 곱해서만 쓴다.
    const blobs = [
      { w: 1, r: 0.46, cx: 0.26, cy: 0.34, sp: 1.0, ph: 0 },
      { w: 0.64, r: 0.52, cx: 0.76, cy: 0.22, sp: 0.66, ph: 2.2 },
      { w: 0.5, r: 0.6, cx: 0.52, cy: 0.92, sp: 0.5, ph: 4.4 },
    ];
    const dust = Array.from({ length: 110 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: 0.3 + Math.random() * 1.1,
      a: 0.2 + Math.random() * 0.8, // 상대 무게 — 상한 알파를 곱해서만 쓴다.
      vx: -0.008 - Math.random() * 0.012,
      vy: -0.004 - Math.random() * 0.01,
      tw: Math.random() * 6.28,
    }));
    // 절별 목표 세기 — 히어로에서 밝고 본문에서 가라앉고 다운로드 절에서 다시 조금.
    const KEY = [1, 0.42, 0.3, 0.36, 0.55];
    let intensity = 1;
    let ambient = 0; // 1000ms 뒤 0→1 (첫 3초 규칙)

    /**
     * 이 페이지의 스크롤러는 window 가 아니라 **앱 셸의 본문 슬롯**(overflow-y:
     * auto div)이다 — `scrollY` 를 읽으면 언제나 0 이라 절별 세기가 히어로
     * 값에 붙박인다(2026-08-18 실측). 캔버스의 스크롤 조상을 한 번 찾아 두고,
     * 없으면(구조가 바뀌면) window 로 떨어진다.
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
        ctx!.fillStyle = `rgba(236,236,240,${alpha})`;
        ctx!.fillRect(d.x * W, d.y * H, d.s, d.s);
      }
      ctx!.globalCompositeOperation = 'source-over';
    }

    let rafId = 0;
    let startTimer = 0;
    let disposed = false;
    let cursorTick: (() => void) | null = null;
    let fxLoopLive = false;

    const onResize = (): void => {
      size();
      draw(0);
    };
    addEventListener('resize', onResize);

    if (reduced) {
      draw(0); // 배경은 있되 영구 정지.
    } else {
      draw(0); // 0~150ms: 정지 상태로 페인트.
      startTimer = window.setTimeout(() => {
        let ampTime = 0;
        let last = performance.now();
        let lastPaint = 0;
        const loop = (t: number): void => {
          if (disposed) return;
          ambient = Math.min(ambient + (t - last) / 1500, 1); // 1.5s ease-in
          ampTime += (t - last) * ambient; // 위상 점프 없는 누적 시계
          last = t;
          fxLoopLive = true;
          // 분위기층은 30fps 면 충분하다 — 수십 초 주기의 표류에 60fps 는
          // 정보가 아니라 전력이다. 커서 추종만 매 프레임(그건 손의 일이다).
          if (t - lastPaint >= 33) {
            lastPaint = t;
            draw(ampTime);
          }
          cursorTick?.(); // 커서 지연 추종 — 같은 rAF (별도 루프 없음)
          rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
      }, 1000); // 1000ms: 분위기 모션이 서서히 개입 (첫 3초 규칙)
    }

    // ── 커서 링 — pointer: fine 전용, blur/이탈 시 숨김, translate3d 만. ──
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
        // 루프가 없거나(reduced-motion · 첫 1초) 아직 안 돌면 즉시 붙는다 —
        // 감속 사용자에게 랙 있는 커서는 동등물이 아니라 결함이다.
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
      cancelAnimationFrame(rafId);
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
