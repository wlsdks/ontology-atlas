/**
 * 프로젝트 카테고리 ID — Firestore `categories/{id}` 문서 참조.
 * 정의는 runtime에 entities/category에서 관리되므로 여기선 free string.
 */
export type ProjectCategory = string;

/**
 * 프로젝트 상태 ID — Firestore `statuses/{id}` 문서 참조.
 */
export type ProjectStatus = string;

export interface ProjectLink {
  label: string;
  url: string;
}

export interface ProjectTimeline {
  startedAt?: Date;
  launchedAt?: Date;
}

export interface ProjectPosition {
  x: number;
  y: number;
}

/**
 * 프로젝트 도메인 모델 (앱 내부에서 사용).
 * Firestore 문서와 일대일 대응되지만 Timestamp → Date 변환이 적용된다.
 */
export interface Project {
  accountId?: string;
  slug: string;
  name: string;
  nameEn?: string;
  category: ProjectCategory;
  status: ProjectStatus;
  description: string;
  detail?: string;
  tags: string[];
  stack: string[];
  links: ProjectLink[];
  dependencies: string[];
  owner?: string;
  icon?: string;
  screenshots: string[];
  timeline: ProjectTimeline;
  progress?: number;
  isHub: boolean;
  /**
   * 4계층(Workspace > Project > Hub > Node) 중 이 프로젝트의 소속 Project
   * (=Container) id. Firestore 저장 경로가 이미 컨테이너별 subcollection 이라
   * path 로 계층이 성립하지만, 계층을 **데이터 계약**으로도 명시해 타입·쿼리·
   * UI breadcrumb 에서 부모를 확실히 알 수 있게 한다. Layer 0 의 Container 자신
   * (category `__container__`) 은 이 필드를 안 쓴다. 미지정(legacy) 이면 slug
   * prefix 로 추론.
   */
  workspaceProjectId?: string;
  /**
   * Node(isHub=false) 가 소속된 Hub slugs. 여러 Hub 를 걸칠 수 있어 배열.
   * Hub 자신은 이 필드가 비어 있어야 한다. 공개 노드 보기 breadcrumb·검색
   * facet·knowledge 추출 앵커 등에서 부모 Hub 체인 표시에 사용. 미지정(legacy)
   * 이면 dependencies 중 isHub=true 인 항목으로 추론.
   */
  hubSlugs?: string[];
  position: ProjectPosition;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 생성·편집 시 입력으로 쓰는 부분 타입.
 * slug, name, category, status, description, position은 필수.
 * 나머지는 선택이고 기본값이 적용된다.
 */
export type ProjectInput = Pick<
  Project,
  "slug" | "name" | "category" | "status" | "description" | "position"
> &
  Partial<Omit<Project, "slug" | "createdAt" | "updatedAt">>;
