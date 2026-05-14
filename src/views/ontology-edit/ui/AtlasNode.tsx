"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { resolveDomainTint } from "@/shared/lib/domain-color";

/**
 * Atlas custom node — kind 별 디자인 폴리시.
 *
 * 디자인 헌장 §11 호환:
 * - 단일 인디고 alpha (hue 살짝 다름 — kind 별 차별화)
 * - glow / 보라핑크 / scale hover X
 * - rounded + soft shadow (정적, 무채색 alpha)
 * - vault (실선 border) vs ephemeral (dashed border) 시각 구분
 * - 같은 도메인 노드는 같은 hue 좌측 accent bar (4px) — 그룹 시각화
 */
export interface AtlasNodeData {
  label: string;
  kind: "project" | "domain" | "capability" | "element" | "ephemeral";
  ephemeral?: boolean;
  /** vault 노드 frontmatter.description — hover 시 native title tooltip 으로 노출. */
  description?: string;
  /** 원본 title (트레일링 괄호 strip 전) — tooltip / inspector 가 풀 텍스트 노출. */
  fullTitle?: string;
  /** 도메인 grouping 키. capability/element 의 frontmatter.domain, domain 자기 tail. */
  domainSlug?: string | null;
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
  // 호버 elevation — 디자인 헌장 §11 의 'scale hover 금지' 약속 안에서 box-shadow
  // 만 강화 (translateY 도 안 씀). React state 로 hover 분기 — 인라인 스타일이
  // CSS hover 보다 우선이라 state 가 가장 깔끔.
  const [hovered, setHovered] = useState(false);
  const tone = KIND_TONE[nodeData.kind] ?? KIND_TONE.element;
  const isEphemeral = Boolean(nodeData.ephemeral);
  // ephemeral 은 *저장 필요* 신호 — 디자인 헌장 §11 의 warning amber
  // (rgba(255,179,71,*)) 사용 (hub amber #d4b478 와 구분되는 신호 톤).
  // border 두께도 2px 로 강조 — vault 의 1px solid 와 한눈에 차별.
  const borderStyle = isEphemeral ? "dashed" : "solid";
  const borderWidth = isEphemeral ? 2 : 1;
  const borderColor = isEphemeral ? "rgba(255, 179, 71, 0.55)" : tone.border;
  const ephemeralBadgeColor = "rgba(255, 179, 71, 0.95)";
  // hover 시 native browser tooltip — description / fullTitle 노출.
  // fullTitle 이 있으면 카드 짧은 라벨 대신 풀 텍스트 + description.
  const hoverHeader =
    typeof nodeData.fullTitle === "string" && nodeData.fullTitle
      ? nodeData.fullTitle
      : nodeData.label;
  const hoverTitle = nodeData.description
    ? `${hoverHeader}\n\n${nodeData.description}`
    : hoverHeader;
  // 도메인 tint — 같은 도메인 노드끼리 시각 그룹화. domain 자체 노드 + capability /
  // element 가 도메인 일치하면 같은 hue. project / vault-readme 는 null tint.
  const domainTint = resolveDomainTint(
    typeof nodeData.domainSlug === "string" ? nodeData.domainSlug : null,
  );
  // ephemeral 은 amber 신호색이 강해서 도메인 tint 적용 안 함 (혼동 방지).
  // domain 노드 자기 카드도 자기 색으로 hue 진하게 (좌측 4px bar, bg tint).
  const showDomainTint = !isEphemeral && nodeData.domainSlug;
  // 선택 / hover / 기본 시각 위계 — 디자인 헌장 §11 의 단일 인디고 약속 안에서
  // box-shadow elevation 으로만 차별. scale / translate 금지.
  //  - selected: indigo halo + ring (또는 ephemeral 의 amber halo)
  //  - hovered: 그림자 한 단계 강화 (rest 보다 또렷, selected 보단 약함)
  //  - rest: 살짝 떠있는 default shadow
  const selectedShadow = selected
    ? `0 0 0 2px ${isEphemeral ? "rgba(255, 179, 71, 0.62)" : tone.accent}, 0 0 22px ${isEphemeral ? "rgba(255, 179, 71, 0.32)" : "rgba(139, 151, 255, 0.32)"}, 0 12px 28px rgba(0, 0, 0, 0.42)`
    : null;
  const hoveredShadow = hovered
    ? "0 8px 22px rgba(0, 0, 0, 0.36), 0 0 0 1px rgba(139, 151, 255, 0.22)"
    : null;
  const restShadow = "0 4px 12px rgba(0, 0, 0, 0.22)";
  return (
    <div
      title={hoverTitle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minWidth: 220,
        minHeight: 60,
        padding: "12px 16px",
        paddingLeft: showDomainTint ? 18 : 16,
        borderRadius: 12,
        border: `${borderWidth}px ${borderStyle} ${borderColor}`,
        // 좌측 4px accent bar 가 domain 시각 그룹의 anchor. ephemeral 은
        // amber 강조라 적용 X (잘못된 신호 혼합 회피).
        borderLeft: showDomainTint
          ? `4px solid ${domainTint.accent}`
          : `${borderWidth}px ${borderStyle} ${borderColor}`,
        background: isEphemeral
          ? "rgba(255, 179, 71, 0.06)"
          : showDomainTint
            ? `linear-gradient(to right, ${domainTint.bg}, ${tone.bg})`
            : tone.bg,
        color: "var(--color-text-primary)",
        boxShadow: selectedShadow ?? hoveredShadow ?? restShadow,
        transition:
          "box-shadow 200ms ease-out, border-color 200ms ease-out",
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
