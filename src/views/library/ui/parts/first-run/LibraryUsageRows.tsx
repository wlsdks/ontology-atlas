"use client";

import type { useTranslations } from "next-intl";
import { FolderOpen, Copy, ShieldCheck } from "lucide-react";

import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import { hostFileManager } from "../../../model/sources/file-manager";

type LibraryT = ReturnType<typeof useTranslations<"library">>;

/** Usage's Library rows: where sources live, what adding does, and when an agent reads one. */
export function LibraryUsageRows({ folderName, t }: { folderName: string; t: LibraryT }) {
  const fileManagerName = t("start.fileManagerName", { fileManager: hostFileManager() });
  const rows = [
    { id: "where", icon: FolderOpen, text: t("usage.where", { folder: folderName, fileManagerName }) },
    { id: "copy", icon: Copy, text: t("usage.copy") },
    { id: "read", icon: ShieldCheck, text: t("usage.read") },
  ];
  return (
    <ul data-testid="library-usage-rows" className="flex flex-col gap-2.5 border-t border-[color:var(--color-divider)] px-4 pt-3 pb-4">
      {rows.map(({ id, icon: Icon, text }) => (
        <li key={id} data-usage-row={id} className="flex gap-2.5 text-body text-[color:var(--color-text-secondary)]">
          <Icon size={ICON_SIZE.md} aria-hidden className="mt-0.5 flex-none text-[color:var(--color-text-tertiary)]" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}
