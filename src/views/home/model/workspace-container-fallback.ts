import type { Project } from "@/entities/project";
import type { WorkspaceProject } from "@/entities/workspace-project";

const SEPARATOR = " · ";

export interface WorkspaceProjectContainerFallback extends WorkspaceProject {
  hubCount: number;
  nodeCount: number;
}

interface WorkspaceProjectGroup {
  id: string;
  name: string;
}

function normalizeIdSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleFromId(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferNamePrefix(project: Pick<Project, "name">): string | null {
  const [prefix] = project.name.split(SEPARATOR);
  const trimmed = prefix?.trim();
  if (!trimmed || trimmed === project.name.trim()) return null;
  return trimmed;
}

export function inferWorkspaceProjectGroup(
  project: Pick<Project, "slug" | "name" | "workspaceProjectId">,
): WorkspaceProjectGroup {
  const namePrefix = inferNamePrefix(project);
  if (project.workspaceProjectId?.trim()) {
    const id = project.workspaceProjectId.trim();
    return {
      id,
      name: namePrefix ?? titleFromId(id),
    };
  }

  if (namePrefix) {
    return {
      id: normalizeIdSegment(namePrefix) || project.slug,
      name: namePrefix,
    };
  }

  const slugParts = project.slug.split("-").filter(Boolean);
  if (slugParts.length >= 2) {
    const id = `${slugParts[0]}-${slugParts[1]}`;
    return {
      id,
      name: titleFromId(id),
    };
  }

  return {
    id: project.slug,
    name: project.name,
  };
}

export function deriveWorkspaceProjectContainers(
  projects: Project[],
  accountId: string | null | undefined,
): WorkspaceProjectContainerFallback[] {
  const buckets = new Map<
    string,
    {
      id: string;
      name: string;
      accountId: string;
      createdAt: Date;
      updatedAt: Date;
      hubCount: number;
      nodeCount: number;
    }
  >();

  for (const project of projects) {
    const group = inferWorkspaceProjectGroup(project);
    const existing = buckets.get(group.id);
    const projectAccountId = accountId ?? project.accountId ?? "";
    if (!existing) {
      buckets.set(group.id, {
        id: group.id,
        name: group.name,
        accountId: projectAccountId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        hubCount: project.isHub ? 1 : 0,
        nodeCount: project.isHub ? 0 : 1,
      });
      continue;
    }

    if (project.isHub) {
      existing.hubCount += 1;
    } else {
      existing.nodeCount += 1;
    }
    if (project.createdAt < existing.createdAt) {
      existing.createdAt = project.createdAt;
    }
    if (project.updatedAt > existing.updatedAt) {
      existing.updatedAt = project.updatedAt;
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      id: bucket.id,
      accountId: bucket.accountId,
      name: bucket.name,
      description: "기존 프로젝트 목록에서 추론한 프로젝트 컨테이너",
      createdAt: bucket.createdAt,
      updatedAt: bucket.updatedAt,
      hubCount: bucket.hubCount,
      nodeCount: bucket.nodeCount,
    }))
    .sort((a, b) => {
      const countDelta = b.hubCount + b.nodeCount - (a.hubCount + a.nodeCount);
      if (countDelta !== 0) return countDelta;
      return a.name.localeCompare(b.name);
    });
}
