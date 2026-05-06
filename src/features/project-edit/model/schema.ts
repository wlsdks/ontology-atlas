import { z } from "zod";
import type { Project, ProjectInput } from "@/entities/project";

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime());
}

function parseDateOnly(value?: string) {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateInputValue(date?: Date) {
  if (!date) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLinkLine(line: string) {
  const [labelPart, urlPart, ...rest] = line.split("|");
  const label = labelPart?.trim() ?? "";
  const url = urlPart?.trim() ?? "";

  if (rest.length > 0 || !label || !url) {
    return {
      ok: false as const,
      message: "Each link must be in the form `label|https://...`",
    };
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        ok: false as const,
        message: "Link URL must start with http:// or https://",
      };
    }
  } catch {
    return {
      ok: false as const,
      message: "Enter a valid URL",
    };
  }

  return {
    ok: true as const,
    value: { label, url },
  };
}

export function parseLinksText(
  text?: string,
): Array<{ label: string; url: string }> {
  if (!text) return [];

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseLinkLine(line))
    .filter(
      (
        parsed,
      ): parsed is { ok: true; value: { label: string; url: string } } =>
        parsed.ok,
    )
    .map((parsed) => parsed.value);
}

export const projectFormSchema = z
  .object({
    slug: z
      .string()
      .min(1, "Slug is required")
      .regex(/^[\p{L}\p{N}-]+$/u, "Letters, numbers, and hyphens only"),
    name: z.string().min(1, "Name is required"),
    nameEn: z.string().optional(),
    // 동적 카테고리/상태 — taxonomy default 또는 미래 vault frontmatter 기반
    // taxonomy 로 확장될 수 있어 free string. 존재 여부 검증은 호출자
    // (ProjectForm) 가 taxonomy 와 대조해 수행.
    category: z.string().min(1, "Category is required"),
    status: z.string().min(1, "Status is required"),
    description: z.string().min(1, "Description is required"),
    detail: z.string().optional(),
    tagsCsv: z.string().optional(),
    stackCsv: z.string().optional(),
    linksText: z.string().optional(),
    dependencies: z.array(z.string()).default([]),
    screenshots: z.array(z.string()).default([]),
    owner: z.string().optional(),
    icon: z.string().optional(),
    startedAt: z.string().optional(),
    launchedAt: z.string().optional(),
    progress: z.number().min(0).max(100).optional(),
    isHub: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.linksText) {
      for (const [index, rawLine] of values.linksText.split("\n").entries()) {
        const line = rawLine.trim();
        if (!line) continue;

        const parsed = parseLinkLine(line);
        if (!parsed.ok) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["linksText"],
            message: `Link ${index + 1}: ${parsed.message}`,
          });
          return;
        }
      }
    }

    if (values.startedAt && !isValidDateOnly(values.startedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startedAt"],
        message: "Invalid start date format",
      });
    }

    if (values.launchedAt && !isValidDateOnly(values.launchedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["launchedAt"],
        message: "Invalid launch date format",
      });
    }

    if (
      values.startedAt &&
      values.launchedAt &&
      isValidDateOnly(values.startedAt) &&
      isValidDateOnly(values.launchedAt) &&
      parseDateOnly(values.launchedAt)!.getTime() <
        parseDateOnly(values.startedAt)!.getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["launchedAt"],
        message: "Launch date cannot be earlier than start date",
      });
    }
  });

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

function nextDuplicateSlug(
  baseSlug: string,
  existingSlugs: Set<string>,
): string {
  let attempt = `${baseSlug}-copy`;
  let index = 2;
  while (existingSlugs.has(attempt)) {
    attempt = `${baseSlug}-copy-${index}`;
    index += 1;
  }
  return attempt;
}

export function projectToFormValues(project: Project): ProjectFormValues {
  return {
    slug: project.slug,
    name: project.name,
    nameEn: project.nameEn ?? "",
    // R15 — Form 은 사용자 vault frontmatter 작성 도구라 form-local default 적용.
    category: project.category ?? "uncategorized",
    status: project.status ?? "active",
    description: project.description,
    detail: project.detail ?? "",
    tagsCsv: project.tags.join(", "),
    stackCsv: project.stack.join(", "),
    linksText: project.links.map((l) => `${l.label}|${l.url}`).join("\n"),
    dependencies: [...project.dependencies],
    screenshots: [...project.screenshots],
    owner: project.owner ?? "",
    icon: project.icon ?? "",
    startedAt: toDateInputValue(project.timeline?.startedAt),
    launchedAt: toDateInputValue(project.timeline?.launchedAt),
    progress: project.progress,
    isHub: project.isHub ?? false,
  };
}

export function duplicateProjectToFormValues(
  project: Project,
  existingSlugs: Iterable<string>,
): ProjectFormValues {
  return {
    ...projectToFormValues(project),
    slug: nextDuplicateSlug(project.slug, new Set(existingSlugs)),
  };
}

/**
 * 폼 값을 ProjectInput으로 변환 — position은 호출자가 주입해야 함.
 */
export function formValuesToProjectInput(
  values: ProjectFormValues,
  position: { x: number; y: number },
): ProjectInput {
  const splitCsv = (s?: string): string[] =>
    s
      ? s
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      : [];

  return {
    slug: values.slug,
    name: values.name,
    nameEn: values.nameEn || undefined,
    category: values.category,
    status: values.status,
    description: values.description,
    detail: values.detail || undefined,
    tags: splitCsv(values.tagsCsv),
    stack: splitCsv(values.stackCsv),
    links: parseLinksText(values.linksText),
    dependencies: values.dependencies,
    screenshots: values.screenshots,
    owner: values.owner || undefined,
    icon: values.icon || undefined,
    timeline: {
      startedAt: parseDateOnly(values.startedAt),
      launchedAt: parseDateOnly(values.launchedAt),
    },
    progress: values.progress,
    isHub: values.isHub,
    position,
  };
}
