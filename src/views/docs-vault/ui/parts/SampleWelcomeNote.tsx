import { FolderOpen, X } from "lucide-react";
import { useLocale } from "next-intl";
import { IconButton, controlClass } from "@/shared/ui";

export interface SampleWelcomeNoteProps {
  /** P1b — FSA 지원이면 웹에서도 폴더 열기(SampleNotice 와 동일 능력 계약). */
  canOpenLocalVault: boolean;
  onOpenFolder: () => void;
  onDismiss: () => void;
}

// Toss D1 정리(2026-07) — 이 카피는 `src/views/docs-vault/` 파일 소유권
// 제약 때문에 공유 `messages/ko.json` / `messages/en.json` 카탈로그에
// 등록하지 못했다(다른 worktree 와 동시 편집 충돌 회피). 대신 이 컴포넌트
// 안에서 로케일별 리터럴을 직접 스위치한다 — next-intl 관례에서 벗어난
// 의도적 예외이며, 후속 정리에서 정식 메시지 키로 승격해야 한다.
const COPY = {
  ko: {
    title: "이 문서함은 무엇인가요?",
    body: "ontology-atlas 프로젝트 자신의 문서를 읽기 전용 샘플로 보여주고 있어요. 왼쪽 목록에서 아무 문서나 눌러 둘러보세요 — 대부분은 개발자용 기술 문서예요. 내 마크다운 폴더를 열면 그 폴더가 이 화면을 그대로 채워요.",
    openFolderCta: "내 폴더 열기",
    dismissAria: "안내 닫기",
  },
  en: {
    title: "What is this document space?",
    body: "You're browsing this project's own documentation as a read-only sample. Pick anything from the list on the left — most of it is developer reference material. Open your own markdown folder and it fills this screen instead.",
    openFolderCta: "Open my folder",
    dismissAria: "Dismiss",
  },
} as const;

/**
 * 샘플(vault 미선택) 모드에서 명시적 딥링크 없이 착지했을 때 첫 화면에
 * 보이는 소개 노트 — "이 문서함은 무엇이고 어떻게 쓰나" 를 평문으로.
 *
 * 기존 기본 선택 로직(`README`/`FEATURES`/…)은 여전히 100% 영어 개발
 * 문서를 고르지만, 이 노트가 그 위에서 먼저 맥락을 줘 비개발자 방문자가
 * 첫 화면에서 곧장 이탈하지 않게 한다(po-pass Toss D1). 표시 조건은
 * caller(`shouldShowSampleWelcomeNote`)가 판단 — 이 컴포넌트는 항상
 * 렌더된 것을 전제로 한 순수 표시. `SampleNotice`(왜 읽기 전용인지) 와는
 * 다른 관심사라 별도 표면으로 유지한다.
 */
export function SampleWelcomeNote({
  canOpenLocalVault,
  onOpenFolder,
  onDismiss,
}: SampleWelcomeNoteProps) {
  const locale = useLocale();
  const copy = locale === "ko" ? COPY.ko : COPY.en;
  return (
    <div
      data-testid="docs-vault-sample-welcome-note"
      className="relative flex flex-none flex-col gap-2 border-b border-l-2 border-b-[color:var(--color-divider)] border-l-[color:var(--color-indigo-brand)] bg-[color:var(--color-elevated)] px-6 py-4 md:px-10"
    >
      <IconButton
        label={copy.dismissAria}
        size="sm"
        tone="muted"
        onClick={onDismiss}
        className="absolute right-3 top-3 hover:text-[color:var(--color-text-primary)]"
      >
        <X size={13} aria-hidden />
      </IconButton>
      <p className="max-w-[560px] pr-6 text-body leading-body text-[color:var(--color-text-secondary)]">
        <span className="block font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {copy.title}
        </span>
        {copy.body}
      </p>
      {canOpenLocalVault ? (
        <button
          type="button"
          onClick={onOpenFolder}
          className={controlClass({
          shape: "chip",
          size: "lg",
          active: true,
          className:
            "w-fit flex-none font-[var(--font-weight-signature)] hover:border-[color:var(--color-indigo-line-a54)] hover:bg-[color:var(--color-indigo-a24)]",
        })}
        >
          <FolderOpen size={12} aria-hidden />
          {copy.openFolderCta}
        </button>
      ) : null}
    </div>
  );
}
