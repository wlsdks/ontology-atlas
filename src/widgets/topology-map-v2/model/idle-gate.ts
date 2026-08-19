/**
 * A2 — 유휴 프레임 게이트 (순수 판정).
 *
 * Guardian 관측: 입력 0 상태에서도 rAF 가 매 프레임 전량 재도색했다.
 * P1(코멧테일 포커스 강등)·모션 토큰화가 끝나 "정지 상태"가 정의 가능해진
 * 지금이 착수 조건이다.
 *
 * 설계는 보수적이다 — rAF 를 멈추지 않는다. 유휴가 충분히 길면(grace)
 * 물리 스텝과 페인트만 건너뛴다. 조건은 매 프레임 refs 에서 재평가되므로
 * 어떤 상태 변화든 다음 프레임에 자연 복귀한다: wake 배선이 없고, 따라서
 * wake 누락으로 캔버스가 얼어붙는 실패 모드 자체가 없다. no-op 프레임
 * 비용은 µs 급 — 프레임 예산의 실질 소거.
 */

export interface CanvasActivityFlags {
  /** 포인터 상태머신이 idle 이 아님 (드래그/프레스/호버 이동 중). */
  pointerActive: boolean;
  /** 시뮬레이션 heat 또는 pin (드래그/릴리즈 정착). */
  simWarm: boolean;
  /** 자동 정렬/첫 지도 연출 호밍 진행 중. */
  homing: boolean;
  /** 선택 커밋 펄스 재생 중. */
  selectionPulseActive: boolean;
  /** 포커스 상태 + ego 테일 진행(속도>0) — 유일한 상시 모션. */
  egoTailAnimating: boolean;
  /** 호버/패널 강조 대상 존재 (리플 램프 가능 구간). */
  emphasisTarget: boolean;
  /**
   * 선택 해제 페이드 진행 중 — 라이브 포커스(노드/엣지)는 없는데 retained
   * colorFocus(선택 링 + 배경 dim 의 색 타깃)가 아직 남아 focus 램프가 0 으로
   * 감쇠하는 중. 이 구간은 위 어떤 플래그(코멧·카메라·호버)와도 무관하게
   * 활동이다 — 램프 감쇠·colorFocus 클리어는 프레임 바디 안에서만 일어나므로,
   * 유휴 스킵이 여기서 끼면 링이 풀 opacity 로 얼어붙는다(deselect 회귀).
   * reduced-motion 이면 램프가 한 프레임에 스냅→클리어되므로 딱 1 프레임만
   * 깨어 있으면 된다.
   */
  focusFadeSettling: boolean;
  /** fresh 노드 브리드 (reduced-motion 이면 false 로 넘길 것). */
  breathing: boolean;
  /** 카메라가 아직 움직임 (스프링 미정착). */
  cameraMoving: boolean;
  /**
   * 최근 변경 스포트라이트 램프가 목표(on=1 / off=0)에 미도달 — 켜고 끄는
   * 침강/복귀 전이가 진행 중이다. 램프 step 은 프레임 바디 안에서만 일어나므로
   * focusFadeSettling 과 같은 이유로 명시 활동으로 친다(전이 중 동결 방지).
   */
  spotlightSettling: boolean;
  /**
   * 걸어온 길 렌즈가 켜지거나 꺼졌는데 아직 그 상태로 그린 프레임이 없다.
   * 렌즈는 React state 가 아니라 ref 로 내려오므로(전환마다 페이지 트리를
   * 다시 렌더하지 않기 위해) effect 로 깨울 수 없다 — 대신 "현재 ref ≠
   * 마지막으로 그린 상태"를 여기서 활동으로 쳐서 한 프레임을 확보한다.
   */
  trailLensSettling: boolean;
}

/**
 * `egoTailAnimating` 을 짓는 세 갈래 — 순수 판정.
 *
 * 왜 함수로 뽑았나: 이 플래그는 OR 세 개인데 **앰비언트 휴면이 그중 둘에만
 * 걸려 있었다.** depends 혜성과 fresh 브리드는 재웠는데 포커스 contains 혜성
 * 갈래가 게이트 밖에 남아, **노드를 하나 선택해 둔 채 손을 놓으면 앱이 영원히
 * 안 잠들었다** — 데이터시트를 열어 두고 터미널로 넘어가는, 이 워크벤치에서
 * 가장 흔한 방치 상태가 정확히 그것이다.
 *
 * 그 상태에서 화면은 이미 정지해 있었다는 게 요점이다: 물리 스텝이 모든 혜성
 * 속도에 `ambientFactor` 를 곱하므로(`topology-physics-step.ts`) 계수가 0 이면
 * 위상이 한 톨도 안 나간다. 즉 **바뀌지 않는 그림을 매 프레임 전면 재래스터**
 * 하고 있었다 — P0 실측이 지목한 바로 그 비용이 한 갈래에만 살아남은 것이다.
 *
 * 펄스 갈래는 일부러 게이트 밖에 둔다. 호버가 낳고 420ms 에 만료되는 일회성
 * 신호이고, 호버는 입력이라 그 순간 계수가 1 로 복귀해 있다 — 게이트를 걸어도
 * 참이 되는 일이 없고, 걸면 "발사됐는데 안 그려지는" 실패 모드만 생긴다.
 */
