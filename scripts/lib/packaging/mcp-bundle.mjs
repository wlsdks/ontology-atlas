/**
 * The pure part of the `.mcpb` build: a zip holding the compiled Rust program `ontology-atlas-mcp`
 * for each platform it is given, plus a `manifest.json`. MCPB manifest 0.3 has no architecture:
 * `compatibility.platforms` and `server.mcp_config.platform_overrides` are keyed by Node's
 * `process.platform` (`darwin`, `win32`, `linux`) alone
 * (https://github.com/anthropics/mcpb/blob/main/MANIFEST.md, "System Requirements" and
 * "Platform-Specific Configurations"). A system with programs for two architectures therefore
 * starts a small shell script that runs the one for `uname -m`; a system with one program starts
 * that program directly. The image carries both Linux architectures through `docker buildx`.
 */

const BUNDLE_SERVER_DIR = 'server';
const MCP_PROGRAM_NAME = 'ontology-atlas-mcp';

const PLATFORM_OF_TRIPLE = Object.freeze({
  'aarch64-apple-darwin': 'darwin',
  'x86_64-apple-darwin': 'darwin',
  'x86_64-pc-windows-msvc': 'win32',
  'x86_64-unknown-linux-gnu': 'linux',
  'x86_64-unknown-linux-musl': 'linux',
  'aarch64-unknown-linux-gnu': 'linux',
  'aarch64-unknown-linux-musl': 'linux',
});

/** What `uname -m` prints, on the systems that have it, for the architecture a triple starts with. */
const UNAME_MACHINES_OF_ARCHITECTURE = Object.freeze({
  x86_64: ['x86_64', 'amd64'],
  aarch64: ['arm64', 'aarch64'],
});

/** Where the program of `triple` sits inside the bundle. */
export function bundleProgramPath(triple) {
  return `${BUNDLE_SERVER_DIR}/${MCP_PROGRAM_NAME}-${triple}${triple.includes('-windows-') ? '.exe' : ''}`;
}

/** The operating system a host calls `triple`'s program for; null for a target the bundle does not know. */
const bundlePlatformOfTriple = (triple) => PLATFORM_OF_TRIPLE[triple] ?? null;

const architectureOfTriple = (triple) => triple.split('-')[0];

/** Where the script that starts the right program of a system with several sits inside the bundle. */
export const bundleSelectorPath = (platform) => `${BUNDLE_SERVER_DIR}/start-${MCP_PROGRAM_NAME}-${platform}`;

/** `triples` grouped by the system a host calls them for, in the order the systems first appear. */
export function bundleProgramsByPlatform(triples) {
  const byPlatform = new Map();
  for (const triple of triples) {
    const platform = bundlePlatformOfTriple(triple);
    byPlatform.set(platform, [...(byPlatform.get(platform) ?? []), triple]);
  }
  return byPlatform;
}

/** The file a host starts on `platform`: the program itself when it is the only one, else the selector. */
const bundleLaunchPath = (platform, platformTriples) =>
  platformTriples.length === 1 ? bundleProgramPath(platformTriples[0]) : bundleSelectorPath(platform);

/**
 * The POSIX shell script that replaces itself with the program built for this machine, so the
 * host's pipes and signals reach the program directly. A machine it has no program for gets a line
 * on standard error and exit code 1, not a program of another architecture.
 */
export function bundleSelectorScript(platformTriples) {
  const arms = platformTriples.map((triple) => {
    const machines = UNAME_MACHINES_OF_ARCHITECTURE[architectureOfTriple(triple)];
    return `  ${machines.join('|')}) exec "$here/${MCP_PROGRAM_NAME}-${triple}" "$@" ;;`;
  });
  return [
    '#!/bin/sh',
    '# A bundle host picks a program by operating system alone, so this picks by architecture.',
    'here=$(cd "$(dirname "$0")" && pwd)',
    'case "$(uname -m)" in',
    ...arms,
    'esac',
    `echo "${MCP_PROGRAM_NAME}: this bundle has no program for $(uname -m)" >&2`,
    'exit 1',
    '',
  ].join('\n');
}

/**
 * What stops a set of targets from being one bundle: an unknown target, or two programs a host
 * cannot tell apart, meaning one system with the same architecture twice.
 */
export function bundleProgramProblems(triples) {
  const problems = [];
  const known = triples.filter((triple) => {
    if (bundlePlatformOfTriple(triple)) return true;
    problems.push(`${triple} is not a target the bundle knows`);
    return false;
  });
  for (const [platform, found] of bundleProgramsByPlatform(known)) {
    const byArchitecture = Map.groupBy(found, architectureOfTriple);
    for (const same of byArchitecture.values()) {
      if (same.length > 1) {
        problems.push(`${same.join(' and ')} are both ${platform} programs for one architecture; the bundle holds one`);
      }
    }
  }
  if (triples.length === 0) problems.push('no program was given; build one with `pnpm mcp:build-binary`');
  return problems;
}

/**
 * The MCPB manifest. `user_config.vault` is a directory prompt rather than a
 * free-text path because the host renders it as a folder picker, and the server
 * reads exactly one environment variable (`OATLAS_VAULT`) to find the vault.
 * The program is native, so the manifest states no runtime.
 */
export function bundleManifest({ version, description, triples }) {
  const launchers = [...bundleProgramsByPlatform(triples)].map(([platform, platformTriples]) => [
    platform,
    bundleLaunchPath(platform, platformTriples),
  ]);
  const platforms = launchers.map(([platform]) => platform);
  const command = (launchPath) => `\${__dirname}/${launchPath}`;
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
      type: 'binary',
      entry_point: launchers[0][1],
      mcp_config: {
        command: command(launchers[0][1]),
        args: [],
        env: { OATLAS_VAULT: '${user_config.vault}' },
        platform_overrides: Object.fromEntries(
          launchers.map(([platform, launchPath]) => [platform, { command: command(launchPath) }]),
        ),
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
    compatibility: { platforms },
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
 * What a person holding the file can check: two releases can carry the same server version with
 * different bytes, so the artifact states the commit it was built from and the programs it holds.
 */
export function bundleProvenance({ version, commit, tag, builtAt, triples, bootedTriple }) {
  return [
    'Ontology Atlas MCP server — MCP Bundle provenance',
    '',
    `server version   ${version}`,
    `built from       ${commit}`,
    `release tag      ${tag ?? '(none: local build)'}`,
    `built at         ${builtAt}`,
    `programs         ${triples.join(', ')}`,
    `booted           ${bootedTriple} (the others cannot run on the machine that built this file)`,
    '',
    'Each program is the compiled Rust server: there is no runtime to install. Where a system has',
    'programs for two architectures, a short shell script starts the one for this machine.',
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
