import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CURATION,
  build,
  readRegistrySnapshot,
  registryArgs,
  registryEnv,
  render,
  runCatalogue,
} from './build-mcp-catalogue.mjs';

const COMMITTED_OUT = new URL('../src/shared/config/mcp-catalogue.generated.ts', import.meta.url);
const COMMITTED_SNAPSHOT = new URL('./data/mcp-registry-snapshot.json', import.meta.url);

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-mcp-catalogue-'));
  const outPath = join(dir, 'mcp-catalogue.generated.ts');
  const snapshotPath = join(dir, 'mcp-registry-snapshot.json');
  writeFileSync(outPath, readFileSync(COMMITTED_OUT));
  writeFileSync(snapshotPath, readFileSync(COMMITTED_SNAPSHOT));
  return { dir, outPath, snapshotPath };
}

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

test('keeps a curated required credential when the registry relaxes it with arguments the curated line lacks', async () => {
  const entries = await build({
    offline: false,
    registryServers: {
      'io.github.github/github-mcp-server': {
        packages: [
          {
            registryType: 'oci',
            identifier: 'ghcr.io/github/github-mcp-server:2.0.2',
            runtimeArguments: [
              { type: 'named', name: '-p', value: '127.0.0.1:8085:8085' },
              {
                type: 'named',
                name: '-e',
                value: 'GITHUB_PERSONAL_ACCESS_TOKEN={token}',
                variables: { token: { isSecret: true } },
              },
            ],
          },
        ],
      },
    },
  });
  const github = entries.find((entry) => entry.id === 'github');
  assert.equal(github.registryChecked, true);
  assert.equal(github.variants[0].args.includes('127.0.0.1:8085:8085'), false);
  assert.deepEqual(
    github.variants[0].env.map(({ name, required }) => ({ name, required })),
    [{ name: 'GITHUB_PERSONAL_ACCESS_TOKEN', required: true }],
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

test('ordinary check is deterministic and never fetches', async (t) => {
  const paths = fixture();
  t.after(() => rmSync(paths.dir, { recursive: true, force: true }));
  let fetches = 0;
  const message = await runCatalogue({
    argv: ['--check'],
    ...paths,
    fetchImpl: async () => {
      fetches += 1;
      throw new Error('ordinary check reached the network');
    },
  });
  assert.equal(fetches, 0);
  assert.match(message, /unchanged/);
});

test('refuses a registry answer that names a different server', async (t) => {
  const paths = fixture();
  t.after(() => rmSync(paths.dir, { recursive: true, force: true }));
  const impostor = { name: 'io.example/impostor', packages: [] };
  await assert.rejects(
    runCatalogue({
      argv: [],
      ...paths,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ server: impostor }) }),
    }),
    /registry answered io\.example\/impostor/,
  );
});

test('ordinary check rejects tampered generated output', async (t) => {
  const paths = fixture();
  t.after(() => rmSync(paths.dir, { recursive: true, force: true }));
  writeFileSync(paths.outPath, `${readFileSync(paths.outPath, 'utf8')}\n// tampered\n`);
  await assert.rejects(
    runCatalogue({ argv: ['--check'], ...paths, fetchImpl: assert.fail }),
    /differs from what the committed registry snapshot produces/,
  );
});

