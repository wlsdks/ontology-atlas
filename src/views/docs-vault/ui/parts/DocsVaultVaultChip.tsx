import type { RefObject } from "react";
import { ChevronDown, ClipboardCheck, HardDrive, Package } from "lucide-react";
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
  /**
   * **소스는 이 칩 하나가 말한다** (2026-08-08, 2안). 종전엔 화면 오른쪽 끝의
   * 라디오 한 벌이 같은 사실(샘플이냐 내 폴더냐)을 한 번 더 말하고 바꾸는
   * 길도 따로 갖고 있었다 — 같은 사실을 두 곳이 말하면 어느 쪽이 진짜인지부터
   * 헷갈린다. 표시는 칩 라벨이, 전환은 이 메뉴가 맡는다.
   */
  isSample: boolean;
  onUseSample: () => void;
  /** FSA 미지원 브라우저 — 「내 폴더」를 고를 수 없는 이유와 함께 잠근다. */
  localDisabled?: boolean;
  localDisabledReason?: string;
  /** 문서함 점검 — 오른쪽 끝 클립보드 타일에서 이 메뉴로 접었다. */
  onOpenAudit: () => void;
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
  isSample,
  onUseSample,
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
        /* 메뉴 항목들은 testid 가 있는데 이 트리거만 없어서, 두 e2e 스펙이
           로케일 라벨("문서함 정보 메뉴" / "Workspace info menu")로 찾고 있었다.
           번역을 고치면 스펙이 조용히 죽는 이음새다 — 로케일 무관 좌표를 준다. */
        data-testid="vault-chip-menu-trigger"
        className="min-w-0 max-w-[200px] flex-none font-mono hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]"
      >
        {/* 칩의 아이콘이 소스를 말한다 — 오른쪽 라디오를 걷어낸 자리를
            이 한 글리프가 대신한다(2026-08-08). */}
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
          {/* 소스 두 줄 — 한 축에서 하나만 고르므로 `menuitemradio` 다.
              체크 자리는 안 고른 줄에서도 비워 둬 글자가 흔들리지 않는다. */}
          <div
            role="group"
            aria-label={t("header.sourceAriaLabel")}
            className="mt-1 border-t border-[color:var(--color-border-soft)] pt-1"
          >
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
            <RowButton
              size="sm"
              role="menuitemradio"
              aria-checked={!isSample}
              active={!isSample}
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
                {/* 라디오 두 줄은 둘 다 **무엇을 보는지**를 말해야 한다.
                    한쪽만 동작 이름(「폴더 바꾸기」)이면 같은 축의 선택지로
                    안 읽힌다. 이미 내 폴더를 보고 있으면 바꾸는 일이 되므로
                    그때만 「폴더 바꾸기」다. */}
                {isSample
                  ? t("header.sourcePickLocal")
                  : t("header.vaultPillSwap")}
              </span>
            </RowButton>
            {localDisabled && localDisabledReason ? (
              /* 왜 못 고르는지를 **화면에도** 적는다 — 흐린 줄만 보고는
                 «고장» 과 «이 브라우저에서는 안 됨» 이 같은 그림이다. */
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
