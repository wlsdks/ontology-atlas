'use client';

import { useEffect, useState } from 'react';

import { useFrameMeter } from '@/shared/lib/appearance-preferences';

/**
 * 프레임 계기 — 지도가 실제로 몇 프레임을 내주고 있는지 화면에서 말한다.
 *
 * ## 무엇을 재는가 (그리고 무엇을 안 재는가)
 *
 * **눈에 도달한 프레임**을 잰다. `requestAnimationFrame` 이 실제로 불린 간격이라,
 * 원인이 우리 스크립트든 GC 든 합성이든 브라우저 확장이든 **버벅임 자체**가 잡힌다.
 * 반대로 「우리 코드가 한 프레임에 몇 ms 썼나」는 **안 잰다** — 그건 루프에 계측을
 * 심어야 나오는 값이고, 여기서 재면 계기 자신의 rAF 를 앱의 rAF 로 착각하게 된다
 * (2026-07-31 실측 사고: rAF 간격 8.3ms 를 「앱이 8.3ms 쓴다」로 읽었는데, 그건
 * 그냥 120Hz 디스플레이의 주사 간격이었다).
 *
 * ## 왜 「최악 간격」이 fps 보다 중요한가
 *
 * 버벅임은 평균이 아니라 **꼬리**다. 소유자 녹화 영상을 프레임 타임스탬프로 재보니
 * 중앙값은 16.7ms(=60fps) 로 멀쩡한데 최악 간격이 **150ms** 였고, 100ms 넘는
 * 프레임은 11초 중 8장(1.4%)뿐이었다. 평균만 보면 "정상"이라고 보고했을 값이다.
 * 그래서 이 계기는 fps 와 **직전 1초의 최악 간격**을 나란히 놓는다.
 *
 * ## 꺼져 있으면 아무것도 돌지 않는다
 *
 * 설정이 off 면 rAF 를 걸지 않고 렌더도 하지 않는다. **성능을 갉아먹는 성능계는
 * 거짓말쟁이다** — 켜야만 존재한다.
 */

/** 화면 갱신 주기(ms). 매 프레임 setState 하면 계기가 부하가 된다. */
const REPORT_MS = 250;
/** 「최악 간격」을 보는 창(ms). 눈이 버벅임을 기억하는 길이에 맞춘다. */
const WORST_WINDOW_MS = 1000;
/** 이 위는 «끊겼다» 로 친다 — 60Hz 한 프레임(16.7ms)의 두 배. */
const JANK_MS = 34;

interface Sample {
  fps: number;
  worst: number;
  jank: number;
}

/**
 * 설정만 읽는 껍데기 — 꺼져 있으면 **측정하는 쪽을 아예 마운트하지 않는다.**
 *
 * 「이펙트 안에서 상태를 지우기」로 껐다 켰다를 처리하면 두 가지가 따라온다:
 * lint 가 옳게 지적하고(상태 초기화는 렌더 경로가 아니다), 다시 켰을 때 **직전
 * 세션의 숫자가 250ms 동안 남는다** — 계기가 옛 값을 현재로 보여주는 것은
 * 계기로서 가장 나쁜 실패다. 언마운트로 가르면 둘 다 저절로 없어진다.
 */
export function FrameMeter({ className }: { className?: string }) {
  const enabled = useFrameMeter();
  if (!enabled) return null;
  return <FrameMeterLive className={className} />;
}

function FrameMeterLive({ className }: { className?: string }) {
  const [sample, setSample] = useState<Sample | null>(null);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let reportedAt = last;
    // [timestamp, gap] 쌍을 창 길이만큼만 들고 있는다 — 무한히 자라지 않게.
    const gaps: Array<[number, number]> = [];

    const tick = (now: number) => {
      const gap = now - last;
      last = now;
      gaps.push([now, gap]);
      while (gaps.length > 0 && now - gaps[0][0] > WORST_WINDOW_MS) gaps.shift();

      if (now - reportedAt >= REPORT_MS && gaps.length > 1) {
        reportedAt = now;
        let worst = 0;
        let jank = 0;
        let total = 0;
        for (const [, g] of gaps) {
          if (g > worst) worst = g;
          if (g > JANK_MS) jank += 1;
          total += g;
        }
        const fps = total > 0 ? Math.round((gaps.length / total) * 1000) : 0;
        setSample({ fps, worst: Math.round(worst), jank });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 표본이 두 개 모이기 전에는 간격을 계산할 수 없다 — 그때 0fps 같은
  // «그럴듯한 거짓말» 을 그리지 않는다.
  if (sample === null) return null;

  // 상태는 색이 아니라 **값**이 말한다. 색은 그 값을 거들 뿐이라, 색을 못 보는
  // 사람에게도 숫자만으로 판정이 선다(WCAG 1.4.1).
  const bad = sample.worst >= 100 || sample.jank >= 3;
  const warn = !bad && (sample.worst >= JANK_MS * 2 || sample.jank >= 1);
  // 신호 톤은 램프에 **선언된** 토큰만 쓴다. 처음엔 `--color-error-text` /
  // `--color-warning-text` 라고 썼는데 둘 다 존재하지 않는 이름이었다 —
  // 없는 토큰을 부르는 `var()` 는 **에러 없이 색이 안 먹을 뿐**이라, 계기가
  // «위험» 을 말해야 할 때 아무 말도 안 하고 있었을 것이다.
  // `undeclared-token-ref` 계약 테스트가 잡았다.
  const tone = bad
    ? 'text-[color:var(--color-status-danger)]'
    : warn
      ? 'text-[color:var(--color-status-warning)]'
      : 'text-[color:var(--color-text-tertiary)]';

  return (
    <div
      className={className}
      // 진단 계기는 지도를 가리지도, 클릭을 먹지도 않는다.
      style={{ pointerEvents: 'none' }}
      // 매 250ms 바뀌는 숫자를 스크린리더가 계속 읽으면 방해만 된다.
      aria-hidden="true"
    >
      <div className="flex items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2 py-1 font-mono text-label tabular-nums">
        <span className={tone}>{sample.fps} fps</span>
        <span className="text-[color:var(--color-divider)]">·</span>
        <span className={tone}>최악 {sample.worst}ms</span>
        {sample.jank > 0 ? (
          <>
            <span className="text-[color:var(--color-divider)]">·</span>
            <span className={tone}>끊김 {sample.jank}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
