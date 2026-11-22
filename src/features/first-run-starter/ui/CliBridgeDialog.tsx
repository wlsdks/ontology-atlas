"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/shared/ui";
import { CliBridgeBody } from "./CliBridgeBody";
import { FirstRunDialogHeader } from "./FirstRunDialogHeader";

export function CliBridgeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("firstRunStarter");
  const titleId = useId();
  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="sm" testId="first-run-starter-cli-dialog">
      <FirstRunDialogHeader titleId={titleId} title={t("cliBridgeToggle")} onClose={onClose} />
      <div className="mt-3">
        <CliBridgeBody />
      </div>
    </Dialog>
  );
}
