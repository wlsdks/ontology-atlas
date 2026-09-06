#!/usr/bin/env node
/**
 * The MCP connector catalogue — **captured once by a person and committed**.
 *
 * ## Why this is a file and not a fetch
 *
 * `scripts/build-acp-registry.mjs` already wrote the reasoning for the agent
 * runtime list and it holds here word for word: fetching a catalogue when the
 * app opens breaks trust-charter promise ① (works without the internet) and
 * promise ② (nothing leaves unless the person turned it on) at the same time.
 * So the list is a committed file. It changes when somebody runs this script,
 * and what changed is a git diff.
 *
 * The PO steward's 2026-09-07 review made that a condition rather than a
 * preference, and added the second half: a runtime "refresh" button would
 * overturn the same two promises and needs its own decision record. There is
 * none, so there is no such button.
 *
 * ## Where each row comes from
 *
 * Two sources, and the file says which for every entry.
 *
 * - `registry` — the official MCP Registry (`registry.modelcontextprotocol.io`).
 *   Its server metadata is CC0-1.0 (registry Terms of Service, read
 *   2026-09-07), so it may be committed here. What is taken: the package
 *   identifier, the runtime hint, the arguments, the remote URL, and the
 *   environment variables **with the publisher's own `isRequired` / `isSecret`
 *   flags**. That last pair is the whole reason to prefer the registry: it is
 *   the publisher saying "this one is a credential", where
 *   `looksLikeSecretKey()` can only guess from the name — and has guessed wrong
 *   before (`OPENAPI_MCP_HEADERS`, recorded in `connector-record.ts`).
 * - `curated` — a person read the vendor's own documentation, wrote the facts
 *   down, and left the URL and the date they read it. Used where the registry
 *   has no entry or the vendor documents something the registry does not, which
 *   is every hosted OAuth endpoint below.
 *
 * A curated row is drawn differently on screen than a registry row. Atlas must
 * not borrow the registry's authority for a line one of us typed.
 *
 * ## What is deliberately absent
 *
 * No popularity, no install count, no star rating, no "recommended", no
 * ordering by anything but the curation order below. Those turn a list into a
 * marketplace, which `.claude/rules/forbidden.md` refuses. No icon URLs either:
 * the app fetches no external images, for the same reason it fetches no list.
 *
 * Usage:
 *   node scripts/build-mcp-catalogue.mjs            # rebuild from the registry
 *   node scripts/build-mcp-catalogue.mjs --check    # fail if the committed file differs
 *   node scripts/build-mcp-catalogue.mjs --offline  # rebuild curated rows only (no network)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'shared', 'config', 'mcp-catalogue.generated.ts');
const REGISTRY = 'https://registry.modelcontextprotocol.io/v0/servers';

/**
 * The services a person actually asks for by name, in the order they appear.
 *
 * Order is curation, not ranking — the three the owner named on 2026-09-07 come
 * first because they are the three that were asked about, and the file says so
 * rather than implying a measurement nobody took.
 *
 * `registryName` is the id to look up in the official registry. When it is
 * absent, or the lookup finds nothing, the entry ships with its curated facts
 * and `source: 'curated'`.
 */
const CURATION = [
  {
    id: 'notion',
    name: 'notion',
    title: 'Notion',
    summary: 'Read and write the pages and databases in your Notion workspace.',
    docsUrl: 'https://developers.notion.com/guides/mcp/get-started-with-mcp',
    verifiedAt: '2026-09-07',
    registryName: 'com.notion/mcp',
    variants: [
      {
        kind: 'remote',
        transport: 'http',
        url: 'https://mcp.notion.com/mcp',
        auth: 'oauth',
        headers: [],
      },
      {
        kind: 'local',
        transport: 'stdio',
        runtime: 'npx',
        packageId: '@notionhq/notion-mcp-server',
        args: ['-y', '@notionhq/notion-mcp-server'],
        env: [
          {
            name: 'NOTION_TOKEN',
            secret: true,
            required: true,
            issueUrl: 'https://www.notion.so/profile/integrations',
          },
        ],
      },
    ],
  },
  {
    id: 'atlassian',
    name: 'atlassian',
    title: 'Atlassian (Jira · Confluence)',
    summary: 'Read and write Jira issues and Confluence pages in your Atlassian site.',
    docsUrl: 'https://github.com/atlassian/atlassian-mcp-server',
    verifiedAt: '2026-09-07',
    registryName: null,
    variants: [
      {
        kind: 'remote',
        transport: 'http',
        url: 'https://mcp.atlassian.com/v2/mcp',
        auth: 'oauth',
        headers: [],
      },
    ],
  },
  {
    id: 'github',
    name: 'github',
    title: 'GitHub',
    summary: 'Read and write issues, pull requests, code and wikis on GitHub.',
    docsUrl: 'https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md',
    verifiedAt: '2026-09-07',
    registryName: 'io.github.github/github-mcp-server',
    variants: [
      {
        kind: 'remote',
        transport: 'http',
        url: 'https://api.githubcopilot.com/mcp/',
        auth: 'oauth',
        headers: [],
      },
      {
        kind: 'remote',
        transport: 'http',
        url: 'https://api.githubcopilot.com/mcp/readonly',
        label: 'read-only',
        auth: 'oauth',
        headers: [],
      },
      {
        kind: 'local',
        transport: 'stdio',
        runtime: 'docker',
        packageId: 'ghcr.io/github/github-mcp-server',
        args: [
          'run',
          '-i',
          '--rm',
          '-e',
          'GITHUB_PERSONAL_ACCESS_TOKEN',
          'ghcr.io/github/github-mcp-server',
        ],
        env: [
          {
            name: 'GITHUB_PERSONAL_ACCESS_TOKEN',
            secret: true,
            required: true,
            issueUrl: 'https://github.com/settings/personal-access-tokens/new',
          },
        ],
      },
    ],
  },
];

