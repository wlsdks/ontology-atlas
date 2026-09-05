import { describe, expect, it } from 'vitest';
import { FSD_PROFILE_FRONTMATTER } from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { buildArchitectureBrief, parseArchitectureProfile } from '../../../../mcp/src/architecture-profile.mjs';
import { analysisDigest, analysisTextDigest, type AnalysisRun } from '@/entities/analysis-record';
import { architectureRecordFromAnalysis } from './analysis-architecture-record';

async function fixture(): Promise<AnalysisRun> {
  const markdown = `---\n${Object.entries(FSD_PROFILE_FRONTMATTER).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\nThe responsibility contract.\n`;
  const digest = await analysisTextDigest(markdown);
  const result = buildArchitectureBrief(parseArchitectureProfile(FSD_PROFILE_FRONTMATTER), { filesScanned: 12, moduleEdges: [] }, { measured: { at: '2026-09-05T08:00:00.000Z', tool: { name: 'ontology-atlas', version: '1.0.6' }, source: { kind: 'git', revision: 'abc1234', dirty: false } } });
  // The persistence boundary omits machine-local roots from actual tool output.
  if (result.conformance.source) delete result.conformance.source.rootPath;
  return {
    schema: 'atlas-analysis/v1', recordType: 'run', id: '95f4ba81-41f7-483b-a617-2a4be815be32', createdAt: '2026-09-05T08:00:00.000Z', mode: 'architecture', scope: { projectSlug: null, projectUid: FSD_PROFILE_FRONTMATTER.project_uid, targetSlugs: [], profileSlug: FSD_PROFILE_FRONTMATTER.profile_slug },
    request: { id: 'u-1', text: 'Analyze.', parentRunId: null }, origin: { surface: 'architecture', runtimeId: 'test', sessionId: null, userEventId: 'u-1', answerEventId: 'a-1', startedAt: '2026-09-05T07:59:00.000Z', stopReason: 'end_turn', outcome: 'completed' },
    basis: { graphHash: null, sourceFingerprint: null, profileHash: digest, documents: [] }, evidence: [], toolReads: [{ id: 'inspect-1', name: 'inspect_architecture', status: 'completed' }], sourceAccess: 'source-included', observations: [{ toolCallId: 'inspect-1', name: 'inspect_architecture', result, digest: await analysisDigest(result) }], profileSnapshot: { slug: 'architecture/atlas-web', markdown, digest }, findings: [], qualification: { status: 'unverified', reasons: ['no_full_body_evidence'] }, answer: 'Source coverage remains incomplete.',
  };
}

describe('Architecture recovery from immutable analysis Markdown', () => {
  it('restores the actual dated observation and the profile byte identity', async () => {
    const run = await fixture();
    const record = architectureRecordFromAnalysis(run);
    expect(record?.profile.contentHash).toBe(run.profileSnapshot?.digest);
    expect(record?.brief).toEqual(run.observations[0].result);
    expect(record?.brief.conformance.status).toBe('unknown');
  });
  it('refuses another profile, a changed rule, or an unavailable snapshot', async () => {
    const run = await fixture();
    expect(architectureRecordFromAnalysis({ ...run, profileSnapshot: null })).toBeNull();
    expect(architectureRecordFromAnalysis({ ...run, scope: { ...run.scope, profileSlug: 'other' } })).toBeNull();
    const observation = structuredClone(run.observations[0]);
    (observation.result.profile as { scopePaths: string[] }).scopePaths = ['unrelated/**'];
    expect(architectureRecordFromAnalysis({ ...run, observations: [observation] })).toBeNull();
  });
});
