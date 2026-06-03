import { Link } from "@/i18n/navigation";
import { Bot, Network, PanelLeftOpen } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * 문서 미선택 상태 — 항상 보이는 트리를 없앤 뒤의 Source Vault 시작점.
 *
 * 호출자: `DocsVaultContent` 의 viewer 영역 (selectedSlug 없을 때).
 */
export function EmptyState({
  docCount,
  onOpenAgentWorkflow,
  onOpenTree,
}: {
  docCount: number;
  onOpenAgentWorkflow: () => void;
  onOpenTree: () => void;
}) {
  const t = useTranslations("vaultWidgets.parts.empty");
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="w-full max-w-[560px] rounded-lg border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.02)] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {t("eyebrow", { count: docCount })}
        </p>
        <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.01em] text-[color:var(--color-text-primary)]">
          {t("title")}
        </h2>
        <p className="mx-auto mt-2 max-w-[440px] text-[13px] leading-[1.7] text-[color:var(--color-text-tertiary)]">
          {t("body")}
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={onOpenTree}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[color:rgba(139,151,255,0.32)] bg-[color:rgba(94,106,210,0.1)] px-3 text-[12px] font-medium text-[color:rgba(220,225,255,0.94)] transition-colors hover:border-[color:rgba(139,151,255,0.55)] hover:bg-[color:rgba(94,106,210,0.16)]"
          >
            <PanelLeftOpen size={14} aria-hidden />
            {t("openTree")}
          </button>
          <button
            type="button"
            onClick={onOpenAgentWorkflow}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[color:var(--color-border-soft)] px-3 text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(139,151,255,0.32)] hover:text-[color:var(--color-text-primary)]"
          >
            <Bot size={14} aria-hidden />
            {t("openAgent")}
          </button>
          <Link
            href="/topology/"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[color:var(--color-border-soft)] px-3 text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(139,151,255,0.32)] hover:text-[color:var(--color-text-primary)]"
          >
            <Network size={14} aria-hidden />
            {t("openTopology")}
          </Link>
        </div>
      </div>
    </div>
  );
}
