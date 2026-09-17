import { describe, expect, it } from 'vitest';

import { buildServiceRoundBrief } from './service-round-brief';

const base = {
  serviceLabel: 'Confluence',
  connectorName: 'confluence',
  vaultRoot: '/Users/probe/Ontology Atlas/launch',
  knownSources: ['sources/eng-onboarding.md', 'sources/release-plan.md'],
  query: 'pages changed in the last 24 hours in space ENG',
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
    expect(brief).toContain('at most 5 in this pass');
    expect(brief).toContain('fetched_at (2026-09-17T09:00:00Z)');
  });

  it('with no query it only refreshes, and with no compile brief it still names the template', () => {
    const brief = buildServiceRoundBrief({ ...base, query: '   ', compileBrief: null });
    expect(brief).toContain('Do not search for new documents');
    expect(brief).not.toContain('COMPILE RULES HERE');
    expect(brief).toContain('wiki/_template.md');
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
