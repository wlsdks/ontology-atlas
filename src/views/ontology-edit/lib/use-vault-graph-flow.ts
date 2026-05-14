"use client";

import { type CSSProperties, useMemo } from "react";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";

/** 자동 레이아웃 알고리즘 — 빌더 헤더 dropdown 으로 사용자가 토글. */
export type VaultGraphLayoutMode = "dagre" | "force";

/**
 * 라벨 해석기 — kind enum / edge frontmatter key 를 사용자 locale 에 맞춰
 * 변환. 이 lib 는 React 컴포넌트가 아니라 직접 \`useTranslations\` 호출
 * 못 함 → 호출자가 i18n-resolved 함수를 주입. 미주입 시 raw key 노출.
 */
export type KindLabelResolver = (kind: string) => string;
export type EdgeLabelResolver = (edgeKey: string) => string;

/**
 * 빌더 — vault 의 .md 노드를 캔버스 background 로 노출. xyflow Node[]/Edge[]
 * 를 반환하며 진실원은 vault manifest. node id = vault slug (예:
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
  /** 노드 라벨 i18n resolver. 미주입 시 raw kind enum 노출. */
  kindLabelOf?: KindLabelResolver;
  /** 엣지 라벨 i18n resolver. 미주입 시 raw frontmatter key 노출. */
  edgeLabelOf?: EdgeLabelResolver;
}

