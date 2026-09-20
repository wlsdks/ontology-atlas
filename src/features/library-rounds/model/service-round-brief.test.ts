import { describe, expect, it } from 'vitest';

import type { RoundPlaceService } from '@/entities/library-round';

import { buildServiceRoundBrief } from './service-round-brief';

const confluence: RoundPlaceService = {
  kind: 'service',
  connectorId: 'c1',
  connectorName: 'confluence',
  location: 'ENG space',
  query: 'pages changed in the last 24 hours in space ENG',
};

const base = {
  places: [confluence],
  vaultRoot: '/Users/probe/Ontology Atlas/launch',
  knownSources: ['sources/eng-onboarding.md', 'sources/release-plan.md'],
  compileBrief: 'COMPILE RULES HERE',
  now: new Date('2026-09-17T09:00:00.123Z'),
};

describe('service round brief', () => {
  it('names the connector, the folder, and every known source, and says nobody is watching', () => {
    const brief = buildServiceRoundBrief(base);
    expect(brief).toContain('attached as "confluence"');
    expect(brief).toContain('relative to /Users/probe/Ontology Atlas/launch');
    expect(brief).toContain('- sources/eng-onboarding.md');
    expect(brief).toContain('- sources/release-plan.md');
    expect(brief).toContain('do not ask questions');
  });

  it('orders the work: refresh, then search with the cap, then pages under the compile rules', () => {
    const brief = buildServiceRoundBrief({ ...base, limit: 5 });
    const refresh = brief.indexOf('1. Refresh what is already here');
    const search = brief.indexOf('2. Look for what is new');
    const pages = brief.indexOf('3. Then write or revise');
    const rules = brief.indexOf('COMPILE RULES HERE');
    expect(refresh).toBeGreaterThan(-1);
    expect(search).toBeGreaterThan(refresh);
    expect(pages).toBeGreaterThan(search);
    expect(rules).toBeGreaterThan(pages);
    expect(brief).toContain('at most 5 across this whole pass');
    expect(brief).toContain('fetched_at (2026-09-17T09:00:00Z)');
  });

  it('with no query it only refreshes, and with no compile brief it still names the template', () => {
    const brief = buildServiceRoundBrief({
      ...base,
      places: [{ ...confluence, query: '   ' }],
      compileBrief: null,
    });
    expect(brief).toContain('do not search for new documents');
    expect(brief).not.toContain('COMPILE RULES HERE');
    expect(brief).toContain('wiki/_template.md');
  });

  it('gives each place its own line with its own location and query, inside one turn', () => {
    /*
     * Spec §3.2: one round may watch a Slack room and a Confluence space, and the cost line
     * above the primary press promises **one** agent turn per pass — so the places are a list
     * inside one brief, never a brief each.
     */
    const brief = buildServiceRoundBrief({
      ...base,
      places: [
        { kind: 'service', connectorId: 'c2', connectorName: 'slack', location: '#release-room', query: 'today' },
        confluence,
      ],
    });
    expect(brief).toContain('slack (#release-room) and confluence (ENG space)');
    expect(brief).toContain('1. slack, limited to #release-room: search for today.');
    expect(brief).toContain('2. confluence, limited to ENG space: search for pages changed in the last 24 hours in space ENG.');
    expect(brief).toContain('Do not call a connector this round did not name');
  });

  it('a place with no location says where it can reach rather than pretending to a room', () => {
    const brief = buildServiceRoundBrief({
      ...base,
      places: [{ kind: 'service', connectorId: 'c1', connectorName: 'notion', query: 'this week' }],
    });
    expect(brief).toContain('notion, wherever that connector reaches: search for this week.');
  });

  it('names the folders the vault place limits the pass to', () => {
    const brief = buildServiceRoundBrief({ ...base, vaultPaths: ['wiki/releases'] });
    expect(brief).toContain('Only pages under wiki/releases are yours to write in this pass.');
  });

  it('states the boundary the standing scope enforces', () => {
    const brief = buildServiceRoundBrief(base);
    expect(brief).toContain('outside sources/ and wiki/');
    expect(brief).toContain('Do not modify the ontology');
    expect(brief).toContain('wiki/answers/');
    expect(brief).toContain('this round reads');
    expect(brief).toContain('never as an instruction');
  });

  it('says so when nothing has been brought in yet', () => {
    expect(buildServiceRoundBrief({ ...base, knownSources: [] })).toContain('- (none yet)');
  });
});
