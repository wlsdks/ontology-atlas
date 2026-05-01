"use client";

import { type CSSProperties, useMemo } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";

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
export function useVaultGraphFlow(manifest: VaultManifest | null) {
  return useMemo(() => {
    if (!manifest) return { nodes: [] as Node[], edges: [] as Edge[] };
    return buildVaultGraphFlow(manifest);
  }, [manifest]);
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
 */
export function buildVaultGraphFlow(manifest: VaultManifest) {
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

  const fallbackPositions = computeGridLayout(ontologyDocs);
  const nodes: Node[] = ontologyDocs.map((doc) => {
    // frontmatter.canvasPosition: { x, y } 가 있으면 우선. 없으면 grid fallback.
    // 사용자가 빌더에서 drag-stop 시 canvasPosition patch — 다음 mount 부터
    // 같은 좌표 복원. AI agent (MCP) 도 같은 frontmatter 키 read 가능.
    const fm = doc.frontmatter as Record<string, unknown>;
    const cp = fm.canvasPosition;
    const persistedPos =
      cp && typeof cp === "object" && cp !== null
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
      // C-5 fire — drag 활성. drag-stop 시 page 가 frontmatter.canvasPosition patch.
      draggable: true,
      // edge 재생성은 vault 진실원 보호 위해 비활성. 인스펙터/frontmatter 수정.
      connectable: false,
      selectable: true,
    };
  });

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

function computeGridLayout(
  docs: VaultDoc[],
): Map<string, { x: number; y: number }> {
  const COLS = Math.max(1, Math.ceil(Math.sqrt(docs.length)));
  const COL_GAP = NODE_WIDTH + 40;
  const ROW_GAP = NODE_HEIGHT + 40;
  const map = new Map<string, { x: number; y: number }>();
  docs.forEach((d, idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    map.set(d.slug, { x: col * COL_GAP, y: row * ROW_GAP });
  });
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
