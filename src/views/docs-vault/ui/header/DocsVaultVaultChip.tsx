import type { RefObject } from "react";
import { ChevronDown, ClipboardCheck, HardDrive } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import type { useTranslations } from "next-intl";
import { Chip, RowButton, Surface } from "@/shared/ui";

export interface DocsVaultVaultChipProps {
  label: string;
  /** `null` states no count: a number read before the folder arrives would say "my folder has none". */
  docCount: number | null;
  folderCount: number;
  path: string;
  isLocalSourceLoaded: boolean;
  open: boolean;
  onToggle: () => void;
  onSwap: () => void;
  onOpenAudit: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
  toolsMovedHint?: string;
  t: ReturnType<typeof useTranslations<"docsVault">>;
}

export function DocsVaultVaultChip({
  label,
  docCount,
  folderCount,
  path,
  isLocalSourceLoaded,
  open,
  onToggle,
  onSwap,
  onOpenAudit,
  menuRef,
  toolsMovedHint,
  t,
}: DocsVaultVaultChipProps) {
  return (
    <div ref={menuRef} className="relative min-w-0 shrink">
      <Chip
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("vaultChip.menuAriaLabel")}
        data-testid="vault-chip-menu-trigger"
        className="min-h-[var(--chrome-tile-size)] min-w-0 max-w-[min(200px,100%)] flex-none gap-1 px-2 hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]"
      >
        <HardDrive size={ICON_SIZE.sm} aria-hidden className="flex-none" />
        {/* One sans face for name and count; paths keep mono elsewhere (DESIGN-SYSTEM "Machine strings"). */}
        <span className="hidden min-w-0 truncate text-[color:var(--color-text-secondary)] sm:inline">
          {label}
        </span>
        <ChevronDown
          size={ICON_SIZE.sm}
          aria-hidden
          className={`flex-none transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Chip>
      <Surface
        open={open}
        origin="top left"
        role="menu"
        aria-label={t("vaultChip.menuAriaLabel")}
        className="absolute left-0 top-[calc(100%+6px)] z-50 w-72 max-w-[84vw] rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-2 shadow-[var(--chrome-shadow)]"
      >
          <p className="truncate rounded-micro px-1.5 py-1 font-mono text-label text-[color:var(--color-text-tertiary)]">
            {path}
          </p>
          <p data-testid="vault-chip-census" className="px-1.5 py-1 text-label tabular-nums text-[color:var(--color-text-secondary)]">
            {t("header.vaultPillFolders", { count: folderCount })}
            {docCount === null ? null : ` · ${t("header.docCount", { count: docCount })}`}
          </p>
          {isLocalSourceLoaded ? (
            <p className="inline-flex items-center gap-1 px-1.5 py-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-pale-a86)]">
              <HardDrive size={ICON_SIZE.sm} aria-hidden />
              {t("header.localBadge")}
            </p>
          ) : null}
          <div className="mt-1 border-t border-[color:var(--color-border-soft)] pt-1">
            <RowButton
              size="sm"
              role="menuitem"
              data-testid="vault-chip-use-local"
              onClick={onSwap}
              className="hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
            >
              <HardDrive size={ICON_SIZE.sm} aria-hidden className="flex-none" />
              <span className="min-w-0 flex-1 truncate">{t("header.vaultPillSwap")}</span>
            </RowButton>
          </div>
          <RowButton
            size="sm"
            role="menuitem"
            data-testid="vault-chip-open-audit"
            onClick={onOpenAudit}
            className="mt-1 border-t border-[color:var(--color-border-soft)] pt-1 hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
          >
            <ClipboardCheck size={ICON_SIZE.sm} aria-hidden className="flex-none" />
            <span className="min-w-0 flex-1 truncate">{t("header.contractToggleShow")}</span>
          </RowButton>
          {toolsMovedHint ? (
            <p className="mt-1 border-t border-[color:var(--color-border-soft)] px-1.5 pt-1.5 text-caption leading-label text-[color:var(--color-text-tertiary)]">
              {toolsMovedHint}
            </p>
          ) : null}
      </Surface>
    </div>
  );
}
