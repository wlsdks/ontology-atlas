'use client';

import { useTranslations } from 'next-intl';
import { getProjectDetailUrl } from '@/entities/project';
import { useToast } from '@/shared/ui';

export interface SigmaContextMenuData {
  slug: string;
  name: string;
  x: number;
  y: number;
}

interface Props {
  data: SigmaContextMenuData;
  onFocus: (slug: string) => void;
  onLocalGraph: (slug: string) => void;
  onDismiss: () => void;
}

/**
 * 노드 우클릭 context menu — 포커스 / local graph 진입 / 상세 URL 복사.
 * 3개 액션 모두 실행 후 onDismiss 로 메뉴 닫음.
 */
export function SigmaContextMenu({
  data,
  onFocus,
  onLocalGraph,
  onDismiss,
}: Props) {
  const toast = useToast();
  const t = useTranslations('topologyWidgets.contextMenu');
  const copyDetailUrl = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      const url = getProjectDetailUrl(window.location.origin, data.slug);
      void navigator.clipboard
        .writeText(url)
        .then(() => toast.show(t('copySuccess'), 'success'))
        .catch(() => toast.show(t('copyError'), 'error'));
    }
    onDismiss();
  };

  return (
    <div
      className="pointer-events-auto absolute z-30 flex w-[180px] flex-col overflow-hidden rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
      style={{ left: data.x, top: data.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="border-b border-[color:var(--color-border-soft)] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
        {data.slug}
      </div>
      <button
        type="button"
        onClick={() => {
          onFocus(data.slug);
          onDismiss();
        }}
        className="px-3 py-2 text-left text-[12px] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
      >
        {t('focus')}
      </button>
      <button
        type="button"
        onClick={() => {
          onLocalGraph(data.slug);
          onDismiss();
        }}
        className="px-3 py-2 text-left text-[12px] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
      >
        {t('localGraph')}
      </button>
      <button
        type="button"
        onClick={copyDetailUrl}
        className="px-3 py-2 text-left text-[12px] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
      >
        {t('copyDetailUrl')}
      </button>
    </div>
  );
}
