import { describe, expect, it } from 'vitest';

import {
  buildInsightsAgentPrompt,
  planInsightsAgentPrompt,
  resolveInsightsAgentRoute,
  selectInsightsAgentRuntimes,
  type InsightsAgentPrefill,
} from './insights-agent';

const current: InsightsAgentPrefill = {
  kind: 'connections',
  text: 'Explain connections',
  nonce: 3,
};

describe('Analysis shared ACP planner', () => {
  it('keeps the new unmatched tab explanation free of write handoff commands', () => {
    const prompt = buildInsightsAgentPrompt({
      locale: 'en', kind: 'unmatched',
      handoff: 'add_concept({}) → add_relation({})', flowRequest: '',
    });
    expect(prompt).toContain('maintenance_plan');
    expect(prompt).not.toContain('add_concept');
    expect(prompt).not.toContain('add_relation');
  });
  it('frames measured tabs as Atlas-only reads while Flow keeps its exact request', () => {
    const framed = buildInsightsAgentPrompt({
      locale: 'en',
      kind: 'connections',
      handoff: 'query_ontology({operation:"centrality"})',
      flowRequest: 'exact flow request',
    });
    expect(framed).toContain('Use only Atlas MCP read tools');
    expect(framed).toContain('Do not call write tools');
    expect(framed).toContain('query_ontology({operation:"centrality"})');
    expect(buildInsightsAgentPrompt({
      locale: 'ko',
      kind: 'flow',
      handoff: 'short flow handoff',
      flowRequest: 'exact flow request',
    })).toBe('exact flow request');
  });

  it('keeps the current request when the same tab action is pressed again', () => {
    expect(planInsightsAgentPrompt({
      current,
      draftPresent: true,
      kind: 'connections',
      text: 'Explain connections',
    })).toEqual({ action: 'open-current', request: current });
  });

  it('seats a new tab request only into an empty composer', () => {
    expect(planInsightsAgentPrompt({
      current,
      draftPresent: false,
      kind: 'boundaries',
      text: 'Explain boundaries',
    })).toEqual({
      action: 'seat',
      request: { kind: 'boundaries', text: 'Explain boundaries', nonce: 4 },
    });
  });

  it('requires a second explicit choice before replacing a non-empty draft', () => {
    expect(planInsightsAgentPrompt({
      current,
      draftPresent: true,
      kind: 'freshness',
      text: 'Explain freshness',
    })).toEqual({
      action: 'confirm-replace',
      request: { kind: 'freshness', text: 'Explain freshness', nonce: 4 },
    });
  });
});

describe('Analysis ACP admission', () => {
  it('keeps only verified, ready runtimes with a measured guard', () => {
    const base = {
      description: '', website: null, license: null, icon: null, brandInk: null,
      launchKind: 'npx' as const, cliPath: '/bin/tool', adapterPath: '/bin/adapter',
      adapterPackage: null,
    };
    expect(selectInsightsAgentRuntimes([
      { ...base, id: 'claude-acp', label: 'Claude', verified: true, state: 'ready', isolated: true },
      { ...base, id: 'unknown', label: 'Unknown', verified: true, state: 'ready', isolated: false },
      { ...base, id: 'not-ready', label: 'Wait', verified: true, state: 'cli-missing', isolated: true },
    ])).toEqual([{ id: 'claude-acp', label: 'Claude' }]);
  });

  it('degrades to clipboard until every installed-app prerequisite is observed', () => {
    const input = {
      bridgeAvailable: true,
      runtimeCheckComplete: true,
      serverCheckComplete: true,
      runtime: { id: 'claude-acp', label: 'Claude' },
      vaultRoot: '/vault',
      serverReady: true,
    };
    expect(resolveInsightsAgentRoute(input)).toBe('agent');
    expect(resolveInsightsAgentRoute({ ...input, bridgeAvailable: false })).toBe('clipboard');
    expect(resolveInsightsAgentRoute({ ...input, runtimeCheckComplete: false })).toBe('checking');
    expect(resolveInsightsAgentRoute({ ...input, vaultRoot: null })).toBe('clipboard');
  });
});
