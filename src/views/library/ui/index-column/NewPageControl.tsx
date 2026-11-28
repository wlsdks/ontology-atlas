import { useState } from "react";
import type { useTranslations } from "use-intl";
import { Plus } from "lucide-react";

import { humanPageSlug } from "@/features/library";
import { cn } from "@/shared/lib/cn";
import { isImeComposing } from "@/shared/lib/keyboard/ime-composition";
import { WIKI_SECTION_ORDER } from "@/shared/lib/library/wiki-page-schema";
import { Button, Dialog, IconButton } from "@/shared/ui";
import { Input } from "@/shared/ui/fields/input";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

const WIKI_SECTION_PREVIEW_KEYS = {
  Summary: "summary",
  Facts: "facts",
  Decisions: "decisions",
  "Open questions": "openQuestions",
  "Not in sources": "notInSources",
} as const;

/** The "+" in the tool row and the centred dialog that starts a page a person writes, from a title. */
export function NewPageControl({
  onNewPage,
  busy,
  t,
}: {
  /** Resolves false when the page was not created, which keeps the dialog open. */
  onNewPage: (title: string) => void | Promise<boolean>;
  busy: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const close = () => {
    setOpen(false);
    setTitle("");
  };
  const create = async () => {
    const trimmed = title.trim();
    if (!trimmed || busy || creating) return;
    setCreating(true);
    try {
      const created = await onNewPage(trimmed);
      if (created !== false) close();
    } finally {
      setCreating(false);
    }
  };
  const previewIsExample = title.trim() === "";
  const previewTitle = title.trim() || t("wiki.newPageExampleTitle");
  const previewPath = humanPageSlug(previewTitle) + ".md";

  return (
    <>
      <IconButton
        data-testid="library-new-page"
        label={t("wiki.newPage")}
        onClick={() => setOpen(true)}
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="dialog"
        size="lg"
        tone="muted"
        hoverInk="strong"
        hoverSurface="lift"
        className="atlas-touch-floor border border-[color:var(--color-border-soft)]"
      >
        <Plus size={ICON_SIZE.sm} aria-hidden />
      </IconButton>
      <Dialog
        open={open}
        onClose={close}
        labelledBy="library-new-page-title-heading"
        testId="library-new-page-row"
        size="md"
        className="max-h-[calc(100vh-var(--chrome-inset)*2)] overflow-y-auto flex flex-col gap-4"
      >
        <h2
          id="library-new-page-title-heading"
          className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
        >
          {t("wiki.newPageDialogTitle")}
        </h2>
        <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">
          {t("wiki.newPageDialogBody")}
        </p>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
        >
          <Input
            data-testid="library-new-page-title"
            size="md"
            label={t("wiki.newPageTitle")}
            placeholder={t("wiki.newPageTitleExample")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !isImeComposing(event)) {
                event.preventDefault();
                void create();
              }
            }}
          />
          <section
            aria-label={t("wiki.newPagePreviewTitle")}
            className="rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-label font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
                {t("wiki.newPagePreviewTitle")}
              </h3>
              <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">
                {t("wiki.newPageFormat")}
              </span>
            </div>
            <p className="mt-2 break-all font-mono text-label text-[color:var(--color-text-secondary)]">
              {previewPath}
            </p>
            {/* Held, not removed, once a title is typed: the dialog is centred, so a line leaving the preview
               would move the field under the caret. `invisible` keeps the height. */}
            <p
              data-testid="library-new-page-example-note"
              aria-hidden={!previewIsExample || undefined}
              className={cn(
                "mt-1 text-caption text-[color:var(--color-text-quaternary)]",
                !previewIsExample && "invisible",
              )}
            >
              {t("wiki.newPagePreviewExample")}
            </p>
            <p className="mt-2 text-caption text-[color:var(--color-text-tertiary)]">
              {t("wiki.newPageMetadata")}
            </p>
            <p className="mt-3 border-t border-[color:var(--color-border-soft)] pt-3 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
              {t("wiki.newPageStructure")}
            </p>
            <ol className="mt-2 flex flex-col gap-1.5">
              {WIKI_SECTION_ORDER.map((section) => (
                <li
                  key={section}
                  className="flex flex-wrap items-baseline gap-x-2 text-label text-[color:var(--color-text-secondary)]"
                >
                  <span className="font-mono">## {section}</span>
                  <span className="text-[color:var(--color-text-quaternary)]">
                    {t("wiki.newPageSection." + WIKI_SECTION_PREVIEW_KEYS[section])}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t border-[color:var(--color-divider)] px-4 py-3">
            <Button variant="ghost" className="atlas-touch-floor" onClick={close}>
              {t("wiki.newPageCancel")}
            </Button>
            <Button
              data-testid="library-new-page-make"
              type="submit"
              className="atlas-touch-floor"
              disabled={busy || creating || title.trim() === ""}
            >
              {t("wiki.newPageCreate")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