export function useVaultGraphFlow(
  manifest: VaultManifest | null,
  options?: UseVaultGraphFlowOptions,
) {
  const ignorePersistedPosition = options?.ignorePersistedPosition ?? false;
  const layoutMode = options?.layoutMode ?? "dagre";
  const kindLabelOf = options?.kindLabelOf;
  const edgeLabelOf = options?.edgeLabelOf;
  return useMemo(() => {
    if (!manifest) return { nodes: [] as Node[], edges: [] as Edge[] };
    return buildVaultGraphFlow(manifest, {
      ignorePersistedPosition,
      layoutMode,
      kindLabelOf,
      edgeLabelOf,
    });
  }, [manifest, ignorePersistedPosition, layoutMode, kindLabelOf, edgeLabelOf]);
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 60;

// 의미상 부모→자식 hierarchy 를 만드는 keys. 이들 엣지가 dagre rank 계산을
// 주도해서 project → domain → capability → element 의 LR 골격을 형성한다.
// `domains` 가 R14 schema 에서 project 의 array 키 — 빠지면 골격이 안 그려져
// 사선 relates 가 화면을 잡아먹는다.
const CONTAINMENT_KEYS = [
  "domains",
  "capabilities",
  "elements",
  "contains",
] as const;

// 횡단 관계 — rank 에 영향 주지 않고 overlay 로만 그려진다. 같은 kind 두
// 노드가 서로 relates 라도 같은 column 에 머물러야 사선이 폭증하지 않음.
const RELATION_KEYS = [
  "dependencies",
  "relates",
  "describes",
] as const;

const NEIGHBOR_KEYS = [
  ...CONTAINMENT_KEYS,
  ...RELATION_KEYS,
] as const;

const CONTAINMENT_KEY_SET: ReadonlySet<string> = new Set(CONTAINMENT_KEYS);

type SemanticType = "containment" | "relation";

function semanticTypeOf(key: string): SemanticType {
  return CONTAINMENT_KEY_SET.has(key) ? "containment" : "relation";
}

/**
 * 노드 카드 라벨용 — 트레일링 괄호 메타데이터 strip.
 *
 *   "CLI Developer Entry (16 commands incl. bootstrap)"
 *     → "CLI Developer Entry"
 *   "Ontology Hub — Mode-Aware (Q1=(a))"
 *     → "Ontology Hub — Mode-Aware"
 *   "Mode-Aware Adapter"        // 괄호 없음 → 그대로
 *
 * 조건: 마지막 `)` 가 문자열 끝, 그 이전에 매칭되는 `(`, 그리고 그 앞에 본문
 * 텍스트가 있을 때만. 중간 괄호 (예: "Foo (bar) baz") 는 건드리지 않음.
 * Inspector / hover tooltip 은 원본 title 그대로 사용 — 카드 라벨만 짧아짐.
 */
export function stripTrailingParenthetical(title: string): string {
  const trimmed = title.trim();
  const match = trimmed.match(/^(.+?)\s+\(.+\)\s*$/);
  return match ? match[1].trim() : trimmed;
}

/**
 * 노드의 domain grouping 키 결정. UI tint / swimlane 분기용.
 *  - domain 자체 → tail slug ("domains/ai-agent-partner" → "ai-agent-partner")
 *  - capability / element → frontmatter.domain (inline 단일 string)
 *  - project / vault-readme / 기타 → null (그룹화 안 함)
 */
export function resolveNodeDomainSlug(
  doc: VaultDoc,
  kind: string,
): string | null {
  if (kind === "domain") {
    const tail = doc.slug.split("/").pop() ?? doc.slug;
    return tail || null;
  }
  if (kind === "capability" || kind === "element") {
    const dom = doc.frontmatter.domain;
    return typeof dom === "string" && dom ? dom : null;
  }
  return null;
}

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
    kindLabelOf?: KindLabelResolver;
    edgeLabelOf?: EdgeLabelResolver;
  },
) {
  const ignorePersistedPosition = options?.ignorePersistedPosition ?? false;
  const layoutMode = options?.layoutMode ?? "dagre";
  const resolveKindLabel = options?.kindLabelOf ?? ((kind: string) => kind);
  const resolveEdgeLabel = options?.edgeLabelOf ?? ((key: string) => key);
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

  // Edge 페어를 한 번에 수집 — frontmatter key 와 semanticType 까지 같이
  // tag. layout 은 containment 만 사용 (rank skeleton), 렌더는 전체 사용.
  // 같은 (source, target) 페어는 *처음 본 key* 만 유지 (containment 가
  // 먼저 등장하도록 NEIGHBOR_KEYS 순서가 containment 우선).
  interface EdgeRecord {
    source: string;
    target: string;
    key: string;
    semanticType: SemanticType;
  }
  const edgeRecords: EdgeRecord[] = [];
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
        edgeRecords.push({
          source: doc.slug,
          target: resolved,
          key,
          semanticType: semanticTypeOf(key),
        });
      }
    }
  }

  // 자동 layout — dagre 는 containment 엣지만 받는다. relates / dependencies
  // / describes 가 rank 에 끼면 같은 kind 끼리 column 이 갈라져 사선 폭증.
  // force 는 모든 엣지로 자연스럽게 인력/척력 분포.
  const containmentPairs: Array<[string, string]> = edgeRecords
    .filter((e) => e.semanticType === "containment")
    .map((e) => [e.source, e.target]);
  const allPairs: Array<[string, string]> = edgeRecords.map((e) => [
    e.source,
    e.target,
  ]);
  const fallbackPositions =
    layoutMode === "force"
      ? computeForceLayout(ontologyDocs, allPairs)
      : computeDagreLayout(ontologyDocs, containmentPairs);
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
    // 카드 라벨은 짧게 (트레일링 괄호 strip), inspector / hover tooltip 은
    // 원본 title 그대로 (description 으로 노출).
    const labelTitle = stripTrailingParenthetical(title);
    const description =
      typeof doc.frontmatter.description === "string"
        ? doc.frontmatter.description
        : "";
    // 도메인 grouping 용 — capability / element 의 frontmatter.domain (inline
    // 단일 string), domain 자체는 자기 slug 의 tail. project / vault-readme 는
    // null (그룹화 없음).
    const domainSlug = resolveNodeDomainSlug(doc, kind);
    return {
      id: doc.slug,
      type: "atlas",
      position: pos,
      data: {
        label: `${resolveKindLabel(kind)} · ${labelTitle}`,
        // 원본 title — inspector / tooltip 이 짧은 라벨 아닌 풀 텍스트 필요할 때.
        fullTitle: title,
        kind,
        ephemeral: false,
        vault: true,
        description,
        domainSlug,
      },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      // drag 활성. drag-stop 시 page 가 frontmatter.canvasPosition patch.
      draggable: true,
      // 핸들 drag 로 edge 생성 활성 — onConnect 핸들러가 source/target
      // 의 vault 여부에 따라 분기 (vault↔vault → frontmatter array patch,
      // 그 외 → ephemeral edge).
      connectable: true,
      selectable: true,
      // 캔버스 Del 로 vault 노드 직접 삭제 금지 — frontmatter 진실원
      // 영구 손실 위험. 인스펙터의 '삭제' 버튼은 backlink 검사 + 확인
      // 모달 거쳐 안전하게 처리.
      deletable: false,
    };
  });

  // edge 렌더 — 위에서 모은 edgeRecords 를 xyflow Edge[] 로 변환. n8n 스타일:
  //  - containment → smoothstep + 둥근 모서리 (borderRadius 12) + 화살표 marker
  //  - dependencies → bezier 곡선 + 화살표 marker (방향성 의존 강조)
  //  - relates / describes → 양방향 약한 overlay, marker 없음
  // **라벨은 기본 비표시** — 시각 노이즈 주범, hover/inspector 가 담당.
  // 라벨 텍스트는 data.frontmatterKey 로만 노출, edgeLabelOf 는 향후 hover
  // 단계에서 호출. 지금은 미사용 분기 회피용으로 호출하지 않음.
  void resolveEdgeLabel;
  const edges: Edge[] = edgeRecords.map((rec) => {
    const id = `${rec.source}--${rec.key}-->${rec.target}`;
    const isContainment = rec.semanticType === "containment";
    const isDirectional =
      isContainment || rec.key === "dependencies";
    const stroke = edgeStrokeStyleByKey(rec.key);
    return {
      id,
      source: rec.source,
      target: rec.target,
      type: isContainment ? "smoothstep" : "default",
      // smoothstep 모서리를 n8n 처럼 둥글게. 5(default) 는 거의 직각으로
      // 보임, 12 면 부드러운 곡선 인상.
      ...(isContainment
        ? { pathOptions: { borderRadius: 12, offset: 18 } }
        : {}),
      style: stroke,
      animated: false,
      // 방향성 있는 엣지 (containment / depends_on) 에 화살표 marker. 색은
      // stroke 와 매칭해서 시각 일관성. relates / describes 는 대칭 관계라
      // marker 생략.
      ...(isDirectional
        ? {
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 16,
              height: 16,
              color: typeof stroke.stroke === "string"
                ? stroke.stroke
                : "rgba(139, 151, 255, 0.78)",
            },
          }
        : {}),
      // Inspector / 디버그 / 향후 hover UI 에서 의미를 알 수 있게 metadata
      // 노출. semanticType 으로 스타일/필터 분기.
      data: {
        semanticType: rec.semanticType,
        frontmatterKey: rec.key,
      },
      // vault edge 는 frontmatter 진실원이라 캔버스 Del 로 삭제 금지.
      // 인스펙터의 array editor (-) 버튼만 patch 권한.
      deletable: false,
    };
  });

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
  // rankdir LR — 좌→우 계층 흐름. R12 — capability 가 14+ 같은 rank 에 쌓이는
  // 케이스에서 nodesep=24 면 NODE_HEIGHT 와 비교해 라벨 영역이 겹침. 60 으로
  // 늘려 행간 라벨 충돌 완화. ranksep 은 70 으로 확장 — 화살표 라벨 (포함/관련)
  // 가 column 사이에 들어갈 공간 확보. fitView 가 자동 줌-아웃해서 너무
  // 작아지지 않게 비율 유지.
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 70, marginx: 16, marginy: 16 });
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
  // iteration 수를 docs 수에 따라 graceful degrade — 큰 vault (200+) 에서
  // 메인 스레드 hang 회피. 작은 vault 는 어차피 250 도 수십 ms 라 무영향.
  // 50 미만 → 250, 50-150 → 180, 150+ → 120 (barnesHut 가 보강).
  const iterations =
    docs.length < 50 ? 250 : docs.length < 150 ? 180 : 120;
  forceAtlas2.assign(g, {
    iterations,
    settings: {
      gravity: 1.0,
      scalingRatio: 4,
      strongGravityMode: false,
      barnesHutOptimize: docs.length > 80,
      slowDown: 2,
    },
  });
  // FA2 결과 좌표 → 알려진 viewport-friendly 범위로 normalize. 이전엔 raw
  // 좌표 × SPREAD 했더니 outliers 가 huge value 로 튀어 viewport 가 밖으로
  // 날아가는 회귀. 모든 좌표의 bounding box 계산 후 (0,0)~(targetW, targetH)
  // 로 매핑 — fitView 가 안정적으로 잡힘.
  const TARGET_W = Math.max(1000, docs.length * 120);
  const TARGET_H = Math.max(700, docs.length * 70);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const raw = new Map<string, { x: number; y: number }>();
  for (const doc of docs) {
    const attrs = g.getNodeAttributes(doc.slug);
    if (typeof attrs.x !== "number" || typeof attrs.y !== "number") continue;
    raw.set(doc.slug, { x: attrs.x, y: attrs.y });
    if (attrs.x < minX) minX = attrs.x;
    if (attrs.x > maxX) maxX = attrs.x;
    if (attrs.y < minY) minY = attrs.y;
    if (attrs.y > maxY) maxY = attrs.y;
  }
  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);
  for (const [slug, p] of raw.entries()) {
    map.set(slug, {
      x: ((p.x - minX) / rangeX) * TARGET_W - NODE_WIDTH / 2,
      y: ((p.y - minY) / rangeY) * TARGET_H - NODE_HEIGHT / 2,
    });
  }
  return map;
}

function edgeStrokeStyleByKey(key: string): CSSProperties {
  // n8n 스타일 — 굵은 indigo cable 이 골격. solid 선 + 화살표 marker (caller).
  if (
    key === "contains" ||
    key === "capabilities" ||
    key === "elements" ||
    key === "domains"
  ) {
    return { stroke: "rgba(139, 151, 255, 0.85)", strokeWidth: 1.9 };
  }
  // Dependencies — 방향성 있는 의존, dashed indigo + 화살표 marker (caller).
  if (key === "dependencies") {
    return {
      stroke: "rgba(139, 151, 255, 0.62)",
      strokeWidth: 1.45,
      strokeDasharray: "6 4",
    };
  }
  // relates / describes — 양방향 overlay, marker 없음. 골격을 가리지 않으면서
  // *읽힐 만큼* 가시 (이전 0.18 회귀 후 0.5 로).
  if (key === "describes") {
    return {
      stroke: "rgba(180, 188, 220, 0.5)",
      strokeWidth: 1.1,
      strokeDasharray: "2 3",
    };
  }
  return {
    stroke: "rgba(180, 188, 220, 0.5)",
    strokeWidth: 1.1,
    strokeDasharray: "4 4",
  };
}
