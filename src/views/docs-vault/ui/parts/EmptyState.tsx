import { Link } from "@/i18n/navigation";
import { Bot, Network, PanelLeftOpen } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import { controlClass } from "@/shared/ui";

/**
 * The no-document-selected state — the Source Vault starting point after the always-visible tree
 * was removed. Rendered by the viewer area of `DocsVaultContent` when there is no `selectedSlug`.
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
      <div className="w-full max-w-[560px] rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-5 shadow-[var(--shadow-elevation-1)]">
        <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          {t("eyebrow", { count: docCount })}
        </p>
        <h2 className="mt-3 text-display font-[var(--font-weight-strong)] tracking-[var(--tracking-title)] text-[color:var(--color-text-primary)]">
          {t("title")}
        </h2>
        <p className="mx-auto mt-2 max-w-[440px] text-body leading-prose text-[color:var(--color-text-tertiary)]">
          {t("body")}
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={onOpenTree}
            className={controlClass({
              shape: "chip",
              size: "lg",
              active: true,
              className:
                "justify-center gap-2 font-[var(--font-weight-signature)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a16)]",
            })}
          >
            <PanelLeftOpen size={ICON_SIZE.md} aria-hidden />
            {t("openTree")}
          </button>
          <button
            type="button"
            onClick={onOpenAgentWorkflow}
            className={controlClass({ hoverInk: 'strong',
              shape: "chip",
              size: "lg",
              tone: "secondary",
              className: "justify-center gap-2 hover:border-[color:var(--color-indigo-line-a32)]",
            })}
          >
            <Bot size={ICON_SIZE.md} aria-hidden />
            {t("openAgent")}
          </button>
          <Link
            href="/topology/"
            className={controlClass({ hoverInk: 'strong',
              shape: "chip",
              size: "lg",
              tone: "secondary",
              className: "justify-center gap-2 hover:border-[color:var(--color-indigo-line-a32)]",
            })}
          >
            <Network size={ICON_SIZE.md} aria-hidden />
            {t("openTopology")}
          </Link>
        </div>
      </div>
    </div>
  );
}
