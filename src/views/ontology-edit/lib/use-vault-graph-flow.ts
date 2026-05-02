"use client";

import { type CSSProperties, useMemo } from "react";
import type { Edge, Node } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";

/** 자동 레이아웃 알고리즘 — 빌더 헤더 dropdown 으로 사용자가 토글. */
export type VaultGraphLayoutMode = "dagre" | "force";

/**
 * mission v2 빌더 — 로컬 vault 의 .md 노드를 캔버스 background 로 노출.
 *
 * cloud `useApprovedGraphFlow` 와 동일한 shape (xyflow Node[]/Edge[]) 를
 * 반환하되 진실원이 vault manifest 다. node id = vault slug (예:
 * `capabilities/mcp-server`) — 인스펙터가 이 id 로 manifest.docs 에서
 * 다시 frontmatter 를 lookup 하고 vault.updateFrontmatter 로 patch.
 *
 * 노드 필터: frontmatter.kind 가 string 이고 비어있지 않은 doc 만 ontology
 * 후보로 본다 (vault-readme 같은 sentinel 도 같이 노출되지만 ERD 캔버스
 * 에서는 일반 노드로 취급해도 무해).
 *
 * Edge: 본 doc 의 frontmatter array 키 (capabilities / elements /
 * dependencies / relates / contains / describes) 의 항목이 다른 doc 의
 * slug 또는 마지막 segment 와 매칭되면 edge 추가. unresolved 항목은
 * 무시 — vault 외부 reference 는 dangling 으로 두고 노출 안 함.
 */
export interface UseVaultGraphFlowOptions {
  /**
   * true 면 \`frontmatter.canvasPosition\` 을 무시하고 자동 layout 결과만
   * 사용. "자동 정렬" 버튼이 사용자 drag 결과를 reset (in-memory only —
   * frontmatter 자체는 안 건드림) 할 때 활용.
   */
  ignorePersistedPosition?: boolean;
  /**
   * 자동 레이아웃 알고리즘. \`dagre\` (기본 — kind 계층 LR) 또는 \`force\`
   * (graphology + ForceAtlas2 — 노드 사이 인력/척력 시뮬레이션, 토폴로지
   * 와 같은 organic 분포). 사용자 선호 토글.
   */
  layoutMode?: VaultGraphLayoutMode;
}

