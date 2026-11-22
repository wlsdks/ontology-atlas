import {
  CONTAINMENT_KEYS,
  kindForContainmentKey,
} from "@/shared/lib/vault-document/containment-keys";
import { looksLikeCodePath } from "@/shared/lib/concept-display/humanize-code-path-title";
import { DANGLING_CHECK_KEYS, toRefTokens } from "./fields";

/**
 * References nothing in the folder answers to (the compiler's `dangling-graph-reference`).
 * The page resolver never resolves less than the compiler, so every name here is also unplaced there.
 */
export function collectDanglingRefs(
  frontmatter: Record<string, unknown> | undefined,
  resolveRef: (token: string) => string | null,
): string[] {
  const dangling = new Set<string>();
  for (const key of DANGLING_CHECK_KEYS) {
    const { tokens } = toRefTokens(frontmatter?.[key]);
    for (const token of tokens) {
      if (key === "elements" && looksLikeCodePath(token)) continue;
      if (resolveRef(token) == null) dangling.add(token);
    }
  }
  return [...dangling];
}

/**
 * Raw code paths from `elements:`, deduplicated. They are evidence, not node references, so they
 * are not links; a misplaced vault ref is kept out by `looksLikeCodePath`.
 */
export function collectCodeLocations(raw: unknown): string[] {
  const codeLocations: string[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(raw)) return codeLocations;
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed) || !looksLikeCodePath(trimmed)) continue;
    seen.add(trimmed);
    codeLocations.push(trimmed);
  }
  return codeLocations;
}

export interface MisfiledRef {
  token: string;
  key: string;
  kind: string;
}

/**
 * Entries in a list named for a kind whose document is another kind; they resolve, so the
 * dangling warning misses them, but the map counts them by their list.
 */
export function collectMisfiledRefs(
  frontmatter: Record<string, unknown> | undefined,
  resolveRef: (token: string) => string | null,
  kindOf: (slug: string) => string | null,
): MisfiledRef[] {
  const misfiled: MisfiledRef[] = [];
  const seen = new Set<string>();
  for (const key of [...CONTAINMENT_KEYS, "domain"]) {
    const expected = key === "domain" ? "domain" : kindForContainmentKey(key);
    const { tokens } = toRefTokens(frontmatter?.[key]);
    for (const token of tokens) {
      if (key === "elements" && looksLikeCodePath(token)) continue;
      const target = resolveRef(token);
      const kind = target ? kindOf(target) : null;
      if (!kind || kind === expected || seen.has(`${key}\0${token}`)) continue;
      seen.add(`${key}\0${token}`);
      misfiled.push({ token, key, kind });
    }
  }
  return misfiled;
}
