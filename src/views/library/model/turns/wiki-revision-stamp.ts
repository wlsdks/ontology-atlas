import { isWikiPage, type VaultDoc } from "@/entities/docs-vault";
import { isWikiFurnitureSlug } from "@/shared/lib/library/wiki-page-schema";

/** Each content page's modified time by slug, so a turn's writes show as the stamps that moved. */
export function wikiRevisionStamp(docs: readonly VaultDoc[]): Map<string, number> {
  return new Map(
    docs
      .filter((doc) => isWikiPage(doc) && !isWikiFurnitureSlug(doc.slug))
      .map((doc) => [doc.slug, doc.mtime ?? 0] as const),
  );
}
