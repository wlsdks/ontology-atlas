import { expect, it } from 'vitest';
import type { KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { selectedAnalysisRequest } from './selected-analysis-request';
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
