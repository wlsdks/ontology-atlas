import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import { resolveTopologySelectedOntologyNode } from "./resolve-topology-selected-node";

/**
 * 슬러그의 **사람이 읽는 이름** — 이 볼트에서 실제로 해석될 때만.
 *
 * ## null 이 정보다 (2026-08-01 수리)
 *
 * 예전엔 못 찾으면 `?? slug` 로 **슬러그를 제목인 척** 돌려줬다. 그래서 이
 * 볼트에 없는 노드가 멀쩡한 이름으로 화면에 그려졌고, 경로 칩은 그 이름 둘
 * 위에서 **「경로 없음」이라고 단언**했다 — 진실은 "둘 다 여기 없다" 인데
 * 화면은 "둘 다 있고 안 이어져 있다" 고 말한 것이다.
 *
 * 폴백은 친절해 보이지만 **"없다" 라는 정보를 지운다.** 그 정보가 지워지면
 * 그 위의 모든 판정이 조용히 거짓이 된다. 그래서 여기서는 못 찾으면 null 을
 * 낸다 — 호출부가 그 사실을 말할 수 있게.
 */
export function resolveTopologyNodeTitle({
  slug,
  projectBySlug,
  ontologyNodes,
}: {
  slug: string | null;
  projectBySlug: ReadonlyMap<string, Project>;
  ontologyNodes: readonly KnowledgeGraphNode[] | null | undefined;
}): string | null {
  if (!slug) return null;

  const project = projectBySlug.get(slug);
  if (project) return project.name;

  const node = resolveTopologySelectedOntologyNode(slug, ontologyNodes);
  if (!node) return null;
  return compactTopologyPanelTitle(node.title);
}

/** 괄호 부연을 떼어 칩·패널이 한 줄에 들어가게 한다. */
export function compactTopologyPanelTitle(title: string | null): string | null {
  if (!title) return null;
  const stripped = title.replace(/\s*\(.*$/, "").trim();
  return stripped.length > 0 ? stripped : title;
}
