import type { VaultManifest } from "@/entities/docs-vault";

/**
 * vault 안에서 `targetSlug` 를 가리키는 다른 doc 를 찾는다. MCP `findBacklinks`
 * (mcp/src/vault.mjs) 와 같은 정책 — frontmatter array 키와 마지막 segment
 * 매칭까지 본다.
 *
 * 빌더에서 vault 노드 delete 버튼을 누르기 전에 호출 — 참조하는 노드가
 * 있으면 dangling 위험을 사용자에게 명시하고 confirm 을 한 번 더 받는다.
 */
const NEIGHBOR_KEYS = [
  "capabilities",
  "elements",
  "dependencies",
  "relates",
  "contains",
  "describes",
] as const;

export interface VaultBacklinkMatch {
  slug: string;
  title: string;
  matchedKeys: string[];
}

export function findVaultBacklinks(
  manifest: VaultManifest,
  targetSlug: string,
): VaultBacklinkMatch[] {
  const tail = targetSlug.split("/").pop() ?? targetSlug;
  const matches: VaultBacklinkMatch[] = [];
  for (const doc of manifest.docs) {
    if (doc.slug === targetSlug) continue;
    const matchedKeys: string[] = [];
    for (const key of NEIGHBOR_KEYS) {
      const value = doc.frontmatter[key];
      if (!Array.isArray(value)) continue;
      const hit = value.some(
        (v) =>
          typeof v === "string" &&
          (v === targetSlug || v === tail || v.endsWith(`/${tail}`)),
      );
      if (hit) matchedKeys.push(key);
    }
    if (matchedKeys.length === 0) continue;
    matches.push({
      slug: doc.slug,
      title: doc.title || doc.slug,
      matchedKeys,
    });
  }
  return matches;
}