test('ordinary check rejects tampered registry capture', async (t) => {
  const paths = fixture();
  t.after(() => rmSync(paths.dir, { recursive: true, force: true }));
  const snapshot = readRegistrySnapshot(paths.snapshotPath);
  snapshot.servers['io.github.microsoft/playwright-mcp'].packages[0].identifier =
    '@playwright/mcp-tampered';
  writeFileSync(paths.snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  await assert.rejects(
    runCatalogue({ argv: ['--check'], ...paths, fetchImpl: assert.fail }),
    /differs from what the committed registry snapshot produces/,
  );
});

test('ordinary check fails closed when the registry capture is missing', async (t) => {
  const paths = fixture();
  t.after(() => rmSync(paths.dir, { recursive: true, force: true }));
  rmSync(paths.snapshotPath);
  await assert.rejects(
    runCatalogue({ argv: ['--check'], ...paths, fetchImpl: assert.fail }),
    /MCP registry snapshot is missing/,
  );
});

test('online check keeps registry errors visible', async (t) => {
  const paths = fixture();
  t.after(() => rmSync(paths.dir, { recursive: true, force: true }));
  await assert.rejects(
    runCatalogue({
      argv: ['--check-online'],
      ...paths,
      fetchImpl: async () => {
        throw new Error('registry unavailable');
      },
    }),
    /registry unavailable/,
  );
});

test('normal regeneration captures live inputs and writes output that deterministic check accepts', async (t) => {
  const paths = fixture();
  t.after(() => rmSync(paths.dir, { recursive: true, force: true }));
  const live = readRegistrySnapshot(paths.snapshotPath);
  rmSync(paths.snapshotPath);
  rmSync(paths.outPath);
  const requested = [];
  const fetchImpl = async (url) => {
    const name = decodeURIComponent(new URL(url).pathname.match(/\/servers\/([^/]+)\/versions\/latest$/)[1]);
    requested.push(name);
    return {
      ok: true,
      json: async () => ({ server: live.servers[name] }),
    };
  };

  await runCatalogue({ argv: [], ...paths, fetchImpl });
  assert.deepEqual(new Set(requested), new Set(CURATION.map((entry) => entry.registryName)));
  assert.deepEqual(readRegistrySnapshot(paths.snapshotPath), live);
  await runCatalogue({
    argv: ['--check'],
    ...paths,
    fetchImpl: async () => assert.fail('deterministic follow-up check fetched'),
  });
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

test('pins every program it offers to the release current on the day a person verified it', async () => {
  const entries = await build({ offline: false, registryServers: readRegistrySnapshot(COMMITTED_SNAPSHOT).servers });
  const programs = entries.flatMap((entry) => entry.variants.filter((variant) => variant.kind === 'local'));
  assert.ok(programs.length > 0);
  for (const variant of programs) {
    const pinned = variant.runtime === 'docker'
      ? `${variant.packageId}:${variant.version}@sha256:`
      : `${variant.packageId}@${variant.version}`;
    assert.ok(variant.version, `${variant.packageId} names no version`);
    assert.ok(
      variant.args.some((arg) => arg.startsWith(pinned)),
      `${variant.packageId} runs whatever is newest: ${variant.args.join(' ')}`,
    );
  }
});

test('refuses to offer a program without the version verified on its date', async () => {
  const unpinned = CURATION.map((entry) => ({
    ...entry,
    variants: entry.variants.map((variant) => (variant.kind === 'local' ? { ...variant, version: undefined } : variant)),
  }));
  await assert.rejects(build({ offline: true, curation: unpinned }), /needs the version/);
});

test('rebuilds from the committed capture without fetching, and keeps its date', async (t) => {
  const paths = fixture();
  t.after(() => rmSync(paths.dir, { recursive: true, force: true }));
  await runCatalogue({
    argv: ['--from-snapshot'],
    ...paths,
    fetchImpl: async () => assert.fail('a rebuild from the capture reached the network'),
  });
  assert.equal(readFileSync(paths.outPath, 'utf8'), readFileSync(COMMITTED_OUT, 'utf8'));
  assert.equal(readFileSync(paths.snapshotPath, 'utf8'), readFileSync(COMMITTED_SNAPSHOT, 'utf8'));
});

test('the committed catalogue runs nothing unpinned', () => {
  const text = readFileSync(COMMITTED_OUT, 'utf8');
  for (const name of ['@notionhq/notion-mcp-server', '@playwright/mcp', '@upstash/context7-mcp']) {
    assert.ok(text.includes(`"${name}@`), `${name} is offered without a version`);
  }
  assert.match(text, /"ghcr\.io\/github\/github-mcp-server:[\d.]+@sha256:[0-9a-f]{64}"/);
});
