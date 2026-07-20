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
  /** fresh 노드 브리드 (reduced-motion 이면 false 로 넘길 것). */
  breathing: boolean;
  /** 카메라가 아직 움직임 (스프링 미정착). */
  cameraMoving: boolean;
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
    flags.cameraMoving
  );
}

/** 유휴 판정 — 마지막 활동 후 `graceMs` 가 지나야 스킵을 허용한다 (램프 감쇠 꼬리 보호). */
export function shouldSkipFrame(nowMs: number, lastActiveMs: number, graceMs: number): boolean {
  return nowMs - lastActiveMs > graceMs;
}
