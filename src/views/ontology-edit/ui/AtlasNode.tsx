"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

/**
 * Atlas custom node — C-8 디자인 폴리시.
 *
 * 디자인 헌장 §11 호환:
 * - 단일 인디고 alpha (hue 살짝 다름 — kind 별 차별화)
 * - glow / 보라핑크 / scale hover X
 * - rounded + soft shadow (정적, 무채색 alpha)
 * - approved (실선 border) vs ephemeral (dashed border) 시각 구분
 */
export interface AtlasNodeData {
  label: string;
  kind: "project" | "domain" | "capability" | "element" | "ephemeral";
  ephemeral?: boolean;
  /** kindLabel 별도 (예: '프로젝트' / '도메인'). label 안에 이미 prefix 로 들어감. */
  [key: string]: unknown;
}

const KIND_TONE: Record<
  AtlasNodeData["kind"],
  { border: string; bg: string; accent: string }
> = {
  project: {
    border: "rgba(94, 106, 210, 0.46)",
    bg: "rgba(94, 106, 210, 0.10)",
    accent: "rgba(139, 151, 255, 0.96)",
  },
  domain: {
    border: "rgba(94, 106, 210, 0.32)",
    bg: "rgba(94, 106, 210, 0.06)",
    accent: "rgba(120, 132, 230, 0.96)",
  },
  capability: {
    border: "rgba(94, 106, 210, 0.24)",
    bg: "rgba(94, 106, 210, 0.04)",
    accent: "rgba(110, 122, 220, 0.96)",
  },
  element: {
    border: "var(--color-overlay-3)",
    bg: "var(--color-overlay-1)",
    accent: "rgba(180, 188, 220, 0.84)",
  },
  ephemeral: {
    border: "rgba(94, 106, 210, 0.66)",
    bg: "rgba(94, 106, 210, 0.08)",
    accent: "rgba(139, 151, 255, 0.96)",
  },
};

export function AtlasNode({ data, selected }: NodeProps) {
  const nodeData = data as AtlasNodeData;
  const tone = KIND_TONE[nodeData.kind] ?? KIND_TONE.element;
  const isEphemeral = Boolean(nodeData.ephemeral);
  const borderStyle = isEphemeral ? "dashed" : "solid";
  return (
    <div
      style={{
        // 헌장 §11 — rounded + 무채색 alpha bg + 단일 인디고 border
        // soft shadow (선명도 X, 무채색 alpha)
        minWidth: 200,
        minHeight: 56,
        padding: "10px 14px",
        borderRadius: 12,
        border: `1px ${borderStyle} ${tone.border}`,
        background: tone.bg,
        color: "var(--color-text-primary)",
        boxShadow: selected
          ? `0 0 0 2px ${tone.accent}, 0 8px 18px rgba(0, 0, 0, 0.32)`
          : "0 4px 12px rgba(0, 0, 0, 0.22)",
        // 헌장 §11 — transition 은 box-shadow / border 만 (transform / scale X)
        transition: "box-shadow 180ms ease-out, border-color 180ms ease-out",
        fontSize: 13,
        lineHeight: 1.4,
        wordBreak: "keep-all",
      }}
    >
      {/* source / target handle — 인디고 dot. ephemeral 노드는 connectable. */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: tone.accent,
          width: 8,
          height: 8,
          border: "2px solid rgba(14, 16, 22, 0.9)",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {isEphemeral ? (
          <span
            aria-hidden
            style={{
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: tone.accent,
              padding: "2px 6px",
              borderRadius: 4,
              border: `1px solid ${tone.border}`,
              background: tone.bg,
            }}
          >
            임시
          </span>
        ) : null}
        <span style={{ flex: 1, minWidth: 0 }}>{nodeData.label}</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: tone.accent,
          width: 8,
          height: 8,
          border: "2px solid rgba(14, 16, 22, 0.9)",
        }}
      />
    </div>
  );
}

/**
 * xyflow nodeTypes registry — 캔버스 mount 시 한 번 register.
 */
export const ATLAS_NODE_TYPES = {
  atlas: AtlasNode,
};
