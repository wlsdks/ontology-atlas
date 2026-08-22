"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { PencilLine, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { type Project } from "@/entities/project";
import { isStarterProjectDescription } from "@/entities/docs-vault";
import {
  type ProjectFrontmatterPatch,
  useProjectMutations,
} from "@/features/project-data-source";
import { Button, Surface, controlClass } from "@/shared/ui";
import { fieldClass } from '@/shared/ui/control-class';

interface Props {
  project: Project;
  documentNewHref?: string | null;
  settingsHref?: string | null;
}

interface QuickEditValues {
  name: string;
  description: string;
  owner: string;
  tags: string;
}

// The canonical control: `--control-h-lg` (40px) height, rounded-chip, five surface steps.
const FIELD_INPUT_CLASS = fieldClass({ size: "lg", className: "mt-1.5 w-full" });

/*
 * The rest state is byte-identical to link/md (text-label, tertiary ink), so it moved
 * into the value layer. The underline is on hover only, not at rest — hover belongs to
 * the consumer (the value-layer rule), hence the className. `min-h-6` (24) is the
 * WCAG 2.5.8 floor: the hit box used to be a 16px line box.
 */
const TERTIARY_LINK_CLASS = controlClass({
  shape: "link",
  className:
    "touch-hit-expand underline-offset-2 hover:text-[color:var(--color-indigo-accent)] hover:underline",
});

/** The canonical form label — plain text label plus a muted "(optional)" hint on optional fields. */
function FieldLabel({
  children,
  optional,
}: {
  children: React.ReactNode;
  optional?: string;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
        {children}
      </span>
      {optional ? (
        <span className="text-caption text-[color:var(--color-text-quaternary)]">
          {optional}
        </span>
      ) : null}
    </span>
  );
}

function toQuickEditValues(project: Project): QuickEditValues {
  return {
    name: project.name,
    // The starter's default description (English boilerplate) is treated as a placeholder
    // rather than a real value, so the field starts empty. Nobody should have to delete it before writing.
    description: isStarterProjectDescription(project.description)
      ? ""
      : project.description,
    owner: project.owner ?? "",
    tags: project.tags.join(", "),
  };
}

function toProjectPatch(values: QuickEditValues): ProjectFrontmatterPatch {
  const tags = values.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    owner: values.owner.trim() || null,
    tags: tags.length > 0 ? tags : null,
  };
}

