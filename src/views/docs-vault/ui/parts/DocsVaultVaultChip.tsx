import type { RefObject } from "react";
import { ChevronDown, HardDrive } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import type { useTranslations } from "next-intl";
import { Chip, RowButton, Surface } from "@/shared/ui";

export interface DocsVaultVaultChipProps {
  /** vault 짧은 이름 — local=폴더명, server=샘플 라벨. */
  label: string;
  /** `null` 이면 문서 수를 아예 말하지 않는다 — 폴더 미선택 로컬에서 샘플
   *  숫자를 띄우면 "내 폴더에 N개가 있다" 로 읽힌다. */
  docCount: number | null;
  folderCount: number;
  /** local vault 의 실제 root 경로(또는 dogfood 경로) — 팝오버 안 전체 표시. */
  path: string;
  isLocalSourceLoaded: boolean;
  open: boolean;
  onToggle: () => void;
  onSwap: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
  /** B2 병합 — vault 도구가 설정으로 이동했음을 알리는 한 줄 브리지(이번
   *  릴리스 한정). 팝오버 하단에 조용히 노출. */
  toolsMovedHint?: string;
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
        className="min-w-0 max-w-[200px] flex-none font-mono hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]"
      >
        <HardDrive size={ICON_SIZE.sm} aria-hidden className="flex-none" />
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
      {/* 칩 왼쪽 모서리에 앵커한 메뉴 — 등장도 그 모서리에서 자란다. */}
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
          <RowButton
            size="sm"
            role="menuitem"
            onClick={onSwap}
            className="mt-1 hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
          >
            {t("header.vaultPillSwap")}
          </RowButton>
          {toolsMovedHint ? (
            <p className="mt-1 border-t border-[color:var(--color-border-soft)] px-1.5 pt-1.5 text-caption leading-4 text-[color:var(--color-text-tertiary)]">
              {toolsMovedHint}
            </p>
          ) : null}
      </Surface>
    </div>
  );
}
