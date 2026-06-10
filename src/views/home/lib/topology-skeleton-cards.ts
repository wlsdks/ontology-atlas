import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { SkeletonCardModel } from "@/widgets/topology-map-sigma";
import type { OntologySkeleton } from "./topology-ontology-skeleton";
import type { RevealState } from "./topology-reveal-state";

/**
 * 골격 진입의 DOM 카드 오버레이 모델 빌더 — Sigma 점 대신 디자인된 HTML
 * 카드가 노드의 "상(form)" 을 담당한다 (사용자 방향 결정 2026-06-10).
 * Sigma 는 엣지 hairline 과 dust 만 캔버스에 그린다. 카드 shape 자체는
 * 렌더러(widget)의 `SkeletonCardModel` 이 단일 정의 — view 는 빌더만 가진다.
 *
 * 카드 수는 골격+클릭 확장으로 항상 ~20-60 으로 바운드 — DOM 이 감당 가능한
 * 스케일이라는 전제가 이 설계의 성립 조건이다.
 */

const KIND_TIER: Record<string, 0 | 1 | 2 | 3> = {
  project: 0,
  domain: 1,
  capability: 2,
  element: 3,
};

/** 파일 경로형 제목('src/a/b/C.tsx')은 마지막 segment 만 — 라벨 위계 보존. */
function compactCardTitle(title: string): string {
  if (!title.includes("/")) return title;
  const segments = title.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return last && last.length > 0 ? last : title;
}

/** 괄호 부연('Views (Topology · …)')은 카드에선 본 제목만 — 캔버스 라벨과 동일 규칙. */
function stripParenthetical(title: string): string {
  const stripped = title.replace(/\s*\(.*$/, "").trim();
  return stripped.length > 0 ? stripped : title;
}

export function buildSkeletonCardModels(
  skeleton: OntologySkeleton,
  reveal: RevealState,
  nodes: readonly KnowledgeGraphNode[],
  options: {
    /**
     * 펼친 자식 카드의 플러시 정렬 — 부모를 향한 모서리를 노드 좌표에
     * 고정한다(MindNode 문법). HomePage 가 레이아웃 좌표에서 계산해 전달.
     */
    anchorBySlug?: ReadonlyMap<string, "left" | "right">;
    /**
     * true 면 펼친 자식 카드에 dock 메타(부모 카드 rect 기준 px 도킹)를
     * 단다 — 그래프 좌표 배치의 줌-의존 간격("공백 과다") 제거.
     */
    dock?: boolean;
  } = {},
): SkeletonCardModel[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // dock 메타 — scope 도메인의 역량 열은 도메인에, scope 역량의 요소 열은
  // 역량에 도킹. side 는 anchorBySlug('left' 앵커 = 부모의 오른쪽)와 일치.
  const dockBySlug = new Map<string, NonNullable<SkeletonCardModel["dock"]>>();
  if (options.dock) {
    const register = (parentId: string | null, children: readonly string[]) => {
      if (!parentId || children.length === 0) return;
      children.forEach((slug, index) => {
        const anchor = options.anchorBySlug?.get(slug);
        dockBySlug.set(slug, {
          parentId,
          index,
          total: children.length,
          side: anchor === "right" ? "left" : "right",
        });
      });
    };
    register(reveal.scopeDomainSlug, reveal.domainCapabilitySlugs);
    register(reveal.scopeCapabilitySlug, reveal.capabilityElementSlugs);
  }

  const cards: SkeletonCardModel[] = [];
  // visibleSlugs 는 Set — nodes 배열 순서로 돌아 결정론 순서 보장.
  for (const node of nodes) {
    if (!reveal.visibleSlugs.has(node.id)) continue;
    const source = nodeById.get(node.id);
    if (!source) continue;
    const kind =
      source.kind === "project" ||
      source.kind === "domain" ||
      source.kind === "capability" ||
      source.kind === "element"
        ? source.kind
        : "unknown";
    const weight = skeleton.subtreeWeightBySlug.get(node.id) ?? 0;
    cards.push({
      id: node.id,
      title:
        kind === "element"
          ? compactCardTitle(source.title)
          : stripParenthetical(source.title),
      kind,
      tier: KIND_TIER[kind] ?? 3,
      count: weight > 0 ? weight : undefined,
      anchor: options.anchorBySlug?.get(node.id) ?? "center",
      dock: dockBySlug.get(node.id),
    });
  }
  // 도킹 깊이 순 정렬(안정) — 부모 카드가 먼저 DOM 배치돼야 자식이 그 rect
  // 를 읽는다: 골격 anchor(0) → 도메인 자식 열(1) → 역량 자식 열(2).
  const depth = (card: SkeletonCardModel): number => {
    if (!card.dock) return 0;
    return card.dock.parentId === reveal.scopeCapabilitySlug ? 2 : 1;
  };
  return cards
    .map((card, i) => ({ card, i }))
    .sort((a, b) => depth(a.card) - depth(b.card) || a.i - b.i)
    .map(({ card }) => card);
}
