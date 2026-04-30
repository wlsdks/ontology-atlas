import type { KnowledgeGraphSource } from "../model";

export interface ManualSourceChipProps {
  source: KnowledgeGraphSource | undefined;
  /** 컴팩트 모드 — 작은 surface (트리 행, 검색 결과) 에서 텍스트 짧게. */
  size?: "default" | "compact";
}

/**
 * `source === 'manual'` 인 노드/엣지에만 노출되는 작은 chip.
 *
 * 디자인: warm gray inline 라벨. 인디고 (액센트) / amber (경고) 와 구분되어
 * "정보적 표시" 임을 명확히. extraction 출처는 기본값이라 chip 표시 안 함
 * (signal-to-noise 보호).
 */
export function ManualSourceChip({ source, size = "default" }: ManualSourceChipProps) {
  if (source !== "manual") return null;
  const padding = size === "compact" ? "px-1.5 py-0" : "px-2 py-0.5";
  const fontSize = size === "compact" ? "text-[9px]" : "text-[10px]";
  return (
    <span
      title="사용자가 추출 워커 거치지 않고 직접 만든 노드/관계"
      className={`inline-flex items-center rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-2)] font-mono ${fontSize} uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)] ${padding}`}
    >
      manual
    </span>
  );
}
