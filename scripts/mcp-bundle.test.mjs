#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  EXCLUDED_FROM_BUNDLE,
  OWNERSHIP_LABEL,
  REGISTRY_DESCRIPTION_LIMIT,
  REGISTRY_SERVER_NAME,
  STRIPPED_MODULE,
  TYPED_MODULE,
  artifactUrlProblems,
  bundleArtifactName,
  bundleDownloadUrl,
  bundleFileList,
  bundleManifest,
  bundlePackageJson,
  bundleProvenance,
  dependencyClosure,
  isBundleBallast,
  registryInvariantProblems,
  serverJson,
  serverJsonProblems,
} from './lib/mcp-bundle.mjs';
import { parseArgs, tagProblems, usage } from './build-server-json.mjs';

const MCP_PACKAGE = JSON.parse(readFileSync('mcp/package.json', 'utf8'));
const DOCKERFILE = readFileSync('mcp/Dockerfile', 'utf8');
const WORKFLOW = readFileSync('.github/workflows/release-macos.yml', 'utf8');

describe('bundle contents', () => {
  /**
   * The bundle ships what the server itself declares. If these two lists were
   * maintained separately, a new module would reach npm's `files` and silently
   * miss the bundle, which fails only at a user's install.
   */
  it('carries every declared shipping file, with the typed module renamed', () => {
    const bundled = bundleFileList(MCP_PACKAGE.files);

    assert.ok(MCP_PACKAGE.files.includes(TYPED_MODULE), 'mcp/package.json must still declare the typed module');
    assert.ok(bundled.includes(STRIPPED_MODULE), 'the bundle must carry the stripped twin');
    assert.ok(!bundled.includes(TYPED_MODULE), 'the bundle must not carry the .mts source');
    assert.equal(bundled.length, MCP_PACKAGE.files.length - EXCLUDED_FROM_BUNDLE.length);
  });

  it('leaves the test fixture behind, because a host has no test runner', () => {
    for (const excluded of EXCLUDED_FROM_BUNDLE) {
      assert.ok(MCP_PACKAGE.files.includes(excluded), `mcp/package.json should still declare ${excluded} for npm test`);
      assert.ok(!bundleFileList(MCP_PACKAGE.files).includes(excluded), `${excluded} must not ship in the bundle`);
    }
  });

  /**
   * pnpm links `zod` only under the SDK, so a flat lookup in `mcp/node_modules`
   * finds the two direct dependencies and stops. The walk therefore resolves each
   * package from the directory of the package that depends on it.
   */
  it('walks a transitive dependency that lives only under its dependent', () => {
    const tree = {
      '/mcp': { dependencies: { '@scope/server': '1' } },
      '/store/server': { name: '@scope/server', dependencies: { zod: '4' } },
      '/store/server/node_modules/zod': { name: 'zod' },
    };
    const { packages, missing } = dependencyClosure({
      rootDependencies: tree['/mcp'].dependencies,
      rootDir: '/mcp',
      resolvePackageDir: (name, fromDir) => {
        if (name === '@scope/server' && fromDir === '/mcp') return '/store/server';
        if (name === 'zod' && fromDir === '/store/server') return '/store/server/node_modules/zod';
        return null;
      },
      readManifest: (dir) => tree[dir] ?? null,
    });

    assert.deepEqual(missing, []);
    assert.deepEqual(packages.map(({ name }) => name), ['@scope/server', 'zod']);
  });

  it('reports a dependency it cannot resolve instead of shipping a bundle without it', () => {
    const { packages, missing } = dependencyClosure({
      rootDependencies: { absent: '1' },
      rootDir: '/mcp',
      resolvePackageDir: () => null,
      readManifest: () => null,
    });

    assert.deepEqual(packages, []);
    assert.deepEqual(missing, ['absent']);
  });
});

