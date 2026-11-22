import { useTranslations } from "next-intl";

import { OpenVaultCta } from "@/features/docs-vault-local";

export interface SampleNoticeProps {
  onOpenFolder: () => void;
}

export function SampleNotice({ onOpenFolder }: SampleNoticeProps) {
  const t = useTranslations("docsVault");
  return (
    <div
      data-testid="docs-vault-sample-notice"
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5"
    >
      <p className="min-w-0 flex-1 text-body leading-body text-[color:var(--color-text-tertiary)]">
        <span className="font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">
          {t("sampleNotice.title")}
        </span>{" "}
        — {t("sampleNotice.body")}
      </p>
      <OpenVaultCta testId="docs-vault-sample-open-folder" onOpen={onOpenFolder} className="flex-none" />
    </div>
  );
}
