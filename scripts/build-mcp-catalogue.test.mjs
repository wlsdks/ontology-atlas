import assert from 'node:assert/strict';
import test from 'node:test';

import { CURATION, build, registryArgs, registryEnv, render } from './build-mcp-catalogue.mjs';

/**
 * The generator writes a file that ends up in front of a person deciding what to run on their own
 * computer, so what is tested here is the translation from somebody else's schema into ours — the
 * step where a wrong guess becomes a committed line nobody reads again.
 */

test('builds an npx line from the package identifier and nothing else', () => {
  assert.deepEqual(
    registryArgs({ registryType: 'npm', identifier: '@notionhq/notion-mcp-server' }),
    ['-y', '@notionhq/notion-mcp-server'],
  );
});

test('leaves a container entry alone rather than assembling a command line out of fragments', () => {
  /*
   * ⚠️ **Measured against GitHub's own registry entry, 2026-09-07.** Its `runtimeArguments` is a
   * single `-e GITHUB_PERSONAL_ACCESS_TOKEN={token}`, so reading it as an argv line produced
   * `docker -e GITHUB_PERSONAL_ACCESS_TOKEN={token}` — no `run`, no `--rm`, no image, and a
   * literal `{token}` where a value belongs. An OCI entry publishes fragments, not a command;
   * turning them into one is guesswork, and the curated line a person checked against the
   * vendor's page beats a guess. An empty array is how that line survives.
   */
  assert.deepEqual(
    registryArgs({
      registryType: 'oci',
      identifier: 'ghcr.io/github/github-mcp-server:1.0.4',
      runtimeArguments: [
        { type: 'named', name: '-e', value: 'GITHUB_PERSONAL_ACCESS_TOKEN={token}' },
      ],
    }),
    [],
  );
});

test('drops a templated argument value instead of writing the placeholder down', () => {
  assert.deepEqual(
    registryArgs({
      registryType: 'npm',
      identifier: 'pkg',
      packageArguments: [
        { type: 'named', name: '--port', value: '{port}' },
        { type: 'positional', value: 'stdio' },
      ],
    }),
    ['-y', 'pkg', '--port', 'stdio'],
  );
});

test('takes the publisher own isSecret rather than guessing from the name', () => {
  /*
   * This is the whole reason to prefer the registry. `looksLikeSecretKey()` reads a name, and it
   * read `OPENAPI_MCP_HEADERS` — Notion's own documented variable, carrying a bearer token — as
   * ordinary, so the connector attached with its credential absent and looked perfectly healthy
   * (`connector-record.ts`, measured 2026-09-05).
   */
  assert.deepEqual(
    registryEnv({
      environmentVariables: [
        { name: 'OPENAPI_MCP_HEADERS', isSecret: true, isRequired: true },
        { name: 'NOTION_VERSION', isSecret: false, isRequired: false },
      ],
    }),
    [
      { name: 'OPENAPI_MCP_HEADERS', secret: true, required: true },
      { name: 'NOTION_VERSION', secret: false, required: false },
    ],
  );
});

test('finds a credential declared inside a runtime argument, not only in the env block', () => {
  // GitHub declares its token as `-e VAR={token}` with `isSecret` on the template variable.
  // Reading only `environmentVariables` would drop it exactly where it matters most.
  assert.deepEqual(
    registryEnv({
      runtimeArguments: [
        {
          type: 'named',
          name: '-e',
          isRequired: true,
          value: 'GITHUB_PERSONAL_ACCESS_TOKEN={token}',
          variables: { token: { isSecret: true, isRequired: true } },
        },
      ],
    }),
    [{ name: 'GITHUB_PERSONAL_ACCESS_TOKEN', secret: true, required: true }],
  );
});

test('the file states the count and the date, and says the list is neither complete nor audited', async () => {
  const entries = await build({ offline: true });
  const text = render(entries, '2026-09-07');
  assert.ok(text.includes("MCP_CATALOGUE_CAPTURED_AT = '2026-09-07'"));
  assert.ok(text.includes('not complete and Atlas has not audited'));
  assert.ok(text.includes('Do not edit by hand'));
  // Nothing is fetched while the app runs, and the file is where a reader is told so.
  assert.ok(text.includes('Nothing here is fetched while the app runs'));
});

test('offline still produces every entry, marked as curated', async () => {
  /*
   * The generator has to work on a plane too — not for the app's sake (it never fetches) but so a
   * person can regenerate after editing the curation table without the registry being reachable.
   * What they must not get is a row claiming registry provenance it never had.
   */
  const entries = await build({ offline: true });
  assert.equal(entries.length, CURATION.length);
  for (const entry of entries) {
    assert.equal(entry.registryChecked, false);
    for (const variant of entry.variants) assert.equal(variant.source, 'curated');
  }
});

test('every curated entry carries the page and the date a person read it', () => {
  for (const entry of CURATION) {
    assert.match(entry.docsUrl, /^https:\/\//);
    assert.match(entry.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
    for (const variant of entry.variants) {
      const variables = variant.kind === 'remote' ? variant.headers : variant.env;
      for (const variable of variables) {
        // A curated credential with no link to where it is issued is the dead end this catalogue
        // exists to remove.
        if (variable.secret) assert.match(variable.issueUrl ?? '', /^https:\/\//);
      }
    }
  }
});

test('the curation table holds no ranking or endorsement field', () => {
  // A list with a count beside each row is a marketplace, which `.claude/rules/forbidden.md`
  // refuses. Cheap to check here, easy to miss once somebody adds one "helpful" field.
  const text = JSON.stringify(CURATION).toLowerCase();
  for (const forbidden of ['downloads', 'stars', 'popularity', 'rating', 'recommended', 'rank']) {
    assert.ok(!text.includes(`"${forbidden}"`), `catalogue must not rank: ${forbidden}`);
  }
});
