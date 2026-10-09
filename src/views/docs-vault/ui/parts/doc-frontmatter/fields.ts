import { looksLikeCodePath } from "@/shared/lib/humanize-code-path-title";

const GRAPH_KEYS = [
  "kind",
  "slug",
  "title",
  // `display_<locale>` keys are listed right after `title` — see `graphFieldKeys`.
  "domain",
  "domains",
  "capabilities",
  "elements",
  "dependencies",
  "relates",
  "describes",
  "broader",
  "relation_notes",
  "category",
  "status",
  "depends_on",
  "relates_to",
  "contains",
  "belongs_to",
  "evidence",
] as const;

/** Per-language names are graph facts: screens show `display_<locale>` before `title`. */
const DISPLAY_NAME_KEY = /^display_[a-z]{2}$/;

export function graphFieldKeys(frontmatter: Record<string, unknown> | undefined): string[] {
  const displayKeys = Object.keys(frontmatter ?? {})
    .filter((key) => DISPLAY_NAME_KEY.test(key))
    .sort();
  const titleAt = GRAPH_KEYS.indexOf("title") + 1;
  return [...GRAPH_KEYS.slice(0, titleAt), ...displayKeys, ...GRAPH_KEYS.slice(titleAt)];
}

export const DANGLING_CHECK_KEYS = [
  "domain",
  "domains",
  "capabilities",
  "elements",
  "dependencies",
  "depends_on",
  "relates",
  "relates_to",
  "contains",
  "describes",
  "broader",
  "belongs_to",
] as const;

export const REFERENCE_KEYS = new Set<string>(DANGLING_CHECK_KEYS);

export function toRefTokens(value: unknown): { tokens: string[]; isArray: boolean } {
  if (Array.isArray(value)) {
    return {
      tokens: value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean),
      isArray: true,
    };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return { tokens: trimmed ? [trimmed] : [], isArray: false };
  }
  return { tokens: [], isArray: false };
}

export function formatValue(value: unknown, key?: string): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return `[${value.join(", ")}]`;
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (key === "relation_notes" && typeof value === "object") return JSON.stringify(value, null, 2);
  return null;
}


export function isNodeReference(key: string, token: string): boolean {
  return key !== "elements" || !looksLikeCodePath(token);
}
