/**
 * The pure part of the `.mcpb` build: a zip holding one MCP server plus a `manifest.json`. It
 * carries exactly `mcp/package.json`'s `files` list. `mcp/src/analysis-record.mts` is compiled to
 * `.mjs` because Node type stripping is unflagged only from Node 23.6.
 */

/** The bundle's own layout. `server/` mirrors `mcp/`, so entry paths stay readable. */
export const BUNDLE_SERVER_DIR = 'server';
export const BUNDLE_ENTRY_POINT = `${BUNDLE_SERVER_DIR}/src/index.js`;

/** The typed module the server imports directly, and the plain name it takes in a bundle. */
export const TYPED_MODULE = 'src/analysis-record.mts';
export const STRIPPED_MODULE = 'src/analysis-record.mjs';

/**
 * A test fixture is not a shipping surface. `mcp/package.json` lists it because
 * `npm test` inside a published package runs the parser smoke test
 * (`check-package-contracts` holds that contract), but a bundle a host installs
 * has no test runner and no reason to carry one.
 */
export const EXCLUDED_FROM_BUNDLE = Object.freeze(['src/parser.test.mjs']);

/**
 * Runtime dependencies are vendored, so the closure is walked the way Node
 * itself resolves it: each package is looked up **from the directory of the
 * package that depends on it**. A flat lookup in `mcp/node_modules` finds the
 * two direct dependencies and misses `zod`, which pnpm keeps in its store and
 * links only under the SDK — measured, and the reason this takes a resolver
 * rather than a path join.
 *
 * `resolvePackageDir(name, fromDir)` returns the real directory or null.
 */
export function dependencyClosure({ rootDependencies, rootDir, resolvePackageDir, readManifest }) {
  const pending = Object.keys(rootDependencies ?? {}).map((name) => ({ name, fromDir: rootDir }));
  const found = new Map();
  const missing = [];
  while (pending.length > 0) {
    const { name, fromDir } = pending.shift();
    if (found.has(name)) continue;
    const dir = resolvePackageDir(name, fromDir);
    if (!dir) {
      missing.push(name);
      continue;
    }
    found.set(name, dir);
    for (const next of Object.keys(readManifest(dir)?.dependencies ?? {})) {
      if (!found.has(next)) pending.push({ name: next, fromDir: dir });
    }
  }
  return {
    packages: [...found.entries()].map(([name, dir]) => ({ name, dir })).sort((a, b) => a.name.localeCompare(b.name)),
    missing: missing.sort(),
  };
}

/**
 * The bundle gets its own manifest rather than a copy of the repository's.
 * Copying it shipped three contradictions to end users: an `engines` pin of
 * `>=24 <25` beside a bundle measured on Node 20, a `files` list naming two
 * modules the bundle deliberately does not carry, and a Korean maintainer note
 * in the most public copy of that file. Node needs `type: "module"` here and
 * nothing else.
 */
export function bundlePackageJson({ version }) {
  return {
    name: 'ontology-atlas-mcp',
    version,
    description: REGISTRY_DESCRIPTION,
    type: 'module',
    license: 'MIT',
    private: true,
  };
}

/**
 * A vendored dependency ships its licence and its code, not its test suite.
 * Measured before this: 168 of the bundle's 896 files were `zod`'s own
 * `src/v3/tests/**`, and source maps were most of the unpacked weight. Neither
 * is something a host needs to start a server.
 */
export function isBundleBallast(relativePath) {
  const normalized = relativePath.split('\\').join('/');
  return (
    // Matches the directory itself as well as its contents, or the copy leaves
    // four empty `tests/` folders behind.
    /(?:^|\/)(?:tests?|__tests__|\.github)(?:\/|$)/.test(normalized) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized) ||
    normalized.endsWith('.map') ||
    /(?:^|\/)(?:CHANGELOG|CONTRIBUTING)\.md$/i.test(normalized)
  );
}

/** The files copied into `server/`, with the typed module renamed to its stripped twin. */
export function bundleFileList(declaredFiles) {
  return declaredFiles
    .filter((file) => !EXCLUDED_FROM_BUNDLE.includes(file))
    .map((file) => (file === TYPED_MODULE ? STRIPPED_MODULE : file))
    .sort();
}

/**
 * The MCPB manifest. `user_config.vault` is a directory prompt rather than a
 * free-text path because the host renders it as a folder picker, and the server
 * reads exactly one environment variable (`OATLAS_VAULT`) to find the vault.
 *
 * `compatibility.runtimes.node` states the SDK's real floor rather than this
 * repository's `engines` pin — see the note at the top of this file.
 */
