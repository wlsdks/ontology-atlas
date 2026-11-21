"use client";

import { useTranslations } from "next-intl";
import { CloseButton } from "@/shared/ui/controls/close-button";

const TITLE_CLASS = "text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]";

export function FirstRunDialogHeader({ titleId, title, onClose }: { titleId: string; title: string; onClose: () => void }) {
  const t = useTranslations("firstRunStarter");
  return (
    <div className="flex items-start justify-between gap-3">
      <h2 id={titleId} className={TITLE_CLASS}>{title}</h2>
      <CloseButton label={t("closeLabel")} onClick={onClose} data-testid="first-run-dialog-close" className="-mr-1 -mt-1" />
    </div>
  );
}
