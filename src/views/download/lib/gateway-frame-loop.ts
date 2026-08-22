/**
 * The gateway's frame loop — one shared rAF driver plus ambient sleep for the
 * gateway's canvas layers (`GatewayFx`, `hero-object-engine`).
 *
 * ## Why it exists
 *
 * Measured 2026-08-19: the gateway (`/ko/`, `/ko/download/`) burned 55–68 ms per
 * second forever, even 40 s after the last input — the exact opposite of the map
 * screen, which reaches zero busy frames 32 s after input stops. Two causes:
 *
 * 1. **Three rAF loops were running** (900 callbacks in a 5 s window = 60 Hz × 3).
 *    The FX layer and the hero object each owned one, and the evidence section's
 *    map engine added a third. Several loops running independently is an accident,
 *    not a design, so the gateway's own two were merged into this one. The map
 *    engine's loop stays where it is — it is owned by that widget and already has
 *    its own sleep, so it only spins noop frames.
 * 2. **Neither gateway loop could sleep.** The map sleeps under the
 *    `ambient-sleep.ts` contract ("alive in your hand, asleep when you put it
 *    down"); the FX layer and the dome rotation lived outside it. This is the
 *    gateway's instance of the failure `idle-gate.ts` warns about: a condition
 *    applied to one side only.
 *
 * ## The contract — same as the map's
 *
 * Every time constant, ramp, and decision is **imported** from
 * `ambient-sleep.ts`; no copy is made here. Until `AMBIENT_SLEEP_DELAY_MS` (30 s)
 * after the last input the factor is 1 — **not one pixel differs from before**.
 * Over the next `AMBIENT_SLEEP_RAMP_MS` (2 s) it ramps 1 → 0, so motion decelerates
 * to a stop rather than cutting, because a step cut reads as breakage. At 0 the
 * client calls are skipped entirely.
 *
 * rAF itself never stops, matching the conservative design in `idle-gate.ts`. The
 * idle decision is re-evaluated every frame, so any input (move, click, wheel,
 * scroll, key, touch) restores the factor to 1 **on the next frame**. There is no
 * wake wiring, and therefore no failure mode where a missed wake freezes the
 * screen. A noop frame costs microseconds — the same order as the map's measured
 * 1.7 ms/s at idle.
 *
 * reduced-motion never reaches here: under it, both consumers skip registering the
 * loop and draw a single static frame instead (gateway FX exception clause (b),
 * `tests/contract/gateway-fx-exception.contract.test.ts`).
 *
 * Gate: `tests/e2e/gateway-idle-sleep.spec.ts` measures whether the per-second
 * synchronous time in rAF callbacks actually reaches the floor after input stops.
 */
import {
  AMBIENT_SLEEP_DELAY_MS,
  AMBIENT_SLEEP_RAMP_MS,
  ambientSleepFactor,
  isAmbientAsleep,
} from '@/widgets/topology-map-v2/model/ambient-sleep';

export interface GatewayFrameTick {
  /** rAF 타임스탬프(ms) — 페인트 스로틀(30fps 층)의 기준. */
  t: number;
  /**
   * 이전 틱과의 간격(ms, 상한 64) — 탭이 백그라운드였다 돌아와도 누적 시계가
   * 위상 점프하지 않는다(rAF 는 숨은 탭에서 멎는다).
   */
  dtMs: number;
  /**
   * 앰비언트 휴면 계수 (0,1] — 모션 «속도»에 곱한다. 0 인 프레임은 클라이언트에
   * 도착하지 않는다(그 프레임은 그릴 것이 없다 — 시계가 멎었으니 마지막으로
   * 그린 그림과 동일하다).
   */
  factor: number;
}

export type GatewayFrameClient = (tick: GatewayFrameTick) => void;

/** 어떤 종류든 「손이 닿았다」로 치는 입력 — 전부 passive 라 스크롤을 안 막는다. */
const INPUT_EVENTS = [
  'pointermove',
  'pointerdown',
  'wheel',
  'keydown',
  'touchstart',
] as const;

const clients = new Set<GatewayFrameClient>();
let running = false;
let rafId = 0;
let lastInputMs = 0;
let lastT = 0;

function onInput(): void {
  lastInputMs = performance.now();
}

function frame(t: number): void {
  if (!running) return;
  rafId = requestAnimationFrame(frame);
  const dtMs = Math.min(Math.max(t - lastT, 0), 64);
  lastT = t;
  const factor = ambientSleepFactor(performance.now(), lastInputMs);
  if (isAmbientAsleep(factor)) return; // 잠듦 — 페인트 전면 스킵 (noop 프레임)
  const tick: GatewayFrameTick = { t, dtMs, factor };
  for (const client of clients) client(tick);
}

function start(): void {
  running = true;
  lastInputMs = performance.now(); // 도착 자체가 「방금 손이 닿은 상태」다.
  lastT = performance.now();
  for (const type of INPUT_EVENTS) {
    addEventListener(type, onInput, { passive: true });
  }
  // 이 페이지의 스크롤러는 window 가 아니라 앱 셸의 본문 슬롯이다
  // (`GatewayFx` 독블록 실측) — capture 로 어느 스크롤 호스트든 잡는다.
  addEventListener('scroll', onInput, { capture: true, passive: true });
  rafId = requestAnimationFrame(frame);
}

function stop(): void {
  running = false;
  cancelAnimationFrame(rafId);
  for (const type of INPUT_EVENTS) {
    removeEventListener(type, onInput);
  }
  removeEventListener('scroll', onInput, { capture: true });
}

/**
 * 프레임 클라이언트 등록 — 반환된 함수로 해지한다. 첫 등록이 루프와 입력
 * 리스너를 세우고, 마지막 해지가 전부 걷는다(관문을 떠나면 아무것도 안 남는다).
 */
export function registerGatewayFrameClient(client: GatewayFrameClient): () => void {
  clients.add(client);
  if (!running) start();
  return () => {
    clients.delete(client);
    if (clients.size === 0 && running) stop();
  };
}

/** 게이트·독자용 재수출 — 관문의 휴면 시간표는 지도의 그것과 같은 상수다. */
export { AMBIENT_SLEEP_DELAY_MS, AMBIENT_SLEEP_RAMP_MS };
