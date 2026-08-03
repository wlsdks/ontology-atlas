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
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { slugify } from "@/shared/lib/slugify";
import { Button, controlClass } from "@/shared/ui";
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
  PRESERVE_MISSING_TAXONOMY_VALUE,
  type ProjectFormValues,
} from "../model/schema";
import { findProjectPlacement } from "../model/placement";
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
  /**
   * [P-3] true 면 vault 가 로드되지 않은 데모/샘플 모드 — 폼 상단에 ko
   * 안내 배너를 보여주고 모든 제출 버튼을 사전 비활성화한다. 끝까지
   * 채운 뒤에야 영어 raw 에러를 보여주던 이전 흐름(정적 데모 모드에서
   * "Cannot mutate projects…") 대신, 진입 시점에 바로 알려준다.
   */
  writeDisabled?: boolean;
}

// emptyValues는 ProjectForm 내부에서 첫 카테고리/상태 ID로 동적 생성.

// [P-4] zod 스키마(schema.ts)는 useTranslations 훅에 접근할 수 없어 실제
// 영문 문구 대신 "validation.<key>" i18n 키(또는 링크 줄 전용
// "validation.linkLine:<index>:<code>" 포맷)만 issue.message 로 돌려준다.
// 여기서 settings.projectForm 네임스페이스 t() 로 최종 번역한다.
function resolveValidationMessage(
  t: ReturnType<typeof useTranslations>,
  message: string,
): string {
  if (message.startsWith("validation.linkLine:")) {
    const [, index, code] = message.split(":");
    return t(`validation.linkLine.${code}`, { index });
  }
  if (message.startsWith("validation.")) {
    return t(message);
  }
  return message;
}

const FORM_SECTION_IDS = [
  "project-form-basics",
  "project-form-story",
  "project-form-network",
  "project-form-operations",
] as const;

/**
 * 만들기 화면에서 **첫 화면에 보이는** 필수 칸. 나머지는 전부 "더 채우기"
 * 안으로 접힌다 (저장 뒤 편집 화면에서 채워도 되는 것들이다).
 * 검증 에러가 이 집합 밖의 필드를 가리키면 접힌 자리를 먼저 펼친다.
 */
