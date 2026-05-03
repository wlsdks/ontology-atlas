import { useTranslations } from "next-intl";
import type { VaultMode } from "@/entities/docs-vault";

/**
 * 문서 미선택 상태 — 트리에서 문서를 선택하라는 안내 + 현재 관점 라벨.
 *
 * 호출자: `DocsVaultContent` 의 viewer 영역 (selectedSlug 없을 때).
 */
export function EmptyState({ audience }: { audience: VaultMode | "all" }) {
  const t = useTranslations("vaultWidgets.parts.empty");
  const audienceLabel =
    audience === "planner"
      ? t("audiencePlanner")
      : audience === "engineer"
        ? t("audienceEngineer")
        : t("audienceAll");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="text-[14px] text-[color:var(--color-text-tertiary)]">
        {t("selectPrompt")}
      </div>
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {t("audiencePrefix")} · {audienceLabel}
      </div>
    </div>
  );
}
