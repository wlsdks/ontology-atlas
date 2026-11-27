import type { DiscoverySkipReason } from "@/entities/docs-vault";
import type { SkippedUnlisted, SourceCopyPlan } from "@/features/library";
import type { TauriDropOffer } from "@/shared/lib/vault-folder/native-vault/tauri-library-sources";

/** What a drop or Copy all would copy, before the large-copy question. */
export interface CopyRequest {
  files: number;
  totalBytes: number;
  plan: SourceCopyPlan;
  /** Dropped folders refused whole because they are, or hold, the open folder. */
  holdsOpenFolder: string[];
}

/** Whether a drop brought anything to copy or to explain. */
export function requestHasNews(request: CopyRequest): boolean {
  return request.files > 0 || request.plan.skipped.length > 0 || request.holdsOpenFolder.length > 0;
}

/** Counts past the named skipped files, per reason. */
function unlistedBeyond(
  listed: readonly { reason: DiscoverySkipReason }[],
  counts: Partial<Record<DiscoverySkipReason, number>>,
): SkippedUnlisted {
  const unlisted: SkippedUnlisted = {};
  for (const [reason, count] of Object.entries(counts) as [DiscoverySkipReason, number][]) {
    const rest = count - listed.filter((row) => row.reason === reason).length;
    if (rest > 0) unlisted[reason] = rest;
  }
  return unlisted;
}

/** Rust already walked and offered the drop; the page holds only the strings to send back. */
export function requestFromNativeOffer(rootPath: string, offer: TauriDropOffer): CopyRequest {
  return {
    files: offer.files.length,
    totalBytes: offer.totalBytes,
    holdsOpenFolder: offer.holdsOpenFolder,
    plan: {
      rootPath,
      paths: offer.files.map((file) => file.path),
      skipped: offer.skipped.map((row) => ({ name: row.relativePath, reason: row.reason })),
      skippedUnlisted: unlistedBeyond(offer.skipped, offer.skippedCounts),
      ...(offer.truncated ? { truncatedAt: offer.files.length } : {}),
    },
  };
}
