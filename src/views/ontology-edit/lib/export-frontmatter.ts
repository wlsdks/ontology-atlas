import type { EphemeralNode } from "./use-ephemeral-nodes";
import type { EphemeralEdge } from "./use-ephemeral-edges";

/**
 * Atlas frontmatter export — C-13.
 *
 * 캔버스의 ephemeral + approved 노드/엣지를 단일 md 파일로 변환.
 * spec `2026-04-27-ontology-frontmatter-contract.md` 의 등급 A 형식과 호환:
 *
 * - 노드별 yaml frontmatter + 빈 본문 (사용자가 채울 수 있게)
 * - 엣지는 별도 `## 관계` 섹션에 list 로
 *
 * approved 노드 detail 은 page 단에서 미접근이라 ephemeral 만 본격 export.
 * approved 는 id 만 알 수 있어 reference 로만 표시.
 */
export interface AtlasExportInput {
  ephemeralNodes: EphemeralNode[];
  ephemeralEdges: EphemeralEdge[];
  /** approved 노드 id 목록 (선택, edge 의 from/to 가 approved 일 때만 reference). */
  approvedNodeIds?: ReadonlyArray<string>;
  /** account id — 추적용 metadata. */
  accountId: string;
}

export function buildAtlasFrontmatterMarkdown(input: AtlasExportInput): string {
  const { ephemeralNodes, ephemeralEdges, accountId } = input;
  const exportedAt = new Date().toISOString();

  const lines: string[] = [];
  lines.push(`# Atlas export — ${accountId}`);
  lines.push("");
  lines.push(
    `> 생성 시각: \`${exportedAt}\` · 임시 노드 ${ephemeralNodes.length}개 · 임시 관계 ${ephemeralEdges.length}개`,
  );
  lines.push("");

  if (ephemeralNodes.length > 0) {
    lines.push("## 노드");
    lines.push("");
    for (const node of ephemeralNodes) {
      const slug = simpleSlug(node.title);
      const id = `${node.kind}.${slug}`;
      lines.push("---");
      lines.push(`id: ${id}`);
      lines.push(`kind: ${node.kind}`);
      lines.push(`title: ${escapeYamlString(node.title)}`);
      lines.push(`status: draft`);
      lines.push(`version: 1`);
      lines.push("---");
      lines.push("");
      lines.push(`## ${node.title}`);
      lines.push("");
      lines.push("(요약 / 설명을 채워주세요)");
      lines.push("");
    }
  }

  if (ephemeralEdges.length > 0) {
    lines.push("## 관계");
    lines.push("");
    for (const edge of ephemeralEdges) {
      lines.push(`- ${edge.source} → ${edge.target} (${edge.edgeType})`);
    }
    lines.push("");
  }

  if (ephemeralNodes.length === 0 && ephemeralEdges.length === 0) {
    lines.push("> 아직 임시 노드/관계가 없어요. palette 로 노드를 추가한 뒤 export 해주세요.");
    lines.push("");
  }

  return lines.join("\n");
}

function simpleSlug(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 32) || "node"
  );
}

function escapeYamlString(input: string): string {
  // yaml string 안전화 — 콜론 / 따옴표 / 줄바꿈 escape
  if (/^[\w가-힣\s\-.,!?]+$/.test(input)) return input;
  return `"${input.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

export function downloadAtlasFrontmatter(input: AtlasExportInput): void {
  if (typeof window === "undefined") return;
  const md = buildAtlasFrontmatterMarkdown(input);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date()
    .toISOString()
    .replace(/[:T]/g, "-")
    .slice(0, 19);
  link.href = url;
  link.download = `atlas-${input.accountId}-${stamp}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
