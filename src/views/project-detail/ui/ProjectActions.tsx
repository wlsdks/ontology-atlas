import { useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useLocale, useTranslations } from "use-intl";
import { BookOpen, FileText, FilePlus2, Link2, NotebookPen, PencilLine } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buildProjectRuntimeDetailUrl, buildTopologyProjectNodeHref, type Project } from "@/entities/project";
import { ProjectQuickEditPanel } from "@/features/project-quick-edit";
import { useCopyFeedback } from "@/shared/lib/clipboard/use-copy-feedback";
import { BASE_PATH } from "@/shared/lib/public-pages/base-path";
import { Button, Dialog, DialogBody, DialogFooter, buttonVariants, controlClass, useToast } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { ProjectMoreMenu, type ProjectMenuItem } from "./ProjectMoreMenu";

const FILE_HINT_ID = "construction-review-file-hint";

interface Props {
  project: Project;
  displayName: string | null;
  canManage: boolean;
  fullEditHref: string;
  projectHref: string;
  documentHref: string;
  handoffSnippet: string;
  brief: {
    prompt: string;
    explanation: string;
    startAgent: ((prompt: string) => void) | null;
  };
  review: {
    inputProps: InputHTMLAttributes<HTMLInputElement>;
    openPicker: () => void;
    reading: boolean;
  };
}

export function ProjectActions({
  project,
  displayName,
  canManage,
  fullEditHref,
  projectHref,
  documentHref,
  handoffSnippet,
  brief,
  review,
}: Props) {
  const t = useTranslations("projectPages.detail");
  const tLink = useTranslations("copyProjectLink");
  const tEdit = useTranslations("settings.quickEdit");
  const tSelector = useTranslations("projectPages.selector");
  const locale = useLocale();
  const { show: showToast } = useToast();
  const handoffCopy = useCopyFeedback();
  const briefCopy = useCopyFeedback();
  const linkCopy = useCopyFeedback();
  const [dialog, setDialog] = useState<"handoff" | "brief" | null>(null);
  const quickEditRef = useRef<HTMLDivElement>(null);

  const handoffLabel = copyStateLabel(handoffCopy.state, {
    idle: t("handoffCopyLabel"),
    copied: t("handoffCopiedLabel"),
    failed: t("handoffCopyErrorLabel"),
  });
  const briefLabel = copyStateLabel(briefCopy.state, {
    idle: t("briefAskCopy"),
    copied: t("briefAskCopied"),
    failed: t("briefAskCopyError"),
  });

  const copyLink = async () => {
    let copied = false;
    try {
      copied = await linkCopy.copy(
        buildProjectRuntimeDetailUrl(window.location.origin, project.slug, { locale, basePath: BASE_PATH }),
      );
    } catch {
      // An address that cannot be built is a copy that failed.
    }
    showToast(copied ? tLink("labelCopied") : tLink("labelError"), copied ? "success" : "error");
  };

  const items: ProjectMenuItem[] = [
    { label: tLink("labelIdle"), icon: <Link2 size={ICON_SIZE.md} aria-hidden />, testId: "project-detail-copy-link", onSelect: () => void copyLink() },
    { label: t("topBarDocsVault"), icon: <BookOpen size={ICON_SIZE.md} aria-hidden />, testId: "project-detail-docs-vault-link", href: documentHref },
    ...(canManage
      ? [{
          label: tEdit("openLabel"),
          icon: <PencilLine size={ICON_SIZE.md} aria-hidden />,
          testId: "project-detail-quick-edit",
          // The panel owns its trigger; pressing the hidden one keeps its focus return on "more".
          onSelect: () => quickEditRef.current?.querySelector<HTMLButtonElement>(":scope > button")?.click(),
        }]
      : []),
    {
      label: review.reading ? t("constructionReview.readingResult") : t("constructionReview.openResult"),
      icon: <FileText size={ICON_SIZE.md} aria-hidden />,
      testId: "construction-review-open",
      disabled: review.reading,
      describedBy: FILE_HINT_ID,
      onSelect: review.openPicker,
    },
    {
      label: brief.startAgent ? t("briefAskOpen") : t("briefAskCopy"),
      icon: <NotebookPen size={ICON_SIZE.md} aria-hidden />,
      testId: "project-detail-brief-ask",
      onSelect: () => setDialog("brief"),
    },
    {
      label: tSelector("ctaNewProject"),
      icon: <FilePlus2 size={ICON_SIZE.md} aria-hidden />,
      testId: "project-detail-new-project",
      href: `/project/new/?returnTo=${encodeURIComponent(projectHref)}`,
    },
  ];

  return (
    <div data-testid="project-detail-actions" data-agent-route={brief.startAgent ? "agent" : "copy"} className="flex min-w-0 flex-col items-start gap-2 @5xl/project-page:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={buildTopologyProjectNodeHref(project.slug)}
          data-testid="project-detail-topology-link"
          className={cn(buttonVariants({ variant: "primary", size: "sm" }), "atlas-touch-floor")}
        >
          {t("topBarTopologyView")}
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handoffCopy.copy(handoffSnippet)}
          data-testid="project-detail-handoff-copy"
          className="atlas-touch-floor"
        >
          <StableLabel current={handoffLabel} options={[t("handoffCopyLabel"), t("handoffCopiedLabel"), t("handoffCopyErrorLabel")]} />
        </Button>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {handoffCopy.state === "idle" ? "" : handoffLabel}
        </span>
        <ProjectMoreMenu label={t("moreActions")} items={items} />
      </div>
      <button
        type="button"
        data-testid="project-detail-handoff-preview"
        aria-haspopup="dialog"
        onClick={() => setDialog("handoff")}
        className={controlClass({ shape: "link", hoverInk: "strong", className: "touch-hit-expand" })}
      >
        {t("handoffHumanCaption")}
      </button>

      <input {...review.inputProps} data-testid="construction-review-ingress" aria-label={t("constructionReview.openResult")} hidden />
      <p id={FILE_HINT_ID} className="sr-only">
        {t("constructionReview.fileHint")}
      </p>
      {canManage ? (
        <div ref={quickEditRef} className="[&>button]:hidden">
          <ProjectQuickEditPanel
            project={project}
            settingsHref={fullEditHref}
            triggerVariant="outline"
            displayName={displayName}
            displayLocale={locale}
          />
        </div>
      ) : null}

      <PreviewDialog
        open={dialog === "handoff"}
        onClose={() => setDialog(null)}
        testId="project-detail-handoff-dialog"
        title={t("handoffTitle")}
        explanation={t("handoffDesc")}
        text={handoffSnippet}
        closeLabel={t("previewClose")}
        action={
          <Button type="button" variant="primary" size="sm" onClick={() => void handoffCopy.copy(handoffSnippet)} className="atlas-touch-floor">
            <StableLabel current={handoffLabel} options={[t("handoffCopyLabel"), t("handoffCopiedLabel"), t("handoffCopyErrorLabel")]} />
          </Button>
        }
      />
      <PreviewDialog
        open={dialog === "brief"}
        onClose={() => setDialog(null)}
        testId="project-detail-brief-dialog"
        title={brief.startAgent ? t("briefAskOpen") : t("briefAskCopy")}
        explanation={brief.explanation}
        text={brief.prompt}
        closeLabel={t("previewClose")}
        action={
          brief.startAgent ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              data-testid="project-detail-brief-ask-open"
              onClick={() => {
                setDialog(null);
                brief.startAgent?.(brief.prompt);
              }}
              className="atlas-touch-floor"
            >
              {t("briefAskOpen")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="sm"
              data-testid="project-detail-brief-ask-copy"
              onClick={() => void briefCopy.copy(brief.prompt)}
              className="atlas-touch-floor"
            >
              <StableLabel current={briefLabel} options={[t("briefAskCopy"), t("briefAskCopied"), t("briefAskCopyError")]} />
            </Button>
          )
        }
      />
    </div>
  );
}

