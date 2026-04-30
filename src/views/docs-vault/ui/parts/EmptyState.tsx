import type { VaultMode } from "@/entities/docs-vault";

/**
 * 문서 미선택 상태 — 트리에서 문서를 선택하라는 안내 + 현재 관점 라벨.
 *
 * 호출자: `AdminDocsContent` 의 viewer 영역 (selectedSlug 없을 때).
 */
export function EmptyState({ audience }: { audience: VaultMode | "all" }) {
  const audienceLabel =
    audience === "planner"
      ? "기획자"
      : audience === "engineer"
        ? "개발자"
        : "전체";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="text-[14px] text-[color:var(--color-text-tertiary)]">
        왼쪽 트리에서 문서를 선택하세요
      </div>
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        관점 · {audienceLabel}
      </div>
    </div>
  );
}
