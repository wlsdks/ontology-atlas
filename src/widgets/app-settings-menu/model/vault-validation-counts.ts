import type { VaultManifest } from '@/entities/docs-vault';
import { summarizeVaultValidation } from '@/shared/lib/validate-vault-document';

type ValidationCounts = { errorCount: number; warningCount: number } | null;

const countsByManifest = new WeakMap<VaultManifest, ValidationCounts>();

export function vaultValidationCounts(manifest: VaultManifest): ValidationCounts {
  if (countsByManifest.has(manifest)) return countsByManifest.get(manifest) ?? null;
  const summary = summarizeVaultValidation(
    manifest.docs.map((doc) => ({ slug: doc.slug, frontmatter: doc.frontmatter })),
  );
  const counts =
    summary.errorCount === 0 && summary.warningCount === 0
      ? null
      : { errorCount: summary.errorCount, warningCount: summary.warningCount };
  countsByManifest.set(manifest, counts);
  return counts;
}
