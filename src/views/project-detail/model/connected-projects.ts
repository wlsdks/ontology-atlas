import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";

/**
 * "연결된 프로젝트" 요약 레일이 쓰는 project slug 목록 — ontology graph 의
 * `relates:` frontmatter (edge type `related_to`) 로 다른 project 노드와
 * 이어진 경우만. `project:<slug>` id 컨벤션은 derive-ontology-from-vault 의
 * kind:slug 규칙 (`buildOntologyDeeplinkForDoc` 과 동일 근거).
 *
 * 이 프로젝트 자신의 project 노드가 vault 에 없으면(= ontology 미기재) 빈
 * 배열 — dogfood vault 처럼 project 문서가 1개뿐이면 자연히 항상 빈 결과.
 */
export function findRelatesGraphProjectSlugs(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  projectSlug: string,
): string[] {
  const selfId = `project:${projectSlug}`;
  const projectNodeById = new Map(
    nodes.filter((node) => node.kind === "project").map((node) => [node.id, node] as const),
  );
  if (!projectNodeById.has(selfId)) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const edge of edges) {
    if (edge.type !== "related_to") continue;
    let otherId: string | null = null;
    if (edge.from === selfId) otherId = edge.to;
    else if (edge.to === selfId) otherId = edge.from;
    if (!otherId || otherId === selfId) continue;
    const other = projectNodeById.get(otherId);
    if (!other || seen.has(other.id)) continue;
    seen.add(other.id);
    out.push(other.id.replace(/^project:/, ""));
  }
  return out;
}

/**
 * 프로젝트 상세 요약 레일의 "연결된 프로젝트" 목록 — 세 원천의 union, self
 * 제외 + slug 기준 dedup:
 *
 *  1. `project.dependencies` — 이 프로젝트가 기대는 다른 프로젝트 (기존 로직).
 *  2. referencedBy — 다른 프로젝트의 `dependencies` 가 이 프로젝트를 가리킴.
 *  3. relates-graph — ontology `relates:` (related_to edge) 로 이어진 project.
 *
 * (2), (1) 은 R+ 이전부터 있던 동작이라 유지 — vault 가 이미 `dependencies:`
 * 로 프로젝트를 이어둔 경우 회귀 없이 계속 보인다. (3) 은 새 mockup 이 명시한
 * `relates` 경로 추가.
 */
export function buildConnectedProjects(
  project: Project,
  related: readonly Project[],
  relatesGraphSlugs: readonly string[],
): Project[] {
  const relatedBySlug = new Map(related.map((p) => [p.slug, p] as const));
  const dependencyProjects = project.dependencies
    .map((dep) => relatedBySlug.get(dep))
    .filter((p): p is Project => Boolean(p));
  const referencedBy = related.filter((p) => p.dependencies.includes(project.slug));
  const relatesGraphProjects = relatesGraphSlugs
    .map((slug) => relatedBySlug.get(slug))
    .filter((p): p is Project => Boolean(p));

  const seen = new Set<string>([project.slug]);
  const out: Project[] = [];
  for (const candidate of [...dependencyProjects, ...referencedBy, ...relatesGraphProjects]) {
    if (seen.has(candidate.slug)) continue;
    seen.add(candidate.slug);
    out.push(candidate);
  }
  return out;
}
