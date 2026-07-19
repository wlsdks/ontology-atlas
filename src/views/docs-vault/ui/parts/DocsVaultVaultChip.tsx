import type { RefObject } from "react";
import { ChevronDown, HardDrive } from "lucide-react";
import type { useTranslations } from "next-intl";

export interface DocsVaultVaultChipProps {
  /** vault 짧은 이름 — local=폴더명, server=샘플 라벨. */
  label: string;
  docCount: number;
  folderCount: number;
  /** local vault 의 실제 root 경로(또는 dogfood 경로) — 팝오버 안 전체 표시. */
  path: string;
  isLocalSourceLoaded: boolean;
  open: boolean;
  onToggle: () => void;
  onSwap: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
  t: ReturnType<typeof useTranslations<"docsVault">>;
}

/**
 * 헤더 zone-l 의 VaultChip — design-prescription.md ③-2. 기존 vault pill
 * (경로 · 문서수 · 폴더수 · swap 텍스트버튼)을 칩 + 팝오버 메뉴로 접는다.
 * census(개념·관계)는 breadcrumb 스트립이 단독 소유하므로 여기서는 제거
 * (중복 해소). local badge 도 칩에서 메뉴 안으로 강등.
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
  menuRef,
  t,
}: DocsVaultVaultChipProps) {
  return (
    <div ref={menuRef} className="relative min-w-0 flex-none">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("vaultChip.menuAriaLabel")}
        className="inline-flex h-7 min-w-0 max-w-[200px] flex-none items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.028)] px-2 font-mono text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.28)] hover:text-[color:var(--color-text-primary)]"
      >
        <HardDrive size={12} aria-hidden className="flex-none" />
        <span className="hidden min-w-0 truncate text-[color:var(--color-text-secondary)] sm:inline">
          {label}
        </span>
        <span className="flex-none text-[color:var(--color-text-secondary)]">
          {t("header.docCount", { count: docCount })}
        </span>
        <ChevronDown
          size={12}
          aria-hidden
          className={`flex-none transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={t("vaultChip.menuAriaLabel")}
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-72 max-w-[84vw] rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-2 shadow-[var(--chrome-shadow)]"
        >
          <p className="truncate rounded-sm px-1.5 py-1 font-mono text-[11px] text-[color:var(--color-text-tertiary)]">
            {path}
          </p>
          <p className="px-1.5 py-1 text-[11px] text-[color:var(--color-text-secondary)]">
            {t("header.vaultPillFolders", { count: folderCount })}
          </p>
          {isLocalSourceLoaded ? (
            <p className="inline-flex items-center gap-1 px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:rgba(200,210,255,0.86)]">
              <HardDrive size={10} aria-hidden />
              {t("header.localBadge")}
            </p>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={onSwap}
            className="mt-1 flex w-full items-center rounded-sm px-1.5 py-1.5 text-left text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
          >
            {t("header.vaultPillSwap")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
