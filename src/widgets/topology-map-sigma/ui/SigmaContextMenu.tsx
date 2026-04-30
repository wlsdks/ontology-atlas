'use client';

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
  const copyDetailUrl = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      // P0-B Phase 6: getProjectDetailUrl 가 현재 URL 의 ?account / ?pj 를
      // 자동 상속하므로 컨테이너·계정 컨텍스트가 복사된 링크에 그대로 따라감.
      const url = getProjectDetailUrl(window.location.origin, data.slug);
      void navigator.clipboard
        .writeText(url)
        .then(() => toast.show('상세 URL 이 복사됐습니다', 'success'))
        .catch(() => toast.show('복사에 실패했습니다', 'error'));
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
        포커스
      </button>
      <button
        type="button"
        onClick={() => {
          onLocalGraph(data.slug);
          onDismiss();
        }}
        className="px-3 py-2 text-left text-[12px] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
      >
        이웃만 보기 (Local)
      </button>
      <button
        type="button"
        onClick={copyDetailUrl}
        className="px-3 py-2 text-left text-[12px] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
      >
        상세 URL 복사
      </button>
    </div>
  );
}
