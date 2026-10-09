import { expect, it } from 'vitest';
import type { KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { scopedFlowRequest, selectedAnalysisRequest } from './selected-analysis-request';
import type { VaultDoc } from '@/entities/docs-vault';
const node = { id: 'capability:pay', title: 'Pay', kind: 'capability', agentSlug: 'capabilities/pay', evidenceIds: ['capabilities/pay'] } as KnowledgeGraphNode;
const base = { locale: 'en', vaultName: 'atlas', nodes: [node], edge: null, documents: [] };
it('copies sample facts without instructions to query the active vault', () => {
  const result = selectedAnalysisRequest({ ...base, mode: 'static', vaultRoot: '/unrelated' });
  expect(result.runnable).toBe(false);
  expect(result.text).not.toContain('get_concept(');
  expect(result.text).not.toContain('connection_info(');
  expect(result.text).not.toContain('node "$ATLAS"');
  expect(result.text).toContain('bundled Atlas example');
});
it('binds a native read to its exact root and supplies real read-only MCP and CLI calls', () => {
  const result = selectedAnalysisRequest({ ...base, mode: 'local', vaultRoot: "/repo/owner's atlas" });
  expect(result.runnable).toBe(true);
  expect(result.text.indexOf('connection_info({})')).toBeLessThan(result.text.indexOf('get_concept('));
  expect(result.text).toContain('"body":"full"');
  expect(result.text).toContain("node \"$ATLAS/cli/src/index.mjs\" node 'capabilities/pay' '/repo/owner'\\''s atlas' --types depends_on --json");
});
it('does not launch from a browser folder whose absolute identity is unknown', () => {
  const result = selectedAnalysisRequest({ ...base, mode: 'local', vaultRoot: null });
  expect(result.runnable).toBe(false);
  expect(result.text).toContain('matching folder name alone is insufficient');
});

it('keeps local explanation reads within the same root, identity and twelve-concept boundary', () => {
  const doc = { slug: 'store', frontmatter: { kind: 'project', uid: 'expected-identity' } } as unknown as VaultDoc;
  const text = scopedFlowRequest({ request: 'Explain recorded flow with citations.', vaultRoot: '/selected/atlas', vaultName: 'atlas', documents: [doc] });
  expect(text.indexOf('connection_info')).toBeLessThan(text.indexOf('expected-identity'));
  expect(text.indexOf('expected-identity')).toBeLessThan(text.indexOf('Explain recorded flow'));
  expect(text).toContain('/selected/atlas');
  expect(text).toContain('12 full concepts');
  expect(text).not.toContain('node "$ATLAS"');
});

it('halts an explanation before concept reads when only a browser folder name is known', () => {
  const text = scopedFlowRequest({ request: 'Explain recorded flow.', vaultRoot: null, vaultName: 'same-name', documents: [] });
  expect(text).toContain('do not read concepts yet');
  expect(text).toContain('A matching name is insufficient');
  expect(text).not.toContain('vaultRoot exactly matches');
});
