import { describe, expect, it } from 'vitest';

import { parseSearch } from '@/shared/lib/navigation/atlas-search';

import { insightsTarget, mcpTarget, ontologyEditTarget, ontologyTarget } from './retired-address-targets';

const at = (target: typeof ontologyTarget, query: string) => target(parseSearch(query));

describe('the retired /ontology address', () => {
  it('opens the map with the index expanded, naming the concept in its canonical form', () => {
    expect(at(ontologyTarget, '')).toBe('/topology/?index=expanded');
    expect(at(ontologyTarget, 'node=capability:mcp-server')).toBe('/topology/?index=expanded&p=capability%3Amcp-server');
    expect(at(ontologyTarget, 'node=capabilities/mcp-server')).toBe('/topology/?index=expanded&p=capability%3Amcp-server');
    expect(at(ontologyTarget, 'node=mcp-server')).toBe('/topology/?index=expanded&p=mcp-server');
  });

  it('drops the retired return marker and review id and keeps the request kind the map validates', () => {
    expect(at(ontologyTarget, 'node=capability:mcp-server&via=insights:do-next&review=neglected-hub:capability:mcp-server')).toBe(
      '/topology/?index=expanded&p=capability%3Amcp-server',
    );
    expect(at(ontologyTarget, 'ask=business-flow&via=insights:flow')).toBe('/topology/?index=expanded&ask=business-flow');
    expect(at(ontologyTarget, 'node=capability:mcp-server&ask=missing-definition')).toBe(
      '/topology/?index=expanded&p=capability%3Amcp-server&ask=missing-definition',
    );
  });
});

describe('the retired /ontology/edit address', () => {
  it('opens the map, the contextual editor of a node, or the create form', () => {
    expect(at(ontologyEditTarget, '')).toBe('/topology/');
    expect(at(ontologyEditTarget, 'node=capability:mcp-server')).toBe('/topology/?p=capability%3Amcp-server&workbench=edit');
    expect(at(ontologyEditTarget, 'node=capabilities/mcp-server')).toBe('/topology/?p=capability%3Amcp-server&workbench=edit');
    expect(at(ontologyEditTarget, 'mode=create')).toBe('/topology/?workbench=create');
  });

  it('keeps the edge being edited and drops the retired return marker', () => {
    expect(at(ontologyEditTarget, 'node=capability:a&edit=dependsOn:capability:b&via=insights:do-next&review=row-1')).toBe(
      '/topology/?p=capability%3Aa&workbench=edit&edit=dependsOn%3Acapability%3Ab',
    );
  });
});

describe('the retired /ontology/insights address', () => {
  it('keeps the harness target and every other flag', () => {
    expect(at(insightsTarget, 'tab=harness')).toBe('/architecture/?view=overview');
    expect(at(insightsTarget, 'tab=harness&guides=off&focus=main')).toBe('/architecture/?guides=off&focus=main&view=overview');
  });

  it('sends the library section to the Wiki tab of the Library', () => {
    expect(at(insightsTarget, 'tab=library')).toBe('/library/?tab=wiki');
    expect(at(insightsTarget, 'tab=library&review=analysis:capability:x')).toBe('/library/?tab=wiki');
  });

  it('selects the concept a review or node address named, in its canonical form', () => {
    expect(at(insightsTarget, 'review=analysis:capability:mcp-server')).toBe('/topology/?p=capability%3Amcp-server');
    expect(at(insightsTarget, 'tab=connections&review=analysis:domain:views')).toBe('/topology/?p=domain%3Aviews');
    expect(at(insightsTarget, 'node=capabilities/mcp-server')).toBe('/topology/?p=capability%3Amcp-server');
    expect(at(insightsTarget, 'node=%ED%95%9C%EA%B8%80')).toBe('/topology/?p=%ED%95%9C%EA%B8%80');
  });

  it('opens the map for every other tab, a relation review, a return marker or no query', () => {
    for (const query of ['', 'tab=brief', 'tab=do-next&guides=off', 'tab=connections&review=relation:edge-1', 'via=insights:do-next', 'review=analysis:', 'node=']) {
      expect(at(insightsTarget, query)).toBe('/topology/');
    }
  });
});

describe('the retired /mcp address', () => {
  it('lands on the MCP tab of Agents', () => {
    expect(at(mcpTarget, '')).toBe('/agents/?tab=mcp');
    expect(at(mcpTarget, 'tab=share')).toBe('/agents/?tab=mcp');
  });

  it('carries its own section into the tab and keeps every other parameter', () => {
    expect(at(mcpTarget, 'tab=connectors')).toBe('/agents/?tab=mcp&mcp=connectors');
    expect(at(mcpTarget, 'tab=connectors&install=abc&focus=main')).toBe('/agents/?tab=mcp&mcp=connectors&install=abc&focus=main');
  });
});