describe('bundle manifest', () => {
  it('starts the server the way a host does, and asks for the vault as a folder', () => {
    const manifest = bundleManifest({ version: '9.9.9', description: 'd' });

    assert.equal(manifest.server.type, 'node');
    assert.equal(manifest.server.mcp_config.command, 'node');
    assert.equal(manifest.server.mcp_config.args[0], '${__dirname}/server/src/index.js');
    assert.equal(manifest.server.mcp_config.env.OATLAS_VAULT, '${user_config.vault}');
    assert.equal(manifest.user_config.vault.type, 'directory');
    assert.equal(manifest.user_config.vault.required, true);
  });

  /**
   * The `engines` pin in `mcp/package.json` is this repository's toolchain
   * choice. A host supplies its own Node, and the bundle answered `tools/list`
   * with every tool on Node 20, 22, 24 and 25 once the one typed module was
   * stripped — so the manifest states the SDK's floor, not the pin.
   */
  it('claims the runtime floor the stripped bundle actually runs on', () => {
    assert.equal(bundleManifest({ version: '1', description: 'd' }).compatibility.runtimes.node, '>=20');
    assert.match(MCP_PACKAGE.engines.node, /^>=24/);
  });
});

describe('registry entry', () => {
  it('names the release-asset channel and no package registry', () => {
    const document = serverJson({ version: '0.13.0', tag: 'v1.1.0', fileSha256: 'a'.repeat(64) });

    assert.deepEqual(document.packages.map((entry) => entry.registryType), ['mcpb']);
    assert.equal(document.name, REGISTRY_SERVER_NAME);
    assert.equal(document.packages[0].fileSha256, 'a'.repeat(64));
    assert.match(document.packages[0].identifier, /^https:\/\/github\.com\/.+\.mcpb$/);
  });

  it('keeps the artifact URL verifiable: GitHub-hosted and carrying "mcp"', () => {
    assert.deepEqual(artifactUrlProblems(bundleDownloadUrl('v1.1.0', '0.13.0')), []);
    assert.deepEqual(artifactUrlProblems('https://example.com/bundle.mcpb'), [
      'the registry accepts MCPB artifacts hosted on GitHub or GitLab releases only',
    ]);
    assert.deepEqual(artifactUrlProblems('https://github.com/wlsdks/ontology-atlas/releases/download/v1/atlas.zip'), [
      'the artifact URL must contain "mcp" for registry ownership verification',
    ]);
  });

  it('holds the image label and the registry name to the same string', () => {
    assert.deepEqual(registryInvariantProblems({ dockerfile: DOCKERFILE, version: MCP_PACKAGE.version, tag: 'v1.1.0' }), []);

    const drifted = DOCKERFILE.replace(
      `LABEL ${OWNERSHIP_LABEL}="${REGISTRY_SERVER_NAME}"`,
      `LABEL ${OWNERSHIP_LABEL}="io.github.someone/else"`,
    );
    const problems = registryInvariantProblems({ dockerfile: drifted, version: MCP_PACKAGE.version, tag: 'v1.1.0' });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /io\.github\.someone\/else/);
  });

  it('refuses a missing ownership label outright', () => {
    const problems = registryInvariantProblems({ dockerfile: 'FROM node:24-alpine\n', version: '1.0.0' });
    assert.ok(problems.some((problem) => problem.includes(OWNERSHIP_LABEL)));
  });
});

describe('server.json CLI', () => {
  it('requires a release tag shaped like a tag, since the artifact URL is built from it', () => {
    assert.deepEqual(tagProblems('v1.1.0'), []);
    assert.equal(tagProblems('v1.1.0-rc.1').length, 1);
    assert.equal(tagProblems('1.1.0').length, 1);
    assert.equal(tagProblems(null).length, 1);
  });

  it('accepts the separator pnpm forwards and rejects an unknown flag', () => {
    assert.equal(parseArgs(['--', '--tag=v1.1.0']).tag, 'v1.1.0');
    assert.equal(parseArgs(['--check']).check, true);
    assert.match(parseArgs(['--publish']).error, /unknown argument/);
    assert.match(usage(), /--artifact/);
  });
});

