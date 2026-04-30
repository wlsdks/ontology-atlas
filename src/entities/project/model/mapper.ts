import { Timestamp, type DocumentData } from 'firebase/firestore';
import type { Project, ProjectInput } from './types';

/**
 * Firestore 문서 데이터를 앱 도메인 모델(Project)로 변환.
 * Timestamp → Date, 누락 필드는 안전한 기본값으로 채운다.
 */
export function fromFirestore(slug: string, data: DocumentData): Project {
  return {
    accountId: data.accountId ?? undefined,
    slug,
    name: data.name ?? '',
    nameEn: data.nameEn ?? undefined,
    category: data.category ?? 'in-progress',
    status: data.status ?? 'idea',
    description: data.description ?? '',
    detail: data.detail ?? undefined,
    tags: Array.isArray(data.tags) ? data.tags : [],
    stack: Array.isArray(data.stack) ? data.stack : [],
    links: Array.isArray(data.links) ? data.links : [],
    dependencies: Array.isArray(data.dependencies) ? data.dependencies : [],
    owner: data.owner ?? undefined,
    icon: data.icon ?? undefined,
    screenshots: Array.isArray(data.screenshots) ? data.screenshots : [],
    timeline: {
      startedAt: data.timeline?.startedAt instanceof Timestamp ? data.timeline.startedAt.toDate() : undefined,
      launchedAt: data.timeline?.launchedAt instanceof Timestamp ? data.timeline.launchedAt.toDate() : undefined,
    },
    progress: typeof data.progress === 'number' ? data.progress : undefined,
    isHub: Boolean(data.isHub),
    workspaceProjectId:
      typeof data.workspaceProjectId === 'string' && data.workspaceProjectId
        ? data.workspaceProjectId
        : undefined,
    hubSlugs: Array.isArray(data.hubSlugs)
      ? data.hubSlugs.filter((s): s is string => typeof s === 'string' && s.length > 0)
      : undefined,
    position: {
      x: typeof data.position?.x === 'number' ? data.position.x : 0,
      y: typeof data.position?.y === 'number' ? data.position.y : 0,
    },
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(0),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(0),
  };
}

/**
 * 앱 도메인 모델을 Firestore 쓰기용 객체로 변환.
 * slug는 문서 ID로 빠지고, Date는 그대로 (쓰기 시 serverTimestamp 또는 Timestamp 사용).
 * undefined 필드는 제거한다 (Firestore는 undefined 거부).
 */
export function toFirestore(project: Omit<Project, 'slug' | 'createdAt' | 'updatedAt'>): DocumentData {
  const payload: DocumentData = {
    accountId: project.accountId ?? null,
    name: project.name,
    category: project.category,
    status: project.status,
    description: project.description,
    tags: project.tags,
    stack: project.stack,
    links: project.links,
    dependencies: project.dependencies,
    screenshots: project.screenshots,
    isHub: project.isHub,
    position: project.position,
    timeline: {
      startedAt: project.timeline.startedAt ?? null,
      launchedAt: project.timeline.launchedAt ?? null,
    },
  };

  if (project.nameEn !== undefined) payload.nameEn = project.nameEn;
  if (project.detail !== undefined) payload.detail = project.detail;
  if (project.owner !== undefined) payload.owner = project.owner;
  if (project.icon !== undefined) payload.icon = project.icon;
  if (project.progress !== undefined) payload.progress = project.progress;
  // 4계층 부모 참조. path 로만 계층이 성립하던 걸 데이터 계약으로도 기록.
  if (project.workspaceProjectId !== undefined) {
    payload.workspaceProjectId = project.workspaceProjectId;
  }
  if (project.hubSlugs !== undefined) payload.hubSlugs = project.hubSlugs;

  return payload;
}

export function projectToInput(project: Project): ProjectInput {
  return {
    accountId: project.accountId,
    slug: project.slug,
    name: project.name,
    nameEn: project.nameEn,
    category: project.category,
    status: project.status,
    description: project.description,
    detail: project.detail,
    tags: [...project.tags],
    stack: [...project.stack],
    links: [...project.links],
    dependencies: [...project.dependencies],
    owner: project.owner,
    icon: project.icon,
    screenshots: [...project.screenshots],
    timeline: { ...project.timeline },
    progress: project.progress,
    isHub: project.isHub,
    workspaceProjectId: project.workspaceProjectId,
    hubSlugs: project.hubSlugs ? [...project.hubSlugs] : undefined,
    position: { ...project.position },
  };
}
