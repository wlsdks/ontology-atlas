import type { RefObject } from "react";
import { ChevronDown, ClipboardCheck, HardDrive, Package } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import type { useTranslations } from "next-intl";
import { Chip, RowButton, Surface } from "@/shared/ui";

export interface DocsVaultVaultChipProps {
  /** The vault's short name — the folder name for local, the sample label for server. */
  label: string;
  /** `null` means the document count is not stated at all — showing the sample's number for a
   *  local source with no folder chosen reads as "my folder has N documents". */
  docCount: number | null;
  folderCount: number;
  /** The local vault's real root path (or the dogfood path) — shown in full inside the popover. */
  path: string;
  isLocalSourceLoaded: boolean;
  open: boolean;
  onToggle: () => void;
  onSwap: () => void;
  /**
   * **The source is stated by this chip alone** (2026-08-08). A radio pair at the screen's right
   * edge used to state the same fact (sample or my folder) a second time and carry its own way to
   * change it — one fact stated in two places leaves you unsure which is real. The chip label
   * displays it; this menu switches it.
   */
  isSample: boolean;
  onUseSample: () => void;
  /** False in the installed app: bundled sample vaults belong to the web demo only. */
  allowSample?: boolean;
  /** A browser without FSA — locked, with the reason "my folder" cannot be chosen. */
  localDisabled?: boolean;
  localDisabledReason?: string;
  /** The docs check — folded into this menu from the clipboard tile at the right edge. */
  onOpenAudit: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
  /** A one-line bridge saying the vault tools moved into settings (this release only). Shown
   *  quietly at the bottom of the popover. */
  toolsMovedHint?: string;
  t: ReturnType<typeof useTranslations<"docsVault">>;
}

/**
 * The VaultChip in the header's zone-l. It folds the old vault pill (path, document count,
 * folder count, a swap text button) into a chip plus a popover menu. The census (concepts and
 * relations) is owned solely by the breadcrumb strip and so is not repeated here, and the local
 * badge is demoted from the chip into the menu.
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
        /* The menu items have testids but this trigger did not, so two e2e specs were finding it
           by its localized label ("Workspace info menu"). That is a seam where
           editing a translation silently kills a spec — give it a locale-independent handle. */
        data-testid="vault-chip-menu-trigger"
        className="min-w-0 max-w-[200px] flex-none font-mono hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]"
      >
        {/* The chip's icon states the source — this one glyph replaces the radio pair removed
            from the right (2026-08-08). */}
        {isSample ? (
          <Package size={ICON_SIZE.sm} aria-hidden className="flex-none" />
        ) : (
          <HardDrive size={ICON_SIZE.sm} aria-hidden className="flex-none" />
        )}
        <span className="hidden min-w-0 truncate text-[color:var(--color-text-secondary)] sm:inline">
          {label}
        </span>
        <span className="flex-none text-[color:var(--color-text-secondary)]">
          {docCount === null ? null : t("header.docCount", { count: docCount })}
        </span>
        <ChevronDown
          size={ICON_SIZE.sm}
          aria-hidden
          className={`flex-none transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Chip>
      {/* The menu is anchored to the chip's left edge, and grows from that edge. */}
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
          {/* The web offers two source rows on one exclusive axis. The installed app is the
              local-vault home, so it gets one ordinary "switch folder" action and no bundled
              sample choice. Keeping the sample row disabled or hidden with CSS would leave the
              wrong source in the accessibility tree; it is not rendered at all. */}
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
                {/* Both radio rows must state **what you are looking at**. If one of them is an
                    action name ("switch folder") instead, it stops reading as an option on the
                    same axis. Only when you are already looking at your own folder does choosing
                    it become switching, so only then is it "switch folder". */}
                {allowSample && isSample
                  ? t("header.sourcePickLocal")
                  : t("header.vaultPillSwap")}
              </span>
            </RowButton>
            {localDisabled && localDisabledReason ? (
              /* Why it cannot be chosen is written **on screen** too — from a dimmed row alone,
                 «broken» and «not possible in this browser» look identical. */
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
