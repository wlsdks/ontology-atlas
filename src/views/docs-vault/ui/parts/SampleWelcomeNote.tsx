import { FolderOpen, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useLocale } from "next-intl";
import { IconButton, controlClass } from "@/shared/ui";

export interface SampleWelcomeNoteProps {
  /** With FSA support a folder can be opened on the web too (the same capability contract as `SampleNotice`). */
  canOpenLocalVault: boolean;
  onOpenFolder: () => void;
  onDismiss: () => void;
}

// This copy could not be registered in the shared `messages/ko.json` / `messages/en.json`
// catalogues because of file-ownership constraints on `src/views/docs-vault/` (avoiding a
// simultaneous-edit conflict with another worktree). Per-locale literals are switched inside this
// component instead — a deliberate exception to the next-intl convention that should be promoted to
// real message keys in a follow-up.
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
 * The introduction note shown on the first screen when landing in sample mode (no vault chosen)
 * without an explicit deeplink — "what is this docs surface and how do I use it", in plain language.
 *
 * The existing default selection logic (`README`/`FEATURES`/…) still picks a 100% English developer
 * document, so this note gives context above it first and keeps a non-developer visitor from
 * bouncing on the first screen. The visibility condition is decided by the caller
 * (`shouldShowSampleWelcomeNote`); this component is a pure display assuming it was rendered. It
 * stays a separate surface from `SampleNotice` (why it is read-only), which is a different concern.
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
        <X size={ICON_SIZE.sm} aria-hidden />
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
          <FolderOpen size={ICON_SIZE.sm} aria-hidden />
          {copy.openFolderCta}
        </button>
      ) : null}
    </div>
  );
}
