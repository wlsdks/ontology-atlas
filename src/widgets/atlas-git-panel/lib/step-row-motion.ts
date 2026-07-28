/**
 * 지난 걸음 한 줄이 어떤 모션을 입는가 — **방금 남긴 줄만 확정 서명을 받는다**.
 *
 * 2026-07-28 모션 감사: 커밋은 이 표면 최대의 확정인데 `--motion-settle` 사용이
 * 0회였다. 남기기를 누르면 다섯 표면이 동시에 하드 스왑하고 결과 한 줄만
 * 120ms 페이드로 온다 — "썼다" 는 알겠는데 **"어디에 박혔는지"** 를 아무것도
 * 안 보여준다.
 *
 * 규칙을 함수로 뽑는 이유: 삼항 하나지만 **틀리는 방향이 정해져 있다**. 전부에
 * 확정을 주면 이미 있던 역사가 다시 태어나고, 그러면 "무엇이 방금 일어났나"
 * 라는 정보가 오히려 흐려진다. 그 실수를 이름으로 막는다.
 */
export type StepRowMotionClass = "git-commit-settle" | "git-fade-in";

export function stepRowMotionClass(
  commitHash: string,
  settledHash: string | null | undefined,
): StepRowMotionClass {
  return settledHash != null && commitHash === settledHash
    ? "git-commit-settle"
    : "git-fade-in";
}

/** 확정 줄은 계단(스태거)을 타지 않는다 — 한 줄짜리 사건에 순서가 없다. */
export function stepRowUsesStagger(
  commitHash: string,
  settledHash: string | null | undefined,
): boolean {
  return stepRowMotionClass(commitHash, settledHash) === "git-fade-in";
}