function copyStateLabel(state: string, labels: { idle: string; copied: string; failed: string }): string {
  return state === "copied" ? labels.copied : state === "failed" ? labels.failed : labels.idle;
}

function StableLabel({ current, options }: { current: string; options: readonly string[] }) {
  return (
    <span className="inline-grid">
      {options.map((option) => (
        <span
          key={option}
          aria-hidden={option === current ? undefined : true}
          className={option === current ? "col-start-1 row-start-1" : "invisible col-start-1 row-start-1"}
        >
          {option}
        </span>
      ))}
    </span>
  );
}

function PreviewDialog({
  open,
  onClose,
  testId,
  title,
  explanation,
  text,
  closeLabel,
  action,
}: {
  open: boolean;
  onClose: () => void;
  testId: string;
  title: string;
  explanation: string;
  text: string;
  closeLabel: string;
  action: ReactNode;
}) {
  const titleId = `${testId}-title`;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      size="md"
      testId={testId}
      className="flex max-h-[calc(100dvh-var(--chrome-inset)*2)] flex-col"
    >
      <h2 id={titleId} className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
        {title}
      </h2>
      <DialogBody className="mt-3 space-y-4 overscroll-contain pb-4">
        <p className="break-keep text-body leading-body text-[color:var(--color-text-secondary)]">{explanation}</p>
        <pre className="overflow-x-auto font-mono text-body leading-prose whitespace-pre-wrap break-keep text-[color:var(--color-text-tertiary)]">
          {text}
        </pre>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onClose} className="atlas-touch-floor">
          {closeLabel}
        </Button>
        {action}
      </DialogFooter>
    </Dialog>
  );
}
