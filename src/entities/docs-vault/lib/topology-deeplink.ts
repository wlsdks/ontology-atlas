import { getTopologyFocusHref, getTopologyProjectHref } from "@/entities/project";
import type { VaultDoc } from "../model/types";
import { computeProjectSlug } from "./project-slug";

/** project 외에 토폴로지 그래프에 1:1 노드를 갖는 ontology kind — focus 직링크 대상. */
const FOCUSABLE_ONTOLOGY_KINDS = new Set(["domain", "capability", "element"]);

/**
 * 토폴로지 deep-link 빌더. 토폴로지가 *전체 ontology 그래프* 를 렌더하므로(R3 이후)
 * project 뿐 아니라 domain·capability·element 노드도 1:1 그래프 노드를 가진다 —
 * 따라서 그 doc 들도 토폴로지로 점프 가능:
 *  - project → `deriveProjectsFromVault` 가 등재한 노드를 `?p=<projectSlug>` 로
 *    직링크 (computeProjectSlug 공유로 drawer 가 정확히 열림).
 *  - domain/capability/element → vault slug 가 곧 그래프 nodeId 이므로
 *    `?mode=focus&p=<slug>` 로 그 노드를 focus(드로어)로 연다.
 *  - document/vault-readme 등 그래프 노드가 아닌 kind → null.
 * URL 빌더는 entities/project 의 getTopology*Href 로 위임 — 인코딩/key 단일화.
 */
export function buildTopologyDeeplinkForDoc(doc: VaultDoc): string | null {
  const rawKind = doc.frontmatter?.kind;
  const kind = typeof rawKind === "string" ? rawKind.trim() : "";
  if (kind === "project") {
    const slug = computeProjectSlug(doc);
    return slug ? getTopologyProjectHref(slug) : null;
  }
  if (FOCUSABLE_ONTOLOGY_KINDS.has(kind) && doc.slug) {
    return getTopologyFocusHref(doc.slug);
  }
  return null;
}
