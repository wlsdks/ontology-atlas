import type { Project, ProjectInput } from './types';

/**
 * `Project` → `ProjectInput` 매핑.
 *
 * 인라인 편집 등에서 기존 프로젝트 한 필드만 patch 하고 나머지를 그대로
 * 들고 갈 때 사용. 결정성 유지를 위해 array / nested object 는 모두 새로
 * 생성 (참조 공유 회피).
 */
export function projectToInput(project: Project): ProjectInput {
  return {
    slug: project.slug,
    name: project.name,
    description: project.description,
    // R15 (Concern 1) — Project 의 honest type 은 optional. Form 의
    // ProjectInput 은 required (사용자 vault frontmatter 작성 도구)
    // 라 form-local default 적용. 사용자가 form 으로 입력 → frontmatter 기록.
    category: project.category ?? 'uncategorized',
    status: project.status ?? 'active',
    owner: project.owner,
    isHub: project.isHub ?? false,
    progress: project.progress,
    tags: [...project.tags],
    stack: [...project.stack],
    dependencies: [...project.dependencies],
    timeline: project.timeline ? { ...project.timeline } : {},
    links: project.links.map((l) => ({ ...l })),
    screenshots: [...project.screenshots],
    position: project.position
      ? { x: project.position.x, y: project.position.y }
      : { x: 0, y: 0 },
  };
}
