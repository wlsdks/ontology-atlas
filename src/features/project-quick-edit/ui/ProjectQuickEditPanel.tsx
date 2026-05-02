"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { PencilLine, X } from "lucide-react";
import {
  projectToInput,
  type Project,
  type ProjectInput,
} from "@/entities/project";
import { useProjectMutations } from "@/features/project-data-source";
import { Button } from "@/shared/ui";

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

function toQuickEditValues(project: Project): QuickEditValues {
  return {
    name: project.name,
    description: project.description,
    owner: project.owner ?? "",
    tags: project.tags.join(", "),
  };
}

function toProjectInput(project: Project, values: QuickEditValues): ProjectInput {
  return {
    ...projectToInput(project),
    name: values.name.trim(),
    description: values.description.trim(),
    owner: values.owner.trim() || undefined,
    tags: values.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
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
  const { updateProject } = useProjectMutations();
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const next = toQuickEditValues(project);
    queueMicrotask(() => {
      setValues(next);
      setBaseline(next);
    });
  }, [project]);

  // 다른 modal 과 동일한 a11y 패턴 — 열릴 때 trigger 캡처, 닫힐 때 복원.
  // 키보드 사용자가 toggle button → drawer 안에서 작업 → Esc/저장으로 닫을
  // 때 원래 trigger 로 focus 가 돌아가도록.
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
    const nextInput = toProjectInput(project, values);

    if (!nextInput.name.trim() || !nextInput.description.trim()) {
      setError(t("errorEmpty"));
      return;
    }

    setPending(true);
    setError(null);
    setNotice(null);

    try {
      await updateProject(nextInput);
      const nextBaseline = toQuickEditValues({
        ...project,
        ...nextInput,
        owner: nextInput.owner,
        tags: nextInput.tags ?? [],
      } as Project);
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
        <PencilLine size={14} aria-hidden="true" />
        {open ? t("closeLabel") : t("openLabel")}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label={t("ariaCloseOverlay")}
            className="absolute inset-0 bg-[rgba(0,0,0,0.58)]"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label={t("ariaDialog")}
            className="absolute right-0 top-0 flex h-full w-full max-w-[30rem] flex-col border-l border-[color:var(--color-divider)] bg-[color:rgba(11,12,14,0.98)] shadow-[-24px_0_60px_rgba(0,0,0,0.34)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border-soft)] px-5 py-5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                  {t("headerEyebrow")}
                </p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-secondary)]">
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
                <X size={16} aria-hidden="true" />
              </Button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t("fieldName")}
                </span>
                <input
                  data-testid="public-quick-edit-name"
                  name="projectName"
                  autoComplete="off"
                  value={values.name}
                  onChange={(event) => handleChange("name", event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 text-sm text-[color:var(--color-text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:var(--color-indigo-accent)] focus:ring-2 focus:ring-[color:rgba(94,106,210,0.24)]"
                  placeholder={t("fieldNamePlaceholder")}
                />
              </label>

              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t("fieldDescription")}
                </span>
                <textarea
                  data-testid="public-quick-edit-description"
                  name="projectDescription"
                  autoComplete="off"
                  value={values.description}
                  onChange={(event) => handleChange("description", event.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-3 text-sm leading-6 text-[color:var(--color-text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:var(--color-indigo-accent)] focus:ring-2 focus:ring-[color:rgba(94,106,210,0.24)]"
                  placeholder={t("fieldDescriptionPlaceholder")}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                    {t("fieldOwner")}
                  </span>
                  <input
                    data-testid="public-quick-edit-owner"
                    name="projectOwner"
                    autoComplete="off"
                    value={values.owner}
                    onChange={(event) => handleChange("owner", event.target.value)}
                    className="mt-2 h-11 w-full rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 text-sm text-[color:var(--color-text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:var(--color-indigo-accent)] focus:ring-2 focus:ring-[color:rgba(94,106,210,0.24)]"
                    placeholder={t("fieldOwnerPlaceholder")}
                  />
                </label>

                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                    {t("fieldTags")}
                  </span>
                  <input
                    data-testid="public-quick-edit-tags"
                    name="projectTags"
                    autoComplete="off"
                    value={values.tags}
                    onChange={(event) => handleChange("tags", event.target.value)}
                    className="mt-2 h-11 w-full rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 text-sm text-[color:var(--color-text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:var(--color-indigo-accent)] focus:ring-2 focus:ring-[color:rgba(94,106,210,0.24)]"
                    placeholder={t("fieldTagsPlaceholder")}
                  />
                </label>
              </div>

              {error ? (
                <p className="text-sm text-[color:var(--color-status-danger)]">{error}</p>
              ) : null}

              {notice ? (
                <p role="status" className="text-sm text-[color:var(--color-text-primary)]">
                  {notice}
                </p>
              ) : null}
            </div>

            <div className="space-y-3 border-t border-[color:var(--color-border-soft)] px-5 py-5">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={!hasChanges || pending}
                >
                  {pending ? t("applying") : t("apply")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                  disabled={!hasChanges || pending}
                >
                  {t("reset")}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {documentNewHref ? (
                  <Link href={documentNewHref} className="inline-flex">
                    <Button type="button" variant="ghost">
                      {t("openDocument")}
                    </Button>
                  </Link>
                ) : null}
                {settingsHref ? (
                  <Link href={settingsHref} className="inline-flex">
                    <Button type="button" variant="outline">
                      {t("openSettings")}
                    </Button>
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
