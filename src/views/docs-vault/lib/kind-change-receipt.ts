import type { ReferrerListMove } from "@/entities/docs-vault";
import type { ReferrerRewriteReport } from "@/entities/vault-session";

/**
 * What a kind change did to the documents that list the changed one, grouped for the sentence
 * the person reads after Save.
 *
 * **Why it exists** (2026-09-26, map-edit review). A reclassify rewrote other people's files —
 * a domain's `capabilities:` entry became an `elements:` entry — and the screen said nothing
 * about it: the form closed and the page moved. The receipt names each referrer and what its
 * list now says, and it is honest about the two outcomes that are not a clean move: an entry kept
 * in its old list because the referrer's kind has no list for the new kind, and a referrer that
 * could not be written at all.
 */
export interface KindChangeReceipt {
  tone: "success" | "warning";
  /** Referrers whose entry moved into the list for the new kind. */
  moved: { slugs: string[]; from: ReferrerListMove["from"] | null; to: ReferrerListMove["to"] | null };
  /** Referrers that still hold the entry in a list for another kind; their pages flag it. */
  kept: { slugs: string[] };
  /** Referrers the rewrite could not write; they are as they were. */
  failed: { slugs: string[] };
}

/** Null when no referrer lists the document by kind — the move hint already said the rest. */
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
      // One list the entries all left, or null when they left different ones.
      from: froms.size === 1 ? moves[0].from : null,
      to: moves[0]?.to ?? null,
    },
    kept: { slugs: kept.map((row) => row.slug) },
    failed: { slugs: failed.map((row) => row.slug) },
  };
}