/**
 * Which curated facts the registry may correct.
 *
 * `packageId`, `args` and `env` on a **local** variant, because those are the publisher's own
 * launch instructions and go stale in a way a person cannot notice. Nothing on a **remote**
 * variant except confirming that the URL is listed: the registry's `headers[]` for a hosted
 * server describe an alternative token path, and folding that in would put an optional
 * credential box in front of somebody whose whole reason for choosing the hosted address was
 * that there is nothing to type.
 */
const REGISTRY_FIELDS = ['packageId', 'args', 'env'];

async function fetchRegistryEntry(registryName) {
  const url = `${REGISTRY}?search=${encodeURIComponent(registryName)}&limit=50`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`registry ${response.status} for ${registryName}`);
  const body = await response.json();
  const matches = (body.servers ?? [])
    .map((row) => row.server)
    .filter((server) => server && server.name === registryName);
  if (matches.length === 0) return null;
  // The registry keeps every published version; the last one it returns for a name is the newest
  // it has, and taking anything else would pin the catalogue to an old package on purpose.
  return matches[matches.length - 1];
}

/** Registry `environmentVariables[]` → this catalogue's `env[]`. Flags come from the publisher. */
function registryEnv(pkg) {
  const out = (pkg.environmentVariables ?? []).map((variable) => ({
    name: variable.name,
    secret: variable.isSecret === true,
    required: variable.isRequired === true,
    ...(variable.description ? { description: variable.description } : {}),
  }));
  /*
   * A container entry declares its credential inside a runtime argument rather than in
   * `environmentVariables` — GitHub publishes `-e GITHUB_PERSONAL_ACCESS_TOKEN={token}` with the
   * `isSecret` flag on the template variable. Reading only the top-level block would drop the
   * publisher's own "this is a credential" for exactly the entries where it matters most.
   */
  for (const argument of [...(pkg.runtimeArguments ?? []), ...(pkg.packageArguments ?? [])]) {
    const value = typeof argument.value === 'string' ? argument.value : '';
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=\{([A-Za-z0-9_]+)\}$/.exec(value);
    if (!match) continue;
    const declared = argument.variables?.[match[2]] ?? {};
    if (out.some((variable) => variable.name === match[1])) continue;
    out.push({
      name: match[1],
      secret: declared.isSecret === true,
      required: declared.isRequired === true || argument.isRequired === true,
    });
  }
  return out;
}

/**
 * Registry package arguments → an argv line — **for npm only.**
 *
 * `npx -y <identifier>` is deterministic: the registry names the package and the rest is fixed.
 * Nothing else is. An OCI entry publishes fragments (`-e VAR={token}`) that only become a command
 * line once somebody decides where `run`, `-i`, `--rm` and the image name go, and a template
 * placeholder like `{token}` written literally into `args` is a command that fails in a way
 * nobody can read. Measured on GitHub's own registry entry, 2026-09-07: taking its
 * `runtimeArguments` produced `docker -e GITHUB_PERSONAL_ACCESS_TOKEN={token}` — no `run`, no
 * image.
 *
 * So for anything but npm the registry corrects the package identifier and the environment
 * variables, and the argv line stays the curated one a person verified against the vendor's page.
 * Returning `[]` here is what leaves it alone: `REGISTRY_FIELDS` only overwrites a non-empty
 * value.
 */
function registryArgs(pkg) {
  if (pkg.registryType !== 'npm' || !pkg.identifier) return [];
  const out = ['-y', pkg.identifier];
  for (const argument of pkg.packageArguments ?? []) {
    if (argument.type === 'named' && argument.name) out.push(argument.name);
    // A templated value belongs to the person, not to the file. Anything carrying `{…}` is a
    // placeholder the registry expects a client to fill in, and this catalogue does not guess.
    if (typeof argument.value === 'string' && !argument.value.includes('{')) out.push(argument.value);
  }
  return out;
}

