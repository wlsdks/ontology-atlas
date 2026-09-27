import { Download, FolderOpen } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui";

export interface SampleNoticeProps {
  /** Capability, not runtime: with FSA a folder can be opened on the web too. */
  canOpenLocalVault: boolean;
  onOpenFolder: () => void;
}

/**
 * Why editing is unavailable in the sample and how to turn it on, beside the read-only chip.
 * The caller decides visibility.
 */
export function SampleNotice({ canOpenLocalVault, onOpenFolder }: SampleNoticeProps) {
  const t = useTranslations("docsVault");
  return (
    <div
      data-testid="docs-vault-sample-notice"
      // A vault fact, so it sits in the document header row rather than a band above every title.
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5"
    >
      <p className="min-w-0 flex-1 text-body leading-body text-[color:var(--color-text-tertiary)]">
        {/* Secondary ink so it does not compete with the document title. */}
        <span className="font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">
          {t("sampleNotice.title")}
        </span>{" "}
        — {t("sampleNotice.body")}
      </p>
      {canOpenLocalVault ? (
        <button
          type="button"
          onClick={onOpenFolder}
          className={controlClass({
            shape: "chip",
            size: "lg",
            active: true,
            className:
              "flex-none font-[var(--font-weight-signature)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a24)]",
          })}
        >
          <FolderOpen size={ICON_SIZE.sm} aria-hidden />
          {t("sampleNotice.openFolderCta")}
        </button>
      ) : (
        <Link
          href="/download/"
          className={controlClass({ shape: "chip", className: "flex-none border-[color:var(--color-indigo-line-a42)] bg-[color:var(--color-indigo-a12)] px-2.5 py-1.5 font-mono text-label text-[color:var(--color-text-primary)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a18)]" })}
        >
          <Download size={ICON_SIZE.sm} aria-hidden />
          {t("vaultStatus.downloadAppCta")}
        </Link>
      )}
    </div>
  );
}