export interface EgoTailActivityInput {
  reducedMotion: boolean;
  /** `isAmbientAsleep(ambientSleepFactor(...))` — 계수가 0 에 닿았는가. */
  ambientAsleep: boolean;
  hasDependsEdges: boolean;
  edgePulseSpeed: number;
  /** 선택된 노드가 있는가 (처방 E — 인시던트 contains 코멧). */
  focused: boolean;
  hasContainsEdges: boolean;
  /** 살아있는 호버 펄스 수. */
  livePulseCount: number;
}

export function isEgoTailAnimating(input: EgoTailActivityInput): boolean {
  if (input.livePulseCount > 0) return true;
  if (input.reducedMotion || input.ambientAsleep) return false;
  if (input.hasDependsEdges && input.edgePulseSpeed > 0) return true;
  return input.focused && input.hasContainsEdges;
}

/**
 * 3D 돔 자율 회전이 «지금 돌아야 하는가» — 순수 판정.
 *
 * 왜 여기 있나 (2026-08-19 실측): 자율 회전은 상시 혜성·fresh 브리드와 같은
 * 부류의 **앰비언트 모션**인데, 혼자만 `ambient-sleep.ts` 계약 밖에서 살고
 * 있었다. 결과는 `isEgoTailAnimating` 독블록이 적은 실패와 **글자 그대로 같은
 * 모양**이다: 무입력 45초가 지나도 3D 는 잠들지 않고, 2,000 노드에서 초당
 * 520ms(코어 절반)를 영구히 태웠다 — 같은 상태의 2D 는 3ms/s 였다(170배).
 *
 * 이 앱의 전형 시나리오가 「에이전트 터미널 옆에 워크벤치를 띄워 두기」라는
 * 것을 생각하면 그것이 가장 흔한 상태다. 그래서 같은 처방을 쓴다 — 끄지 않고
 * 재운다. 술어를 뽑아 둔 이유도 같다: OR/AND 가 두 자리(활동 플래그 · 회전
 * 적용)에 흩어져 있으면 **한쪽에만 조건이 붙는 사고**가 정확히 다시 난다.
 *
 * 두 자리에서 다른 항(`orbiting` · `yawVel`)은 여기 넣지 않는다 — 그건
 * 「지금 손/관성이 이미 돌리고 있나」라 자율 회전의 조건이 아니다.
 */
export interface DomeSpinInput {
  /** 3D 보기가 켜져 있고 영역 전환 중이 아님. */
  domeOn: boolean;
  reducedMotion: boolean;
  /** `isAmbientAsleep(ambientSleepFactor(...))` — 계수가 0 에 닿았는가. */
  ambientAsleep: boolean;
  /** 개입(궤도·줌·노드 드래그·선택)으로 내려가는 무장 상태. */
  spinArmed: boolean;
  /** 커서가 캔버스 위 — 조준한 노드가 커서 밑에서 미끄러지지 않게 정지. */
  pointerOverCanvas: boolean;
  /** 조립 램프가 다 찼는가. */
  assembled: boolean;
}

export function isDomeSpinAnimating(input: DomeSpinInput): boolean {
  return (
    input.domeOn &&
    !input.reducedMotion &&
    !input.ambientAsleep &&
    input.spinArmed &&
    !input.pointerOverCanvas &&
    input.assembled
  );
}

export function isCanvasActive(flags: CanvasActivityFlags): boolean {
  return (
    flags.pointerActive ||
    flags.simWarm ||
    flags.homing ||
    flags.selectionPulseActive ||
    flags.egoTailAnimating ||
    flags.emphasisTarget ||
    flags.breathing ||
    flags.cameraMoving ||
    flags.focusFadeSettling ||
    flags.spotlightSettling ||
    flags.trailLensSettling
  );
}

/** 유휴 판정 — 마지막 활동 후 `graceMs` 가 지나야 스킵을 허용한다 (램프 감쇠 꼬리 보호). */
export function shouldSkipFrame(nowMs: number, lastActiveMs: number, graceMs: number): boolean {
  return nowMs - lastActiveMs > graceMs;
}

/**
 * M-1 회귀 계약 — 카메라 스프링 "미정착(타깃≠값)"은 활동이다.
 *
 * 값 이동만 활동으로 치면: 유휴 스킵 중엔 물리 스텝이 안 돌아 값이 못
 * 움직이고, 휠 줌은 타깃만 바꾸므로 게이트가 영원히 안 깨어나는 교착
 * (유휴 1.2초 후 휠 줌 사망). 타깃과 값의 차이를 직접 본다.
 */
export function isCameraUnsettled(
  camera: { x: number; y: number; scale: number },
  target: { tx: number; ty: number; tscale: number },
  positionEps = 0.01,
  scaleEps = 0.0001,
): boolean {
  return (
    Math.abs(camera.x - target.tx) > positionEps ||
    Math.abs(camera.y - target.ty) > positionEps ||
    Math.abs(camera.scale - target.tscale) > scaleEps
  );
}
