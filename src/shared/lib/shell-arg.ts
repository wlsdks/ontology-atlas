/**
 * POSIX 셸 인자 안전화 — 값을 작은따옴표로 감싸고 내부 작은따옴표를 escape.
 * agent 가 복사·실행할 CLI 명령 문자열을 조립할 때 인자 주입을 막는다.
 *
 * cli/ · mcp/ 패키지에도 동일 구현이 있지만 그쪽은 물리적으로 분리된 npm
 * 패키지라 의도적 중복(contract). 여기서는 src/ 내부에 있던 2 중복만 단일화한다.
 */
export function shellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
