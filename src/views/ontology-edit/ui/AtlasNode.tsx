"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";

/**
 * Atlas node — the builder canvas's editable sibling of the topology-v2 map
 * language (feat/builder-core, owner-approved contract:
 * `docs/prototypes/builder-v2-02-draft.html` / `builder-v2-03-selected.html`).
 * "빌더 = 지형도 캔버스의 편집 가능한 형제. 새 언어 발명 금지" — so the kind
 * glyph reuses `TopologyV2KindGlyph` verbatim (same hex/chip/circle/pad-via
 * silhouette + fill/stroke the map and INDEX draw), instead of a second icon
 * system.
 *
 * Card shell (surface/border/shadow) stays on the app's adaptive
 * `--color-*` tokens — unlike the topology-v2 canvas world (fixed dark,
 * P3-deferred light values), this builder page still honors the light/dark
 * toggle, so only the glyph's identity colors are shared+fixed.
 *
 * States (owner-approved, no exceptions):
 *  - selected: indigo border only — no shadow ring, no glow.
 *  - hover: border-strong only.
 *  - ephemeral (draft, unsaved): dashed border + opacity .85. No amber, no
 *    badge chip, no domain-tint rail — the mono kind line spells out
 *    "<kind> · <draft label>" instead, and that is the only draft signal.
 */
export interface AtlasNodeData {
  label: string;
  kind: "project" | "domain" | "capability" | "element" | "ephemeral";
  ephemeral?: boolean;
  /** vault 노드 frontmatter.description — hover 시 native title tooltip 으로 노출. */
  description?: string;
  /** 원본 title (트레일링 괄호 strip 전) — tooltip / inspector 가 풀 텍스트 노출. */
  fullTitle?: string;
  /** 도메인 grouping 키 — 카드 자체는 더 이상 시각적으로 안 씀 (배지/레일 삭제),
   *  인스펙터 등 다른 소비자를 위해 데이터는 유지. */
  domainSlug?: string | null;
  [key: string]: unknown;
}

/**
 * 4방향 target + 4방향 source handle — 라우팅(`builder-edge-handles.ts`)이
 * 노드 상대 위치에 따라 이 8개 중 마주보는 포트를 골라 엣지를 앵커한다.
 *
 * 시각/인터랙션 위계(계약):
 *  - **primary** (좌측 target · 우측 source): 10px 원으로 보이고 연결 가능.
 *    히트존은 CSS `::before` 로 22px 까지 넓혀(≥16px) 정밀 조준 부담을 없앤다.
 *  - **secondary** (상/하 + 반대편): 평소 투명·비활성. 노드 hover 시에만 아주
 *    옅게(0.3) 표출돼 "여기에도 포트가 있다"는 절제된 affordance 만 준다.
 *    연결 시작/종료 타깃은 아니다(예측 가능한 좌-입력/우-출력 유지).
 *
 * opacity/pointer-events/히트존/hover 표출은 전부 CSS(OntologyEditCanvas 의
 * styled-jsx global) 가 `atlas-port` / `atlas-port-primary|secondary` 클래스로
 * 소유한다 — 그래야 node-hover 로 secondary 를 드러낼 수 있다(inline opacity 는
 * CSS 로 못 덮음). 여기 inline 은 dot 색(선택 시 인디고)만 남긴다.
 */
function portStyle(selected: boolean): React.CSSProperties {
  return {
    background: "var(--color-canvas)",
    border: `1.5px solid ${selected ? "var(--color-indigo-brand)" : "var(--color-border-strong)"}`,
  };
}

const PORT_PRIMARY = "atlas-port atlas-port-primary";
const PORT_SECONDARY = "atlas-port atlas-port-secondary";

export function AtlasNode({ data, selected }: NodeProps) {
  const t = useTranslations("ontologyPages.edit.atlasNode");
  const nodeData = data as AtlasNodeData;
  const [hovered, setHovered] = useState(false);
  const isEphemeral = Boolean(nodeData.ephemeral);
  const isSelected = Boolean(selected);
  // hover 시 native browser tooltip — description / fullTitle 노출.
  const hoverHeader =
    typeof nodeData.fullTitle === "string" && nodeData.fullTitle
      ? nodeData.fullTitle
      : nodeData.label;
  const hoverTitle = nodeData.description
    ? `${hoverHeader}\n\n${nodeData.description}`
    : hoverHeader;
  // 선택 > 호버 > 기본 — 오직 border color 하나로만 위계 표현. 그림자 증강 /
  // glow 링 없음 (design.md "glow-like boxShadow" 금지 항목).
  const borderColor = isSelected
    ? "var(--color-indigo-brand)"
    : hovered
      ? "var(--color-border-strong)"
      : "var(--color-border-soft)";

  return (
    <div
      title={hoverTitle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 196,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--color-panel)",
        border: `1px ${isEphemeral ? "dashed" : "solid"} ${borderColor}`,
        borderRadius: 8,
        // machined edge (hairline top-inset highlight) + 정적 soft shadow.
        // 둘 다 hover/selected 로 증강 안 됨 — border color 하나가 유일한
        // interaction 신호.
        boxShadow: "var(--topology-v2-builder-node-sheen), var(--chrome-shadow)",
        opacity: isEphemeral ? 0.85 : 1,
        padding: "10px 12px",
        position: "relative",
        color: "var(--color-text-primary)",
        cursor: "pointer",
        transition: "border-color 160ms ease-out",
      }}
    >
      <Handle
        id="target-left"
        type="target"
        position={Position.Left}
        className={PORT_PRIMARY}
        style={portStyle(isSelected)}
      />
      <Handle id="target-top" type="target" position={Position.Top} className={PORT_SECONDARY} style={portStyle(isSelected)} />
      <Handle id="target-right" type="target" position={Position.Right} className={PORT_SECONDARY} style={portStyle(isSelected)} />
      <Handle id="target-bottom" type="target" position={Position.Bottom} className={PORT_SECONDARY} style={portStyle(isSelected)} />

      <TopologyV2KindGlyph kind={nodeData.kind} size={16} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 560,
            color: "var(--color-text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {nodeData.label}
        </span>
        <span
          style={{
            display: "block",
            marginTop: 3,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-text-quaternary)",
          }}
        >
          {isEphemeral ? `${nodeData.kind} · ${t("ephemeralBadge")}` : nodeData.kind}
        </span>
      </span>

      <Handle
        id="source-right"
        type="source"
        position={Position.Right}
        className={PORT_PRIMARY}
        style={portStyle(isSelected)}
      />
      <Handle id="source-left" type="source" position={Position.Left} className={PORT_SECONDARY} style={portStyle(isSelected)} />
      <Handle id="source-top" type="source" position={Position.Top} className={PORT_SECONDARY} style={portStyle(isSelected)} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} className={PORT_SECONDARY} style={portStyle(isSelected)} />
    </div>
  );
}

/**
 * xyflow nodeTypes registry — 캔버스 mount 시 한 번 register.
 */
export const ATLAS_NODE_TYPES = {
  atlas: AtlasNode,
};
