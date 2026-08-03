'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { FolderOpen, History, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

import { MOTION } from '@/shared/motion';

export interface RecentChangesNeedsVaultDialogProps {
  open: boolean;
  onClose: () => void;
  /** 「내 폴더 열기」 — 첫 실행 카드가 쓰는 것과 **같은** 핸들러여야 한다. */
  onOpenVault: () => void;
}

/**
 * 「최근 변경」을 샘플에서 눌렀을 때 — **막다른 곳 대신 길을 준다.**
 *
 * ## 왜 여기만 팝업인가
 *
 * 2026-08-02 판단은 「아무것도 없다」를 말하려고 모달을 여는 것을 기각했다. 그건
 * 누른 사람에게 일을 두 번 시키는 것이고 이 저장소가 `popup soup` 로 금지한
 * 부류다. **그 판단은 여전히 유효하다** — 내 폴더를 연 사람에게 최근 변경이
 * 0이면 그건 진짜로 보여줄 게 없는 것이라 비활성 + 툴팁 그대로다.
 *
 * 샘플은 다르다. 여기서 0인 이유는 「아직 안 바꿨다」가 아니라 **샘플의 날짜가
 * 이 저장소가 픽스처를 마지막으로 건드린 시각이라 사용자와 무관**하다는 것이다.
 * 즉 폴더를 열기 전에는 이 기능이 원리적으로 뜻을 못 가진다 — 기다린다고
 * 켜지지 않는다. 사유가 「없음」이 아니라 「다음 행동」이면 그때는 다음 행동을
 * 줘야 하고, 그게 `surfaces.md` 의 강등 계약(왜 + 어디서)이자 웹 스모크가
 * 요구하는 **죽은 CTA 0** 이다.
 *
 * 소유자 지시(2026-08-03): *"칩 누르면 뭔가 화면에서 팝업 띄워줘야 하지 않을까?
 * … 화면 중앙에 예쁜 팝업 띄워서 폴더 세팅 유도하던지?"*
 *
 * ## 골격은 새로 만들지 않았다
 *
 * scrim + 중앙 카드 + 토큰 + `MOTION.base` — `AgentConnectSheet` 와 같은 계약이다
 * (`design.md`: 모달은 dim/scrim 또는 차단된 상호작용을 **증명**해야 한다).
 * Esc 로 닫히고 포커스는 트리거로 돌아간다.
 */
export function RecentChangesNeedsVaultDialog({
  open,
  onClose,
  onOpenVault,
}: RecentChangesNeedsVaultDialogProps) {
  const t = useTranslations('topology.recentChangesNeedsVault');
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // 열리면 **다음 행동**에 포커스가 간다 — 이 표면의 일이 그것 하나라서다.
    primaryRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-interactive-overlay="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MOTION.base}
          onClick={onClose}
          data-testid="recent-changes-needs-vault-scrim"
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--color-backdrop-medium)] p-6"
        >
          <motion.section
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={MOTION.base}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={t('title')}
            data-testid="recent-changes-needs-vault-dialog"
            className="w-full max-w-[420px] rounded-[var(--radius-panel)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-3)]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-5 py-4">
              <div>
                <p className="flex items-center gap-1.5 font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
                  <History size={11} aria-hidden />
                  {t('eyebrow')}
                </p>
                <p className="mt-1.5 text-body-lg text-[color:var(--color-text-primary)]">{t('title')}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('close')}
                data-testid="recent-changes-needs-vault-close"
                className="shrink-0 rounded p-1 text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                <X size={15} aria-hidden />
              </button>
            </header>

            <div className="px-5 py-4">
              <p className="text-body text-[color:var(--color-text-secondary)]">{t('body')}</p>
              <button
                ref={primaryRef}
                type="button"
                onClick={() => {
                  onClose();
                  onOpenVault();
                }}
                data-testid="recent-changes-needs-vault-open"
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-card)] border border-[color:var(--color-indigo-brand)] bg-[color:var(--color-indigo-brand)] px-4 text-body text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-indigo-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
              >
                <FolderOpen size={14} aria-hidden />
                {t('action')}
              </button>
              {/*
                두 번째 행동을 안 준다. 이 표면의 일은 하나이고, 두 번째 버튼은
                「닫기」인데 그건 헤더의 X 와 scrim 이 이미 두 경로로 준다.
              */}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
