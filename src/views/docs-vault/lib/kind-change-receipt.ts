import type { ReferrerListMove } from "@/entities/docs-vault";
import type { ReferrerRewriteReport } from "@/entities/vault-session";

/**
 * What a kind change did to the documents that list the changed one, grouped for the sentence
 * after Save: moved, kept in a list for another kind, or not written.
 */
export interface KindChangeReceipt {
  tone: "success" | "warning";
  moved: { slugs: string[]; from: ReferrerListMove["from"] | null; to: ReferrerListMove["to"] | null };
  /** Their pages flag the entry. */
  kept: { slugs: string[] };
  /** Left as they were. */
  failed: { slugs: string[] };
}

/** Null when no referrer lists the document by kind. */
export function kindChangeReceipt(report: ReferrerRewriteReport): KindChangeReceipt | null {
  const moved = report.referrers.filter((row) => !row.failed && row.moved.length > 0);
  const kept = report.referrers.filter((row) => !row.failed && row.kept.length > 0);
  const failed = report.referrers.filter((row) => row.failed);
  if (moved.length === 0 && kept.length === 0 && failed.length === 0) return null;
  const moves = moved.flatMap((row) => row.moved);
  const froms = new Set(moves.map((move) => move.from));
  return {
    tone: kept.length > 0 || failed.length > 0 ? "warning" : "success",
    moved: {
      slugs: moved.map((row) => row.slug),
      // Null when the entries left different lists.
      from: froms.size === 1 ? moves[0].from : null,
      to: moves[0]?.to ?? null,
    },
    kept: { slugs: kept.map((row) => row.slug) },
    failed: { slugs: failed.map((row) => row.slug) },
  };
}
