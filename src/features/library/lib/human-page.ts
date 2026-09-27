import { WIKI_DIR } from "@/shared/lib/wiki-page-schema";

/** A hand-started page with the full contract shape, `created_by: human` and empty `sources:`. */
export function humanPageSlug(title: string): string {
  const words = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join("-");
  return `${WIKI_DIR}/${words || "page"}`;
}

export function buildHumanPage({ title, now }: { title: string; now: Date }): { slug: string; path: string; text: string } {
  const slug = humanPageSlug(title);
  const text = [
    "---",
    `title: ${JSON.stringify(title.trim())}`,
    "created_by: human",
    `compiled_at: ${now.toISOString().replace(/\.\d{3}Z$/, "Z")}`,
    "sources: []",
    "source_hash: {}",
    "status: draft",
    `summary: ${JSON.stringify(title.trim())}`,
    "---",
    "",
    "## Summary",
    "",
    "## Facts",
    "",
    "## Decisions",
    "",
    "## Open questions",
    "",
    "## Not in sources",
    "",
  ].join("\n");
  return { slug, path: `${slug}.md`, text };
}
