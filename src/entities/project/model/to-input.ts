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
    // Vault에 없던 taxonomy fact를 변환 단계에서 만들지 않는다. Form의
    // 신규 작성 기본값은 form-local에서 정하고, 기존 project를 bulk/update로
    // 다시 쓰는 경로는 omission을 그대로 보존해야 한다.
    category: project.category,
    status: project.status,
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
