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
import { ChevronDown, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
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
import { ScreenshotUploader } from "./ScreenshotUploader";
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

const FORM_SECTIONS = [
  {
    id: "project-form-basics",
    label: "기본 정보",
    description: "이름, slug, 카테고리와 상태를 정리합니다.",
  },
  {
    id: "project-form-story",
    label: "소개와 문서",
    description: "설명, 마크다운 본문, 태그와 링크를 입력합니다.",
  },
  {
    id: "project-form-network",
    label: "연결과 미디어",
    description: "의존 관계와 스크린샷을 점검합니다.",
  },
  {
    id: "project-form-operations",
    label: "운영 정보",
    description: "일정, 담당자, 아이콘, 허브 여부를 마무리합니다.",
  },
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
  const { categories, statuses, getCategory, getStatus } = useTaxonomy();
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

  // Fire 6-2/6-3 — RHF formState.isDirty 를 dirty tracking 의 단일 진실원으로.
  // values prop 대신 setValue 헬퍼에서 매번 RHF 의 setValue 도 호출 (Fire 6-3).
  // 외부 useState (`values`) 가 source of truth 유지 + RHF 가 dirty / submit
  // 상태만 보강. Fire 6-4 에서 Controller 로 완전 위임 예정.
  //
  // resolver 의 input/output 타입 inference 가 zod default([]) 등으로 차이가
  // 나서 RHF 의 Resolver 시그니처와 맞지 않음 — `as never` cast 로 회피.
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
          label: `Missing category · ${values.category}`,
        },
        ...options,
      ];
    }
    return options;
  }, [categories, getCategory, values.category]);
  const statusOptions = useMemo(() => {
    const options = statuses.map((status) => ({
      value: status.id,
      label: status.label,
    }));
    if (values.status && !getStatus(values.status)) {
      return [
        {
          value: values.status,
          label: `Missing status · ${values.status}`,
        },
        ...options,
      ];
    }
    return options;
  }, [getStatus, statuses, values.status]);
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
  // Fire 6-2 — JSON.stringify dirty → RHF formState.isDirty + savedValues
  // baseline OR. RHF 가 deepEqual 로 비교 + reset(data) 후 즉시 false.
  // savedValues 비교 보존 — RHF 의 isDirty 는 nested array 등에서 약간의 거짓
  // negative 가능. 두 신호의 OR 가 안전.
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
    // Fire 6-3 — RHF 도 동기화 (shouldDirty:true) 해서 formState.isDirty 가
    // 정상 작동. external values useState 는 여전히 source of truth (Fire 6-4
    // 가 Controller 도입하면 제거).
    //
    // ProjectFormValues[K] 의 optional undefined 가 RHF Path-typed setValue
    // 시그니처와 mismatch — `as never` cast 한 줄. Path<T> 가 string 의
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
          (issue.message.startsWith("링크 ")
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
        ...(nextCategory ? {} : { category: "존재하지 않는 카테고리입니다." }),
        ...(nextStatus ? {} : { status: "존재하지 않는 상태입니다." }),
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
        dependencies: `존재하지 않는 의존 프로젝트: ${missingDependencies.join(", ")}`,
      });
      return;
    }

    const duplicateDependencies = findDuplicateDependencySlugs(
      parsed.data.dependencies,
    );
    if (duplicateDependencies.length > 0) {
      setErrors({
        dependencies: `중복 의존 프로젝트: ${duplicateDependencies.join(", ")}`,
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
          dependencies: `순환 의존성이 생깁니다: ${dependencyProject?.name ?? cyclicDependency}`,
        });
        return;
      }
    }

    if (existingSlugSet.has(parsed.data.slug)) {
      setErrors({ slug: "이미 존재하는 slug입니다." });
      focusField("slug");
      return;
    }

    setSubmitting(true);
    try {
      // 슬롯 배치 겹침 방지용 최신 프로젝트 목록. allProjects 가 mode-aware
      // hook(useProjects) 의 출력이라 vault / Firestore 양쪽에서 sync.
      const latestProjects = allProjects;
      const position = initialProject
        ? initialProject.category !== parsed.data.category ||
          !isProjectPositionInsideCategory(nextCategory, initialProject.position)
          ? findProjectPlacement(
              nextCategory,
              latestProjects.filter(
                (project) => project.slug !== initialProject.slug,
              ),
            )
          : initialProject.position
        : findProjectPlacement(nextCategory, latestProjects);
      const input = formValuesToProjectInput(parsed.data, position);
      await onSubmit(input, { behavior: submitBehavior });
      setSavedValues(parsed.data);
      // Fire 6-2 — RHF baseline 도 동기화. reset 후 isDirty=false 로 즉시 회복.
      rhfReset(parsed.data);
      if (submitBehavior === "stay") {
        setSaveNotice(
          mode === "create"
            ? "프로젝트를 만들고 이어서 편집할 수 있게 준비했습니다."
            : "변경 사항을 저장했습니다. 오른쪽 미리보기와 공개 화면 링크에서 바로 확인할 수 있습니다.",
        );
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm(`정말 "${values.name}" 프로젝트를 삭제할까요?`)) return;
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "삭제 실패");
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
        ? "복제본 작성"
        : "새 프로젝트 작성"
      : "프로젝트 편집";
  const dirtyStateLabel = isDirty ? "변경 사항 있음" : "변경 없음";
  const compactDirtyStateLabel = isDirty ? "변경됨" : "변경 없음";
  const optionalSectionsOpen = sectionOpen["project-form-network"] && sectionOpen["project-form-operations"];
  const changePreviewItems = useMemo(() => {
    const items: string[] = [];

    if (values.name !== savedValues.name) {
      items.push(`이름이 “${savedValues.name || "비어 있음"}”에서 “${values.name || "비어 있음"}”으로 바뀝니다.`);
    }
    if (values.category !== savedValues.category || values.status !== savedValues.status) {
      const nextCategoryLabel =
        categoryOptions.find((option) => option.value === values.category)?.label ?? values.category;
      const nextStatusLabel =
        statusOptions.find((option) => option.value === values.status)?.label ?? values.status;
      items.push(`카테고리와 상태가 “${nextCategoryLabel} / ${nextStatusLabel}” 조합으로 보입니다.`);
    }
    if (values.description !== savedValues.description) {
      items.push(
        values.description.trim().length > 0
          ? "짧은 설명이 카드와 드로어 문구에 즉시 반영됩니다."
          : "짧은 설명이 비어 있어 카드와 드로어 요약이 줄어듭니다.",
      );
    }
    if (values.dependencies.length !== savedValues.dependencies.length) {
      items.push(`연결 프로젝트 수가 ${savedValues.dependencies.length}개에서 ${values.dependencies.length}개로 바뀝니다.`);
    }
    if (values.screenshots.length !== savedValues.screenshots.length) {
      items.push(`대표 화면 자료가 ${savedValues.screenshots.length}개에서 ${values.screenshots.length}개로 바뀝니다.`);
    }
    if (values.detail !== savedValues.detail) {
      items.push(
        (values.detail ?? "").trim().length > 0
          ? "상세 문서 본문이 공개 상세 화면에 반영됩니다."
          : "상세 문서 본문이 비어 있어 공개 상세 본문이 간단해집니다.",
      );
    }

    return items.slice(0, 4);
  }, [categoryOptions, savedValues, statusOptions, values]);
  const mobilePreviewSummary = isDirty
    ? `완성도 ${completenessInsight.score}% · 바뀌는 내용 ${changePreviewItems.length}건`
    : `완성도 ${completenessInsight.score}% · 저장된 내용과 같습니다`;

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
                  ? "먼저 저장하고, 나머지는 나중에 채워도 됩니다."
                  : "여기서 바로 저장하거나 돌아갈 수 있습니다."}
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
                  {deleting ? "삭제 중…" : "삭제"}
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
                  ? "저장 중…"
                  : mode === "create"
                    ? "생성하고 계속 보기"
                    : "저장하고 계속 보기"}
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
                {mode === "create" ? "생성 후 돌아가기" : "저장 후 돌아가기"}
              </Button>
              <Button
                data-testid="project-cancel-top"
                type="button"
                variant="ghost"
                onClick={onCancel}
                disabled={submitting || deleting}
                className="justify-center"
              >
                취소
              </Button>
            </div>
          </div>
        </div>

        {mode === "edit" ? (
          <div className="rounded-xl border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-4 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                섹션 이동
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
                  1분 등록 팁
                </p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                  이름, 상태, 짧은 설명부터 입력하면 됩니다.
                </p>
              </div>
              <span className="rounded-full border border-[color:var(--color-divider)] px-3 py-1 text-xs text-[color:var(--color-text-secondary)]">
                자세히 보기
              </span>
            </summary>
            <div className="mt-4 flex flex-col gap-4 border-t border-[color:var(--color-divider)] pt-4 md:flex-row md:items-start md:justify-between">
              <ol className="grid gap-2 text-sm leading-6 text-[color:var(--color-text-secondary)] md:grid-cols-2">
                <li>1. 이름을 입력하면 slug가 자동으로 만들어집니다.</li>
                <li>2. 카테고리와 상태를 고릅니다.</li>
                <li>3. 짧은 설명 한 줄만 적어도 카드와 드로어에 바로 노출됩니다.</li>
                <li>4. 연결 관계와 운영 정보는 저장 후 다시 열어 천천히 추가하면 됩니다.</li>
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
                {optionalSectionsOpen ? "상세 항목 접기" : "상세 항목 펼치기"}
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
              {globalError ?? "저장 전에 먼저 고쳐야 할 항목이 있습니다."}
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
                    + {Object.keys(errors).length - 4}개 더. 아래 필드에서 각각 확인 가능합니다.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        )}

        <FormSection
          id="project-form-basics"
          label="기본 정보"
          description="이름과 식별자, 현재 속한 카테고리와 상태를 먼저 맞춥니다."
          collapsible={false}
        >
          <FieldRow label="slug" error={errors.slug} fieldId={PROJECT_FIELD_IDS.slug}>
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
                  이름에서 생성
                </Button>
                {existingSlugSet.has(values.slug) && values.slug.length > 0 && (
                  <span
                    role="alert"
                    className="text-xs text-[color:var(--color-status-danger)]"
                  >
                    이미 존재하는 slug입니다.
                  </span>
                )}
                {initialProject && (
                  <span className="text-xs text-[color:var(--color-text-quaternary)]">
                    기존 프로젝트 내용을 복제해서 시작합니다.
                  </span>
                )}
              </div>
            )}
            <Hint>URL에 쓰임. 문자·숫자·하이픈만. 생성 후엔 변경 불가.</Hint>
          </FieldRow>

          <FieldRow label="이름" error={errors.name} fieldId={PROJECT_FIELD_IDS.name}>
            <Input
              id={PROJECT_FIELD_IDS.name}
              name="name"
              data-testid="project-input-name"
              value={values.name}
              onChange={(v) => {
                setValue("name", v);
                syncSlugFromName(v);
              }}
              placeholder="Demo"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
            />
          </FieldRow>

          <FieldRow label="영문 이름 (선택)" fieldId={PROJECT_FIELD_IDS.nameEn}>
            <Input
              id={PROJECT_FIELD_IDS.nameEn}
              name="nameEn"
              data-testid="project-input-name-en"
              value={values.nameEn ?? ""}
              onChange={(v) => setValue("nameEn", v)}
              placeholder="Demo"
              autoComplete="off"
            />
          </FieldRow>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldRow
              label="카테고리"
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
                    현재 카테고리 참조가 깨졌습니다. 다른 카테고리를 선택해 복구하세요.
                  </span>
                </Hint>
              )}
              <Hint>
                <Link href="/settings/categories" className="underline">
                  카테고리 관리
                </Link>
                에서 추가·편집 가능
              </Hint>
            </FieldRow>

            <FieldRow
              label="상태"
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
                    현재 상태 참조가 깨졌습니다. 다른 상태를 선택해 복구하세요.
                  </span>
                </Hint>
              )}
              <Hint>
                <Link href="/settings/statuses" className="underline">
                  상태 관리
                </Link>
                에서 추가·편집 가능
              </Hint>
            </FieldRow>
          </div>
        </FormSection>

        <FormSection
          id="project-form-story"
          label="소개와 문서"
          description="노드 카드, 드로어, 상세 페이지에 노출될 설명을 채웁니다."
          isOpen={sectionOpen["project-form-story"]}
          onToggle={() =>
            setSectionOpen((current) => ({
              ...current,
              "project-form-story": !current["project-form-story"],
            }))
          }
          helperBadge="먼저 채우면 좋음"
        >
          <FieldRow
            label="짧은 설명"
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
              placeholder="1~2줄 요약 — 드로어·노드에 표시됨"
              autoComplete="off"
              aria-invalid={Boolean(errors.description)}
            />
          </FieldRow>

          <FieldRow label="상세 (마크다운, 선택)" fieldId={PROJECT_FIELD_IDS.detail}>
            <MarkdownField
              id={PROJECT_FIELD_IDS.detail}
              value={values.detail ?? ""}
              onChange={(v) => setValue("detail", v)}
              rows={8}
              placeholder="# 헤더&#10;&#10;**마크다운 지원** — 상세 페이지 본문에 표시"
            />
          </FieldRow>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldRow label="태그 (CSV)">
              <Input
                value={values.tagsCsv ?? ""}
                onChange={(v) => setValue("tagsCsv", v)}
                placeholder="AI, MCP, Portfolio"
              />
            </FieldRow>

            <FieldRow label="스택 (CSV)">
              <Input
                value={values.stackCsv ?? ""}
                onChange={(v) => setValue("stackCsv", v)}
                placeholder="Next.js, Firebase"
                mono
              />
            </FieldRow>
          </div>

          <FieldRow
            label="링크 (줄별 label|url)"
            error={errors.linksText}
            errorTestId="project-error-links"
          >
            <Textarea
              data-testid="project-input-links"
              value={values.linksText ?? ""}
              onChange={(v) => setValue("linksText", v)}
              rows={3}
              placeholder="GitHub|https://github.com/...&#10;Docs|https://docs.example.com"
              mono
            />
          </FieldRow>
        </FormSection>

        <FormSection
          id="project-form-network"
          label="연결과 미디어"
          description="의존 관계와 화면 자료를 같이 점검합니다."
          isOpen={sectionOpen["project-form-network"]}
          onToggle={() =>
            setSectionOpen((current) => ({
              ...current,
              "project-form-network": !current["project-form-network"],
            }))
          }
          helperBadge="저장 후 추가 가능"
        >
          <FieldRow
            label="의존 프로젝트"
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
            <Hint>이 프로젝트가 연결될 허브·상위 프로젝트를 선택하세요.</Hint>
          </FieldRow>

          <FieldRow label="스크린샷">
            <ScreenshotUploader
              slug={values.slug}
              value={values.screenshots}
              onChange={(next) => setValue("screenshots", next)}
            />
            <Hint>상세 페이지·드로어에서 노출됩니다.</Hint>
          </FieldRow>
        </FormSection>

        <FormSection
          id="project-form-operations"
          label="운영 정보"
          description="일정과 담당, 허브 여부 같은 운영 신호를 마무리합니다."
          isOpen={sectionOpen["project-form-operations"]}
          onToggle={() =>
            setSectionOpen((current) => ({
              ...current,
              "project-form-operations": !current["project-form-operations"],
            }))
          }
          helperBadge="나중에 추가 가능"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldRow
              label="시작일"
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
              label="출시일"
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
            <FieldRow label="담당자">
              <Input
                value={values.owner ?? ""}
                onChange={(v) => setValue("owner", v)}
                placeholder="진안"
              />
            </FieldRow>

            <FieldRow label="아이콘 (이모지)">
              <Input
                value={values.icon ?? ""}
                onChange={(v) => setValue("icon", v)}
                placeholder="🗺️"
              />
            </FieldRow>

            <FieldRow label="진행도 %">
              <Input
                type="number"
                value={
                  values.progress !== undefined ? String(values.progress) : ""
                }
                onChange={(v) =>
                  setValue("progress", v === "" ? undefined : Number(v))
                }
                placeholder="50"
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
              허브 노드로 표시{" "}
              <span className="text-[color:var(--color-text-quaternary)]">
                (인증·에이전트 허브처럼 인디고 강조)
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
                {deleting ? "삭제 중…" : "삭제"}
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
              {mode === "create" ? "생성 후 돌아가기" : "저장 후 돌아가기"}
            </Button>
            <Button
              data-testid="project-cancel"
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={submitting || deleting}
            >
              취소
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
                ? "저장 중…"
                : mode === "create"
                  ? "생성하고 계속 보기"
                  : "저장하고 계속 보기"}
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
                미리보기와 완성도
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
              미리보기
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
              왼쪽 입력이 여기와 공개 화면에 바로 반영됩니다.
            </p>
            {!saveNotice && changePreviewItems.length === 0 ? (
              <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
                저장된 내용과 같습니다. 바로 공개 화면 비교로 넘어가도 됩니다.
              </p>
            ) : null}
          </div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            카드 미리보기
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
              preview
            />
          </div>
          <p className="mt-2 text-[11px] text-[color:var(--color-text-quaternary)]">
            실제 토폴로지에 렌더되는 모습.
          </p>
          <div className="mt-4 rounded-xl border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  완성도
                </p>
                <p className="mt-2 text-[28px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {completenessInsight.score}%
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  공개 상태
                </p>
                <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
                  {isDirty ? "저장 전 입력 중" : freshnessInsight.label}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-[color:var(--color-text-quaternary)]">
              {completenessInsight.completedCount}/{completenessInsight.totalCount}개 항목 입력됨
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
  children,
}: {
  id: string;
  label: string;
  description: string;
  isOpen?: boolean;
  onToggle?: () => void;
  collapsible?: boolean;
  helperBadge?: string;
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
                {isOpen ? "접기" : "펼치기"}
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
