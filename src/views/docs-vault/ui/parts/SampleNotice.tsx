import { Download, FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export interface SampleNoticeProps {
  /** P1b — 게이트는 런타임이 아니라 능력: FSA 지원이면 웹에서도 폴더 열기. */
  canOpenLocalVault: boolean;
  onOpenFolder: () => void;
}

/**
 * 샘플(vault 미선택) 상태에서 "왜 편집이 안 되는지 · 어떻게 켜는지" 를 평문
 * 한 줄로 안내하는 스트립. 아티클 헤더 바로 아래, 본문 전체 폭.
 *
 * 기존 `editorHeader.readOnlySample` 점 칩은 상태 인디케이터로 유지하고,
 * 이 스트립이 그 옆의 설명 + 액션을 담당 — 우상단 작은 칩만으로는 "왜/어떻게"
 * 가 전달되지 않는다는 관찰(po-pass.md §1-3)을 해소한다.
 *
 * 표시 조건(`!isLocalSourceLoaded`)은 caller 가 판단 — 이 컴포넌트는 항상
 * 렌더된 것을 전제로 한 순수 표시. P1b(N1): FSA 를 지원하면 런타임과
 * 무관하게 폴더 열기 흐름을 재사용하고, 미지원 브라우저에서만 macOS 앱
 * 다운로드로 안내한다 — 빌더와 같은 능력 기준 계약.
 */
export function SampleNotice({ canOpenLocalVault, onOpenFolder }: SampleNoticeProps) {
  const t = useTranslations("docsVault");
  return (
    <div
      data-testid="docs-vault-sample-notice"
      className="flex flex-none flex-wrap items-center gap-3 border-b border-l-2 border-b-[color:var(--color-divider)] border-l-[color:var(--color-indigo-brand)] bg-[color:var(--color-elevated)] px-6 py-2.5 md:px-10"
    >
      <p className="min-w-0 flex-1 text-[12.5px] leading-[1.5] text-[color:var(--color-text-secondary)]">
        <span className="font-semibold text-[color:var(--color-text-primary)]">
          {t("sampleNotice.title")}
        </span>{" "}
        — {t("sampleNotice.body")}
      </p>
      {canOpenLocalVault ? (
        <button
          type="button"
          onClick={onOpenFolder}
          className="inline-flex flex-none items-center gap-1.5 rounded-md border border-[color:var(--color-indigo-line-a42)] bg-[color:var(--color-indigo-a12)] px-2.5 py-1.5 font-mono text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a18)]"
        >
          <FolderOpen size={12} aria-hidden />
          {t("sampleNotice.openFolderCta")}
        </button>
      ) : (
        <Link
          href="/download/"
          className="inline-flex flex-none items-center gap-1.5 rounded-md border border-[color:var(--color-indigo-line-a42)] bg-[color:var(--color-indigo-a12)] px-2.5 py-1.5 font-mono text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a18)]"
        >
          <Download size={12} aria-hidden />
          {t("vaultStatus.downloadAppCta")}
        </Link>
      )}
    </div>
  );
}
