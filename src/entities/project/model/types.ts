/**
 * 프로젝트 카테고리 ID — `entities/category` 의 default 또는 미래 vault
 * frontmatter taxonomy 와 매칭되는 free string.
 */
export type ProjectCategory = string;

/**
 * 프로젝트 상태 ID — `entities/status` 의 default 또는 미래 vault
 * frontmatter taxonomy 와 매칭되는 free string.
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
 *
 * 진실원: vault 의 `<slug>.md` frontmatter — `kind: project`. local 모드는
 * 사용자 vault, static 모드는 빌드타임 dogfood 매니페스트.
 *
 * R15 follow-up (Concern 1) — *vault frontmatter 에 명시되지 않은 fields*
 * 는 모두 **optional**. 이전엔 `category: 'uncategorized'` / `status: 'active'`
 * / `isHub: false` / `position: { x:0, y:0 }` 같은 *silent fabrication* 이
 * derive 단에서 박혀 *web 이 vault 가 가지지 않은 정보* 를 표시했음. mission
 * *"frontmatter is the graph"* 위반 → fabrication 제거. UI 가 undefined 인
 * fields 는 표시 안 함 (또는 placeholder 의미 명시).
 *
 * createdAt / updatedAt 는 frontmatter 또는 파일 mtime 에서 derive — 파일
 * 시스템 metadata 라 *fabrication 아님*.
 */
export interface Project {
  slug: string;
  name: string;
  nameEn?: string;
  /** vault frontmatter `category:` 에서 derive. 없으면 undefined. */
  category?: ProjectCategory;
  /** vault frontmatter `status:` 에서 derive. 없으면 undefined. */
  status?: ProjectStatus;
  description: string;
  detail?: string;
  tags: string[];
  stack: string[];
  links: ProjectLink[];
  dependencies: string[];
  owner?: string;
  icon?: string;
  screenshots: string[];
  /** vault frontmatter `timeline:`/`startedAt:`/`launchedAt:` 에서 derive. 없으면 undefined. */
  timeline?: ProjectTimeline;
  progress?: number;
  /** vault frontmatter `isHub:` 명시 시만 true. 없으면 undefined (≠ false). */
  isHub?: boolean;
  /** vault frontmatter `position:` 또는 `positionX/Y:` 명시 시만. 없으면 undefined. */
  position?: ProjectPosition;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 생성·편집 시 입력으로 쓰는 부분 타입. form 측은 사용자 *vault frontmatter
 * 작성* 도구이므로 category/status/position 을 form-local required 로 둔다
 * (입력 후 frontmatter 에 기록). Project type 자체는 vault 가 *가지지 않은
 * fields 를 옵셔널* 로 honest 하게 표현.
 */
export type ProjectInput = {
  slug: string;
  name: string;
  category: ProjectCategory;
  status: ProjectStatus;
  description: string;
  position: ProjectPosition;
  nameEn?: string;
  detail?: string;
  tags?: string[];
  stack?: string[];
  links?: ProjectLink[];
  dependencies?: string[];
  owner?: string;
  icon?: string;
  screenshots?: string[];
  timeline?: ProjectTimeline;
  progress?: number;
  isHub?: boolean;
};