export function ProjectQuickEditPanel({
  project,
  documentNewHref,
  settingsHref,
}: Props) {
  const t = useTranslations("settings.quickEdit");
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<QuickEditValues>(() =>
    toQuickEditValues(project),
  );
  const [baseline, setBaseline] = useState<QuickEditValues>(() =>
    toQuickEditValues(project),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { patchProject } = useProjectMutations();
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const next = toQuickEditValues(project);
    queueMicrotask(() => {
      setValues(next);
      setBaseline(next);
    });
  }, [project]);

  // The same a11y pattern as the other modals — capture the trigger on open and restore
  // on close, so a keyboard user toggling the button, working inside the drawer, and
  // closing with Esc or save returns focus to the original trigger.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  const hasChanges = useMemo(
    () =>
      values.name !== baseline.name ||
      values.description !== baseline.description ||
      values.owner !== baseline.owner ||
      values.tags !== baseline.tags,
    [baseline, values],
  );

  const changedLabels = useMemo(() => {
    const labels: string[] = [];
    if (values.name !== baseline.name) labels.push(t("labelName"));
    if (values.description !== baseline.description) labels.push(t("labelDescription"));
    if (values.owner !== baseline.owner) labels.push(t("labelOwner"));
    if (values.tags !== baseline.tags) labels.push(t("labelTags"));
    return labels;
  }, [baseline, t, values]);

  const handleChange = (key: keyof QuickEditValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setNotice(null);
    setError(null);
  };

  const handleReset = () => {
    setValues(baseline);
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async () => {
    const nextPatch = toProjectPatch(values);

    // Only the name is required — the description is optional (the counterpart of not
    // making anyone delete the starter default).
    if (!nextPatch.name?.trim()) {
      setError(t("errorEmpty"));
      return;
    }

    setPending(true);
    setError(null);
    setNotice(null);

    try {
      await patchProject(project.slug, nextPatch);
      const nextBaseline: QuickEditValues = {
        name: nextPatch.name,
        description: nextPatch.description ?? "",
        owner: nextPatch.owner ?? "",
        tags: nextPatch.tags?.join(", ") ?? "",
      };
      setBaseline(nextBaseline);
      setValues(nextBaseline);
      setNotice(
        changedLabels.length > 0
          ? t("noticeApplied", { labels: changedLabels.join(", ") })
          : t("noticeAppliedNoLabels"),
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t("errorGeneric"),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={open ? "outline" : "ghost"}
        size="sm"
        data-testid="public-quick-edit-toggle"
        onClick={() => setOpen((current) => !current)}
      >
        <PencilLine size={ICON_SIZE.md} aria-hidden="true" />
        {open ? t("closeLabel") : t("openLabel")}
      </Button>

      {/* It has a way out. This used to be `{open ? … : null}`, so the dim and the drawer
          appeared and disappeared together **in one frame** (no entrance, no exit).
          `Surface` owns the exit window (`EXIT_WINDOW_MS`), the exit class
          (`topology-chrome-out`), and `inert`, so nothing extra is needed here. Zero new
          tokens, durations, or colours — it rides the chrome motion family as is.

          `origin` is **the trigger's direction**. The button that opens this drawer is at
          the hero's top right and the drawer lives on the right — being born in the centre
          would put the birth place somewhere other than where it was pressed (the motion
          seat's rejection reason).

          The form values are owned by this component (`values`/`baseline`/`notice`), so
          there is **no external model to hold** during the exit window — the departing
          surface never becomes an empty box. (HomePage's edge panel uses `useHeldValue`
          because its model is owned by the parent.) */}
      <Surface
        open={open}
        origin="top right"
        data-testid="public-quick-edit-surface"
        className="fixed inset-0 z-50"
      >
        <button
          type="button"
          aria-label={t("ariaCloseOverlay")}
          className="absolute inset-0 bg-[var(--color-scrim-a58)]"
          onClick={() => setOpen(false)}
        />
        <section
          role="dialog"
          aria-modal="true"
          aria-label={t("ariaDialog")}
          className="absolute right-0 top-0 flex h-full w-full max-w-[30rem] flex-col border-l border-[color:var(--color-divider)] bg-[color:var(--color-surface-deep-a98)] shadow-[var(--shadow-elevation-dock-side)]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border-soft)] px-5 py-5">
            <div>
              <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-indigo-accent)]">
                {t("headerEyebrow")}
              </p>
              <p className="mt-2 text-body-lg leading-title text-[color:var(--color-text-secondary)]">
                {t("headerSubtitle")}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 px-0"
              onClick={() => setOpen(false)}
            >
              <X size={ICON_SIZE.lg} aria-hidden="true" />
            </Button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <label className="block">
              <FieldLabel>{t("fieldName")}</FieldLabel>
              <input
                data-testid="public-quick-edit-name"
                name="projectName"
                autoComplete="off"
                value={values.name}
                onChange={(event) => handleChange("name", event.target.value)}
                className={FIELD_INPUT_CLASS}
                placeholder={t("fieldNamePlaceholder")}
              />
            </label>

            <label className="block">
              <FieldLabel>{t("fieldDescription")}</FieldLabel>
              <textarea
                data-testid="public-quick-edit-description"
                name="projectDescription"
                autoComplete="off"
                value={values.description}
                onChange={(event) => handleChange("description", event.target.value)}
                rows={3}
                className={fieldClass({ multiline: true, size: "lg", className: "mt-1.5 w-full" })}
                placeholder={t("fieldDescriptionPlaceholder")}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <FieldLabel optional={t("optionalHint")}>{t("fieldOwner")}</FieldLabel>
                <input
                  data-testid="public-quick-edit-owner"
                  name="projectOwner"
                  autoComplete="off"
                  value={values.owner}
                  onChange={(event) => handleChange("owner", event.target.value)}
                  className={FIELD_INPUT_CLASS}
                  placeholder={t("fieldOwnerPlaceholder")}
                />
              </label>

              <label className="block">
                <FieldLabel optional={t("optionalHint")}>{t("fieldTags")}</FieldLabel>
                <input
                  data-testid="public-quick-edit-tags"
                  name="projectTags"
                  autoComplete="off"
                  value={values.tags}
                  onChange={(event) => handleChange("tags", event.target.value)}
                  className={FIELD_INPUT_CLASS}
                  placeholder={t("fieldTagsPlaceholder")}
                />
              </label>
            </div>

            {error ? (
              <p className="text-body text-[color:var(--color-status-danger)]">{error}</p>
            ) : null}

            {notice ? (
              <p role="status" className="text-body text-[color:var(--color-text-primary)]">
                {notice}
              </p>
            ) : null}
          </div>

          {/* Footer: one primary action (apply changes) plus a quiet revert on the right;
              full edit and document registration sit quietly below as tertiary link actions. */}
          <div className="space-y-3 border-t border-[color:var(--color-border-soft)] px-5 py-4">
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={!hasChanges || pending}
              >
                {t("reset")}
              </Button>
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!hasChanges || pending}
              >
                {pending ? t("applying") : t("apply")}
              </Button>
            </div>
            {documentNewHref || settingsHref ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {documentNewHref ? (
                  <Link href={documentNewHref} className={TERTIARY_LINK_CLASS}>
                    {t("openDocument")}
                  </Link>
                ) : null}
                {settingsHref ? (
                  <Link href={settingsHref} className={TERTIARY_LINK_CLASS}>
                    {t("openSettings")}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </Surface>
    </>
  );
}
