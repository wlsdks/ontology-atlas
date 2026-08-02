"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { PencilLine, X } from "lucide-react";
import { type Project } from "@/entities/project";
import { isStarterProjectDescription } from "@/entities/docs-vault";
import {
  type ProjectFrontmatterPatch,
  useProjectMutations,
} from "@/features/project-data-source";
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

// #9 — 캐노니컬 컨트롤: --control-h-lg(40px) 높이 · rounded-chip · 5단계 서피스.
const FIELD_INPUT_CLASS =
  "mt-1.5 h-[var(--control-h-lg)] w-full rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 text-body text-[color:var(--color-text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:var(--color-indigo-accent)] focus:ring-2 focus:ring-[color:var(--color-indigo-a24)]";

const TERTIARY_LINK_CLASS =
  "text-label text-[color:var(--color-text-tertiary)] underline-offset-2 transition-colors hover:text-[color:var(--color-indigo-accent)] hover:underline";

/** 캐노니컬 폼 라벨 — 평범한 텍스트 라벨 + 선택 필드의 muted "(선택)" 힌트. */
function FieldLabel({
  children,
  optional,
}: {
  children: React.ReactNode;
  optional?: string;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-label font-medium text-[color:var(--color-text-secondary)]">
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
    // #9 — 스타터 기본 설명(영어 보일러플레이트)은 실값이 아니라 placeholder
    // 로 다뤄 빈 값으로 시작한다. 사용자가 지운 뒤 쓰게 만들지 않는다.
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
    const nextPatch = toProjectPatch(values);

    // 이름만 필수 — 설명은 선택(스타터 기본을 지우게 만들지 않는 것과 짝).
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
        <PencilLine size={14} aria-hidden="true" />
        {open ? t("closeLabel") : t("openLabel")}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50">
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
            className="absolute right-0 top-0 flex h-full w-full max-w-[30rem] flex-col border-l border-[color:var(--color-divider)] bg-[color:rgba(11,12,14,0.98)] shadow-[var(--shadow-elevation-dock-side)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border-soft)] px-5 py-5">
              <div>
                <p className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                  {t("headerEyebrow")}
                </p>
                <p className="mt-2 text-body-lg leading-6 text-[color:var(--color-text-secondary)]">
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
                  className="mt-1.5 w-full rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-body leading-relaxed text-[color:var(--color-text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:var(--color-indigo-accent)] focus:ring-2 focus:ring-[color:var(--color-indigo-a24)]"
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

            {/* #9 — footer: 주 액션 하나(변경 적용) + quiet 되돌리기 우측 정렬,
                전체 편집/문서 등록은 링크형 3차 액션으로 아래에 조용히. */}
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
        </div>
      ) : null}
    </>
  );
}
