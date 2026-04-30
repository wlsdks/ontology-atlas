/**
 * 프로젝트 변경 감사 로그. 어드민 여러 명이 같은 공간을 편집할 때
 * "누가 언제 무엇을 바꿨나" 를 추적한다. Firestore 직접 저장이라 외부
 * telemetry 없이도 공간 안에서 자체 완결.
 */
export type ProjectActivityAction =
  | "project.created"
  | "project.updated"
  | "project.deleted";

export interface ProjectActivity {
  id: string;
  action: ProjectActivityAction;
  projectSlug: string;
  /** 프로젝트 삭제 후에도 화면 표시를 위한 name 스냅샷. */
  projectName: string;
  actorEmail?: string;
  actorName?: string;
  /** null → 글로벌 공개 프로젝트, 문자열 → account-scoped. */
  accountId: string | null;
  /** 변경 요약 한 줄. 예: "status: developing → live". */
  summary?: string;
  createdAt: Date;
}

/**
 * 작성 시점 입력. id·createdAt 은 저장 파이프라인에서 주입.
 */
export type ProjectActivityInput = Omit<ProjectActivity, "id" | "createdAt">;
