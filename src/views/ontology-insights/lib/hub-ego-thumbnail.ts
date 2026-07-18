import { buildConnections, type ConnectionSourceEdge, type ConnectionSourceNode } from "@/shared/lib/ontology-tree";

/** 미니 ego 썸네일의 스포크 한 개 — 실제 이웃 하나에 대응. */
export interface HubEgoSpoke {
  /** 라디안, 0 = 3시 방향(우측), 시계방향 증가 — SVG 좌표계와 동일. */
  angle: number;
  /** depends_on 관계면 점선(파선), 그 외(contains/relates/describes 등)는 실선. */
  dashed: boolean;
}

export interface HubEgoThumbnail {
  /** 실제 degree (incoming+outgoing 총합) — 표시된 스포크 수와 다를 수 있음(캡). */
  degree: number;
  spokes: HubEgoSpoke[];
}

const MAX_SPOKES = 12;

/**
 * 허브 노드 하나의 "honest" 미니 ego 썸네일 데이터 — 실제 이웃 목록
 * (`buildConnections`, 이미 dedup 됨)에서 유도. 장식용 난수가 아니라 실제
 * degree/관계 타입을 그대로 스포크 각도/파선 여부로 매핑한다.
 *
 * degree 가 `MAX_SPOKES` 를 넘으면 스포크는 캡에서 멈추되 `degree` 필드는
 * 실제 총수를 그대로 노출 — silent cap 금지 원칙(다른 insights 패널과 동일).
 */
export function buildHubEgoThumbnail(
  nodeId: string,
  nodes: readonly ConnectionSourceNode[],
  edges: readonly ConnectionSourceEdge[],
): HubEgoThumbnail {
  const connections = buildConnections(nodeId, nodes, edges);
  const shown = Math.min(connections.length, MAX_SPOKES);
  const spokes: HubEgoSpoke[] = [];
  for (let i = 0; i < shown; i += 1) {
    const angle = (i / shown) * Math.PI * 2 - Math.PI / 2;
    spokes.push({ angle, dashed: connections[i].relationType === "depends_on" });
  }
  return { degree: connections.length, spokes };
}
