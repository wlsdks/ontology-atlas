"use client";

import { FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/shared/lib/cn";
import { buttonVariants } from "@/shared/ui/button";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import { useLocalVault } from "@/entities/vault-session";

export interface OpenVaultCtaProps {
  testId: string;
  variant?: "primary" | "outline";
  tone?: "default" | "accentOnTint";
  className?: string;
}

export function OpenVaultCta({ testId, variant, tone, className }: OpenVaultCtaProps) {
  const t = useTranslations("openVaultCta");
  const vault = useLocalVault();
  const emphasis = variant ?? (tone === "accentOnTint" ? "primary" : "outline");

  if (vault.status === "unsupported") {
    return (
      <Link
        href="/download/"
        data-testid={testId}
        data-open-vault-cta="download"
        data-open-vault-emphasis={emphasis}
        className={controlClass({
          shape: "chip",
          size: "md",
          tone,
          hoverInk: "strong",
          hoverSurface: "lift",
          hoverBorder: "strong",
          className,
        })}
      >
        <FolderOpen size={ICON_SIZE.sm} aria-hidden />
        {t("unsupportedLabel")}
      </Link>
    );
  }

  const busy = vault.status === "opening";
  return (
    <button
      type="button"
      data-testid={testId}
      data-open-vault-cta="picker"
      data-open-vault-emphasis={emphasis}
      disabled={busy}
      onClick={() => {
        void vault.open();
      }}
      className={cn(className, buttonVariants({ variant: emphasis, size: "sm" }))}
    >
      <FolderOpen size={ICON_SIZE.md} aria-hidden />
      {busy ? t("busyLabel") : t("label")}
    </button>
  );
}
