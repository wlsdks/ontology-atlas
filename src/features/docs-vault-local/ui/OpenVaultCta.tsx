import { FolderOpen } from "lucide-react";
import { useTranslations } from "use-intl";

import { cn } from "@/shared/lib/cn";
import { buttonVariants } from "@/shared/ui/controls/button";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import { useLocalVault } from "@/entities/vault-session";

export interface OpenVaultCtaProps {
  testId: string;
  variant?: "primary" | "outline";
  tone?: "default" | "accent";
  className?: string;
  onOpen?: () => void;
}

export function OpenVaultCta({ testId, variant, tone, className, onOpen }: OpenVaultCtaProps) {
  const t = useTranslations("openVaultCta");
  const vault = useLocalVault();
  const emphasis = variant ?? (tone === "accent" ? "primary" : "outline");

  const busy = vault.status === "opening";
  return (
    <button
      type="button"
      data-testid={testId}
      data-open-vault-cta="picker"
      data-open-vault-emphasis={emphasis}
      disabled={busy}
      onClick={() => {
        if (onOpen) onOpen();
        else void vault.open();
      }}
      className={cn(className, buttonVariants({ variant: emphasis, size: "sm" }))}
    >
      <FolderOpen size={ICON_SIZE.md} aria-hidden />
      {busy ? t("busyLabel") : t("label")}
    </button>
  );
}
