'use client';

import { useTranslations } from 'next-intl';
import type { KnowledgeGraphSource } from "../model";

export interface ManualSourceChipProps {
  source: KnowledgeGraphSource | undefined;
  /** 컴팩트 모드 — 작은 surface (트리 행, 검색 결과) 에서 텍스트 짧게. */
  size?: "default" | "compact";
}

/**
 * `source === 'manual'` 인 노드/엣지에만 노출되는 작은 chip.
 *
 * mission v2: vault frontmatter / 빌더 / MCP write 모두 사람·AI agent 가
 * 직접 작성한 출처 — 'manual'. legacy `extraction` (v1 LLM 추출 결과) 은
 * 기본값이라 chip 표시 안 함 (signal-to-noise 보호).
 */
export function ManualSourceChip({ source, size = "default" }: ManualSourceChipProps) {
  const t = useTranslations('ontologyWidgets');
  if (source !== "manual") return null;
  const padding = size === "compact" ? "px-1.5 py-0" : "px-2 py-0.5";
  const fontSize = size === "compact" ? "text-[9px]" : "text-[10px]";
  return (
    <span
      title={t('manualSourceChipTitle')}
      className={`inline-flex items-center rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-2)] font-mono ${fontSize} uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)] ${padding}`}
    >
      manual
    </span>
  );
}
