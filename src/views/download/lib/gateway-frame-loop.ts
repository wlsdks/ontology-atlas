/**
 * 관문 프레임 루프 — 관문의 캔버스 층(전류장 `GatewayFx` · 히어로
 * 오브젝트 `hero-object-engine`)이 공유하는 **단 하나의 rAF 드라이버 +
 * 앰비언트 휴면**.
 *
 * ## 왜 생겼나 (2026-08-19 실측)
 *
 * 관문(`/ko/` · `/ko/download/`)은 무입력 40초 뒤에도 초당 55~68ms 를 영구히
 * 태우고 있었다 — 같은 앱의 지도 화면이 무입력 32초 뒤 0 busy 프레임으로
 * 완전히 잠드는 것과 정반대다. 원인 둘:
 *
 * 1. **rAF 루프가 3개 돌았다** (5초 창에 콜백 900회 = 60Hz × 3). 전류장과
 *    히어로 오브젝트가 각자 루프를 소유했고, 증거 절의 지도 엔진 루프까지
 *    합쳐 셋이었다. 여러 루프가 각자 도는 것은 설계가 아니라 사고다 — 여기로
 *    합쳐 관문 자신의 루프는 하나가 됐다(지도 엔진은 위젯 소유라 그대로 두되,
 *    그 루프는 이미 자기 휴면을 갖고 있어 noop 프레임만 돈다).
 * 2. **관문의 두 루프에는 휴면이 없었다.** 지도는 `ambient-sleep.ts` 계약
 *    ("손 안에서는 살아 있고, 내려놓으면 잠든다")으로 잠드는데, 전류장·돔
 *    회전만 그 계약 밖에서 살았다 — `idle-gate.ts` 독블록이 경고한
 *    「한쪽에만 조건이 붙는 사고」의 관문판이다.
 *
 * ## 계약 — 지도와 같은 방식
 *
 * 시간 상수·램프·판정을 전부 `ambient-sleep.ts` 에서 **수입**한다(사본을
 * 만들지 않는다). 마지막 입력 후 `AMBIENT_SLEEP_DELAY_MS`(30s)까지는 계수 1 —
 * **종전과 1픽셀도 다르지 않다.** 그 뒤 `AMBIENT_SLEEP_RAMP_MS`(2s)에 걸쳐
 * 계수가 1→0 으로 램프하고(모션이 감속으로 멎는다 — 스텝 컷은 「고장난 것」
 * 으로 읽힌다), 0 에 닿으면 클라이언트 호출을 전면 스킵한다.
 *
 * rAF 자체는 멈추지 않는다 — `idle-gate.ts` 의 보수 설계 그대로다. 유휴
 * 판정이 매 프레임 재평가되므로 어떤 입력이든(마우스 이동·클릭·휠·스크롤·
 * 키·터치) **다음 프레임에** 계수 1 로 복귀한다: wake 배선이 없고, 따라서
 * wake 누락으로 화면이 얼어붙는 실패 모드 자체가 없다. noop 프레임 비용은
 * µs 급이다(지도의 유휴 실측 1.7ms/s 와 같은 부류).
 *
 * reduced-motion 은 여기 오지 않는다 — 두 소비처 모두 감속에서는 루프를
 * 아예 등록하지 않고 정지 1프레임만 그린다(관문 FX 예외 조건 (b),
 * `tests/contract/gateway-fx-exception.contract.test.ts`).
 *
 * 게이트: `tests/e2e/gateway-idle-sleep.spec.ts` 가 무입력 후 rAF 콜백의
 * 초당 동기 시간이 실제로 바닥에 닿는지를 잰다.
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
