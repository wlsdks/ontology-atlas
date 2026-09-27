import type { RefObject } from "react";
import { ChevronDown, ClipboardCheck, HardDrive, Package } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import type { useTranslations } from "next-intl";
import { Chip, RowButton, Surface } from "@/shared/ui";

export interface DocsVaultVaultChipProps {
  label: string;
  /** `null` states no count: the sample's number would read as "my folder has N documents". */
  docCount: number | null;
  folderCount: number;
  /** Shown in full inside the popover. */
  path: string;
  isLocalSourceLoaded: boolean;
  open: boolean;
  onToggle: () => void;
  onSwap: () => void;
  /** The chip alone states the source; this menu switches it. */
  isSample: boolean;
  onUseSample: () => void;
  /** False in the installed app: bundled samples are web-only. */
  allowSample?: boolean;
  /** A browser without FSA locks "my folder" with the reason. */
  localDisabled?: boolean;
  localDisabledReason?: string;
  onOpenAudit: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
  /** A one-line note that vault tools moved into settings. */
  toolsMovedHint?: string;
  t: ReturnType<typeof useTranslations<"docsVault">>;
}

/**
 * The header's vault chip: source, name and count, with a menu to switch. The census belongs
 * to the breadcrumb strip.
 */
export function DocsVaultVaultChip({
  label,
  docCount,
  folderCount,
  path,
  isLocalSourceLoaded,
  open,
  onToggle,
  onSwap,
  isSample,
  onUseSample,
  allowSample = true,
  localDisabled = false,
  localDisabledReason,
  onOpenAudit,
  menuRef,
  toolsMovedHint,
  t,
}: DocsVaultVaultChipProps) {
  return (
    <div ref={menuRef} className="relative min-w-0 flex-none">
      <Chip
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("vaultChip.menuAriaLabel")}
        // A locale-independent handle for e2e specs.
        data-testid="vault-chip-menu-trigger"
        className="min-w-0 max-w-[200px] flex-none hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]"
      >
        {/* The icon states the source. */}
        {isSample ? (
          <Package size={ICON_SIZE.sm} aria-hidden className="flex-none" />
        ) : (
          <HardDrive size={ICON_SIZE.sm} aria-hidden className="flex-none" />
        )}
        {/* One sans face for name and count; paths keep mono elsewhere (DESIGN-SYSTEM "Machine strings"). */}
        <span className="hidden min-w-0 truncate text-[color:var(--color-text-secondary)] sm:inline">
          {label}
        </span>
        <span className="flex-none tabular-nums text-[color:var(--color-text-secondary)]">
          {docCount === null ? null : t("header.docCount", { count: docCount })}
        </span>
        <ChevronDown
          size={ICON_SIZE.sm}
          aria-hidden
          className={`flex-none transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Chip>
      {/* Anchored to the chip's left edge and grows from it. */}
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
          <p className="px-1.5 py-1 text-label text-[color:var(--color-text-secondary)]">
            {t("header.vaultPillFolders", { count: folderCount })}
          </p>
          {isLocalSourceLoaded ? (
            <p className="inline-flex items-center gap-1 px-1.5 py-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-pale-a86)]">
              <HardDrive size={ICON_SIZE.sm} aria-hidden />
              {t("header.localBadge")}
            </p>
          ) : null}
          {/* The installed app gets one "switch folder" action and no sample row; a hidden row would
             leave the wrong source in the accessibility tree, so it is not rendered. */}
          <div
            role={allowSample ? "group" : undefined}
            aria-label={allowSample ? t("header.sourceAriaLabel") : undefined}
            className="mt-1 border-t border-[color:var(--color-border-soft)] pt-1"
          >
            {allowSample ? (
              <RowButton
                size="sm"
                role="menuitemradio"
                aria-checked={isSample}
                active={isSample}
                data-testid="vault-chip-use-sample"
                onClick={onUseSample}
                className="hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
              >
                <Package
                  size={ICON_SIZE.sm}
                  aria-hidden
                  className={`flex-none ${isSample ? "opacity-100" : "opacity-40"}`}
                />
                <span className="min-w-0 flex-1 truncate">{t("header.sourcePickSample")}</span>
              </RowButton>
            ) : null}
            <RowButton
              size="sm"
              role={allowSample ? "menuitemradio" : "menuitem"}
              aria-checked={allowSample ? !isSample : undefined}
              active={allowSample ? !isSample : false}
              disabled={localDisabled}
              aria-describedby={localDisabled ? "vault-chip-local-blocked" : undefined}
              
              data-testid="vault-chip-use-local"
              onClick={onSwap}
              className="hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
            >
              <HardDrive
                size={ICON_SIZE.sm}
                aria-hidden
                className={`flex-none ${!isSample ? "opacity-100" : "opacity-40"}`}
              />
              <span className="min-w-0 flex-1 truncate">
                {/* Both rows name what you are looking at; only your own open folder reads "switch folder". */}
                {allowSample && isSample
                  ? t("header.sourcePickLocal")
                  : t("header.vaultPillSwap")}
              </span>
            </RowButton>
            {localDisabled && localDisabledReason ? (
              // A dimmed row alone cannot tell broken from not possible in this browser.
              <p
                id="vault-chip-local-blocked"
                className="px-1.5 pb-1 pt-0.5 text-caption leading-label text-[color:var(--color-text-quaternary)]"
              >
                {localDisabledReason}
              </p>
            ) : null}
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