describe('what the artifact must not carry, and what it must', () => {
  /**
   * Copying `mcp/package.json` shipped three contradictions to end users: an
   * `engines` pin of `>=24 <25` beside a bundle measured on Node 20, a `files`
   * list naming two modules the bundle deliberately drops, and a Korean
   * maintainer note in the most public copy of that file.
   */
  it('writes its own manifest instead of copying the repository one', () => {
    const manifest = bundlePackageJson({ version: '0.13.0' });

    assert.equal(manifest.type, 'module', 'Node needs this to load the server as ESM');
    assert.equal(manifest.license, 'MIT');
    assert.ok(!('engines' in manifest), 'the repository toolchain pin is not this bundle requirement');
    assert.ok(!('files' in manifest), 'a files list would name modules the bundle does not carry');
    assert.ok(!('pnpm' in manifest));
  });

  it('drops a vendored package tests, fixtures and source maps, and keeps its licence', () => {
    assert.equal(isBundleBallast('src/v3/tests/string.test.ts'), true);
    assert.equal(isBundleBallast('src/v4/core/tests'), true, 'the directory itself, or four empty folders remain');
    assert.equal(isBundleBallast('dist/index.js.map'), true);
    assert.equal(isBundleBallast('CHANGELOG.md'), true);
    assert.equal(isBundleBallast('LICENSE'), false, 'the licence is the one file a vendored package owes');
    assert.equal(isBundleBallast('dist/index.js'), false);
    assert.equal(isBundleBallast('src/latest.ts'), false);
  });

  it('states which commit produced the file, since two releases can share a version', () => {
    const text = bundleProvenance({
      version: '0.13.0',
      commit: 'abc1234',
      tag: 'v1.1.0',
      builtAt: '2026-09-11T00:00:00.000Z',
      witnessedRuntimes: ['node 24.16.0', 'node 20.20.0'],
    });

    assert.match(text, /built from\s+abc1234/);
    assert.match(text, /release tag\s+v1\.1\.0/);
    assert.match(text, /booted under\s+node 24\.16\.0, node 20\.20\.0/);
    assert.match(text, /opens no port/);
    assert.match(bundleProvenance({ version: '1', commit: 'c', tag: null, builtAt: 'b', witnessedRuntimes: [] }), /\(none: local build\)/);
  });
});

describe('what the registry would actually accept', () => {
  /**
   * The check that used to print "ready to publish" verified three fields and
   * not the document. Measured: the server's own npm description is 126
   * characters against a schema limit of 100, so a publish would have been
   * rejected after a green check.
   */
  it('keeps the description inside the schema limit the registry enforces', () => {
    const document = serverJson({ version: '0.13.0', tag: 'v1.1.0', fileSha256: 'a'.repeat(64) });

    assert.ok(document.description.length <= REGISTRY_DESCRIPTION_LIMIT);
    assert.notEqual(document.description, MCP_PACKAGE.description, 'the npm description is too long for this field');
    assert.ok(MCP_PACKAGE.description.length > REGISTRY_DESCRIPTION_LIMIT, 'the reason this field is separate');
    assert.deepEqual(serverJsonProblems(document), []);
  });

  it('reports every constraint a publish would reject, rather than three fields', () => {
    assert.deepEqual(serverJsonProblems({ name: 'nope', version: 'x', packages: [] }).sort(), [
      'at least one package is required',
      'description is required',
      'name must be <namespace>/<id>, received "nope"',
      'version must be a semantic version',
    ]);
    const overlong = serverJson({ version: '0.13.0', tag: 'v1.1.0', fileSha256: 'a'.repeat(64) });
    overlong.description = 'x'.repeat(REGISTRY_DESCRIPTION_LIMIT + 1);
    assert.match(serverJsonProblems(overlong)[0], /description is 101 characters/);
  });

  /**
   * A listing whose image nobody pushed sends a stranger to `manifest unknown`,
   * which is exactly what the registry's ownership check exists to prevent.
   */
  it('leaves the image entry out until a person passes --with-image', () => {
    const withoutImage = serverJson({ version: '0.13.0', tag: 'v1.1.0', fileSha256: 'a'.repeat(64) });
    const withImage = serverJson({ version: '0.13.0', tag: 'v1.1.0', fileSha256: 'a'.repeat(64), withImage: true });

    assert.deepEqual(withoutImage.packages.map((entry) => entry.registryType), ['mcpb']);
    assert.deepEqual(withImage.packages.map((entry) => entry.registryType), ['mcpb', 'oci']);
    // The registry rejects both keys on an oci entry.
    assert.ok(!('version' in withImage.packages[1]));
    assert.ok(!('fileSha256' in withImage.packages[1]));
    assert.deepEqual(serverJsonProblems(withImage), []);
  });

  it('refuses an oci identifier that is not registry/repository:tag', () => {
    const document = serverJson({ version: '0.13.0', tag: 'v1.1.0', fileSha256: 'a'.repeat(64), withImage: true });
    document.packages[1].identifier = 'ontology-atlas-mcp';
    assert.match(serverJsonProblems(document).join(' '), /registry\/repository:tag/);
  });
});

