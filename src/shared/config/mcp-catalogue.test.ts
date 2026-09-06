import { describe, expect, it } from 'vitest';

import {
  MCP_CATALOGUE,
  MCP_CATALOGUE_CAPTURED_AT,
  catalogueDraft,
  searchCatalogue,
  variantRuns,
  variantSecrets,
  variantVariables,
  type CatalogueEntry,
} from './mcp-catalogue';
import { serializeConnectorState } from '@/shared/lib/connector-record';

/**
 * The catalogue is committed data a person can change by hand between generator runs, and it
 * feeds a form whose output goes into somebody's folder. So these check the **shape of the data**
 * as hard as they check the code that reads it.
 */

const entryOf = (id: string): CatalogueEntry => {
  const entry = MCP_CATALOGUE.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`no catalogue entry: ${id}`);
  return entry;
};

describe('the committed catalogue', () => {
  it('says how big it is and when it was captured', () => {
    // The screen states both, and a missing date would let a stale list pass as current.
    expect(MCP_CATALOGUE_CAPTURED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(MCP_CATALOGUE.length).toBeGreaterThan(0);
  });

  it('carries provenance on every entry and every variant', () => {
    /*
     * A curated row is one person's transcription of a vendor page; a registry row is the
     * publisher's own metadata. Drawing them the same would borrow the registry's authority for
     * a line one of us typed (PO steward, 2026-09-07), so the distinction has to exist in the
     * data before it can exist on screen.
     */
    for (const entry of MCP_CATALOGUE) {
      expect(entry.docsUrl).toMatch(/^https:\/\//);
      expect(entry.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.variants.length).toBeGreaterThan(0);
      for (const variant of entry.variants) {
        expect(['registry', 'curated']).toContain(variant.source);
      }
    }
  });

  it('holds no popularity, ranking or endorsement field', () => {
    /*
     * A list with a count beside each row is a marketplace, which `.claude/rules/forbidden.md`
     * refuses. This is cheap to check and expensive to notice by eye once somebody adds one
     * "helpful" field.
     */
    const text = JSON.stringify(MCP_CATALOGUE).toLowerCase();
    for (const forbidden of ['downloads', 'stars', 'popularity', 'rating', 'recommended', 'rank']) {
      expect(text).not.toContain(`"${forbidden}"`);
    }
  });

  it('never carries a credential value, only a name and where it is issued', () => {
    for (const entry of MCP_CATALOGUE) {
      for (const variant of entry.variants) {
        for (const variable of variantVariables(variant)) {
          expect(variable).not.toHaveProperty('value');
          expect(variable).not.toHaveProperty('default');
          if (variable.issueUrl) expect(variable.issueUrl).toMatch(/^https:\/\//);
        }
      }
    }
  });

  it('keeps the three services the owner asked about, each with the shape it really has', () => {
    /*
     * 2026-09-07: *"how do I connect Notion, Atlassian, GitHub?"* — the answer is different for
     * each, which is precisely why they are the first three rows and why the two shapes are kept
     * apart in the type.
     */
    const notion = entryOf('notion');
    expect(notion.variants.map((variant) => variant.kind).sort()).toEqual(['local', 'remote']);

    // Atlassian is cloud-only; there is no independent local server, and inventing one would be
    // a row that cannot work (`docs/benchmark/MCP-ONE-CLICK-2026-09-07.md` §6).
    expect(entryOf('atlassian').variants.every((variant) => variant.kind === 'remote')).toBe(true);

    const github = entryOf('github');
    expect(github.variants.some((variant) => variant.kind === 'local')).toBe(true);
    expect(
      github.variants.some(
        (variant) => variant.kind === 'remote' && variant.url.endsWith('/readonly'),
      ),
    ).toBe(true);
  });
});

describe('choosing an entry', () => {
  it('an OAuth address asks for nothing, which is what makes it the one-press case', () => {
    const atlassian = entryOf('atlassian');
    const variant = atlassian.variants[0];
    expect(variantSecrets(variant)).toHaveLength(0);
    const draft = catalogueDraft(atlassian, variant, {
      id: 'c1',
      capturedAt: MCP_CATALOGUE_CAPTURED_AT,
      secretRef: (id, name) => `${id}:${name}`,
    });
    expect(draft).toMatchObject({ transport: 'http', url: 'https://mcp.atlassian.com/v2/mcp' });
    expect(draft.headers).toEqual([]);
    // Written down is not switched on.
    expect(draft.enabled).toBe(false);
  });

  it('a local entry asks for exactly one token, and it goes to the keychain, not the file', () => {
    const notion = entryOf('notion');
    const local = notion.variants.find((variant) => variant.kind === 'local')!;
    expect(variantSecrets(local).map((variable) => variable.name)).toEqual(['NOTION_TOKEN']);

    const draft = catalogueDraft(notion, local, {
      id: 'c1',
      capturedAt: MCP_CATALOGUE_CAPTURED_AT,
      runtimePath: '/opt/homebrew/bin/npx',
      secretRef: (id, name) => `${id}:${name}`,
    });
    expect(draft.command).toBe('/opt/homebrew/bin/npx');
    expect(draft.env).toEqual([{ name: 'NOTION_TOKEN', secretRef: 'c1:NOTION_TOKEN' }]);
    // And the writer accepts it — a reference is exactly what may go into the folder's file.
    expect(serializeConnectorState({ connectors: [draft] })).toContain('secretRef');
    expect(serializeConnectorState({ connectors: [draft] })).not.toContain('ntn_');
  });

  it('records which entry and which capture produced the row', () => {
    /*
     * Without this, `connectors.json` cannot tell a catalogue suggestion apart from something
     * the person typed, and the next agent reading the folder has no way to ask where a row came
     * from (PO steward, 2026-09-07 — the condition that made this a stored field rather than a
     * screen-only label).
     */
    const notion = entryOf('notion');
    const draft = catalogueDraft(notion, notion.variants[0], {
      id: 'c1',
      capturedAt: '2026-09-07',
      secretRef: (id, name) => `${id}:${name}`,
    });
    expect(draft.origin).toBe('catalogue:notion@2026-09-07');
  });

  it('writes the bare runtime name when this machine could not resolve one, and does not guess', () => {
    // A guessed path defers the failure to the moment somebody asks a question, and
    // `connectorProblems` already has a sentence for a non-absolute command.
    const notion = entryOf('notion');
    const local = notion.variants.find((variant) => variant.kind === 'local')!;
    const draft = catalogueDraft(notion, local, {
      id: 'c1',
      capturedAt: MCP_CATALOGUE_CAPTURED_AT,
      runtimePath: null,
      secretRef: (id, name) => `${id}:${name}`,
    });
    expect(draft.command).toBe('npx');
  });
});

describe('search', () => {
  it('finds a service by its name, by what it is for, and by the address itself', () => {
    expect(searchCatalogue(MCP_CATALOGUE, 'notion').map((entry) => entry.id)).toEqual(['notion']);
    expect(searchCatalogue(MCP_CATALOGUE, 'jira').map((entry) => entry.id)).toEqual(['atlassian']);
    // Somebody who half-remembers the URL has to find it too.
    expect(searchCatalogue(MCP_CATALOGUE, 'githubcopilot').map((entry) => entry.id)).toEqual([
      'github',
    ]);
    // And by the variable name, which is often the only thing written in a colleague's message.
    expect(searchCatalogue(MCP_CATALOGUE, 'GITHUB_PERSONAL').map((entry) => entry.id)).toEqual([
      'github',
    ]);
  });

  it('an empty query is every entry, in curation order', () => {
    expect(searchCatalogue(MCP_CATALOGUE, '  ').map((entry) => entry.id)).toEqual(
      MCP_CATALOGUE.map((entry) => entry.id),
    );
  });
});

describe('what one line says will run', () => {
  it('is the address for a hosted entry and the resolved command for a local one', () => {
    const github = entryOf('github');
    const remote = github.variants.find((variant) => variant.kind === 'remote')!;
    const local = github.variants.find((variant) => variant.kind === 'local')!;
    expect(variantRuns(remote)).toBe('https://api.githubcopilot.com/mcp/');
    expect(variantRuns(local, '/usr/local/bin/docker')).toContain('/usr/local/bin/docker run');
  });
});