export function bundleManifest({ version, description }) {
  return {
    manifest_version: '0.3',
    name: 'ontology-atlas-mcp',
    display_name: 'Ontology Atlas',
    version,
    description,
    long_description:
      'Ontology Atlas keeps what a codebase builds, why its boundaries exist, and what a change ' +
      'affects as an ordinary folder of Markdown inside the repository. This server exposes that ' +
      'folder to an agent as typed tools: read a concept, follow backlinks, find a path between ' +
      'two things, measure a blast radius from declared dependencies only, and propose writes that ' +
      'land as Markdown and a Git diff a person reviews. Nothing is uploaded and no account is ' +
      'involved; the folder on disk is the whole database.',
    author: { name: 'Ontology Atlas', url: 'https://ontologyatlas.com' },
    homepage: 'https://ontologyatlas.com',
    documentation: 'https://github.com/wlsdks/ontology-atlas/blob/main/mcp/README.md',
    support: 'https://github.com/wlsdks/ontology-atlas/issues',
    repository: { type: 'git', url: 'https://github.com/wlsdks/ontology-atlas' },
    license: 'MIT',
    keywords: ['ontology', 'codebase', 'markdown', 'knowledge-graph', 'local-first'],
    server: {
      type: 'node',
      entry_point: BUNDLE_ENTRY_POINT,
      mcp_config: {
        command: 'node',
        args: [`\${__dirname}/${BUNDLE_ENTRY_POINT}`],
        env: { OATLAS_VAULT: '${user_config.vault}' },
      },
    },
    user_config: {
      vault: {
        type: 'directory',
        title: 'Vault folder',
        description:
          'The Markdown folder that holds the ontology — normally atlas/ inside the repository it describes.',
        required: true,
        multiple: false,
      },
    },
    compatibility: {
      platforms: ['darwin', 'win32', 'linux'],
      runtimes: { node: '>=20' },
    },
  };
}

/**
 * The registry's own limit, read from the schema this entry declares: a
 * description over 100 characters is rejected by `mcp-publisher publish`. The
 * server's npm-shaped description is 126 characters and names its tool counts,
 * which the schema also asks authors to leave out, so the registry gets its own
 * sentence rather than a truncation.
 */
export const REGISTRY_DESCRIPTION_LIMIT = 100;
const REGISTRY_DESCRIPTION = 'Read and write one codebase ontology kept as Markdown in the repository.';

/**
 * The constraints that decide whether a publish is accepted, checked locally so
 * a green check cannot promise what the registry then refuses. This is not a
 * full JSON Schema implementation; it is the set the registry's validators
 * enforce on the fields we actually emit.
 */
export function serverJsonProblems(document) {
  const problems = [];
  if (typeof document.name !== 'string' || !/^[a-z0-9.-]+\/[A-Za-z0-9._-]+$/.test(document.name)) {
    problems.push(`name must be <namespace>/<id>, received ${JSON.stringify(document.name)}`);
  }
  if (!document.description) problems.push('description is required');
  else if (document.description.length > REGISTRY_DESCRIPTION_LIMIT) {
    problems.push(`description is ${document.description.length} characters; the schema allows ${REGISTRY_DESCRIPTION_LIMIT}`);
  }
  if (!/^\d+\.\d+\.\d+/.test(document.version ?? '')) problems.push('version must be a semantic version');
  if (!Array.isArray(document.packages) || document.packages.length === 0) problems.push('at least one package is required');
  for (const entry of document.packages ?? []) {
    if (entry.registryType === 'mcpb') {
      if (!/^[0-9a-f]{64}$/.test(entry.fileSha256 ?? '')) problems.push('an mcpb package needs a 64-character fileSha256');
      problems.push(...artifactUrlProblems(entry.identifier ?? ''));
    }
    if (entry.registryType === 'oci') {
      // The registry rejects both keys on an oci entry: the tag carries the
      // version and the image is verified by its label, not by a digest we type.
      if ('version' in entry) problems.push('an oci package must not carry a version field');
      if ('fileSha256' in entry) problems.push('an oci package must not carry a fileSha256 field');
      if (!/^[a-z0-9.-]+(?::\d+)?\/[^:]+:[^:]+$/.test(entry.identifier ?? '')) {
        problems.push(`an oci identifier must be registry/repository:tag, received ${JSON.stringify(entry.identifier)}`);
      }
    }
  }
  return problems;
}

/**
 * What a person holding the file can check. Two releases can carry the same
 * server version with different bytes, so the artifact states the commit it was
 * built from; without this, "which source is this?" has no answer inside the zip.
 * It also settles the one contradiction a reader of the unpacked bundle meets:
 * the `engines` field in the server's own `package.json` is the repository's
 * toolchain pin, while the manifest states the floor the bundle was measured on.
 */
export function bundleProvenance({ version, commit, tag, builtAt, witnessedRuntimes }) {
  return [
    'Ontology Atlas MCP server — MCP Bundle provenance',
    '',
    `server version   ${version}`,
    `built from       ${commit}`,
    `release tag      ${tag ?? '(none: local build)'}`,
    `built at         ${builtAt}`,
    `booted under     ${witnessedRuntimes.join(', ')}`,
    '',
    'server/package.json here is written for this bundle rather than copied from',
    'the repository: the repository pins its own toolchain to Node 24, while the',
    'one TypeScript module the server imports is compiled during this build, so',
    'the bundle runs on the floor manifest.json states and was booted on above.',
    '',
    'The vault is an ordinary folder of Markdown on your disk. This server reads',
    'and writes only the folder you point OATLAS_VAULT at, opens no port, and',
    'sends nothing anywhere.',
    '',
  ].join('\n');
}

