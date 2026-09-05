import { describe, expect, it } from 'vitest';
import { analysisGraphDigest, analysisGraphFromInsight, architectureResultRows, buildAnalysisRun, fullBodyResultRows, type AnalysisCaptureContext } from './analysis-capture';
import type { KnowledgeProjectInsight } from '@/entities/knowledge-graph';
import { VAULT_MCP_SERVER_NAME } from './vault-mcp-server';
import type { AcpEvent, AcpTurnCompletion } from './use-acp-session';

const slug = 'capabilities/refund';
const frontmatter = { kind: 'capability', title: 'Refund' };
const body = '\nRefund a settled purchase within 30 days.\n';
const row = { slug, frontmatter, body, isNode: true, bodyInfo: { mode: 'full', truncated: false, returnedChars: body.length } };
const context: AnalysisCaptureContext = {
  mode: 'meaning', surface: 'map', scope: { projectSlug: null, projectUid: null, targetSlugs: [slug], profileSlug: null },
  handle: null, writable: false,
  fileHandles: new Map([[slug, { getFile: async () => ({ size: 100, text: async () => `---\nkind: capability\ntitle: Refund\n---\n${body}` }) } as FileSystemFileHandle]]),
  graph: { nodes: [{ id: slug, title: 'Refund', kind: 'capability' }], edges: [] }, sourceFingerprint: null, profileHash: null,
};
const finding = { category: 'boundary', title: 'Check eligibility', detail: 'The proposed rule omits the time limit.', targetSlugs: [slug], evidenceSlugs: [slug], suggestedAction: 'Read the policy.' };
const answer = `A question, not an approved change.\n\n\`\`\`atlas-analysis\n${JSON.stringify({ findings: [finding] })}\n\`\`\``;
const read = (output: unknown = row, status = 'completed'): AcpEvent => ({ kind: 'tool', id: 'read-1', title: `mcp__${VAULT_MCP_SERVER_NAME}__get_concept`, toolKind: 'read', status, rawInput: { slug, body: 'full' }, rawOutput: output });
function completion(events: AcpEvent[], text = answer): AcpTurnCompletion {
  return { runtimeId: 'test', sessionId: 'session-1', vaultRoot: '/captured-vault', userEventId: 'user-1', text: 'Review meaning', startedAt: '2026-09-05T07:59:00.000Z', endedAt: '2026-09-05T08:00:00.000Z', outcome: 'completed', stopReason: 'end_turn', events: [{ kind: 'user', id: 'user-1', text: 'Review meaning' }, ...events, { kind: 'agent', id: 'answer-1', text }] };
}
async function build(value: AcpTurnCompletion, ctx = context) {
  return buildAnalysisRun(value, ctx, { id: '95f4ba81-41f7-483b-a617-2a4be815be32', graphHash: await analysisGraphDigest(ctx.graph) });
}

