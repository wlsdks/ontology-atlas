import { routing } from "@/i18n/routing";
import type { DocFrontmatterPatch } from "../../model/use-doc-write-actions";

export const EDITABLE_KINDS = ["project", "domain", "capability", "element", "document"] as const;
type EditableKind = (typeof EDITABLE_KINDS)[number];

export function isEditableKind(kind: string): kind is EditableKind {
  return (EDITABLE_KINDS as readonly string[]).includes(kind);
}

/**
 * The languages the quick patch asks a name for: the reader's, those the document already names,
 * then the en/ko companion; only locales the app routes.
 */
export function nameLocalesFor(
  current: string,
  frontmatter: Record<string, unknown> | undefined,
  locales: readonly string[] = routing.locales,
): string[] {
  const named = locales.filter((code) => frontmatter?.[`display_${code}`] !== undefined);
  const companion = current === "en" ? "ko" : "en";
  const ordered = [current, ...named, companion].filter((code) => locales.includes(code));
  return [...new Set(ordered)];
}

export interface QuickPatchValues {
  kind: string;
  domain: string;
  title: string;
  /** Display name by locale code. */
  names: Record<string, string>;
}

/**
 * Only what the form changed. An emptied domain or name is sent as null so the writer removes the
 * key; an emptied title or kind is left as it was.
 */
export function buildFrontmatterPatch(
  draft: QuickPatchValues,
  current: Omit<QuickPatchValues, "kind"> & { kind: string | null },
  nameLocales: readonly string[],
): DocFrontmatterPatch {
  const patch: DocFrontmatterPatch = {};
  if (draft.kind && draft.kind !== current.kind) patch.kind = draft.kind;
  if (draft.title.trim() && draft.title.trim() !== current.title) {
    patch.title = draft.title.trim();
  }
  const nextDomain = draft.domain.trim();
  if (nextDomain !== current.domain) {
    patch.domain = nextDomain || null;
  }
  for (const code of nameLocales) {
    const nextName = (draft.names[code] ?? "").trim();
    if (nextName !== current.names[code]) patch[`display_${code}`] = nextName || null;
  }
  return patch;
}