const CREATE_ESSENTIAL_FIELDS = new Set<keyof ProjectFormValues>([
  "name",
  "category",
  "status",
  "description",
]);

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
    const values = mode === "edit"
      ? projectToFormValues(initialProject)
      : duplicateProjectToFormValues(
          initialProject,
          allProjects.map((project) => project.slug),
        );
    return {
      ...values,
      // Duplicate/create는 새 문서라 보이는 taxonomy default를 사용한다.
      // Edit는 원본에 없던 typed fact를 만들지 않도록 form-only preserve 값을
      // 유지하고, 사용자가 직접 고를 때만 실제 id로 바뀐다.
      category:
        mode === "create"
          ? initialProject.category ?? initialCategoryId ?? categoryId
          : initialProject.category ?? PRESERVE_MISSING_TAXONOMY_VALUE,
      status:
        mode === "create"
          ? initialProject.status ?? initialStatusId ?? statusId
          : initialProject.status ?? PRESERVE_MISSING_TAXONOMY_VALUE,
    };
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
  writeDisabled = false,
}: Props) {
  const t = useTranslations("settings.projectForm");
  // 신선도 등급 → 사람 말. 모델은 등급만 돌려주고 문구는 화면이 고른다.
  const tFreshness = useTranslations("projectFreshness");
  const { categories, statuses, getCategory, getStatus, categoryLabel, statusLabel } =
    useTaxonomy();
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
    // 라벨은 taxonomy provider 가 화면 언어에 맞춰 고른다 — 여기서
    // `category.label`(한국어)을 직접 읽으면 영문 화면에 한국어가 샌다.
    const options = categories.map((category) => ({
      value: category.id,
      label: categoryLabel(category.id),
    }));
    if (values.category === PRESERVE_MISSING_TAXONOMY_VALUE) {
      return [
        {
          value: PRESERVE_MISSING_TAXONOMY_VALUE,
          label: t("fields.categoryUnspecified"),
        },
        ...options,
      ];
    }
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
  }, [categories, categoryLabel, getCategory, t, values.category]);
  const statusOptions = useMemo(() => {
    const options = statuses.map((status) => ({
      value: status.id,
      label: statusLabel(status.id),
    }));
    if (values.status === PRESERVE_MISSING_TAXONOMY_VALUE) {
      return [
        {
          value: PRESERVE_MISSING_TAXONOMY_VALUE,
          label: t("fields.statusUnspecified"),
        },
        ...options,
      ];
    }
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
  }, [getStatus, statusLabel, statuses, t, values.status]);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(mode === "edit");
  // 만들기 화면 전용 — 문서 주소(slug)는 이름에서 자동으로 만들어지므로
  // 기본은 캡션 한 줄이고, 직접 정하고 싶은 사람만 입력 칸을 연다.
  const [slugFieldOpen, setSlugFieldOpen] = useState(false);
  // 만들기 화면 전용 — 필수 4칸 밖의 모든 항목은 접어 둔다. 저장한 뒤
  // 편집 화면에서 채워도 되는 것들이라 첫 화면의 높이를 먹을 이유가 없다.
  const [createExtrasOpen, setCreateExtrasOpen] = useState(false);
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
    // 접힌 자리에 있는 필드로 포커스를 보내려면 먼저 펼쳐야 한다 — 접힌 채로
    // 에러만 배너에 뜨면 "고치라는데 그 칸이 어디에도 없는" 막다른 길이 된다.
    if (mode === "create") {
      if (field === "slug") setSlugFieldOpen(true);
      else if (!CREATE_ESSENTIAL_FIELDS.has(field)) setCreateExtrasOpen(true);
    }
    const fieldId = PROJECT_FIELD_IDS[field];
    if (!fieldId || typeof document === "undefined") return;
    window.requestAnimationFrame(() => {
      const target = document.getElementById(fieldId);
      if (target instanceof HTMLElement) {
        target.focus();
        // jsdom 은 scrollIntoView 를 구현하지 않는다 — 포커스 이동이 본론이고
        // 스크롤은 보조라 없으면 조용히 건너뛴다.
        target.scrollIntoView?.({ behavior: "smooth", block: "center" });
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
      category:
        values.category === PRESERVE_MISSING_TAXONOMY_VALUE
          ? undefined
          : values.category,
      status:
        values.status === PRESERVE_MISSING_TAXONOMY_VALUE
          ? undefined
          : values.status,
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
        map[k] = resolveValidationMessage(t, issue.message);
      }
      setErrors(map);
      const firstField = Object.keys(map)[0] as keyof ProjectFormValues | undefined;
      if (firstField) focusField(firstField);
      return;
    }
    const preservesMissingCategory =
      mode === "edit" &&
      !initialProject?.category &&
      parsed.data.category === PRESERVE_MISSING_TAXONOMY_VALUE;
    const preservesMissingStatus =
      mode === "edit" &&
      !initialProject?.status &&
      parsed.data.status === PRESERVE_MISSING_TAXONOMY_VALUE;
    const nextCategory = preservesMissingCategory
      ? undefined
      : getCategory(parsed.data.category);
    const nextStatus = preservesMissingStatus
      ? undefined
      : getStatus(parsed.data.status);
    if (
      (!preservesMissingCategory && !nextCategory) ||
      (!preservesMissingStatus && !nextStatus)
    ) {
      const nextErrors = {
        ...(!preservesMissingCategory && !nextCategory
          ? { category: t("validation.categoryNotFound") }
          : {}),
        ...(!preservesMissingStatus && !nextStatus
          ? { status: t("validation.statusNotFound") }
          : {}),
      };
      setErrors(nextErrors);
      focusField(
        !preservesMissingCategory && !nextCategory ? "category" : "status",
      );
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
      focusField("dependencies");
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
      focusField("dependencies");
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
        focusField("dependencies");
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
      // 신규 생성 또는 사용자가 category를 실제로 바꾼 경우에만 위치를
      // 계산한다. Edit가 원본의 category/position 부재를 조용히 채우지 않는다.
      const initialPos = initialProject?.position;
      const resolvedCategoryId = preservesMissingCategory
        ? undefined
        : parsed.data.category;
      const categoryChanged =
        initialProject?.category !== resolvedCategoryId;
      const position = initialProject
        ? categoryChanged && nextCategory
          ? findProjectPlacement(
              nextCategory,
              latestProjects.filter(
                (project) => project.slug !== initialProject.slug,
              ),
            )
          : initialPos
        : nextCategory
          ? findProjectPlacement(nextCategory, latestProjects)
          : undefined;
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

  // ── 필드 조각 ──────────────────────────────────────────────────────────
  // 만들기/편집 두 화면이 **같은 필드 정의**를 공유한다. 조각을 한 번만
  // 정의하고 화면별로 배치만 다르게 한다 — 필드를 두 벌 적으면 한쪽만
  // 고쳐지는 drift 가 곧바로 시작된다.

  const slugField = (
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
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
              className="text-body text-[color:var(--color-status-danger)]"
            >
              {t("fields.slugDuplicate")}
            </span>
          )}
          {initialProject && (
            <span className="text-body text-[color:var(--color-text-quaternary)]">
              {t("fields.duplicateNotice")}
            </span>
          )}
        </div>
      )}
      <Hint>{t("fields.slugHint")}</Hint>
    </FieldRow>
  );

  const nameField = (
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
  );

  const nameEnField = (
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
  );

  const categoryStatusFields = (
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
        {!getCategory(values.category) &&
          values.category &&
          values.category !== PRESERVE_MISSING_TAXONOMY_VALUE && (
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
        {!getStatus(values.status) &&
          values.status &&
          values.status !== PRESERVE_MISSING_TAXONOMY_VALUE && (
          <Hint>
            <span data-testid="project-missing-status-warning">
              {t("fields.statusMissingWarning")}
            </span>
          </Hint>
        )}
      </FieldRow>
    </div>
  );

  const descriptionField = (
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
  );

  const detailField = (
    <FieldRow label={t("fields.detail")} fieldId={PROJECT_FIELD_IDS.detail}>
      <MarkdownField
        id={PROJECT_FIELD_IDS.detail}
        value={values.detail ?? ""}
        onChange={(v) => setValue("detail", v)}
        rows={8}
        placeholder={t("fields.detailPlaceholder")}
      />
    </FieldRow>
  );

  const tagsStackFields = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FieldRow label={t("fields.tagsCsv")} fieldId={PROJECT_FIELD_IDS.tagsCsv}>
        <Input
          id={PROJECT_FIELD_IDS.tagsCsv}
          name="tagsCsv"
          value={values.tagsCsv ?? ""}
          onChange={(v) => setValue("tagsCsv", v)}
          placeholder={t("fields.tagsPlaceholder")}
        />
      </FieldRow>

      <FieldRow label={t("fields.stackCsv")} fieldId={PROJECT_FIELD_IDS.stackCsv}>
        <Input
          id={PROJECT_FIELD_IDS.stackCsv}
          name="stackCsv"
          value={values.stackCsv ?? ""}
          onChange={(v) => setValue("stackCsv", v)}
          placeholder={t("fields.stackPlaceholder")}
          mono
        />
      </FieldRow>
    </div>
  );

  const linksField = (
    <FieldRow
      label={t("fields.linksText")}
      error={errors.linksText}
      errorTestId="project-error-links"
      fieldId={PROJECT_FIELD_IDS.linksText}
    >
      <Textarea
        id={PROJECT_FIELD_IDS.linksText}
        name="linksText"
        data-testid="project-input-links"
        value={values.linksText ?? ""}
        onChange={(v) => setValue("linksText", v)}
        rows={3}
        placeholder={t("fields.linksPlaceholder")}
        mono
      />
    </FieldRow>
  );

  const dependenciesField = (
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
  );

  const operationsFields = (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldRow
          label={t("fields.startedAt")}
          error={errors.startedAt}
          errorTestId="project-error-startedAt"
          fieldId={PROJECT_FIELD_IDS.startedAt}
        >
          <Input
            id={PROJECT_FIELD_IDS.startedAt}
            name="startedAt"
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
          fieldId={PROJECT_FIELD_IDS.launchedAt}
        >
          <Input
            id={PROJECT_FIELD_IDS.launchedAt}
            name="launchedAt"
            data-testid="project-input-launched-at"
            type="date"
            value={values.launchedAt ?? ""}
            onChange={(v) => setValue("launchedAt", v)}
          />
        </FieldRow>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FieldRow label={t("fields.owner")} fieldId={PROJECT_FIELD_IDS.owner}>
          <Input
            id={PROJECT_FIELD_IDS.owner}
            name="owner"
            value={values.owner ?? ""}
            onChange={(v) => setValue("owner", v)}
            placeholder={t("fields.ownerPlaceholder")}
          />
        </FieldRow>

        <FieldRow label={t("fields.icon")} fieldId={PROJECT_FIELD_IDS.icon}>
          <Input
            id={PROJECT_FIELD_IDS.icon}
            name="icon"
            value={values.icon ?? ""}
            onChange={(v) => setValue("icon", v)}
            placeholder={t("fields.iconPlaceholder")}
          />
        </FieldRow>

        <FieldRow label={t("fields.progress")} fieldId={PROJECT_FIELD_IDS.progress}>
          <Input
            id={PROJECT_FIELD_IDS.progress}
            name="progress"
            type="number"
            value={values.progress !== undefined ? String(values.progress) : ""}
            onChange={(v) => setValue("progress", v === "" ? undefined : Number(v))}
            placeholder={t("fields.progressPlaceholder")}
          />
        </FieldRow>
      </div>

      <label className="flex items-center gap-2 text-body-lg text-[color:var(--color-text-secondary)]">
        <input
          type="checkbox"
          name="isHub"
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
    </>
  );

  const writeDisabledBanner = writeDisabled ? (
    <div
      role="status"
      data-testid="project-write-disabled-banner"
      className="rounded-panel border border-[color:var(--color-amber-source-a34)] bg-[color:var(--color-amber-source-a08)] px-4 py-3 text-body-lg text-[color:var(--color-text-secondary)]"
    >
      {t("validation.demoModeBanner")}
    </div>
  ) : null;

  const errorBanner =
    globalError || Object.keys(errors).length > 0 ? (
      <div
        role="alert"
        className="rounded-card border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-3 py-3 text-body-lg text-[color:var(--color-status-danger)]"
      >
        <p className="font-[var(--font-weight-signature)]">
          {globalError ?? t("validation.globalErrorBanner")}
        </p>
        {Object.keys(errors).length > 0 ? (
          <>
            <ul className="mt-2 space-y-1 text-body">
              {Object.entries(errors).slice(0, 4).map(([field, message]) => (
                <li key={field}>{message}</li>
              ))}
            </ul>
            {Object.keys(errors).length > 4 ? (
              <p className="mt-2 font-mono text-label uppercase tracking-[0.14em]">
                {t("validation.globalErrorMore", { count: Object.keys(errors).length - 4 })}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    ) : null;

  const primarySubmitLabel = submitting
    ? t("actions.saving")
    : mode === "create"
      ? t("actions.createAndContinue")
      : t("actions.saveAndContinue");
  const returnSubmitLabel =
    mode === "create" ? t("actions.createAndReturn") : t("actions.saveAndReturn");

  // 액션 줄 — **폼 뒤**에 온다. 예전에는 같은 3개 버튼이 폼 맨 위에도 있어서
  // 만들기 화면에서는 입력 칸을 하나도 보기 전에 "생성하고 계속 보기" 를
  // 누를 수 있었다 (누를 수 있는데 누를 게 없는 상태).
  const actionRow = (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--color-overlay-2)] pt-6">
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
        data-testid="project-save-return"
        type="submit"
        data-submit-behavior="return"
        variant="outline"
        onClick={() => {
          submitBehaviorRef.current = "return";
        }}
        disabled={submitting || deleting || writeDisabled}
      >
        {returnSubmitLabel}
      </Button>
      <Button
        data-testid="project-save"
        type="submit"
        data-submit-behavior="stay"
        onClick={() => {
          submitBehaviorRef.current = "stay";
        }}
        disabled={submitting || deleting || writeDisabled}
      >
        {primarySubmitLabel}
      </Button>
    </div>
  );

  // ── 만들기 화면 폼 ─────────────────────────────────────────────────────
  // 필수 4칸(이름 · 카테고리 · 상태 · 짧은 설명)만 펼쳐 두고, 나머지는 전부
  // "더 채우기" 안으로 접는다. 문서 주소(slug)는 이름에서 자동 생성되므로
  // 칸이 아니라 이름 밑의 캡션 한 줄로 내려간다.
  const createForm = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {writeDisabledBanner}
      {errorBanner}

      <div className="flex flex-col gap-5 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-5 shadow-[inset_0_1px_0_var(--color-overlay-2)] md:px-5">
        <div className="flex flex-col gap-2">
          {nameField}
          {slugFieldOpen ? (
            slugField
          ) : (
            /* 캡션은 한 줄로 고정한다 (치수 규칙성). 긴 이름에서 나온 긴
               주소가 줄을 늘리면 그 카드 높이가 글자 수로 정해진다 — 값은
               잘리고 전체 값은 "직접 정하기" 를 열면 입력 칸에서 보인다. */
            <div className="flex items-baseline gap-2 overflow-hidden">
              <span className="shrink-0 text-label text-[color:var(--color-text-quaternary)]">
                {t("fields.slugAutoLabel")}
              </span>
              <span
                title={values.slug || undefined}
                className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-tertiary)]"
              >
                {values.slug || t("fields.slugAutoPending")}
              </span>
              <button
                type="button"
                data-testid="project-slug-disclosure"
                onClick={() => setSlugFieldOpen(true)}
                /* 문장(캡션 행) 속 컨트롤 — `inline` 을 켜야 `min-h-11` 이
                   줄 상자를 밀지 않는다(WCAG 2.5.8 인라인 면제). */
                className={controlClass({
                  shape: "link",
                  tone: "accent",
                  inline: true,
                  className:
                    "shrink-0 underline underline-offset-2 hover:text-[color:var(--color-text-primary)]",
                })}
              >
                {t("fields.slugEditToggle")}
              </button>
            </div>
          )}
        </div>
        {categoryStatusFields}
        {descriptionField}
      </div>

      <CreateExtras
        open={createExtrasOpen}
        onToggle={() => setCreateExtrasOpen((open) => !open)}
        label={t("sections.extrasLabel")}
        caption={t("sections.extrasCaption")}
        openLabel={t("sections.expandLabel")}
        closeLabel={t("sections.collapseLabel")}
      >
        <ExtrasGroup label={t("sections.storyLabel")}>
          {nameEnField}
          {detailField}
          {tagsStackFields}
          {linksField}
        </ExtrasGroup>
        <ExtrasGroup label={t("sections.networkLabel")}>{dependenciesField}</ExtrasGroup>
        <ExtrasGroup label={t("sections.operationsLabel")}>{operationsFields}</ExtrasGroup>
      </CreateExtras>

      {actionRow}
    </form>
  );

  // ── 편집 화면 폼 ───────────────────────────────────────────────────────
  // 편집은 "이미 있는 걸 보강하기" 라 요구가 다르다 — 모든 항목이 펼쳐진
  // 채로 보이고, 긴 폼을 스크롤하는 동안 저장이 따라오도록 상단 저장 줄이
  // sticky 로 붙는다. 구조는 재구성 전과 동일(회귀 금지).
  const editForm = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {writeDisabledBanner}

      <div className="sticky top-4 z-10 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-4 shadow-[inset_0_1px_0_var(--color-overlay-2),0_18px_36px_var(--color-shadow-a22)]">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                {editorModeLabel}
              </p>
              <p className="mt-2 hidden text-body-lg text-[color:var(--color-text-secondary)] md:block">
                {t("actions.headerHelpEdit")}
              </p>
              <span
                className={cn(
                  "mt-2 inline-flex rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] md:hidden",
                  isDirty
                    ? "border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a12)] text-[color:var(--color-text-primary)]"
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
                  ? "border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a12)] text-[color:var(--color-text-primary)]"
                  : "border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]",
              )}
            >
              {dirtyStateLabel}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:justify-end">
            {/* Delete is intentionally absent from this save-cluster — the
                destructive action lives isolated in the dashed danger row at
                the form's foot (design charter + Apple HIG: keep destructive
                actions away from frequently-tapped buttons). */}
            <Button
              data-testid="project-save-top"
              type="submit"
              data-submit-behavior="stay"
              onClick={() => {
                submitBehaviorRef.current = "stay";
              }}
              disabled={submitting || deleting || writeDisabled}
              className="order-last col-span-2 justify-center md:order-none md:col-span-1 md:min-w-[88px]"
            >
              {primarySubmitLabel}
            </Button>
            <Button
              data-testid="project-save-return-top"
              type="submit"
              data-submit-behavior="return"
              variant="outline"
              onClick={() => {
                submitBehaviorRef.current = "return";
              }}
              disabled={submitting || deleting || writeDisabled}
              className="justify-center"
            >
              {returnSubmitLabel}
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

      <div className="rounded-panel border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-4 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {t("sections.navLabel")}
          </p>
          <nav className="flex flex-wrap gap-2">
            {FORM_SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-full border border-[color:var(--color-divider)] px-3 py-1.5 text-body text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:text-[color:var(--color-text-primary)]"
              >
                {section.label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      {errorBanner}

      <FormSection
        id="project-form-basics"
        label={t("sections.basicsLabel")}
        description={t("sections.basicsDetailedDescription")}
        collapsible={false}
        collapseLabel={t("sections.collapseLabel")}
        expandLabel={t("sections.expandLabel")}
      >
        {slugField}
        {nameField}
        {nameEnField}
        {categoryStatusFields}
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
        helperBadge={t("sections.helperBadgeDescriptionRequired")}
        collapseLabel={t("sections.collapseLabel")}
        expandLabel={t("sections.expandLabel")}
      >
        {descriptionField}
        {detailField}
        {tagsStackFields}
        {linksField}
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
        {dependenciesField}
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
        {operationsFields}
      </FormSection>

      {actionRow}

      {/* Edit-only danger row — dashed border is the category signal
          (design charter: category distinction is a border style, not a
          color). This is the single, isolated home for deletion: the
          destructive action is deliberately kept out of the sticky
          save-cluster (Apple HIG — keep destructive actions away from
          frequently-tapped buttons) and given the consequence caption a
          compact bar has no room for. */}
      {onDelete && (
        <div
          data-testid="project-danger-row"
          className="mt-4 flex items-center gap-3 rounded-card border border-dashed border-[color:var(--color-border-strong)] px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-body text-[color:var(--color-text-secondary)]">
              {t("actions.deleteRowTitle")}
            </p>
            <p className="mt-0.5 text-label text-[color:var(--color-text-quaternary)]">
              {t("actions.deleteRowCaption")}
            </p>
          </div>
          <Button
            data-testid="project-delete"
            type="button"
            variant="outline"
            onClick={handleDelete}
            disabled={deleting || submitting}
            className="ml-auto shrink-0 border-[color:var(--color-border-soft)] text-[color:var(--color-status-danger)] hover:border-[color:var(--color-danger-a50)]"
          >
            {deleting ? t("actions.deleting") : t("actions.delete")}
          </Button>
        </div>
      )}
    </form>
  );

  return (
    // 640px 중앙 폼 컬럼 (docs/prototypes/project-forms-final.html · RATIO-SYSTEM.md
    // --page-col-form). 우측 260px 는 라이브 미리보기 — 이제 필수 칸이 첫 화면에
    // 있으므로 "왼쪽 입력" 과 "오른쪽 반영" 이 실제로 같은 화면에서 마주 본다.
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[640px_260px]">
      {mode === "create" ? createForm : editForm}

      {/* 모바일에서는 폼 입력을 먼저 보이게 하고, 데스크톱에서만 우측 보조 패널로 유지한다. */}
      <aside className="order-none">
        <div className="lg:sticky lg:top-10">
          <button
            type="button"
            data-testid="project-mobile-preview-toggle"
            onClick={() => setMobilePreviewOpen((open) => !open)}
            className="mb-4 flex w-full items-center justify-between rounded-panel border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-4 py-4 text-left lg:hidden"
          >
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                {t("preview.toggleEyebrow")}
              </p>
              <p className="mt-2 text-body-lg text-[color:var(--color-text-secondary)]">
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
            {/* 편집 화면에서만 "무엇이 바뀌는지" 를 문장으로 덧댄다. 만들기
                화면은 저장된 이전 상태가 없어서 그 문장이 항상 같은 말을
                반복했고, "왼쪽 입력이 여기 반영됩니다" 는 정작 그 왼쪽 입력이
                화면 밖에 있을 때 쓰던 변명이었다. 지금은 마주 보므로 뺀다. */}
            {(mode === "edit" || saveNotice) && (
              <div className="mb-4 rounded-panel border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t("preview.previewEyebrow")}
                </p>
                {saveNotice ? (
                  <div
                    role="status"
                    className="mt-3 rounded-card border border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a10)] px-4 py-3 text-body-lg text-[color:var(--color-indigo-accent)]"
                  >
                    {saveNotice}
                  </div>
                ) : null}
                {mode === "edit" ? (
                  <>
                    <p className="mt-3 text-body-lg text-[color:var(--color-text-secondary)]">
                      {t("preview.liveHint")}
                    </p>
                    {!saveNotice && changePreviewItems.length === 0 ? (
                      <p className="mt-2 text-body-lg text-[color:var(--color-text-secondary)]">
                        {t("preview.noChanges")}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            )}
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {t("preview.cardEyebrow")}
            </p>
            <div className="flex items-start justify-center rounded-panel border border-[color:var(--color-overlay-2)] bg-[color:var(--color-canvas)] p-6">
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
                descriptionEmptyLabel={t("preview.cardDescriptionEmpty")}
                preview
              />
            </div>
            <p className="mt-2 text-label text-[color:var(--color-text-quaternary)]">
              {t("preview.cardCaption")}
            </p>
            <div className="mt-4 rounded-panel border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] p-4">
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
                  <p className="mt-2 text-body-lg text-[color:var(--color-text-secondary)]">
                    {isDirty ? t("preview.publicStatusDirty") : tFreshness(freshnessInsight.level)}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-label text-[color:var(--color-text-quaternary)]">
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

/**
 * 만들기 화면의 "더 채우기" 자리. 필수 4칸 밖의 모든 항목이 여기 접혀 있고,
 * 펼치는 건 사용자다. 닫힌 높이를 고정하지 않는 대신 캡션 한 줄이 늘 같은
 * 자리에서 "저장한 뒤에 채워도 된다" 를 말한다 — 이 화면의 유일한 안내다.
 */
function CreateExtras({
  open,
  onToggle,
  label,
  caption,
  openLabel,
  closeLabel,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  caption: string;
  openLabel: string;
  closeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-4 md:px-5">
      <button
        type="button"
        data-testid="project-create-extras-toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="project-create-extras"
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-body-lg text-[color:var(--color-text-primary)]">{label}</span>
          <span className="mt-1 block text-label text-[color:var(--color-text-quaternary)]">
            {caption}
          </span>
        </span>
        <span className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-divider)] px-3 text-body text-[color:var(--color-text-secondary)]">
          {open ? closeLabel : openLabel}
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={cn("transition-transform", open && "rotate-180")}
          />
        </span>
      </button>
      {open ? (
        <div
          id="project-create-extras"
          className="mt-5 flex flex-col gap-6 border-t border-[color:var(--color-divider)] pt-5"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** "더 채우기" 안의 소그룹 — 각인 라벨 + 헤어라인, 접기 버튼 없음. */
function ExtrasGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-tertiary)]">
          {label}
        </p>
        <span aria-hidden className="h-px flex-1 bg-[color:var(--color-divider)]" />
      </div>
      {children}
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
          className="text-body text-[color:var(--color-status-danger)]"
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
      className="scroll-mt-28 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-5 shadow-[inset_0_1px_0_var(--color-overlay-2)] md:px-5"
    >
      <div className="mb-5">
        {/* engraved section label — mono uppercase caption + hairline
            continuation (docs/prototypes/project-forms-final.html `.slabel`) */}
        <div className="mb-3 flex items-center gap-2.5">
          <p
            id={headingId}
            className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-tertiary)]"
          >
            {label}
          </p>
          <span aria-hidden className="h-px flex-1 bg-[color:var(--color-divider)]" />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-body-lg text-[color:var(--color-text-secondary)]">
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
                className={controlClass({
                  shape: "pill",
                  size: "lg",
                  tone: "secondary",
                  className:
                    "gap-2 hover:border-[color:var(--color-indigo-a34)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]",
                })}
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
        "h-9 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 text-body-lg text-[color:var(--color-text-primary)]",
        "shadow-[inset_0_1px_2px_var(--color-shadow-a35)]",
        "placeholder:text-[color:var(--color-text-quaternary)]",
        "hover:border-[color:var(--color-border-strong)]",
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
        "rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2 text-body-lg text-[color:var(--color-text-primary)]",
        "shadow-[inset_0_1px_2px_var(--color-shadow-a35)]",
        "placeholder:text-[color:var(--color-text-quaternary)]",
        "hover:border-[color:var(--color-border-strong)]",
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
        "h-9 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 text-body-lg text-[color:var(--color-text-primary)]",
        "shadow-[inset_0_1px_2px_var(--color-shadow-a35)]",
        "hover:border-[color:var(--color-border-strong)]",
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