describe('analysis evidence capture', () => {
  it('links a parent version only to the exact explicit follow-up request', async () => {
    const turn = completion([read()]);
    const parent = '24e7bc39-013c-46e7-86b2-ff2f3aeab58c';
    const ctx = { ...context, parentRunId: parent, parentRequestText: turn.text };
    expect((await build(turn, ctx)).request.parentRunId).toBe(parent);
    expect((await build({ ...turn, text: 'A separate question.' }, ctx)).request.parentRunId).toBeNull();
  });
  it('converts real map identities to portable agent slugs before qualifying evidence', async () => {
    const insight = { nodes: [{ id: 'capability:refund', title: 'Refund', kind: 'capability', agentSlug: slug, hasOwnDocument: true, evidenceIds: [slug] }], edges: [{ from: 'capability:refund', to: 'capability:refund', type: 'related_to' }] } as unknown as KnowledgeProjectInsight;
    const graph = analysisGraphFromInsight(insight);
    expect(graph.nodes[0].id).toBe(slug);
    expect(graph.nodes[0].id).not.toBe(insight.nodes[0].id);
    expect(graph.edges[0].from).toBe(slug);
    expect((await build(completion([read()]), { ...context, graph })).qualification.status).toBe('grounded');
  });
  it('accepts actual nested full-body results and retains the exact answer', async () => {
    const result = await build(completion([read({ content: [{ type: 'text', text: JSON.stringify(row) }] })]));
    expect(result.answer).toBe(answer);
    expect(result.evidence[0].body).toBe(body);
    expect(result.qualification).toEqual({ status: 'grounded', reasons: [] });
  });
  it('retains an untyped profile document as evidence without promoting it to a map concept', async () => {
    const profileSlug = 'architecture/refund-core';
    const profileRow = { ...row, slug: profileSlug, isNode: false, frontmatter: { title: 'Refund architecture' } };
    const profileFile = { getFile: async () => ({ size: 100, text: async () => `---\ntitle: Refund architecture\n---\n${body}` }) } as FileSystemFileHandle;
    const ctx = { ...context, fileHandles: new Map([...context.fileHandles, [profileSlug, profileFile]]) };
    const result = await build(completion([read(profileRow)], answer.replaceAll(slug, profileSlug)), ctx);
    expect(result.evidence[0].kind).toBe('untyped-document');
    expect(result.evidence[0].slug).toBe(profileSlug);
    expect(result.qualification.reasons).toContain('finding-1:target_not_in_graph');
    expect(ctx.graph.nodes).toHaveLength(1);
  });
  it('does not promote input-only, failed, truncated or error-envelope reads', async () => {
    for (const event of [read(undefined, 'failed'), read({ ...row, bodyInfo: { ...row.bodyInfo, truncated: true } }), read({ isError: true, result: row }), { ...read(), rawOutput: undefined }]) {
      const result = await build(completion([event]));
      expect(result.evidence).toHaveLength(0);
      expect(result.qualification.status).toBe('unverified');
    }
    expect(fullBodyResultRows({ ...row, bodyInfo: { ...row.bodyInfo, returnedChars: 0 } })).toEqual([]);
  });
  it('keeps arbitrary and malformed answers instead of dropping the run', async () => {
    for (const raw of ['An ordinary answer without JSON.', '```atlas-analysis\n{broken}\n```']) {
      const result = await build(completion([read()], raw));
      expect(result.answer).toBe(raw);
      expect(result.qualification.status).toBe('unverified');
      expect(result.findings).toEqual([]);
    }
  });
  it('rejects invented endpoints and detects body-only changes during the turn', async () => {
    const changed = { ...context, fileHandles: new Map() };
    const result = await build(completion([read()], answer.replaceAll('capabilities/refund', 'capabilities/invented')), changed);
    expect(result.qualification.reasons).toContain('finding-1:target_not_in_graph');
    expect(result.qualification.reasons).toContain(`document_unavailable:${slug}`);
    const stale = await build(completion([read({ ...row, body: 'old', bodyInfo: { ...row.bodyInfo, returnedChars: 3 } })]));
    expect(stale.qualification.reasons).toContain(`document_changed:${slug}`);
  });
  it('does not claim an Atlas-only or complete judgment after source reads or cancellation', async () => {
    const result = await build({ ...completion([read(), { kind: 'tool', id: 'shell', title: 'Bash', toolKind: 'execute', status: 'completed' }]), outcome: 'cancelled' });
    expect(result.sourceAccess).toBe('unproven');
    expect(result.qualification.reasons).toContain('turn_incomplete');
    expect(result.qualification.reasons).toContain('atlas_only_unproven');
  });
  it('retains measured architecture facts and unknown coverage, without machine roots', async () => {
    const measurement = { contract: 'architectureBrief:v1', profile: { slug: 'refund-core' }, measured: { at: '2026-09-05T08:00:00.000Z', source: { kind: 'git', revision: 'abc1234', dirty: true } }, conformance: { status: 'unknown', violationCount: 2, source: { rootPath: '/private/source', filesScanned: 9 }, unknown: { unmappedEdges: 3 } } };
    const output = { content: [{ type: 'text', text: JSON.stringify(measurement) }] };
    const stripped = architectureResultRows(output)[0];
    expect(JSON.stringify(stripped)).not.toContain('/private/source');
    expect(stripped.conformance).toMatchObject({ violationCount: 2, unknown: { unmappedEdges: 3 } });
    const event: AcpEvent = { kind: 'tool', id: 'inspect-1', title: `mcp__${VAULT_MCP_SERVER_NAME}__inspect_architecture`, toolKind: 'read', status: 'completed', rawInput: { profileSlug: 'refund-core', rootPath: '/private/source' }, rawOutput: output };
    const result = await build(completion([read(), event]), { ...context, mode: 'architecture', scope: { ...context.scope, profileSlug: 'refund-core' }, sourceRoot: '/private/source' });
    expect(result.observations[0].result).toEqual(stripped);
    expect(result.sourceAccess).toBe('source-included');
    expect(result.qualification.status).toBe('unverified');
    expect(result.qualification.reasons).toContain('sourceFingerprint_unrecorded');
  });
});
