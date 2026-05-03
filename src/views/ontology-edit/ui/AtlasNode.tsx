"use client";

import { useTranslations } from "next-intl";
import { Handle, Position, type NodeProps } from "@xyflow/react";

/**
 * Atlas custom node — kind 별 디자인 폴리시.
 *
 * 디자인 헌장 §11 호환:
 * - 단일 인디고 alpha (hue 살짝 다름 — kind 별 차별화)
 * - glow / 보라핑크 / scale hover X
 * - rounded + soft shadow (정적, 무채색 alpha)
 * - vault (실선 border) vs ephemeral (dashed border) 시각 구분
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
  const t = useTranslations("ontologyPages.edit.atlasNode");
  const nodeData = data as AtlasNodeData;
  const tone = KIND_TONE[nodeData.kind] ?? KIND_TONE.element;
  const isEphemeral = Boolean(nodeData.ephemeral);
  // ephemeral 은 *저장 필요* 신호 — 디자인 헌장 §11 의 warning amber
  // (rgba(255,179,71,*)) 사용 (hub amber #d4b478 와 구분되는 신호 톤).
  // border 두께도 2px 로 강조 — vault 의 1px solid 와 한눈에 차별.
  const borderStyle = isEphemeral ? "dashed" : "solid";
  const borderWidth = isEphemeral ? 2 : 1;
  const borderColor = isEphemeral ? "rgba(255, 179, 71, 0.55)" : tone.border;
  const ephemeralBadgeColor = "rgba(255, 179, 71, 0.95)";
  return (
    <div
      style={{
        minWidth: 220,
        minHeight: 60,
        padding: "12px 16px",
        borderRadius: 12,
        border: `${borderWidth}px ${borderStyle} ${borderColor}`,
        background: isEphemeral
          ? "rgba(255, 179, 71, 0.06)"
          : tone.bg,
        color: "var(--color-text-primary)",
        boxShadow: selected
          ? `0 0 0 2px ${isEphemeral ? "rgba(255, 179, 71, 0.6)" : tone.accent}, 0 10px 22px rgba(0, 0, 0, 0.36)`
          : "0 4px 12px rgba(0, 0, 0, 0.22)",
        transition: "box-shadow 180ms ease-out, border-color 180ms ease-out",
        fontSize: 13,
        lineHeight: 1.4,
        wordBreak: "keep-all",
      }}
    >
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
              color: ephemeralBadgeColor,
              padding: "2px 6px",
              borderRadius: 4,
              border: `1px solid ${ephemeralBadgeColor}`,
              background: "rgba(255, 179, 71, 0.10)",
            }}
          >
            {t("ephemeralBadge")}
          </span>
        ) : null}
        <span style={{ flex: 1, minWidth: 0 }}>{nodeData.label}</span>
      </div>
      {isEphemeral ? (
        <p
          style={{
            marginTop: 6,
            fontSize: 10,
            color: "rgba(255, 179, 71, 0.78)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.04em",
          }}
        >
          {t("ephemeralUnsavedHint")}
        </p>
      ) : null}
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
