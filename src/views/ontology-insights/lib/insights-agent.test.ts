import { describe, expect, it } from 'vitest';

import {
  buildInsightsAgentPrompt,
  planInsightsAgentPrompt,
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
      handoff: 'add_concept({}) → add_relation({})',
    });
    expect(prompt).toContain('maintenance_plan');
    expect(prompt).not.toContain('add_concept');
    expect(prompt).not.toContain('add_relation');
  });
  it('frames measured tabs as Atlas-only reads', () => {
    const framed = buildInsightsAgentPrompt({
      locale: 'en',
      kind: 'connections',
      handoff: 'query_ontology({operation:"centrality"})',
    });
    expect(framed).toContain('Use only Atlas MCP read tools');
    expect(framed).toContain('Do not call write tools');
    expect(framed).toContain('query_ontology({operation:"centrality"})');
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
      kind: 'growth',
      text: 'Explain freshness',
    })).toEqual({
      action: 'confirm-replace',
      request: { kind: 'growth', text: 'Explain freshness', nonce: 4 },
    });
  });
});

