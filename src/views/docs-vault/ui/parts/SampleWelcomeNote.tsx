import { FolderOpen, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import { IconButton, controlClass } from "@/shared/ui";

export interface SampleWelcomeNoteProps {
  /** With FSA a folder can be opened on the web too, as in `SampleNotice`. */
  canOpenLocalVault: boolean;
  onOpenFolder: () => void;
  onDismiss: () => void;
}

export function SampleWelcomeNote({
  canOpenLocalVault,
  onOpenFolder,
  onDismiss,
}: SampleWelcomeNoteProps) {
  const t = useTranslations("docsVault.sampleWelcome");
  return (
    <div
      data-testid="docs-vault-sample-welcome-note"
      className="relative flex flex-none flex-col gap-2 border-b border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] px-6 py-4 md:px-10"
    >
      <IconButton
        label={t("dismissAria")}
        size="sm"
        tone="muted"
        onClick={onDismiss}
        className="absolute right-3 top-3 hover:text-[color:var(--color-text-primary)]"
      >
        <X size={ICON_SIZE.sm} aria-hidden />
      </IconButton>
      <p className="max-w-[var(--measure-note-column)] pr-6 text-body leading-body text-[color:var(--color-text-secondary)]">
        <span className="block font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {t("title")}
        </span>
        {t("body")}
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
            "w-fit flex-none font-[var(--font-weight-signature)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a24)]",
        })}
        >
          <FolderOpen size={ICON_SIZE.sm} aria-hidden />
          {t("openFolderCta")}
        </button>
      ) : null}
    </div>
  );
}
