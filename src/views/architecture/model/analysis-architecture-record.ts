import type { AnalysisRun } from '@/entities/analysis-record';
import { parseArchitectureProfile } from '@/entities/architecture-profile';
import { parseArchitectureRecord, type ArchitectureRecord } from '@/entities/architecture-record';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';

/** Reconstruct a dated measurement only against the exact profile captured with that run. */
export function architectureRecordFromAnalysis(run: AnalysisRun): ArchitectureRecord | null {
  if (run.mode !== 'architecture' || !run.profileSnapshot) return null;
  try {
    const parsed = parseFrontmatter(run.profileSnapshot.markdown);
    if (parsed.diagnostics?.length) return null;
    const profile = parseArchitectureProfile(parsed.frontmatter);
    if (profile.slug !== run.scope.profileSlug || profile.projectUid !== run.scope.projectUid) return null;
    const expectedRoles = profile.roles.map((role, index) => ({
      id: role.id, paths: role.paths,
      allowedDependencies: profile.dependencyPolicy === 'lower-only' ? profile.roles.slice(index + 1).map((item) => item.id) : profile.allows[role.id] ?? null,
    }));
    const observation = [...run.observations].reverse().find((item) => {
      const measuredProfile = item.result.profile as Record<string, unknown> | undefined;
      return measuredProfile?.slug === profile.slug && measuredProfile.uid === profile.uid
        && measuredProfile.projectUid === profile.projectUid
        && measuredProfile.dependencyPolicy === profile.dependencyPolicy
        && JSON.stringify(measuredProfile.scopePaths) === JSON.stringify(profile.scopePaths)
        && JSON.stringify(measuredProfile.excludePaths) === JSON.stringify(profile.excludePaths)
        && JSON.stringify(measuredProfile.roles) === JSON.stringify(expectedRoles)
        && JSON.stringify(measuredProfile.dependencyUsages) === JSON.stringify(profile.dependencyUsages);
    });
    if (!observation) return null;
    return parseArchitectureRecord({
      contract: 'architectureRecord:v1',
      profile: { uid: profile.uid, slug: profile.slug, contentHash: run.profileSnapshot.digest },
      brief: observation.result,
    });
  } catch { return null; }
}
