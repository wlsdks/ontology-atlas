#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  OWNERSHIP_LABEL,
  REGISTRY_DESCRIPTION_LIMIT,
  REGISTRY_SERVER_NAME,
  artifactUrlProblems,
  bundleArtifactName,
  bundleDownloadUrl,
  bundleManifest,
  bundleProgramPath,
  bundleProgramProblems,
  bundleProvenance,
  bundleSelectorScript,
  registryInvariantProblems,
  serverJson,
  serverJsonProblems,
} from '../lib/packaging/mcp-bundle.mjs';
import { parseArgs, tagProblems, usage } from './build-server-json.mjs';

const MCP_PACKAGE = JSON.parse(readFileSync('mcp/package.json', 'utf8'));
const DOCKERFILE = readFileSync('mcp/Dockerfile', 'utf8');
const WORKFLOW = readFileSync('.github/workflows/release-macos.yml', 'utf8');

/** Every system and architecture the bundle has carried; losing one strands the people on it. */
const SHIPPED_TRIPLES = [
  'aarch64-apple-darwin',
  'x86_64-apple-darwin',
  'x86_64-unknown-linux-musl',
  'aarch64-unknown-linux-musl',
  'x86_64-pc-windows-msvc',
];

describe('bundle manifest', () => {
  /**
   * MCPB manifest 0.3 keys `platform_overrides` by operating system alone, so the two systems that
   * hold two architectures start a selector and the one that holds a single program starts it.
   */
  it('starts the program of a system that has one, and a selector for a system that has two', () => {
    const manifest = bundleManifest({ version: '9.9.9', description: 'd', triples: SHIPPED_TRIPLES });

    assert.equal(manifest.server.type, 'binary');
    assert.deepEqual(manifest.server.mcp_config.platform_overrides, {
      darwin: { command: '${__dirname}/server/start-ontology-atlas-mcp-darwin' },
      linux: { command: '${__dirname}/server/start-ontology-atlas-mcp-linux' },
      win32: { command: '${__dirname}/server/ontology-atlas-mcp-x86_64-pc-windows-msvc.exe' },
    });
    assert.deepEqual(manifest.compatibility, { platforms: ['darwin', 'linux', 'win32'] });
    assert.equal(manifest.server.mcp_config.env.OATLAS_VAULT, '${user_config.vault}');
    assert.equal(manifest.user_config.vault.type, 'directory');
    assert.equal(manifest.user_config.vault.required, true);
    assert.ok(!('runtimes' in manifest.compatibility), 'a native program needs no runtime');

    const single = bundleManifest({ version: '9.9.9', description: 'd', triples: ['aarch64-apple-darwin'] });
    assert.deepEqual(single.server.mcp_config.platform_overrides, {
      darwin: { command: '${__dirname}/server/ontology-atlas-mcp-aarch64-apple-darwin' },
    });
  });

  it('refuses an unknown target, an empty set and two programs a host cannot tell apart', () => {
    assert.deepEqual(bundleProgramProblems(SHIPPED_TRIPLES), []);
    assert.match(
      bundleProgramProblems(['x86_64-unknown-linux-gnu', 'x86_64-unknown-linux-musl']).join(' '),
      /both linux programs for one architecture/,
    );
    assert.match(bundleProgramProblems(['riscv64-unknown-linux-gnu']).join(' '), /not a target the bundle knows/);
    assert.match(bundleProgramProblems([]).join(' '), /no program was given/);
    assert.equal(bundleProgramPath('x86_64-pc-windows-msvc'), 'server/ontology-atlas-mcp-x86_64-pc-windows-msvc.exe');
  });

  it('starts the program built for this machine and refuses a machine it has none for', { skip: process.platform === 'win32' }, () => {
    const triples = ['x86_64-unknown-linux-musl', 'aarch64-unknown-linux-musl'];
    const folder = mkdtempSync(path.join(tmpdir(), 'bundle-selector-'));
    try {
      for (const triple of triples) {
        writeFileSync(path.join(folder, `ontology-atlas-mcp-${triple}`), `#!/bin/sh\necho "${triple} $1"\n`, { mode: 0o755 });
      }
      const selector = path.join(folder, 'start');
      writeFileSync(selector, bundleSelectorScript(triples), { mode: 0o755 });

      const started = spawnSync(selector, ['argument'], { encoding: 'utf8' });
      const expected = process.arch === 'arm64' ? triples[1] : triples[0];
      if (process.arch === 'arm64' || process.arch === 'x64') {
        assert.equal(started.stdout.trim(), `${expected} argument`);
      }

      writeFileSync(selector, bundleSelectorScript([triples[0]]).replace('x86_64|amd64', 'no-such-machine'), { mode: 0o755 });
      const refused = spawnSync(selector, [], { encoding: 'utf8' });
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, /no program for/);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  /**
   * The release builds the programs on runners of their own architecture and names all of them in
   * the one bundle command, so a dropped job or a dropped flag shows here before a release does.
   */
  it('builds and bundles a program for every system and architecture the bundle has carried', () => {
    assert.deepEqual(bundleProgramProblems(SHIPPED_TRIPLES), []);
    for (const triple of SHIPPED_TRIPLES) {
      assert.match(WORKFLOW, new RegExp(`--program=${triple}=`), `the bundle command names no ${triple} program`);
    }
    const builtByTheRelease = SHIPPED_TRIPLES.filter((triple) => triple !== 'aarch64-apple-darwin' && !triple.includes('windows'));
    for (const triple of builtByTheRelease) {
      assert.match(WORKFLOW, new RegExp(`target: ${triple}\\n\\s+runner: \\S+`), `no job builds the ${triple} program`);
    }
    assert.match(WORKFLOW, /target: aarch64-unknown-linux-musl\n\s+runner: ubuntu-24\.04-arm/, 'arm64 Linux builds on its own runner');
  });
});

describe('registry entry', () => {
  it('names the release-asset channel and no package registry', () => {
    const document = serverJson({ version: MCP_PACKAGE.version, tag: 'v1.1.0', fileSha256: 'a'.repeat(64) });

    assert.deepEqual(document.packages.map((entry) => entry.registryType), ['mcpb']);
    assert.equal(document.name, REGISTRY_SERVER_NAME);
    assert.equal(document.packages[0].fileSha256, 'a'.repeat(64));
    assert.match(document.packages[0].identifier, /^https:\/\/github\.com\/.+\.mcpb$/);
  });

  it('keeps the artifact URL verifiable: GitHub-hosted and carrying "mcp"', () => {
    assert.deepEqual(artifactUrlProblems(bundleDownloadUrl('v1.1.0', MCP_PACKAGE.version)), []);
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

describe('what the artifact must say', () => {
  it('states which commit and which programs produced the file, since two releases can share a version', () => {
    const text = bundleProvenance({
      version: MCP_PACKAGE.version,
      commit: 'abc1234',
      tag: 'v1.1.0',
      builtAt: '2026-09-11T00:00:00.000Z',
      triples: SHIPPED_TRIPLES,
      bootedTriple: 'aarch64-apple-darwin',
    });

    assert.match(text, /built from\s+abc1234/);
    assert.match(text, /release tag\s+v1\.1\.0/);
    assert.ok(text.includes(`programs         ${SHIPPED_TRIPLES.join(', ')}`));
    assert.match(text, /booted\s+aarch64-apple-darwin/);
    assert.match(text, /opens no port/);
    assert.match(
      bundleProvenance({ version: '1', commit: 'c', tag: null, builtAt: 'b', triples: ['t'], bootedTriple: 't' }),
      /\(none: local build\)/,
    );
  });
});

describe('what the registry would actually accept', () => {
  /**
   * The registry check must validate the whole document: the server's npm description is longer than
   * the schema limit, so a three-field check would pass and the publish would be rejected.
   */
  it('keeps the description inside the schema limit the registry enforces', () => {
    const document = serverJson({ version: MCP_PACKAGE.version, tag: 'v1.1.0', fileSha256: 'a'.repeat(64) });

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
    const overlong = serverJson({ version: MCP_PACKAGE.version, tag: 'v1.1.0', fileSha256: 'a'.repeat(64) });
    overlong.description = 'x'.repeat(REGISTRY_DESCRIPTION_LIMIT + 1);
    assert.match(serverJsonProblems(overlong)[0], /description is 101 characters/);
  });

  /**
   * A listing whose image nobody pushed sends a stranger to `manifest unknown`,
   * which is exactly what the registry's ownership check exists to prevent.
   */
  it('leaves the image entry out until a person passes --with-image', () => {
    const withoutImage = serverJson({ version: MCP_PACKAGE.version, tag: 'v1.1.0', fileSha256: 'a'.repeat(64) });
    const withImage = serverJson({ version: MCP_PACKAGE.version, tag: 'v1.1.0', fileSha256: 'a'.repeat(64), withImage: true });

    assert.deepEqual(withoutImage.packages.map((entry) => entry.registryType), ['mcpb']);
    assert.deepEqual(withImage.packages.map((entry) => entry.registryType), ['mcpb', 'oci']);
    // The registry rejects both keys on an oci entry.
    assert.ok(!('version' in withImage.packages[1]));
    assert.ok(!('fileSha256' in withImage.packages[1]));
    assert.deepEqual(serverJsonProblems(withImage), []);
  });

  it('refuses an oci identifier that is not registry/repository:tag', () => {
    const document = serverJson({ version: MCP_PACKAGE.version, tag: 'v1.1.0', fileSha256: 'a'.repeat(64), withImage: true });
    document.packages[1].identifier = 'ontology-atlas-mcp';
    assert.match(serverJsonProblems(document).join(' '), /registry\/repository:tag/);
  });
});

describe('the image', () => {
  it('does not run as root, since a write lands in the mounted folder', () => {
    assert.match(DOCKERFILE, /^USER atlas$/m);
  });

  it('runs the Rust program built from the crate, with no Node in it', () => {
    assert.match(DOCKERFILE, /cargo build --release --locked -p mcp-server/);
    assert.match(DOCKERFILE, /^ENTRYPOINT \["\/usr\/local\/bin\/ontology-atlas-mcp"\]$/m);
    assert.doesNotMatch(DOCKERFILE.split('\n').filter((row) => /^(?:FROM|RUN|COPY|ENTRYPOINT)\b/.test(row)).join('\n'), /node|pnpm|npm/i);
  });

  /**
   * An outside builder starts at the repository root. The awesome-list bot's
   * Glama requirement is what exposed this: a directory that builds a server
   * from its Dockerfile would have taken the app's `package.json`. Every COPY
   * from the build context is repository-relative, so the same file serves us and them.
   */
  it('copies from the repository root, since that is the context a directory uses', () => {
    assert.match(DOCKERFILE, /build context is the repository root/);
    for (const line of DOCKERFILE.split('\n').filter((row) => row.startsWith('COPY ') && !row.startsWith('COPY --from='))) {
      assert.match(line, /^COPY (?:src-tauri\/|LICENSE)/, `a root-context build needs a repository-relative source: ${line}`);
    }
    assert.match(DOCKERFILE, /docker build -f mcp\/Dockerfile -t ontology-atlas-mcp \./);
  });

  it('states the multi-architecture push and the uid override', () => {
    assert.match(DOCKERFILE, /docker buildx build --platform linux\/amd64,linux\/arm64 -f mcp\/Dockerfile/);
    assert.match(DOCKERFILE, /--user "\$\(id -u\):\$\(id -g\)"/);
  });

  it('pins both stages by digest and builds with the Rust the repository pins', () => {
    const channel = /^\s*channel\s*=\s*"([^"]+)"/m.exec(readFileSync('rust-toolchain.toml', 'utf8'))[1];
    const froms = DOCKERFILE.split('\n').filter((row) => row.startsWith('FROM '));
    assert.equal(froms.length, 2);
    for (const from of froms) assert.match(from, /@sha256:[0-9a-f]{64}/, `a moved tag would change the image: ${from}`);
    assert.ok(froms[0].startsWith(`FROM rust:${channel}-alpine@`), `the build stage uses Rust ${channel}`);
  });

  it('carries the licence its own labels claim', () => {
    assert.match(DOCKERFILE, /^COPY LICENSE \/usr\/share\/licenses\/ontology-atlas-mcp\/LICENSE$/m);
    assert.match(DOCKERFILE, /org\.opencontainers\.image\.licenses="MIT"/);
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
