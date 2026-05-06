"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { slugify } from "@/shared/lib/slugify";
import { Button } from "@/shared/ui";
import {
  ProjectCard,
  computeHubSlugs,
  computeSuggestedDependencies,
  findDuplicateDependencySlugs,
  findMissingDependencySlugs,
  isSharedNode,
  resolveProjectCompletenessInsight,
  resolveProjectFreshnessInsight,
  wouldCreateDependencyCycle,
  type ProjectInput,
  type Project,
} from "@/entities/project";
import { useTaxonomy } from "@/features/taxonomy";
import {
  duplicateProjectToFormValues,
  projectFormSchema,
  projectToFormValues,
  formValuesToProjectInput,
  type ProjectFormValues,
} from "../model/schema";
import {
  findProjectPlacement,
  isProjectPositionInsideCategory,
} from "../model/placement";
import { DependencyPicker } from "./DependencyPicker";
import { MarkdownField } from "./MarkdownField";

interface Props {
  mode: "create" | "edit";
  initialProject?: Project;
  initialCategoryId?: string;
  initialStatusId?: string;
  /** 의존성 피커용 전체 프로젝트 목록. */
  allProjects: Project[];
  onSubmit: (
    input: ProjectInput,
    options: { behavior: "stay" | "return" },
  ) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

// emptyValues는 ProjectForm 내부에서 첫 카테고리/상태 ID로 동적 생성.

const FORM_SECTION_IDS = [
  "project-form-basics",
  "project-form-story",
  "project-form-network",
  "project-form-operations",
] as const;

const PROJECT_FIELD_IDS: Partial<Record<keyof ProjectFormValues, string>> = {
  slug: "project-field-slug",
  name: "project-field-name",
  nameEn: "project-field-name-en",
  category: "project-field-category",
  status: "project-field-status",
  description: "project-field-description",
  detail: "project-field-detail",
  tagsCsv: "project-field-tags",
  stackCsv: "project-field-stack",
  linksText: "project-field-links",
  startedAt: "project-field-started-at",
  launchedAt: "project-field-launched-at",
  owner: "project-field-owner",
  icon: "project-field-icon",
  progress: "project-field-progress",
};

function buildInitialValues({
  mode,
  initialProject,
  allProjects,
  categoryId,
  statusId,
  initialCategoryId,
  initialStatusId,
}: {
  mode: "create" | "edit";
  initialProject?: Project;
  allProjects: Project[];
  categoryId: string;
  statusId: string;
  initialCategoryId?: string;
  initialStatusId?: string;
}): ProjectFormValues {
  if (initialProject) {
    return mode === "edit"
      ? projectToFormValues(initialProject)
      : duplicateProjectToFormValues(
          initialProject,
          allProjects.map((project) => project.slug),
        );
  }

  return {
    slug: "",
    name: "",
    nameEn: "",
    category: initialCategoryId ?? categoryId,
    status: initialStatusId ?? statusId,
    description: "",
    detail: "",
    tagsCsv: "",
    stackCsv: "",
    linksText: "",
    dependencies: [],
    screenshots: [],
    startedAt: "",
    launchedAt: "",
    owner: "",
    icon: "",
    progress: undefined,
    isHub: false,
  };
}

export function ProjectForm({
  mode,
  initialProject,
  initialCategoryId,
  initialStatusId,
  allProjects,
  onSubmit,
  onCancel,
  onDelete,
  onDirtyChange,
}: Props) {
  const t = useTranslations("settings.projectForm");
  const { categories, statuses, getCategory, getStatus } = useTaxonomy();
  const FORM_SECTIONS = useMemo(
    () => [
      {
        id: FORM_SECTION_IDS[0],
        label: t("sections.basicsLabel"),
        description: t("sections.basicsDescription"),
      },
      {
        id: FORM_SECTION_IDS[1],
        label: t("sections.storyLabel"),
        description: t("sections.storyDescription"),
      },
      {
        id: FORM_SECTION_IDS[2],
        label: t("sections.networkLabel"),
        description: t("sections.networkDescription"),
      },
      {
        id: FORM_SECTION_IDS[3],
        label: t("sections.operationsLabel"),
        description: t("sections.operationsDescription"),
      },
    ],
    [t],
  );
  const initialValues = useMemo(
    () =>
      buildInitialValues({
        mode,
        initialProject,
        allProjects,
        categoryId: categories[0]?.id ?? "",
        statusId: statuses[0]?.id ?? "",
        initialCategoryId,
        initialStatusId,
      }),
    [
      allProjects,
      categories,
      initialCategoryId,
      initialProject,
      initialStatusId,
      mode,
      statuses,
    ],
  );
  const [savedValues, setSavedValues] = useState<ProjectFormValues>(initialValues);
  const [values, setValues] = useState<ProjectFormValues>(initialValues);

  // RHF formState.isDirty 를 dirty tracking 의 단일 진실원으로 사용.
  // 외부 useState (\`values\`) 가 source of truth 를 쥐고 setValue 헬퍼가
  // 매 호출 RHF setValue 도 함께 호출 — RHF 는 dirty / submit 상태만 보강.
  //
  // resolver 의 input/output 타입 inference 가 zod default([]) 등으로 차이가
  // 나 RHF Resolver 시그니처와 맞지 않음 — \`as never\` cast 로 회피.
  const rhfMethods = useForm<ProjectFormValues>({
    defaultValues: initialValues,
    resolver: zodResolver(projectFormSchema) as never,
  });
  const rhfIsDirty = rhfMethods.formState.isDirty;
  const rhfReset = rhfMethods.reset;
  const rhfSetValue = rhfMethods.setValue;
  const categoryOptions = useMemo(() => {
    const options = categories.map((category) => ({
      value: category.id,
      label: category.label,
    }));
    if (values.category && !getCategory(values.category)) {
      return [
        {
          value: values.category,
          label: t("fields.categoryMissingOption", { id: values.category }),
        },
        ...options,
      ];
    }
    return options;
  }, [categories, getCategory, t, values.category]);
  const statusOptions = useMemo(() => {
    const options = statuses.map((status) => ({
      value: status.id,
      label: status.label,
    }));
    if (values.status && !getStatus(values.status)) {
      return [
        {
          value: values.status,
          label: t("fields.statusMissingOption", { id: values.status }),
        },
        ...options,
      ];
    }
    return options;
  }, [getStatus, statuses, t, values.status]);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(mode === "edit");
  const [errors, setErrors] = useState<
    Partial<Record<keyof ProjectFormValues, string>>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const submitBehaviorRef = useRef<"stay" | "return">("stay");
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>(() =>
    mode === "create"
      ? {
          "project-form-basics": true,
          "project-form-story": true,
          "project-form-network": false,
          "project-form-operations": false,
        }
      : {
          "project-form-basics": true,
          "project-form-story": true,
          "project-form-network": true,
          "project-form-operations": true,
        },
  );
  const existingSlugSet = useMemo(
    () =>
      new Set(
        allProjects
          .map((project) => project.slug)
          .filter((slug) =>
            mode === "edit" ? slug !== initialProject?.slug : true,
          ),
      ),
    [allProjects, initialProject?.slug, mode],
  );
  const invalidDependencySlugs = useMemo(() => {
    if (!initialProject) return [];

    return allProjects
      .filter((project) =>
        wouldCreateDependencyCycle(allProjects, initialProject.slug, project.slug),
      )
      .map((project) => project.slug);
  }, [allProjects, initialProject]);
  // 설명/상세에서 언급된 다른 프로젝트를 dependency 후보로 제안.
  // cycle 을 유발하는 후보는 invalidDependencySlugs 로 이미 잡히므로 제안에서 제외.
  const dependencySuggestions = useMemo(() => {
    const invalidSet = new Set(invalidDependencySlugs);
    return computeSuggestedDependencies(
      {
        slug: values.slug,
        dependencies: values.dependencies,
        description: values.description,
        detail: values.detail,
      },
      allProjects,
    ).filter((suggestion) => !invalidSet.has(suggestion.slug));
  }, [
    allProjects,
    invalidDependencySlugs,
    values.dependencies,
    values.description,
    values.detail,
    values.slug,
  ]);
  // dirty 신호 = RHF formState.isDirty 또는 savedValues baseline 비교.
  // RHF 의 isDirty 는 nested array 등에서 약간의 false-negative 가능 →
  // savedValues 직접 비교를 OR 신호로 같이 사용.
  const isDirty =
    rhfIsDirty || JSON.stringify(values) !== JSON.stringify(savedValues);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // B-23 — dirty 상태에서 브라우저 닫기 / 새로고침 / 다른 link 이동 시 confirm
  // dialog 노출. 브라우저는 returnValue 가 빈 문자열이어도 generic 확인 메시지
  // 표시 (Chrome / Firefox / Safari). 메시지 자체는 브라우저 보안 정책상 커스텀
  // 불가. 실제 페이지 이동 (Next.js Link) 은 별도 router event 가드 필요 —
  // 본 fire 는 외부 이탈 (탭 닫기 / 새로고침) 만 커버.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    queueMicrotask(() => {
      setSectionOpen(
        mode === "create"
          ? {
              "project-form-basics": true,
              "project-form-story": true,
              "project-form-network": false,
              "project-form-operations": false,
            }
          : {
              "project-form-basics": true,
              "project-form-story": true,
              "project-form-network": true,
              "project-form-operations": true,
            },
      );
    });
  }, [mode]);

  const setValue = <K extends keyof ProjectFormValues>(
    key: K,
    v: ProjectFormValues[K],
  ) => {
    setSaveNotice(null);
    setValues((prev) => ({ ...prev, [key]: v }));
    // RHF 도 동시 setValue (\`shouldDirty: true\`) — formState.isDirty 가
    // baseline 과 정확히 일치하도록.
    //
    // ProjectFormValues[K] 의 optional undefined 가 RHF Path-typed setValue
    // 시그니처와 mismatch — \`as never\` cast 한 줄. Path<T> 가 string 의
    // 부분집합이라 keyof T 와 호환 안 함 (RHF 7.x 의 정상 동작).
    rhfSetValue(
      key as Parameters<typeof rhfSetValue>[0],
      v as never,
      { shouldDirty: true, shouldValidate: false },
    );
  };

  const focusField = (field: keyof ProjectFormValues) => {
    const fieldId = PROJECT_FIELD_IDS[field];
    if (!fieldId || typeof document === "undefined") return;
    window.requestAnimationFrame(() => {
      const target = document.getElementById(fieldId);
      if (target instanceof HTMLElement) {
        target.focus();
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  };

  const syncSlugFromName = (name: string) => {
    if (mode !== "create") return;
    if (slugManuallyEdited) return;
    const nextSlug = slugify(name);
    setValues((prev) => ({ ...prev, slug: nextSlug }));
    rhfSetValue("slug", nextSlug, { shouldDirty: true, shouldValidate: false });
  };

  // 라이브 프리뷰용 Project 객체 — 폼 값에서 유도.
  const previewProject = useMemo<Project>(
    () => ({
      slug: values.slug,
      name: values.name,
      nameEn: values.nameEn || undefined,
      category: values.category,
      status: values.status,
      description: values.description,
      detail: values.detail || undefined,
      tags: (values.tagsCsv ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      stack: (values.stackCsv ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      links: [],
      dependencies: values.dependencies,
      owner: values.owner || undefined,
      icon: values.icon || undefined,
      screenshots: values.screenshots,
      timeline: {
        startedAt: values.startedAt
          ? new Date(`${values.startedAt}T00:00:00.000Z`)
          : undefined,
        launchedAt: values.launchedAt
          ? new Date(`${values.launchedAt}T00:00:00.000Z`)
          : undefined,
      },
      progress: values.progress,
      isHub: values.isHub,
      position: initialProject?.position ?? { x: 0, y: 0 },
      createdAt: initialProject?.createdAt ?? new Date(),
      updatedAt: new Date(),
    }),
    [values, initialProject],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    setSaveNotice(null);
    const submitBehavior = submitBehaviorRef.current;
    const parsed = projectFormSchema.safeParse(values);
    if (!parsed.success) {
      const map: Partial<Record<keyof ProjectFormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const k =
          (issue.path[0] as keyof ProjectFormValues | undefined) ??
          (issue.message.startsWith("Link ")
            ? "linksText"
            : undefined);
        if (!k) continue;
        map[k] = issue.message;
      }
      setErrors(map);
      const firstField = Object.keys(map)[0] as keyof ProjectFormValues | undefined;
      if (firstField) focusField(firstField);
      return;
    }
    const nextCategory = getCategory(parsed.data.category);
    const nextStatus = getStatus(parsed.data.status);
    if (!nextCategory || !nextStatus) {
      const nextErrors = {
        ...(nextCategory ? {} : { category: t("validation.categoryNotFound") }),
        ...(nextStatus ? {} : { status: t("validation.statusNotFound") }),
      };
      setErrors(nextErrors);
      focusField(!nextCategory ? "category" : "status");
      return;
    }

    const availableDependencySlugs = allProjects
      .filter((project) =>
        mode === "edit" ? project.slug !== initialProject?.slug : true,
      )
      .map((project) => project.slug);
    const missingDependencies = findMissingDependencySlugs(
      parsed.data.dependencies,
      availableDependencySlugs,
    );
    if (missingDependencies.length > 0) {
      setErrors({
        dependencies: t("validation.missingDependencies", {
          slugs: missingDependencies.join(", "),
        }),
      });
      return;
    }

    const duplicateDependencies = findDuplicateDependencySlugs(
      parsed.data.dependencies,
    );
    if (duplicateDependencies.length > 0) {
      setErrors({
        dependencies: t("validation.duplicateDependencies", {
          slugs: duplicateDependencies.join(", "),
        }),
      });
      return;
    }

    setErrors({});

    if (initialProject) {
      const cyclicDependency = parsed.data.dependencies.find((dependencySlug) =>
        wouldCreateDependencyCycle(allProjects, initialProject.slug, dependencySlug),
      );

      if (cyclicDependency) {
        const dependencyProject = allProjects.find(
          (project) => project.slug === cyclicDependency,
        );
        setErrors({
          dependencies: t("validation.cyclicDependency", {
            name: dependencyProject?.name ?? cyclicDependency,
          }),
        });
        return;
      }
    }

    if (existingSlugSet.has(parsed.data.slug)) {
      setErrors({ slug: t("validation.duplicateSlug") });
      focusField("slug");
      return;
    }

    setSubmitting(true);
    try {
      // 슬롯 배치 겹침 방지용 최신 프로젝트 목록. allProjects 가 mode-aware
      // hook (useProjects) 의 출력이라 vault / 빌드타임 dogfood 진실원과 sync.
      const latestProjects = allProjects;
      // R15 — initialProject.position 이 undefined (vault 가 명시 안 함) 면
      // 자동 placement 강제. category 가 바뀌었거나 inside 아니면도 동일.
      const initialPos = initialProject?.position;
      const position = initialProject
        ? initialProject.category !== parsed.data.category ||
          !initialPos ||
          !isProjectPositionInsideCategory(nextCategory, initialPos)
          ? findProjectPlacement(
              nextCategory,
              latestProjects.filter(
                (project) => project.slug !== initialProject.slug,
              ),
            )
          : initialPos
        : findProjectPlacement(nextCategory, latestProjects);
      const input = formValuesToProjectInput(parsed.data, position);
      await onSubmit(input, { behavior: submitBehavior });
      setSavedValues(parsed.data);
      // RHF baseline 도 reset → isDirty=false 로 즉시 복원.
      rhfReset(parsed.data);
      if (submitBehavior === "stay") {
        setSaveNotice(
          mode === "create"
            ? t("actions.createNoticeStay")
            : t("actions.editNoticeStay"),
        );
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : t("validation.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm(t("actions.deleteConfirm", { name: values.name }))) return;
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : t("validation.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const completenessInsight = useMemo(
    () => resolveProjectCompletenessInsight(previewProject),
    [previewProject],
  );
  const freshnessInsight = useMemo(
    () => resolveProjectFreshnessInsight(previewProject),
    [previewProject],
  );
  const editorModeLabel =
    mode === "create"
      ? initialProject
        ? t("actions.modeDuplicate")
        : t("actions.modeCreate")
      : t("actions.modeEdit");
  const dirtyStateLabel = isDirty ? t("actions.dirty") : t("actions.clean");
  const compactDirtyStateLabel = isDirty ? t("actions.compactDirty") : t("actions.compactClean");
  const optionalSectionsOpen = sectionOpen["project-form-network"] && sectionOpen["project-form-operations"];
  const changePreviewItems = useMemo(() => {
    const items: string[] = [];
    const emptyLabel = t("preview.changeNameEmpty");

    if (values.name !== savedValues.name) {
      items.push(
        t("preview.changeName", {
          from: savedValues.name || emptyLabel,
          to: values.name || emptyLabel,
        }),
      );
    }
    if (values.category !== savedValues.category || values.status !== savedValues.status) {
      const nextCategoryLabel =
        categoryOptions.find((option) => option.value === values.category)?.label ?? values.category;
      const nextStatusLabel =
        statusOptions.find((option) => option.value === values.status)?.label ?? values.status;
      items.push(
        t("preview.changeCategoryStatus", {
          category: nextCategoryLabel,
          status: nextStatusLabel,
        }),
      );
    }
    if (values.description !== savedValues.description) {
      items.push(
        values.description.trim().length > 0
          ? t("preview.changeDescriptionFilled")
          : t("preview.changeDescriptionEmpty"),
      );
    }
    if (values.dependencies.length !== savedValues.dependencies.length) {
      items.push(
        t("preview.changeDependencies", {
          from: savedValues.dependencies.length,
          to: values.dependencies.length,
        }),
      );
    }
    if (values.screenshots.length !== savedValues.screenshots.length) {
      items.push(
        t("preview.changeScreenshots", {
          from: savedValues.screenshots.length,
          to: values.screenshots.length,
        }),
      );
    }
    if (values.detail !== savedValues.detail) {
      items.push(
        (values.detail ?? "").trim().length > 0
          ? t("preview.changeDetailFilled")
          : t("preview.changeDetailEmpty"),
      );
    }

    return items.slice(0, 4);
  }, [categoryOptions, savedValues, statusOptions, t, values]);
  const mobilePreviewSummary = isDirty
    ? t("preview.summaryDirty", { score: completenessInsight.score, count: changePreviewItems.length })
    : t("preview.summaryClean", { score: completenessInsight.score });

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_260px]">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div
          className={cn(
            "rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-4 py-4 shadow-[0_18px_36px_rgba(0,0,0,0.22)]",
            mode === "edit" && "sticky top-4 z-10",
          )}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                {editorModeLabel}
              </p>
              <p className="mt-2 hidden text-sm text-[color:var(--color-text-secondary)] md:block">
                {mode === "create"
                  ? t("actions.headerHelpCreate")
                  : t("actions.headerHelpEdit")}
              </p>
              <span
                className={cn(
                  "mt-2 inline-flex rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] md:hidden",
                  isDirty
                    ? "border-[color:rgba(94,106,210,0.3)] bg-[color:rgba(94,106,210,0.12)] text-[color:var(--color-text-primary)]"
                    : "border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]",
                )}
              >
                {compactDirtyStateLabel}
              </span>
              </div>
              <span
                className={cn(
                  "hidden rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] md:inline-flex",
                  isDirty
                    ? "border-[color:rgba(94,106,210,0.3)] bg-[color:rgba(94,106,210,0.12)] text-[color:var(--color-text-primary)]"
                    : "border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]",
                )}
              >
                {dirtyStateLabel}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:justify-end">
              {mode === "edit" && onDelete && (
                <Button
                  data-testid="project-delete-top"
                  type="button"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={deleting || submitting}
                  className="justify-center"
                >
                  {deleting ? t("actions.deleting") : t("actions.delete")}
                </Button>
              )}
              <Button
                data-testid="project-save-top"
                type="submit"
                data-submit-behavior="stay"
                onClick={() => {
                  submitBehaviorRef.current = "stay";
                }}
                disabled={submitting || deleting}
                className={cn(
                  "order-last col-span-2 justify-center md:order-none md:col-span-1",
                  mode === "edit" && onDelete ? "" : "md:min-w-[88px]",
                )}
              >
                {submitting
                  ? t("actions.saving")
                  : mode === "create"
                    ? t("actions.createAndContinue")
                    : t("actions.saveAndContinue")}
              </Button>
              <Button
                data-testid="project-save-return-top"
                type="submit"
                data-submit-behavior="return"
                variant="outline"
                onClick={() => {
                  submitBehaviorRef.current = "return";
                }}
                disabled={submitting || deleting}
                className="justify-center"
              >
                {mode === "create" ? t("actions.createAndReturn") : t("actions.saveAndReturn")}
              </Button>
              <Button
                data-testid="project-cancel-top"
                type="button"
                variant="ghost"
                onClick={onCancel}
                disabled={submitting || deleting}
                className="justify-center"
              >
                {t("actions.cancel")}
              </Button>
            </div>
          </div>
        </div>

        {mode === "edit" ? (
          <div className="rounded-xl border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-4 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                {t("sections.navLabel")}
              </p>
              <nav className="flex flex-wrap gap-2">
                {FORM_SECTIONS.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="rounded-full border border-[color:var(--color-divider)] px-3 py-1.5 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:text-[color:var(--color-text-primary)]"
                  >
                    {section.label}
                  </a>
                ))}
              </nav>
            </div>
          </div>
        ) : null}

        {mode === "create" && (
          <details className="rounded-xl border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(94,106,210,0.06)] px-4 py-4 md:px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                  <Sparkles size={12} aria-hidden="true" />
                  {t("tip.eyebrow")}
                </p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                  {t("tip.lead")}
                </p>
              </div>
              <span className="rounded-full border border-[color:var(--color-divider)] px-3 py-1 text-xs text-[color:var(--color-text-secondary)]">
                {t("tip.moreLabel")}
              </span>
            </summary>
            <div className="mt-4 flex flex-col gap-4 border-t border-[color:var(--color-divider)] pt-4 md:flex-row md:items-start md:justify-between">
              <ol className="grid gap-2 text-sm leading-6 text-[color:var(--color-text-secondary)] md:grid-cols-2">
                <li>{t("tip.step1")}</li>
                <li>{t("tip.step2")}</li>
                <li>{t("tip.step3")}</li>
                <li>{t("tip.step4")}</li>
              </ol>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setSectionOpen((current) => ({
                    ...current,
                    "project-form-network": !optionalSectionsOpen,
                    "project-form-operations": !optionalSectionsOpen,
                  }))
                }
              >
                {optionalSectionsOpen ? t("tip.collapseDetails") : t("tip.expandDetails")}
              </Button>
            </div>
          </details>
        )}

        {(globalError || Object.keys(errors).length > 0) && (
          <div
            role="alert"
            className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-3 text-sm text-red-200"
          >
            <p className="font-[var(--font-weight-signature)] text-red-100">
              {globalError ?? t("validation.globalErrorBanner")}
            </p>
            {Object.keys(errors).length > 0 ? (
              <>
                <ul className="mt-2 space-y-1 text-xs text-red-200/90">
                  {Object.entries(errors).slice(0, 4).map(([field, message]) => (
                    <li key={field}>{message}</li>
                  ))}
                </ul>
                {Object.keys(errors).length > 4 ? (
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-red-300/90">
                    {t("validation.globalErrorMore", { count: Object.keys(errors).length - 4 })}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        )}

        <FormSection
          id="project-form-basics"
          label={t("sections.basicsLabel")}
          description={t("sections.basicsDetailedDescription")}
          collapsible={false}
          collapseLabel={t("sections.collapseLabel")}
          expandLabel={t("sections.expandLabel")}
        >
          <FieldRow label={t("fields.slug")} error={errors.slug} fieldId={PROJECT_FIELD_IDS.slug}>
            <Input
              id={PROJECT_FIELD_IDS.slug}
              name="slug"
              data-testid="project-input-slug"
              value={values.slug}
              onChange={(v) => {
                setSlugManuallyEdited(true);
                setValue("slug", v);
              }}
              placeholder="sample"
              disabled={mode === "edit"}
              mono
              spellCheck={false}
              aria-invalid={Boolean(errors.slug)}
            />
            {mode === "create" && (
              <div className="mt-2 flex items-center gap-2">
                <Button
                  data-testid="project-generate-slug"
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSlugManuallyEdited(false);
                    setValue("slug", slugify(values.name));
                  }}
                  disabled={values.name.trim().length === 0}
                >
                  {t("fields.slugGenerate")}
                </Button>
                {existingSlugSet.has(values.slug) && values.slug.length > 0 && (
                  <span
                    role="alert"
                    className="text-xs text-[color:var(--color-status-danger)]"
                  >
                    {t("fields.slugDuplicate")}
                  </span>
                )}
                {initialProject && (
                  <span className="text-xs text-[color:var(--color-text-quaternary)]">
                    {t("fields.duplicateNotice")}
                  </span>
                )}
              </div>
            )}
            <Hint>{t("fields.slugHint")}</Hint>
          </FieldRow>

          <FieldRow label={t("fields.name")} error={errors.name} fieldId={PROJECT_FIELD_IDS.name}>
            <Input
              id={PROJECT_FIELD_IDS.name}
              name="name"
              data-testid="project-input-name"
              value={values.name}
              onChange={(v) => {
                setValue("name", v);
                syncSlugFromName(v);
              }}
              placeholder={t("fields.namePlaceholder")}
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
            />
          </FieldRow>

          <FieldRow label={t("fields.nameEn")} fieldId={PROJECT_FIELD_IDS.nameEn}>
            <Input
              id={PROJECT_FIELD_IDS.nameEn}
              name="nameEn"
              data-testid="project-input-name-en"
              value={values.nameEn ?? ""}
              onChange={(v) => setValue("nameEn", v)}
              placeholder={t("fields.nameEnPlaceholder")}
              autoComplete="off"
            />
          </FieldRow>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldRow
              label={t("fields.category")}
              error={errors.category}
              errorTestId="project-error-category"
              fieldId={PROJECT_FIELD_IDS.category}
            >
              <Select
                id={PROJECT_FIELD_IDS.category}
                name="category"
                data-testid="project-input-category"
                value={values.category}
                onChange={(v) => setValue("category", v)}
                options={categoryOptions}
                aria-invalid={Boolean(errors.category)}
              />
              {!getCategory(values.category) && values.category && (
                <Hint>
                  <span data-testid="project-missing-category-warning">
                    {t("fields.categoryMissingWarning")}
                  </span>
                </Hint>
              )}
            </FieldRow>

            <FieldRow
              label={t("fields.status")}
              error={errors.status}
              errorTestId="project-error-status"
              fieldId={PROJECT_FIELD_IDS.status}
            >
              <Select
                id={PROJECT_FIELD_IDS.status}
                name="status"
                data-testid="project-input-status"
                value={values.status}
                onChange={(v) => setValue("status", v)}
                options={statusOptions}
                aria-invalid={Boolean(errors.status)}
              />
              {!getStatus(values.status) && values.status && (
                <Hint>
                  <span data-testid="project-missing-status-warning">
                    {t("fields.statusMissingWarning")}
                  </span>
                </Hint>
              )}
            </FieldRow>
          </div>
        </FormSection>

        <FormSection
          id="project-form-story"
          label={t("sections.storyLabel")}
          description={t("sections.storyDetailedDescription")}
          isOpen={sectionOpen["project-form-story"]}
          onToggle={() =>
            setSectionOpen((current) => ({
              ...current,
              "project-form-story": !current["project-form-story"],
            }))
          }
          helperBadge={t("sections.helperBadgeFillFirst")}
          collapseLabel={t("sections.collapseLabel")}
          expandLabel={t("sections.expandLabel")}
        >
          <FieldRow
            label={t("fields.description")}
            error={errors.description}
            fieldId={PROJECT_FIELD_IDS.description}
          >
            <Textarea
              id={PROJECT_FIELD_IDS.description}
              name="description"
              data-testid="project-input-description"
              value={values.description}
              onChange={(v) => setValue("description", v)}
              rows={2}
              placeholder={t("fields.descriptionPlaceholder")}
              autoComplete="off"
              aria-invalid={Boolean(errors.description)}
            />
          </FieldRow>

          <FieldRow label={t("fields.detail")} fieldId={PROJECT_FIELD_IDS.detail}>
            <MarkdownField
              id={PROJECT_FIELD_IDS.detail}
              value={values.detail ?? ""}
              onChange={(v) => setValue("detail", v)}
              rows={8}
              placeholder={t("fields.detailPlaceholder")}
            />
          </FieldRow>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldRow label={t("fields.tagsCsv")}>
              <Input
                value={values.tagsCsv ?? ""}
                onChange={(v) => setValue("tagsCsv", v)}
                placeholder={t("fields.tagsPlaceholder")}
              />
            </FieldRow>

            <FieldRow label={t("fields.stackCsv")}>
              <Input
                value={values.stackCsv ?? ""}
                onChange={(v) => setValue("stackCsv", v)}
                placeholder={t("fields.stackPlaceholder")}
                mono
              />
            </FieldRow>
          </div>

          <FieldRow
            label={t("fields.linksText")}
            error={errors.linksText}
            errorTestId="project-error-links"
          >
            <Textarea
              data-testid="project-input-links"
              value={values.linksText ?? ""}
              onChange={(v) => setValue("linksText", v)}
              rows={3}
              placeholder={t("fields.linksPlaceholder")}
              mono
            />
          </FieldRow>
        </FormSection>

        <FormSection
          id="project-form-network"
          label={t("sections.networkLabel")}
          description={t("sections.networkDetailedDescription")}
          isOpen={sectionOpen["project-form-network"]}
          onToggle={() =>
            setSectionOpen((current) => ({
              ...current,
              "project-form-network": !current["project-form-network"],
            }))
          }
          helperBadge={t("sections.helperBadgeAfterSave")}
          collapseLabel={t("sections.collapseLabel")}
          expandLabel={t("sections.expandLabel")}
        >
          <FieldRow
            label={t("fields.dependencies")}
            error={errors.dependencies}
            errorTestId="project-error-dependencies"
          >
            <DependencyPicker
              value={values.dependencies}
              onChange={(next) => setValue("dependencies", next)}
              options={allProjects}
              selfSlug={mode === "edit" ? initialProject?.slug : undefined}
              invalidSlugs={invalidDependencySlugs}
              suggestions={dependencySuggestions}
            />
            <Hint>{t("fields.dependenciesHint")}</Hint>
          </FieldRow>

          {/* Screenshot uploader 없음 — local-first 흐름은 markdown 안
              이미지 인라인 또는 vault 내부 image asset 으로 처리. */}
        </FormSection>

        <FormSection
          id="project-form-operations"
          label={t("sections.operationsLabel")}
          description={t("sections.operationsDetailedDescription")}
          isOpen={sectionOpen["project-form-operations"]}
          onToggle={() =>
            setSectionOpen((current) => ({
              ...current,
              "project-form-operations": !current["project-form-operations"],
            }))
          }
          helperBadge={t("sections.helperBadgeOptional")}
          collapseLabel={t("sections.collapseLabel")}
          expandLabel={t("sections.expandLabel")}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldRow
              label={t("fields.startedAt")}
              error={errors.startedAt}
              errorTestId="project-error-startedAt"
            >
              <Input
                data-testid="project-input-started-at"
                type="date"
                value={values.startedAt ?? ""}
                onChange={(v) => setValue("startedAt", v)}
              />
            </FieldRow>

            <FieldRow
              label={t("fields.launchedAt")}
              error={errors.launchedAt}
              errorTestId="project-error-launchedAt"
            >
              <Input
                data-testid="project-input-launched-at"
                type="date"
                value={values.launchedAt ?? ""}
                onChange={(v) => setValue("launchedAt", v)}
              />
            </FieldRow>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FieldRow label={t("fields.owner")}>
              <Input
                value={values.owner ?? ""}
                onChange={(v) => setValue("owner", v)}
                placeholder={t("fields.ownerPlaceholder")}
              />
            </FieldRow>

            <FieldRow label={t("fields.icon")}>
              <Input
                value={values.icon ?? ""}
                onChange={(v) => setValue("icon", v)}
                placeholder={t("fields.iconPlaceholder")}
              />
            </FieldRow>

            <FieldRow label={t("fields.progress")}>
              <Input
                type="number"
                value={
                  values.progress !== undefined ? String(values.progress) : ""
                }
                onChange={(v) =>
                  setValue("progress", v === "" ? undefined : Number(v))
                }
                placeholder={t("fields.progressPlaceholder")}
              />
            </FieldRow>
          </div>

          <label className="flex items-center gap-2 text-sm text-[color:var(--color-text-secondary)]">
            <input
              type="checkbox"
              checked={values.isHub}
              onChange={(e) => setValue("isHub", e.target.checked)}
              className="h-4 w-4 accent-[color:var(--color-indigo-brand)]"
            />
            <span>
              {t("fields.isHubLabel")}{" "}
              <span className="text-[color:var(--color-text-quaternary)]">
                {t("fields.isHubHint")}
              </span>
            </span>
          </label>
        </FormSection>

        <div className="flex items-center justify-between border-t border-[color:var(--color-overlay-2)] pt-6">
          <div>
            {mode === "edit" && onDelete && (
              <Button
                data-testid="project-delete"
                type="button"
                variant="outline"
                onClick={handleDelete}
                disabled={deleting || submitting}
              >
                {deleting ? t("actions.deleting") : t("actions.delete")}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              data-testid="project-save-return"
              type="submit"
              data-submit-behavior="return"
              variant="outline"
              onClick={() => {
                submitBehaviorRef.current = "return";
              }}
              disabled={submitting || deleting}
            >
              {mode === "create" ? t("actions.createAndReturn") : t("actions.saveAndReturn")}
            </Button>
            <Button
              data-testid="project-cancel"
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={submitting || deleting}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              data-testid="project-save"
              type="submit"
              data-submit-behavior="stay"
              onClick={() => {
                submitBehaviorRef.current = "stay";
              }}
              disabled={submitting || deleting}
            >
              {submitting
                ? t("actions.saving")
                : mode === "create"
                  ? t("actions.createAndContinue")
                  : t("actions.saveAndContinue")}
            </Button>
          </div>
        </div>
      </form>

      {/* 모바일에서는 폼 입력을 먼저 보이게 하고, 데스크톱에서만 우측 보조 패널로 유지한다. */}
      <aside className="order-none">
        <div className="lg:sticky lg:top-10">
          <button
            type="button"
            data-testid="project-mobile-preview-toggle"
            onClick={() => setMobilePreviewOpen((open) => !open)}
            className="mb-4 flex w-full items-center justify-between rounded-xl border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-4 py-4 text-left lg:hidden"
          >
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                {t("preview.toggleEyebrow")}
              </p>
              <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
                {mobilePreviewSummary}
              </p>
            </div>
            <ChevronDown
              size={16}
              className={cn(
                "shrink-0 text-[color:var(--color-text-quaternary)] transition-transform",
                mobilePreviewOpen && "rotate-180",
              )}
            />
          </button>
          <div className={cn("hidden lg:block", mobilePreviewOpen && "block")}>
          <div className="mb-4 rounded-xl border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {t("preview.previewEyebrow")}
            </p>
            {saveNotice ? (
              <div
                role="status"
                className="mt-3 rounded-lg border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.1)] px-4 py-3 text-sm text-[color:var(--color-indigo-accent)]"
              >
                {saveNotice}
              </div>
            ) : null}
            <p className="mt-3 text-sm text-[color:var(--color-text-secondary)]">
              {t("preview.liveHint")}
            </p>
            {!saveNotice && changePreviewItems.length === 0 ? (
              <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
                {t("preview.noChanges")}
              </p>
            ) : null}
          </div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {t("preview.cardEyebrow")}
          </p>
          <div className="flex items-start justify-center rounded-xl border border-[color:var(--color-overlay-2)] bg-[color:var(--color-canvas)] p-6">
            <ProjectCard
              project={previewProject}
              category={(() => {
                const c = getCategory(previewProject.category);
                return c
                  ? {
                      borderStyle: c.borderStyle,
                      sideLabelText: c.sideLabelText ?? c.labelEn ?? c.label,
                    }
                  : undefined;
              })()}
              statusDotColor={
                getStatus(previewProject.status)?.dotColor ?? "neutral"
              }
              shared={
                !previewProject.isHub &&
                isSharedNode(
                  previewProject.dependencies,
                  computeHubSlugs(allProjects),
                )
              }
              hubEyebrow={t("preview.cardHubEyebrow")}
              sharedEyebrow={t("preview.cardSharedEyebrow")}
              preview
            />
          </div>
          <p className="mt-2 text-[11px] text-[color:var(--color-text-quaternary)]">
            {t("preview.cardCaption")}
          </p>
          <div className="mt-4 rounded-xl border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t("preview.completenessLabel")}
                </p>
                <p className="mt-2 text-[28px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {completenessInsight.score}%
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t("preview.publicStatusLabel")}
                </p>
                <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
                  {isDirty ? t("preview.publicStatusDirty") : freshnessInsight.label}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-[color:var(--color-text-quaternary)]">
              {t("preview.completenessFraction", {
                completed: completenessInsight.completedCount,
                total: completenessInsight.totalCount,
              })}
            </p>
          </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function FieldRow({
  label,
  error,
  errorTestId,
  fieldId,
  children,
}: {
  label: string;
  error?: string;
  errorTestId?: string;
  fieldId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]"
      >
        {label}
      </label>
      {children}
      {error && (
        <p
          role="alert"
          data-testid={errorTestId}
          className="text-xs text-[color:var(--color-status-danger)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function FormSection({
  id,
  label,
  description,
  isOpen = true,
  onToggle,
  collapsible = true,
  helperBadge,
  collapseLabel,
  expandLabel,
  children,
}: {
  id: string;
  label: string;
  description: string;
  isOpen?: boolean;
  onToggle?: () => void;
  collapsible?: boolean;
  helperBadge?: string;
  collapseLabel?: string;
  expandLabel?: string;
  children: React.ReactNode;
}) {
  const contentId = `${id}-content`;
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      className="scroll-mt-28 rounded-xl border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-4 py-5 md:px-5"
    >
      <div className="mb-5 border-b border-[color:var(--color-overlay-2)] pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              id={headingId}
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]"
            >
              {label}
            </p>
            <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
              {description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {helperBadge ? (
              <span className="rounded-full border border-[color:var(--color-divider)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                {helperBadge}
              </span>
            ) : null}
            {collapsible ? (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={isOpen}
                aria-controls={contentId}
                className="inline-flex h-8 items-center gap-2 rounded-full border border-[color:var(--color-divider)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.34)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
              >
                {isOpen ? (collapseLabel ?? "Collapse") : (expandLabel ?? "Expand")}
                <ChevronDown
                  size={14}
                  aria-hidden="true"
                  className={cn("transition-transform", isOpen && "rotate-180")}
                />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {isOpen ? (
        <div
          id={contentId}
          role="region"
          aria-labelledby={headingId}
          className="flex flex-col gap-6"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-[color:var(--color-text-quaternary)]">
      {children}
    </p>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
  disabled,
  ...props
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  disabled?: boolean;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "disabled"
>) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        "h-9 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-3 text-sm text-[color:var(--color-text-primary)]",
        "placeholder:text-[color:var(--color-text-quaternary)]",
        "focus:border-[color:var(--color-indigo-accent)] focus:outline-none",
        "disabled:opacity-50",
        mono && "font-mono",
      )}
      {...props}
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows,
  mono,
  ...props
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows: number;
  mono?: boolean;
} & Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "rows"
>) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={cn(
        "rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]",
        "placeholder:text-[color:var(--color-text-quaternary)]",
        "focus:border-[color:var(--color-indigo-accent)] focus:outline-none",
        "resize-none",
        mono && "font-mono",
      )}
      {...props}
    />
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
  ...props
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(
        "h-9 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-3 text-sm text-[color:var(--color-text-primary)]",
        "focus:border-[color:var(--color-indigo-accent)] focus:outline-none",
      )}
      {...props}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