/** The registry entry for the built artifact. Metadata only; the registry hosts no files. */
function registryPackageEntry({ downloadUrl, fileSha256 }) {
  return {
    registryType: 'mcpb',
    identifier: downloadUrl,
    fileSha256,
    transport: { type: 'stdio' },
    environmentVariables: [
      {
        name: 'OATLAS_VAULT',
        description:
          'The Markdown folder that holds the ontology — normally atlas/ inside the repository it describes.',
        isRequired: false,
        format: 'filepath',
        isSecret: false,
      },
    ],
  };
}

/**
 * The registry identity. GitHub-authenticated namespaces are `io.github.<account>/`, so this name
 * and the repository account cannot disagree; the Dockerfile's ownership label must repeat it
 * exactly (`registryInvariantProblems`).
 */
export const REGISTRY_SERVER_NAME = 'io.github.wlsdks/ontology-atlas';
const OCI_IMAGE_REPOSITORY = 'ghcr.io/wlsdks/ontology-atlas-mcp';
export const OWNERSHIP_LABEL = 'io.modelcontextprotocol.server.name';
const RELEASE_DOWNLOAD_BASE = 'https://github.com/wlsdks/ontology-atlas/releases/download';

/** The artifact's file name, which is also what makes its URL contain "mcp". */
export function bundleArtifactName(version) {
  return `ontology-atlas-mcp-${version}.mcpb`;
}

export function bundleDownloadUrl(tag, version) {
  return `${RELEASE_DOWNLOAD_BASE}/${tag}/${bundleArtifactName(version)}`;
}

/**
 * The complete `server.json` the publisher sends. Every value is derived: the
 * version and description from `mcp/package.json`, the MCPB URL from the release
 * tag, its digest from the built artifact, the image tag from the same version.
 * Nothing here is hand-typed, because a hand-typed digest is a lie the registry
 * would then serve.
 */
export function serverJson({ version, tag, fileSha256, withImage = false }) {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name: REGISTRY_SERVER_NAME,
    title: 'Ontology Atlas',
    description: REGISTRY_DESCRIPTION,
    version,
    repository: { url: 'https://github.com/wlsdks/ontology-atlas', source: 'github' },
    websiteUrl: 'https://ontologyatlas.com',
    packages: [
      { ...registryPackageEntry({ downloadUrl: bundleDownloadUrl(tag, version), fileSha256 }) },
      // The image entry is opt-in because nothing in this repository pushes the
      // image: a published entry naming an unpushed image is what the registry's
      // ownership check exists to refuse, and a stranger would meet
      // `manifest unknown` instead. `--with-image` is the flag a person passes
      // once `ghcr.io` actually serves that tag for every platform they claim.
      ...(withImage
        ? [
            {
              registryType: 'oci',
              identifier: `${OCI_IMAGE_REPOSITORY}:${version}`,
              transport: { type: 'stdio' },
              environmentVariables: [
                {
                  name: 'OATLAS_VAULT',
                  description:
                    'The mounted Markdown folder that holds the ontology. The image defaults it to /vault.',
                  isRequired: false,
                  format: 'filepath',
                  isSecret: false,
                },
              ],
            },
          ]
        : []),
    ],
  };
}

/**
 * What must hold whether or not an artifact exists yet: the image label repeats
 * the registry name, the image the label sits on is the one the entry names, and
 * the artifact URL still carries "mcp".
 */
export function registryInvariantProblems({ dockerfile, version, tag = 'v0.0.0' }) {
  const problems = [];
  const label = new RegExp(`^LABEL\\s+${OWNERSHIP_LABEL}="([^"]+)"`, 'm').exec(dockerfile);
  if (!label) {
    problems.push(`mcp/Dockerfile must carry LABEL ${OWNERSHIP_LABEL}="${REGISTRY_SERVER_NAME}" for OCI ownership verification`);
  } else if (label[1] !== REGISTRY_SERVER_NAME) {
    problems.push(`mcp/Dockerfile declares ${OWNERSHIP_LABEL}="${label[1]}" but the registry entry is named ${REGISTRY_SERVER_NAME}`);
  }
  if (!/^ENV\s+OATLAS_VAULT=\/vault$/m.test(dockerfile)) {
    problems.push('mcp/Dockerfile must default OATLAS_VAULT to /vault — the registry entry documents that path');
  }
  problems.push(...artifactUrlProblems(bundleDownloadUrl(tag, version)));
  return problems;
}

/**
 * The registry requires the artifact URL to contain "mcp" — the `.mcpb`
 * extension satisfies it, but only while the file keeps that name, so the rule
 * is checked rather than trusted.
 */
export function artifactUrlProblems(downloadUrl) {
  const problems = [];
  if (!downloadUrl.startsWith('https://github.com/')) {
    problems.push('the registry accepts MCPB artifacts hosted on GitHub or GitLab releases only');
  }
  if (!downloadUrl.toLowerCase().includes('mcp')) {
    problems.push('the artifact URL must contain "mcp" for registry ownership verification');
  }
  return problems;
}
