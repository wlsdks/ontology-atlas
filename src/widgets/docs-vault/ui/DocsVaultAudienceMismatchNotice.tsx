'use client';

import type { VaultMode } from '@/entities/docs-vault';

type DocsVaultAudience = VaultMode | 'all';

interface Props {
  docMode: VaultMode;
  currentAudience: DocsVaultAudience;
  onSwitchAudience: (audience: DocsVaultAudience) => void;
}

const AUDIENCE_LABEL: Record<VaultMode, string> = {
  planner: '기획자',
  engineer: '개발자',
  both: '공용',
};

export function DocsVaultAudienceMismatchNotice({
  docMode,
  currentAudience,
  onSwitchAudience,
}: Props) {
  const targetAudience = docMode === 'both' ? 'all' : docMode;
  if (
    currentAudience === 'all' ||
    docMode === 'both' ||
    currentAudience === docMode
  ) {
    return null;
  }

  return (
    <section
      className="mx-auto max-w-[760px] px-6 pt-3 md:px-10"
      aria-label="현재 관점 밖의 문서 안내"
    >
      <div className="flex flex-col gap-2 rounded-md border border-[color:rgba(224,196,140,0.2)] bg-[color:rgba(224,196,140,0.055)] px-3 py-2.5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-[color:rgba(232,210,170,0.94)]">
            현재 관점 밖의 참고 문서
          </p>
          <p className="mt-0.5 text-[11px] leading-[1.5] text-[color:var(--color-text-tertiary)]">
            이 문서는 {AUDIENCE_LABEL[docMode]} 관점입니다. 본문은 그대로
            유지되고, 트리와 추천만 현재 관점 기준으로 정렬됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSwitchAudience(targetAudience)}
          className="flex-none rounded-sm border border-[color:rgba(224,196,140,0.32)] px-2.5 py-1.5 text-[11px] text-[color:rgba(232,210,170,0.94)] transition-colors hover:border-[color:rgba(224,196,140,0.55)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(224,196,140,0.45)]"
        >
          {AUDIENCE_LABEL[docMode]} 관점으로 보기
        </button>
      </div>
    </section>
  );
}
