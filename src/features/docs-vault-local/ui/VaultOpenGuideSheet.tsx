"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { FolderOpen, HardDrive, ShieldCheck, Sparkles, X } from "lucide-react";
import { MOTION } from "@/shared/motion";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";

/**
 * 폴더 열기 사전 안내 시트 (2026-07-24 온보딩 라운드) — 첫 실행 카드의
 * 폴더 CTA 가 사전 설명 0으로 OS 폴더 선택창을 직행해, 첫 사용자가
 * "어떤 폴더를 골라야 하나 / 고르면 무슨 일이 생기나 / 파일은 안전한가"
 * 를 모른 채 겁먹고 이탈했다(라이브 답사 실측). OS 창을 띄우기 전에
 * 안심 3줄 + 기존/새로 분기 하나를 보여준다.
 *
 * 모달 골격은 AgentConnectSheet 와 동일 계약 (scrim + 중앙 카드 + 토큰,
 * Esc/scrim 닫기, 카드 클릭 전파 차단).
 */
export interface VaultOpenGuideSheetProps {
  open: boolean;
  onClose: () => void;
  /** "기존 폴더 선택" — 시트를 닫고 OS 폴더 선택창(vault.open())으로. */
  onPickExisting: () => void;
  /** "빈 폴더로 새로 시작" — 시트를 닫고 vault 생성 플로우(스캐폴드)로. */
  onCreateNew: () => void;
}

const BULLETS = [
  { icon: FolderOpen, key: "bulletAnyFolder" },
  { icon: HardDrive, key: "bulletLocal" },
  { icon: Sparkles, key: "bulletStarter" },
  // 소유자 실사용 지적 (2026-07-24) — 폴더 선택 직후 브라우저의 표준
  // 허용 확인창("이 사이트에서 파일을 보고…")을 예고하지 않아 처음 보면
  // 우리 팝업/이상 동작으로 오인했다. 미리 한 줄로 안심시킨다.
  { icon: ShieldCheck, key: "bulletPermission" },
] as const;

export function VaultOpenGuideSheet({
  open,
  onClose,
  onPickExisting,
  onCreateNew,
}: VaultOpenGuideSheetProps) {
  const t = useTranslations("vaultOpenGuide");
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-interactive-overlay="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MOTION.fast}
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-backdrop-medium)] p-4 sm:p-6"
          onClick={onClose}
          data-testid="vault-guide-scrim"
        >
          <motion.section
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={MOTION.medium}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t("title")}
            data-testid="vault-guide-sheet"
            className="flex w-full max-w-[420px] flex-col overflow-hidden rounded-[var(--topology-shortcut-sheet-radius)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-2xl"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-5 py-4">
              <div>
                <h2 className="text-body-lg font-semibold text-[color:var(--color-text-primary)]">
                  {t("title")}
                </h2>
                <p className="mt-1 text-label leading-relaxed text-[color:var(--color-text-tertiary)]">
                  {t("subtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("actionCancel")}
                data-testid="vault-guide-close"
                className="rounded p-1 text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                <X size={14} aria-hidden />
              </button>
            </header>

            <ul className="flex flex-col gap-2.5 px-5 py-4">
              {BULLETS.map(({ icon: Icon, key }) => (
                <li key={key} className="flex items-start gap-2.5">
                  <Icon
                    size={14}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]"
                  />
                  <span className="text-body leading-relaxed text-[color:var(--color-text-secondary)]">
                    {t(key)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-2 border-t border-[color:var(--color-border-soft)] px-5 py-4">
              <button
                type="button"
                onClick={onPickExisting}
                data-testid="vault-guide-pick-existing"
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-indigo-line-a45)] bg-[color:var(--color-indigo-brand)] text-body font-semibold text-white transition-colors hover:bg-[color:var(--color-indigo-accent)]"
              >
                <FolderOpen size={13} aria-hidden />
                {t("actionPickExisting")}
              </button>
              <button
                type="button"
                onClick={onCreateNew}
                data-testid="vault-guide-create-new"
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] text-body text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]"
              >
                <Sparkles size={13} aria-hidden />
                {t("actionCreateNew")}
              </button>
              <button
                type="button"
                onClick={onClose}
                data-testid="vault-guide-cancel"
                className="mt-0.5 self-center text-label text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
              >
                {t("actionCancel")}
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
