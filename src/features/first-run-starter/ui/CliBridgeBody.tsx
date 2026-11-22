"use client";

import { useTranslations } from "next-intl";
import { useCopyFeedback } from "@/shared/lib/clipboard/use-copy-feedback";
import { CompactCopyButton } from "@/shared/ui";

const CLI_BOOTSTRAP_COMMAND =
  "node cli/src/index.mjs init && node cli/src/index.mjs bootstrap";

export function CliBridgeBody() {
  const t = useTranslations("firstRunStarter");
  const { state, copy } = useCopyFeedback();
  return (
    <div data-testid="first-run-starter-cli-bridge" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 break-keep text-label leading-label text-[color:var(--color-text-secondary)]">
          {t("cliBridgeLabel")}
        </p>
        <CompactCopyButton
          copied={state === "copied"}
          label={state === "copied" ? t("cliBridgeCopied") : t("cliBridgeCopy")}
          ariaLabel={t("cliBridgeCopyAriaLabel")}
          onClick={() => void copy(CLI_BOOTSTRAP_COMMAND)}
          data-testid="first-run-starter-cli-bridge-copy"
          className="-my-1.5 shrink-0"
        />
      </div>
      <code className="block whitespace-pre-wrap break-words rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2 font-mono text-label leading-label text-[color:var(--color-text-secondary)]">
        {CLI_BOOTSTRAP_COMMAND}
      </code>
      <p
        data-testid="first-run-starter-cli-source-only"
        className="text-caption leading-label text-[color:var(--color-text-tertiary)]"
      >
        {t("cliBridgeSourceOnly")}
      </p>
    </div>
  );
}
