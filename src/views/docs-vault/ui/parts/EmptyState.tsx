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
      <div className="w-full max-w-[560px] rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-5 shadow-[var(--shadow-elevation-1)]">
        <p className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {t("eyebrow", { count: docCount })}
        </p>
        <h2 className="mt-3 text-display font-semibold tracking-[-0.01em] text-[color:var(--color-text-primary)]">
          {t("title")}
        </h2>
        <p className="mx-auto mt-2 max-w-[440px] text-body leading-prose text-[color:var(--color-text-tertiary)]">
          {t("body")}
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={onOpenTree}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-a10)] px-3 text-body font-medium text-[color:rgba(220,225,255,0.94)] transition-colors hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a16)]"
          >
            <PanelLeftOpen size={14} aria-hidden />
            {t("openTree")}
          </button>
          <button
            type="button"
            onClick={onOpenAgentWorkflow}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[color:var(--color-border-soft)] px-3 text-body text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]"
          >
            <Bot size={14} aria-hidden />
            {t("openAgent")}
          </button>
          <Link
            href="/topology/"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[color:var(--color-border-soft)] px-3 text-body text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]"
          >
            <Network size={14} aria-hidden />
            {t("openTopology")}
          </Link>
        </div>
      </div>
    </div>
  );
}
