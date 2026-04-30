export type ProjectRelationshipKind = "auth" | "agent" | "dependency";

export interface ProjectRelationshipMeta {
  kind: ProjectRelationshipKind;
  label: string;
  description: string;
  strokeDasharray?: string;
  strokeWidth: number;
}

const PROJECT_RELATIONSHIP_META: Record<
  ProjectRelationshipKind,
  ProjectRelationshipMeta
> = {
  auth: {
    kind: "auth",
    label: "Auth",
    description: "인증 흐름",
    strokeDasharray: undefined,
    strokeWidth: 1.15,
  },
  agent: {
    kind: "agent",
    label: "Agent",
    description: "AI 런타임",
    strokeDasharray: "10 6",
    strokeWidth: 1.2,
  },
  dependency: {
    kind: "dependency",
    label: "Dependency",
    description: "서비스 연결",
    strokeDasharray: "2 6",
    strokeWidth: 1,
  },
};

export function resolveProjectRelationshipKind(
  dependencySlug: string,
): ProjectRelationshipKind {
  if (dependencySlug === "iam") {
    return "auth";
  }

  if (dependencySlug === "reactor") {
    return "agent";
  }

  return "dependency";
}

export function getProjectRelationshipMeta(
  kind: ProjectRelationshipKind,
): ProjectRelationshipMeta {
  return PROJECT_RELATIONSHIP_META[kind];
}