describe('the image', () => {
  it('does not run as root, since a write lands in the mounted folder', () => {
    assert.match(DOCKERFILE, /^USER node$/m);
  });

  /**
   * An outside builder starts at the repository root. The awesome-list bot's
   * Glama requirement is what exposed this: a directory that builds a server
   * from its Dockerfile would have taken the app's `package.json` and died on a
   * missing `CHANGELOG.md`. Every COPY is repository-relative now, so the same
   * file serves us and them.
   */
  it('copies from the repository root, since that is the context a directory uses', () => {
    assert.match(DOCKERFILE, /build context is the repository root/);
    for (const line of DOCKERFILE.split('\n').filter((row) => row.startsWith('COPY '))) {
      assert.match(line, /^COPY (?:mcp\/|LICENSE)/, `a root-context build needs a repository-relative source: ${line}`);
    }
    assert.match(DOCKERFILE, /docker build -f mcp\/Dockerfile -t ontology-atlas-mcp \./);
  });

  it('states the multi-architecture push and the uid override, both measured', () => {
    assert.match(DOCKERFILE, /docker buildx build --platform linux\/amd64,linux\/arm64 -f mcp\/Dockerfile/);
    assert.match(DOCKERFILE, /--user "\$\(id -u\):\$\(id -g\)"/);
  });

  it('carries the licence its own labels claim', () => {
    assert.match(DOCKERFILE, /^COPY LICENSE \.\/$/m);
    assert.match(DOCKERFILE, /org\.opencontainers\.image\.licenses="MIT"/);
  });

  it('carries no test suite, because it has no runner for one', () => {
    assert.match(DOCKERFILE, /rm -f src\/\*\.test\.mjs/);
  });
});

describe('release wiring', () => {
  /**
   * A bundle nobody uploads is not a channel. The registry entry points at a
   * release asset by name, so the release must actually carry that name.
   */
  it('uploads the bundle and its checksum with the release', () => {
    assert.match(WORKFLOW, /release-assets\/mcp\/\*\.mcpb$/m);
    assert.match(WORKFLOW, /release-assets\/mcp\/\*\.mcpb\.sha256$/m);
    assert.match(WORKFLOW, /pnpm mcp:build-bundle/);
  });

  it('builds the bundle after the updater manifest, which splits architectures by folder', () => {
    assert.ok(
      WORKFLOW.indexOf('Build updater manifest') < WORKFLOW.indexOf('Build the MCP ecosystem bundle'),
      'the manifest builder must not see release-assets/mcp/',
    );
  });

  it('names the artifact the registry entry expects', () => {
    assert.equal(bundleArtifactName(MCP_PACKAGE.version), `ontology-atlas-mcp-${MCP_PACKAGE.version}.mcpb`);
    assert.ok(bundleDownloadUrl('v1.1.0', MCP_PACKAGE.version).endsWith(bundleArtifactName(MCP_PACKAGE.version)));
  });
});