export function useVaultGraphFlow(
  manifest: VaultManifest | null,
  options?: UseVaultGraphFlowOptions,
) {
  const ignorePersistedPosition = options?.ignorePersistedPosition ?? false;
  const layoutMode = options?.layoutMode ?? "dagre";
  return useMemo(() => {
    if (!manifest) return { nodes: [] as Node[], edges: [] as Edge[] };
    return buildVaultGraphFlow(manifest, {
      ignorePersistedPosition,
      layoutMode,
    });
  }, [manifest, ignorePersistedPosition, layoutMode]);
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;

const NEIGHBOR_KEYS = [
  "capabilities",
  "elements",
  "dependencies",
  "relates",
  "contains",
  "describes",
] as const;

/**
 * 순수 함수 — manifest → xyflow Node[] / Edge[]. 테스트용 export.
 *
 * options:
 * - ignorePersistedPosition: true 면 frontmatter.canvasPosition 무시 (자동 정렬)
 * - layoutMode: 'dagre' (default, kind 계층 LR) | 'force' (FA2 organic)
 */
export function buildVaultGraphFlow(
  manifest: VaultManifest,
  options?: {
    ignorePersistedPosition?: boolean;
    layoutMode?: VaultGraphLayoutMode;
  },
) {
  const ignorePersistedPosition = options?.ignorePersistedPosition ?? false;
  const layoutMode = options?.layoutMode ?? "dagre";
  const ontologyDocs = manifest.docs.filter(
    (doc) => typeof doc.frontmatter.kind === "string" && doc.frontmatter.kind,
  );
  const slugSet = new Set(ontologyDocs.map((d) => d.slug));
  const tailToFull = new Map<string, string>();
  for (const slug of slugSet) {
    const tail = slug.split("/").pop();
    if (tail && tail !== slug && !tailToFull.has(tail)) {
      tailToFull.set(tail, slug);
    }
  }
  function resolveRef(ref: string): string | null {
    if (slugSet.has(ref)) return ref;
    if (tailToFull.has(ref)) return tailToFull.get(ref) ?? null;
    for (const slug of slugSet) {
      if (slug.endsWith(`/${ref}`)) return slug;
    }
    return null;
  }

  // Edge 페어 (sourceSlug → targetSlug) 를 layout 전에 한 번 모은다.
  // dagre / 미래의 다른 layout 알고리즘 모두 이 raw 페어 list 가 필요.
  const rawEdgePairs: Array<[string, string]> = [];
  const seenPair = new Set<string>();
  for (const doc of ontologyDocs) {
    for (const key of NEIGHBOR_KEYS) {
      const value = doc.frontmatter[key];
      if (!Array.isArray(value)) continue;
      for (const ref of value) {
        if (typeof ref !== "string") continue;
        const resolved = resolveRef(ref);
        if (!resolved || resolved === doc.slug) continue;
        const pairKey = `${doc.slug}->${resolved}`;
        if (seenPair.has(pairKey)) continue;
        seenPair.add(pairKey);
        rawEdgePairs.push([doc.slug, resolved]);
      }
    }
  }

  // 자동 layout — 사용자 선호에 따라 dagre (default, kind 계층 LR) 또는
  // force (FA2 organic 분포) 두 가지. dagre 는 ontology 의 project → domain
  // → capability → element 흐름이 자연스럽게 좌→우 계층, force 는 토폴로지
  // 와 같이 노드 사이 인력/척력 시뮬레이션. 사용자가 drag 한 노드는 그대로
  // 우선 (수동 배치 보존).
  const fallbackPositions =
    layoutMode === "force"
      ? computeForceLayout(ontologyDocs, rawEdgePairs)
      : computeDagreLayout(ontologyDocs, rawEdgePairs);
  const nodes: Node[] = ontologyDocs.map((doc) => {
    // frontmatter.canvasPosition: { x, y } 가 있으면 우선. 없으면 dagre fallback.
    // 사용자가 빌더에서 drag-stop 시 canvasPosition patch — 다음 mount 부터
    // 같은 좌표 복원. AI agent (MCP) 도 같은 frontmatter 키 read 가능.
    // \`ignorePersistedPosition\` 이 true 면 강제로 dagre 결과 사용 — "자동
    // 정렬" 버튼이 in-memory 만 reset 할 때 활용 (frontmatter 자체는 그대로).
    const fm = doc.frontmatter as Record<string, unknown>;
    const cp = fm.canvasPosition;
    const persistedPos =
      !ignorePersistedPosition && cp && typeof cp === "object" && cp !== null
        ? (() => {
            const x = (cp as Record<string, unknown>).x;
            const y = (cp as Record<string, unknown>).y;
            return typeof x === "number" && typeof y === "number"
              ? { x, y }
              : null;
          })()
        : null;
    const pos = persistedPos ?? fallbackPositions.get(doc.slug) ?? { x: 0, y: 0 };
    const kind = String(doc.frontmatter.kind);
    const title = doc.title || doc.slug;
    return {
      id: doc.slug,
      type: "atlas",
      position: pos,
      data: {
        label: `${kindLabel(kind)} · ${title}`,
        kind,
        ephemeral: false,
        vault: true,
      },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      // drag 활성. drag-stop 시 page 가 frontmatter.canvasPosition patch.
      draggable: true,
      // edge 재생성은 vault 진실원 보호 위해 비활성. 인스펙터/frontmatter 수정.
      connectable: false,
      selectable: true,
    };
  });

  // edge style / label 풍부 결정 — frontmatter array 키별 톤. raw pair 는
  // 이미 위에서 dedup 됐고, 여기서 같은 (source,target) 에 대해 처음 매칭된
  // key 의 style 적용. 같은 페어가 두 키에 있으면 첫 번째만.
  const seenEdges = new Set<string>();
  const edges: Edge[] = [];
  for (const doc of ontologyDocs) {
    for (const key of NEIGHBOR_KEYS) {
      const value = doc.frontmatter[key];
      if (!Array.isArray(value)) continue;
      for (const ref of value) {
        if (typeof ref !== "string") continue;
        const resolved = resolveRef(ref);
        if (!resolved || resolved === doc.slug) continue;
        const edgeId = `${doc.slug}--${key}-->${resolved}`;
        if (seenEdges.has(edgeId)) continue;
        seenEdges.add(edgeId);
        edges.push({
          id: edgeId,
          source: doc.slug,
          target: resolved,
          type: "default",
          label: edgeLabel(key),
          labelStyle: edgeLabelStyle,
          labelBgStyle: edgeLabelBgStyle,
          labelBgPadding: [6, 4] as [number, number],
          labelBgBorderRadius: 4,
          style: edgeStrokeStyleByKey(key),
          animated: false,
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * dagre 로 layered LR 자동 레이아웃. ontology 의 project → domain →
 * capability → element 계층이 좌→우 흐름. 노드 ID = vault slug. edges
 * 는 (source, target) 페어. dagre 는 동기 함수, 수십 ms.
 */
function computeDagreLayout(
  docs: VaultDoc[],
  edges: ReadonlyArray<readonly [string, string]>,
): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  if (docs.length === 0) return map;
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  // rankdir LR — 좌→우 계층 흐름. nodesep / ranksep 은 노드 간 여백 +
  // 계층 간 여백. NODE_WIDTH/HEIGHT 보다 약간 크게 잡아 라벨 chip 이
  // 다른 노드 가려지지 않도록.
  g.setGraph({ rankdir: "LR", nodesep: 32, ranksep: 80, marginx: 24, marginy: 24 });
  for (const doc of docs) {
    g.setNode(doc.slug, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const [from, to] of edges) {
    if (g.hasNode(from) && g.hasNode(to)) g.setEdge(from, to);
  }
  dagre.layout(g);
  for (const doc of docs) {
    const node = g.node(doc.slug);
    if (!node) continue;
    // dagre 는 노드 *중심* 좌표를 반환. xyflow position 은 좌상단이라 변환.
    map.set(doc.slug, {
      x: node.x - NODE_WIDTH / 2,
      y: node.y - NODE_HEIGHT / 2,
    });
  }
  return map;
}

/**
 * graphology + ForceAtlas2 organic 레이아웃. 노드 사이 인력 (edge 가 있으면
 * 가까이) + 모든 노드 척력 (서로 밀어내기) 의 시뮬레이션. 토폴로지
 * (\`/topology\`) 와 같은 알고리즘 — 빌더에서도 같은 시각 언어 선택 가능.
 *
 * 동기 — \`forceAtlas2.assign\` 이 nodeIters 만큼 iteration 후 graphology
 * 노드의 x/y attribute 갱신. 노드 60개 / iteration 200 가량 ~수십 ms.
 */
function computeForceLayout(
  docs: VaultDoc[],
  edges: ReadonlyArray<readonly [string, string]>,
): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  if (docs.length === 0) return map;
  const g = new Graph({ multi: false, type: "undirected" });
  // 초기 좌표 — 작은 spiral 로 띄워두면 FA2 가 빠르게 settle.
  // ForceAtlas2 는 (0,0) 다중 중첩 입력이면 NaN 반환할 수 있어 round-robin
  // 으로 perturbation.
  const RADIUS_STEP = 60;
  docs.forEach((doc, i) => {
    const angle = (i / Math.max(docs.length, 1)) * Math.PI * 2;
    const r = RADIUS_STEP * (1 + Math.floor(i / 8));
    g.addNode(doc.slug, {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    });
  });
  for (const [from, to] of edges) {
    if (g.hasNode(from) && g.hasNode(to) && !g.hasEdge(from, to)) {
      g.addEdge(from, to);
    }
  }
  forceAtlas2.assign(g, {
    iterations: 250,
    settings: {
      gravity: 1.5,
      scalingRatio: 4,
      strongGravityMode: false,
      barnesHutOptimize: docs.length > 80,
      slowDown: 2,
    },
  });
  // graphology 의 좌표는 노드 중심. xyflow 좌상단 변환. FA2 결과 좌표가
  // 작아 노드 박스 (200x56) 가 겹치지 않도록 적당히 spread (× 60).
  const SPREAD = 60;
  for (const doc of docs) {
    const attrs = g.getNodeAttributes(doc.slug);
    if (typeof attrs.x !== "number" || typeof attrs.y !== "number") continue;
    map.set(doc.slug, {
      x: attrs.x * SPREAD - NODE_WIDTH / 2,
      y: attrs.y * SPREAD - NODE_HEIGHT / 2,
    });
  }
  return map;
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "project":
      return "프로젝트";
    case "domain":
      return "도메인";
    case "capability":
      return "역량";
    case "element":
      return "요소";
    case "document":
      return "문서";
    default:
      return kind;
  }
}

function edgeLabel(key: string): string {
  switch (key) {
    case "capabilities":
      return "역량";
    case "elements":
      return "요소";
    case "dependencies":
      return "의존";
    case "relates":
      return "관련";
    case "contains":
      return "포함";
    case "describes":
      return "설명";
    default:
      return key;
  }
}

const edgeLabelStyle = {
  fontSize: 10,
  fill: "rgba(220, 226, 240, 0.96)",
  fontWeight: 600,
};
const edgeLabelBgStyle = {
  fill: "rgba(14, 16, 22, 0.92)",
  stroke: "rgba(94, 106, 210, 0.32)",
  strokeWidth: 1,
};

function edgeStrokeStyleByKey(key: string): CSSProperties {
  if (key === "contains" || key === "capabilities" || key === "elements") {
    return { stroke: "rgba(139, 151, 255, 0.66)", strokeWidth: 1.5 };
  }
  if (key === "dependencies") {
    return { stroke: "rgba(94, 106, 210, 0.46)", strokeWidth: 1.25 };
  }
  if (key === "describes") {
    return {
      stroke: "rgba(180, 188, 220, 0.4)",
      strokeWidth: 1,
      strokeDasharray: "2 3",
    };
  }
  return {
    stroke: "rgba(180, 188, 220, 0.32)",
    strokeWidth: 1,
    strokeDasharray: "4 4",
  };
}
