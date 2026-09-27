"use client";

import { FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import { useLocalVault } from "@/entities/vault-session";

/**
 * Opens the folder from the place that mentions it, in place rather than navigating: on the web
 * `/` is the gateway for a visitor without a vault, which cannot open a folder. The click is the
 * user gesture the folder picker needs. Branches on capability, not runtime
 * (`isDocsVaultLocalSourceDisabled`); only unsupported browsers go to the app download, never
 * "coming soon" (`.claude/rules/surfaces.md`).
 */
export interface OpenVaultCtaProps {
  /** Differs per slot. */
  testId: string;
  /**
   * `accentOnTint` where this is the region's primary action, so a secondary app link is not the
   * only indigo on screen. Ink is a `controlClass` axis; the tint goes through `className`.
   */
  tone?: "default" | "accentOnTint";
  className?: string;
}

/**
 * Not selectable: `sm` renders 9.5px text, smaller than the 11px label beside it, inverting the
 * hierarchy (`.claude/rules/design.md`).
 */
const CTA_SIZE = "md" as const;

export function OpenVaultCta({ testId, tone, className }: OpenVaultCtaProps) {
  const t = useTranslations("openVaultCta");
  const vault = useLocalVault();
  // `status` is the single source of the capability verdict.
  const unsupported = vault.status === "unsupported";
  const busy = vault.status === "opening";
  const ctaClassName = controlClass({
    shape: "chip",
    size: CTA_SIZE,
    tone,
    hoverInk: "strong",
    hoverSurface: "lift",
    hoverBorder: "strong",
    className,
  });

  if (unsupported) {
    return (
      <Link
        href="/download/"
        data-testid={testId}
        data-open-vault-cta="download"
        className={ctaClassName}
      >
        <FolderOpen size={ICON_SIZE.sm} aria-hidden />
        {t("unsupportedLabel")}
      </Link>
    );
  }

  return (
    <button
      type="button"
      data-testid={testId}
      data-open-vault-cta="picker"
      disabled={busy}
      onClick={() => {
        void vault.open();
      }}
      className={ctaClassName}
    >
      <FolderOpen size={ICON_SIZE.sm} aria-hidden />
      {busy ? t("busyLabel") : t("label")}
    </button>
  );
}
