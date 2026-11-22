import type { ReferrerListMove } from "@/entities/docs-vault";
import type { ReferrerRewriteReport } from "@/entities/vault-session";

export interface KindChangeReceipt {
  tone: "success" | "warning";
  moved: { slugs: string[]; from: ReferrerListMove["from"] | null; to: ReferrerListMove["to"] | null };
  kept: { slugs: string[] };
  failed: { slugs: string[] };
}

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
      from: froms.size === 1 ? moves[0].from : null,
      to: moves[0]?.to ?? null,
    },
    kept: { slugs: kept.map((row) => row.slug) },
    failed: { slugs: failed.map((row) => row.slug) },
  };
}
