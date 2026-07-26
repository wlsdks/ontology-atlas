/**
 * Resolve which node the 공방(Compass Stage) ENHANCE surface centers on from the
 * `?node=<id>` deep-link — TOLERANTLY.
 *
 * WHY (C3, codex 로컬 vault 회귀): the studio focal resolver used a naive
 * `nodes.some(n => n.id === requestedNode)`. That only holds when the `?node=`
 * value is byte-identical to the derived node id (canonical `kind:slug`). The
 * sample/dogfood vault's ids always are, so it worked there. A LOCAL vault does
 * not guarantee that: `?node=` legitimately arrives in other id forms and the
 * strict `===` misses every one of them, so the page silently fell back to the
 * default node — the reported "검색 클릭이 focal 을 안 바꿈 (리스트만 닫히고
 * focal 그대로)".
 *
 * The forms that legitimately reach `?node=`:
 *   1. canonical            `capability:ticket`        (studio top-bar search)
 *   2. folder-prefixed ref  `capabilities/ticket`      (route-memory restore,
 *                            insights `evidenceIds` href, hand-built / stale link)
 *   3. bare tail slug       `ticket`                   (topology `?p=` handoff)
 *   4. Unicode NFD          `티켓-분류` (decomposed)     (macOS filename → doc.slug)
 *
 * `/topology`'s own resolver already tolerates 1–3; the studio never did. This
 * closes the gap with the SAME entity-layer folder→kind normalizer the deep-link
 * senders use (`translateOntologyDeeplinkToTopologyParam`), plus Unicode NFC
 * folding so a decomposed filename slug matches a composed frontmatter one.
 *
 * Pure + synchronous so it is unit-tested independent of React and the router.
 */

import { translateOntologyDeeplinkToTopologyParam } from "@/entities/knowledge-graph";
import {
  selectDefaultStudioNodeId,
  type StudioSourceEdge,
  type StudioSourceNode,
} from "./build-studio-item";

/** Unicode-fold (NFC) + trim so NFD filename slugs match NFC frontmatter ones. */
function foldId(id: string): string {
  return id.normalize("NFC").trim();
}

/** The comparable tail of an id — after the last `/` or `:` — NFC-folded. */
function tailOf(id: string): string {
  const folded = foldId(id);
  const slash = folded.lastIndexOf("/");
  const afterSlash = slash >= 0 ? folded.slice(slash + 1) : folded;
  const colon = afterSlash.indexOf(":");
  return colon >= 0 ? afterSlash.slice(colon + 1) : afterSlash;
}

/**
 * Resolve `requestedNode` against the live graph, tolerant of id form. Returns
 * the matching node id (the canonical graph id, so downstream `buildStudioItem`
 * keeps working) or `null` when nothing matches. Deterministic: an exact id
 * match wins, then canonicalized, then NFC-folded, then a unique bare-tail
 * match. A tail that is ambiguous (matches 2+ nodes) is rejected rather than
 * guessed — the caller falls back to its default node.
 */
export function resolveStudioFocalId(
  requestedNode: string | null | undefined,
  nodes: readonly StudioSourceNode[],
): string | null {
  if (!requestedNode) return null;
  const raw = requestedNode.trim();
  if (!raw) return null;

  // 1. exact id (canonical `kind:slug` from the studio's own search).
  for (const n of nodes) if (n.id === raw) return n.id;

  // 2. folder-prefixed ref (`capabilities/foo`) → canonical, then exact match.
  const canonical = translateOntologyDeeplinkToTopologyParam(raw);
  if (canonical !== raw) {
    for (const n of nodes) if (n.id === canonical) return n.id;
  }

  // 3. NFC fold — a decomposed (macOS filename) requested id vs a composed node
  //    id, or vice versa. Compare the canonicalized forms folded.
  const foldedReq = foldId(canonical);
  for (const n of nodes) if (foldId(n.id) === foldedReq) return n.id;

  // 4. bare tail — `?node=foo` (topology `?p=` handoff) or a tail-only link.
  //    Only when it resolves to exactly ONE node (never guess between kinds).
  const reqTail = tailOf(raw);
  if (reqTail) {
    let hit: string | null = null;
    for (const n of nodes) {
      if (tailOf(n.id) !== reqTail) continue;
      if (hit !== null) return null; // ambiguous → let the caller default
      hit = n.id;
    }
    if (hit) return hit;
  }

  return null;
}

/**
 * ENHANCE 무대가 **어느 노드를 열지** 를 정한다 — 그리고 요청한 노드가 없으면
 * 그 사실을 숨기지 않는다.
 *
 * 왜 분리했나 (2026-07-26 실측) — 예전 페이지는 `resolveStudioFocalId(...) ??
 * selectDefaultStudioNodeId(...)` 한 줄이었다. 요청한 슬러그가 그래프에 없으면
 * 조용히 **기본 노드**가 열렸고, 같은 주소를 세 번 열면 매번 다른 노드가
 * 열렸다. 사용자는 자기가 요청한 개념을 보고 있다고 믿으므로, 그 상태에서
 * 소켓을 채우면 엉뚱한 개념의 문서에 쓰기가 일어난다.
 *
 * 그래프가 아직 비어 있을 때(로딩 · 볼트 미선택)는 "없다" 고 단정하지 않는다 —
 * 그건 데이터가 안 온 것이지 링크가 죽은 것이 아니다.
 */
export function resolveStudioEnhanceFocal(
  requestedNode: string | null | undefined,
  nodes: readonly StudioSourceNode[],
  edges: readonly StudioSourceEdge[],
): { focalId: string | null; requestedMissing: boolean } {
  if (nodes.length === 0) return { focalId: null, requestedMissing: false };
  const requested = requestedNode?.trim() ?? "";
  const resolved = resolveStudioFocalId(requested, nodes);
  if (requested && resolved === null) {
    return { focalId: null, requestedMissing: true };
  }
  return {
    focalId: resolved ?? selectDefaultStudioNodeId(nodes, edges),
    requestedMissing: false,
  };
}
