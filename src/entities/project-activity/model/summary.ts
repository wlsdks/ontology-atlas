import type { Project, ProjectInput } from "@/entities/project";

/**
 * 두 프로젝트 상태를 비교해 사람이 읽을 수 있는 한 줄 요약을 만든다.
 * 우선순위: dependencies > status > category > name > description > 기타.
 * null 반환 시 의미 있는 변경이 없다고 판단 (저장 안 함).
 */
export function summarizeProjectUpdate(
  before: Project,
  after: ProjectInput,
): string | null {
  if (!arraysEqual(before.dependencies ?? [], after.dependencies ?? [])) {
    const beforeCount = (before.dependencies ?? []).length;
    const afterCount = (after.dependencies ?? []).length;
    if (beforeCount !== afterCount) {
      return `dependencies ${beforeCount} → ${afterCount}`;
    }
    return "dependencies 구성 변경";
  }
  if (before.status !== after.status) {
    return `status: ${before.status} → ${after.status}`;
  }
  if (before.category !== after.category) {
    return `category: ${before.category} → ${after.category}`;
  }
  if (before.name !== after.name) {
    return `name 변경`;
  }
  if ((before.description ?? "") !== (after.description ?? "")) {
    return "description 수정";
  }
  if ((before.detail ?? "") !== (after.detail ?? "")) {
    return "detail 수정";
  }
  if (before.isHub !== (after.isHub ?? false)) {
    return after.isHub ? "허브 승격" : "허브 해제";
  }
  if ((before.owner ?? "") !== (after.owner ?? "")) {
    return "owner 변경";
  }
  return null;
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
