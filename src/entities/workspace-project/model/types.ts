/**
 * WorkspaceProject — 워크스페이스 안의 "프로젝트 컨테이너".
 *
 * 4-layer 계층 `Workspace > Project > Hub > Node` 에서 중간 층을 담당.
 * 기존 `entities/project/Project` 는 장기적으로 Hub/Node 역할로 rename
 * 예정이며, 당분간은 "workspace-project" 이름으로 prefix 해 충돌 회피.
 *
 * 설계 문서: `docs/superpowers/plans/2026-04-21-project-container-entity.md`
 */
export interface WorkspaceProject {
  /** Firestore 문서 id. 기본 컨테이너는 "general". */
  id: string;
  /** 소속 워크스페이스 (= account). */
  accountId: string;
  name: string;
  description?: string;
  /** 공개 범위 — 워크스페이스 단위 isPublic 상속 기본. */
  isPublic?: boolean;
  /** 컨테이너 정렬용 수동 order. 미지정 시 createdAt 역순. */
  order?: number;
  /** 추가 메타 — 추후 icon · color · owner 등 확장 예약. */
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** 생성·편집 입력 타입. id·createdAt·updatedAt 은 API 가 주입. */
export type WorkspaceProjectInput = Omit<WorkspaceProject, "id" | "createdAt" | "updatedAt"> & {
  /** 사용자가 명시적으로 id 를 지정하고 싶을 때 (예: "general" 기본 컨테이너). */
  id?: string;
};
