import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";

const ONTOLOGY_KINDS = new Set(["project", "domain", "capability", "element"]);
const RELATION_KEYS = [
  "domains",
  "domain",
  "capabilities",
  "elements",
  "dependencies",
  "depends_on",
  "relates",
  "contains",
  "describes",
] as const;

export interface FocusedBuilderManifestResult {
  manifest: VaultManifest;
  focusSlug: string | null;
  isFocused: boolean;
}

export function buildFocusedBuilderManifest(
  manifest: VaultManifest,
  requestedFocusSlug: string | null | undefined,
): FocusedBuilderManifestResult {
  const docs = manifest.docs;
  const focusDoc =
    resolveDoc(docs, requestedFocusSlug) ?? docs.find((doc) => isOntologyDoc(doc));

  if (!focusDoc || !isOntologyDoc(focusDoc)) {
    return { manifest, focusSlug: null, isFocused: false };
  }

  const selected = new Set<string>([focusDoc.slug]);
  const outgoingRefs = relationRefs(focusDoc);
  for (const ref of outgoingRefs) {
    const target = resolveDoc(docs, ref);
    if (target) selected.add(target.slug);
  }

  for (const doc of docs) {
    if (doc.slug === focusDoc.slug) continue;
    const refs = relationRefs(doc);
    if (refs.some((ref) => resolveDoc(docs, ref)?.slug === focusDoc.slug)) {
      selected.add(doc.slug);
    }
  }

  return {
    manifest: {
      ...manifest,
      docs: docs.filter((doc) => selected.has(doc.slug)),
    },
    focusSlug: focusDoc.slug,
    isFocused: true,
  };
}

function isOntologyDoc(doc: VaultDoc): boolean {
  return ONTOLOGY_KINDS.has(String(doc.frontmatter.kind));
}

function relationRefs(doc: VaultDoc): string[] {
  const fm = doc.frontmatter as Record<string, unknown>;
  const refs: string[] = [];
  for (const key of RELATION_KEYS) {
    const value = fm[key];
    if (typeof value === "string" && value.length > 0) {
      refs.push(value);
    } else if (Array.isArray(value)) {
      refs.push(
        ...value.filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        ),
      );
    }
  }
  return refs;
}

function resolveDoc(
  docs: VaultDoc[],
  ref: string | null | undefined,
): VaultDoc | null {
  if (!ref) return null;
  const normalized = normalizeRef(ref);
  return (
    docs.find((doc) => normalizeRef(doc.slug) === normalized) ??
    docs.find((doc) => normalizeRef(tail(doc.slug)) === normalized) ??
    docs.find((doc) => normalizeRef(doc.title) === normalized) ??
    null
  );
}

function tail(value: string): string {
  const parts = value.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? value;
}

function normalizeRef(value: string): string {
  return value.trim().toLowerCase();
}