async function build({ offline }) {
  const entries = [];
  for (const curated of CURATION) {
    const variants = curated.variants.map((variant) => ({ ...variant, source: 'curated' }));
    let registryChecked = false;
    if (!offline && curated.registryName) {
      const server = await fetchRegistryEntry(curated.registryName);
      if (server) {
        registryChecked = true;
        // A hosted address the registry also lists is an independently published fact, so the
        // row stops being one person's transcription. Only the URL is confirmed — see
        // REGISTRY_FIELDS for why the registry's headers stay out.
        for (const remote of server.remotes ?? []) {
          const index = variants.findIndex(
            (variant) => variant.kind === 'remote' && variant.url === remote.url,
          );
          if (index >= 0) variants[index] = { ...variants[index], source: 'registry' };
        }
        for (const pkg of server.packages ?? []) {
          // An OCI identifier carries its tag (`ghcr.io/…:1.0.4`); the catalogue names the image.
          const identifier = (pkg.identifier ?? '').replace(/:[^:/]+$/, '');
          const index = variants.findIndex(
            (variant) => variant.kind === 'local' && variant.packageId === identifier,
          );
          if (index < 0) continue;
          const fromRegistry = {
            packageId: identifier,
            args: registryArgs(pkg),
            env: registryEnv(pkg),
          };
          // The registry wins on the three fields it is authoritative for, and only when it
          // actually said something. An empty `environmentVariables` is a publisher who did not
          // fill it in, not a publisher declaring "no credential needed".
          /*
           * The registry never carries **where a credential is issued** — that is a link a person
           * found on the vendor's own page, and it is the single field that turns "paste a token"
           * from a dead end into an errand. So a registry variable of the same name keeps the
           * curated `issueUrl`; everything else about it comes from the publisher.
           */
          fromRegistry.env = fromRegistry.env.map((variable) => {
            const curatedVariable = (variants[index].env ?? []).find(
              (candidate) => candidate.name === variable.name,
            );
            return curatedVariable?.issueUrl
              ? { ...variable, issueUrl: curatedVariable.issueUrl }
              : variable;
          });
          for (const field of REGISTRY_FIELDS) {
            const value = fromRegistry[field];
            if (Array.isArray(value) ? value.length > 0 : Boolean(value)) {
              variants[index] = { ...variants[index], [field]: value, source: 'registry' };
            }
          }
        }
      }
    }
    entries.push({
      id: curated.id,
      name: curated.name,
      title: curated.title,
      summary: curated.summary,
      docsUrl: curated.docsUrl,
      verifiedAt: curated.verifiedAt,
      registryName: curated.registryName ?? null,
      registryChecked,
      variants,
    });
  }
  return entries;
}

function render(entries, generatedAt) {
  const remoteCount = entries.reduce(
    (total, entry) => total + entry.variants.filter((variant) => variant.kind === 'remote').length,
    0,
  );
  const localCount = entries.reduce(
    (total, entry) => total + entry.variants.filter((variant) => variant.kind === 'local').length,
    0,
  );
  return `/**
 * GENERATED by \`node scripts/build-mcp-catalogue.mjs\`. Do not edit by hand.
 *
 * Captured ${generatedAt}: ${entries.length} services, ${remoteCount} hosted
 * addresses and ${localCount} programs that run on this computer.
 *
 * **This list is not complete and Atlas has not audited any server on it.** It
 * is a shortcut past typing a package name, nothing more; "By hand" reaches
 * every server that exists. Rows marked \`registry\` were read from the official
 * MCP Registry, whose metadata is CC0-1.0; rows marked \`curated\` were read off
 * the vendor's own page on the date beside them.
 *
 * Nothing here is fetched while the app runs. Refreshing it is a person running
 * the script and committing the diff.
 */
import type { CatalogueEntry } from './mcp-catalogue';

/** The day a person ran the generator. The screen says it out loud. */
export const MCP_CATALOGUE_CAPTURED_AT = '${generatedAt}';

export const MCP_CATALOGUE: readonly CatalogueEntry[] = ${JSON.stringify(entries, null, 2)} as const;
`;
}

async function main() {
  const check = process.argv.includes('--check');
  const offline = process.argv.includes('--offline');
  const existing = (() => {
    try {
      return readFileSync(OUT, 'utf8');
    } catch {
      return null;
    }
  })();
  // In --check the date must come from the committed file, or every run would differ by a day and
  // the check would fail on a calendar change rather than on a real drift.
  const generatedAt = check
    ? (existing?.match(/MCP_CATALOGUE_CAPTURED_AT = '([\d-]+)'/)?.[1] ?? today())
    : today();
  const entries = await build({ offline });
  const next = render(entries, generatedAt);
  if (check) {
    if (existing !== next) {
      console.error(
        `${OUT} differs from what the generator produces. Run: node scripts/build-mcp-catalogue.mjs`,
      );
      process.exit(1);
    }
    console.log(`mcp catalogue: ${entries.length} services, unchanged.`);
    return;
  }
  writeFileSync(OUT, next);
  console.log(`mcp catalogue: wrote ${entries.length} services to ${OUT}`);
}

/**
 * The local calendar day, not UTC. The generator is run by a person at their desk and the file
 * says when they ran it; a UTC slice puts yesterday's date on a morning run in Asia.
 */
function today() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export { build, registryArgs, registryEnv, render, CURATION };

if (process.argv[1] && process.argv[1].endsWith('build-mcp-catalogue.mjs')) {
  await main();
}
