#!/usr/bin/env node
// Pack the local MCP + CLI packages, install the tarballs into a fresh temp
// project, then exercise the installed `oh-my-ontology` bin. This catches
// package `files`, bin, dependency, and MCP-spawn drift that source-checkout
// smoke tests can miss.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { checkMcpLeanTarballFiles } from './check-package-contracts.mjs';
import { parseMcpToolMetadataFromDescription } from '../cli/src/lib/mcp-metadata.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MCP_DIR = join(ROOT, 'mcp');
const CLI_DIR = join(ROOT, 'cli');
const MCP_PKG = JSON.parse(readFileSync(join(MCP_DIR, 'package.json'), 'utf-8'));
const CLI_PKG = JSON.parse(readFileSync(join(CLI_DIR, 'package.json'), 'utf-8'));
const mcpToolMetadata = parseMcpToolMetadataFromDescription(MCP_PKG.description);
const expectedToolCount = mcpToolMetadata?.toolCount;
const expectedToolSplitRe = mcpToolMetadata?.splitPattern;

assert.ok(mcpToolMetadata, 'mcp/package.json description must include the current tool count and split');

function run(cmd, args, options = {}) {
  const result = runRaw(cmd, args, options);
  assert.equal(
    result.status,
    0,
    `${cmd} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function runRaw(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: 'utf-8',
  });
}

function packPackage(packageDir, destination) {
  const result = run('npm', ['pack', '--pack-destination', destination], {
    cwd: packageDir,
  });
  const filename = result.stdout.trim().split('\n').filter(Boolean).at(-1);
  assert.ok(filename?.endsWith('.tgz'), `npm pack did not print a tarball name: ${result.stdout}`);
  return join(destination, filename);
}

function packSummary(packageDir) {
  const result = run('npm', ['pack', '--dry-run', '--json'], { cwd: packageDir });
  const [summary] = JSON.parse(result.stdout);
  return {
    name: summary.name,
    version: summary.version,
    size: summary.size,
    unpackedSize: summary.unpackedSize,
    entryCount: summary.entryCount,
    files: summary.files.map((file) => file.path),
  };
}

function writeCycleVault(root) {
  mkdirSync(join(root, 'capabilities'), { recursive: true });
  mkdirSync(join(root, 'domains'), { recursive: true });
  writeFileSync(
    join(root, 'capabilities', 'a.md'),
    [
      '---',
      'kind: capability',
      'slug: capabilities/a',
      'title: A',
      'domain: domains/auth',
      'dependencies: [capabilities/b]',
      '---',
      '',
      '# A',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'capabilities', 'b.md'),
    [
      '---',
      'kind: capability',
      'slug: capabilities/b',
      'title: B',
      'domain: domains/auth',
      'dependencies: [capabilities/a]',
      '---',
      '',
      '# B',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, 'domains', 'auth.md'),
    [
      '---',
      'kind: domain',
      'slug: domains/auth',
      'title: Auth',
      'capabilities: [capabilities/a, capabilities/b]',
      '---',
      '',
      '# Auth',
      '',
    ].join('\n'),
  );
}

function writeDanglingVault(root) {
  mkdirSync(join(root, 'capabilities'), { recursive: true });
  writeFileSync(
    join(root, 'capabilities', 'a.md'),
    [
      '---',
      'kind: capability',
      'slug: capabilities/a',
      'title: A',
      'dependencies: [capabilities/missing]',
      '---',
      '',
      '# A',
      '',
    ].join('\n'),
  );
}

function writeDisconnectedVault(root) {
  mkdirSync(join(root, 'capabilities'), { recursive: true });
  for (const slug of ['a', 'b']) {
    writeFileSync(
      join(root, 'capabilities', `${slug}.md`),
      [
        '---',
        'kind: capability',
        `slug: capabilities/${slug}`,
        `title: ${slug.toUpperCase()}`,
        '---',
        '',
        `# ${slug.toUpperCase()}`,
        '',
      ].join('\n'),
    );
  }
}

function writeProjectlessVault(root) {
  mkdirSync(join(root, 'domains'), { recursive: true });
  writeFileSync(
    join(root, 'domains', 'core.md'),
    [
      '---',
      'kind: domain',
      'slug: domains/core',
      'title: Core',
      '---',
      '',
      '# Core',
      '',
    ].join('\n'),
  );
}

const temp = mkdtempSync(join(tmpdir(), 'omot-packed-cli-'));
try {
  const packDir = join(temp, 'packs');
  const installDir = join(temp, 'install');
  const projectDir = join(temp, 'project');
  mkdirSync(packDir, { recursive: true });
  mkdirSync(installDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });

  const mcpTgz = packPackage(MCP_DIR, packDir);
  const cliTgz = packPackage(CLI_DIR, packDir);

  writeFileSync(
    join(installDir, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }, null, 2),
  );
  run('npm', ['install', '--ignore-scripts', mcpTgz, cliTgz], { cwd: installDir });

  const cliBin = join(installDir, 'node_modules', '.bin', 'oh-my-ontology');
  assert.equal(existsSync(cliBin), true, 'installed CLI bin is missing');

  const version = run(cliBin, ['--version'], { cwd: projectDir });
  assert.equal(version.stdout.trim(), CLI_PKG.version);

  const init = run(cliBin, ['init', 'ontology'], { cwd: projectDir });
  assert.match(init.stdout, new RegExp(`${expectedToolCount} tools`));
  assert.match(init.stdout, expectedToolSplitRe);
  assert.match(init.stdout, /codex mcp add oh-my-ontology/);

  const config = JSON.parse(readFileSync(join(projectDir, '.mcp.json'), 'utf-8'));
  const server = config.mcpServers['oh-my-ontology'];
  assert.equal(server.command, 'node');
  assert.match(server.args[0], /node_modules\/oh-my-ontology-mcp\/src\/index\.js$/);
  assert.equal(server.env.OMOT_VAULT, './ontology');

  const cliMcpVerify = run(cliBin, ['mcp-verify', 'ontology', '--timeout-ms', '1000'], {
    cwd: projectDir,
  });
  assert.match(cliMcpVerify.stdout, /timeout=1000ms/);
  assert.match(cliMcpVerify.stdout, new RegExp(`tools/list ${expectedToolCount}/${expectedToolCount}`));
  assert.match(cliMcpVerify.stdout, /list_kinds/);
  assert.match(cliMcpVerify.stdout, /validate_vault/);
  assert.match(cliMcpVerify.stdout, /workspace_brief/);
  assert.match(cliMcpVerify.stdout, /workspace_brief — .*next actions, .*health checks/);
  assert.match(cliMcpVerify.stdout, /workspace_brief_tuned — .*next actions, .*health checks/);
  assert.match(cliMcpVerify.stdout, /workspace_brief advisory nextActions/);
  assert.match(cliMcpVerify.stdout, /compile_issues:warn/);
  assert.match(cliMcpVerify.stdout, /health — .*checks/);
  assert.match(cliMcpVerify.stdout, /health — .*compile_issues:(pass|warn)/);
  assert.match(cliMcpVerify.stdout, /health_tuned — .*checks/);
  assert.match(cliMcpVerify.stdout, /health_tuned — .*compile_issues:(pass|warn)/);
  assert.match(cliMcpVerify.stdout, /compile_ontology/);
  assert.match(cliMcpVerify.stdout, /overview/);
  assert.match(cliMcpVerify.stdout, /overview query_plan/);
  assert.match(cliMcpVerify.stdout, /project_map query_plan/);
  assert.match(cliMcpVerify.stdout, /maintenance cursor — missing afterActionId reported/);
  assert.match(cliMcpVerify.stdout, /neighbors — elements\/example/);
  assert.match(cliMcpVerify.stdout, /path — elements\/example → project \(1 hop, 1 edge\)/);
  assert.match(cliMcpVerify.stdout, /project_scope/);

  const projectlessVault = join(projectDir, 'projectless-vault');
  writeProjectlessVault(projectlessVault);
  const cliProjectlessMcpVerify = run(cliBin, ['mcp-verify', projectlessVault, '--timeout-ms', '1000'], {
    cwd: projectDir,
  });
  assert.match(cliProjectlessMcpVerify.stdout, /maintenance cursor — missing afterActionId reported/);
  assert.match(cliProjectlessMcpVerify.stdout, /neighbors — domains\/core/);
  assert.match(cliProjectlessMcpVerify.stdout, /path — domains\/core → domains\/core \(0 hops, 0 edges\)/);
  assert.match(cliProjectlessMcpVerify.stdout, /project_scope — skipped \(no project node in vault\)/);

  const emptyVault = join(projectDir, 'empty-vault');
  mkdirSync(emptyVault, { recursive: true });
  const cliEmptyMcpVerify = run(cliBin, ['mcp-verify', emptyVault, '--timeout-ms', '1000'], {
    cwd: projectDir,
  });
  assert.match(cliEmptyMcpVerify.stdout, /vault total 0 nodes/);
  assert.match(cliEmptyMcpVerify.stdout, /neighbors\/path — skipped \(vault has no nodes\)/);
  assert.match(cliEmptyMcpVerify.stdout, /project_scope — skipped \(no project node in vault\)/);

  const cliMcpVerifyHelp = run(cliBin, ['mcp-verify', '--help'], { cwd: projectDir });
  assert.equal(cliMcpVerifyHelp.stderr, '');
  assert.match(cliMcpVerifyHelp.stdout, /Usage:/);
  assert.match(cliMcpVerifyHelp.stdout, /compile_ontology/);
  assert.match(cliMcpVerifyHelp.stdout, /neighbors\/node-to-project path\/project_scope graph-query smoke/);
  assert.match(cliMcpVerifyHelp.stdout, /tools\/list schema strictness/);
  assert.match(cliMcpVerifyHelp.stdout, /runtime unknown-argument \/ invalid-enum rejection/);
  assert.match(cliMcpVerifyHelp.stdout, /missing maintenance_plan\.afterActionId cursor smoke/);
  assert.match(cliMcpVerifyHelp.stdout, /Maintenance filters are enum-validated for phases\/severities\/kinds/);
  assert.match(cliMcpVerifyHelp.stdout, /cursor miss smoke requires cursor\.found=false, cursor\.reason, zero remaining actions, and no next actions/);

  const missingVerifyOverride = runRaw(cliBin, ['mcp-verify', 'ontology'], {
    cwd: projectDir,
    env: { OMOT_MCP_VERIFY_PATH: join(temp, 'missing-verify.mjs') },
  });
  assert.equal(missingVerifyOverride.status, 2);
  assert.match(missingVerifyOverride.stderr, /OMOT_MCP_VERIFY_PATH does not exist/);

  const directoryVerifyOverride = runRaw(cliBin, ['mcp-verify', 'ontology'], {
    cwd: projectDir,
    env: { OMOT_MCP_VERIFY_PATH: temp },
  });
  assert.equal(directoryVerifyOverride.status, 2);
  assert.match(directoryVerifyOverride.stderr, /OMOT_MCP_VERIFY_PATH is not a file/);

  const missingMcpEntryOverride = runRaw(cliBin, ['overview', 'ontology'], {
    cwd: projectDir,
    env: { OMOT_MCP_PATH: join(temp, 'missing-mcp-entry.js') },
  });
  assert.equal(missingMcpEntryOverride.status, 2);
  assert.match(missingMcpEntryOverride.stderr, /OMOT_MCP_PATH does not exist/);
  assert.doesNotMatch(missingMcpEntryOverride.stderr, /MODULE_NOT_FOUND|mcp exited/);

  const directoryMcpEntryOverride = runRaw(cliBin, ['overview', 'ontology'], {
    cwd: projectDir,
    env: { OMOT_MCP_PATH: temp },
  });
  assert.equal(directoryMcpEntryOverride.status, 2);
  assert.match(directoryMcpEntryOverride.stderr, /OMOT_MCP_PATH is not a file/);
  assert.doesNotMatch(directoryMcpEntryOverride.stderr, /MODULE_NOT_FOUND|mcp exited/);

  const missingVaultRoot = runRaw(cliBin, ['list', 'not-a-vault'], { cwd: projectDir });
  assert.equal(missingVaultRoot.status, 2);
  assert.match(missingVaultRoot.stderr, /Vault root not found/);
  assert.equal(missingVaultRoot.stdout, '');

  const missingMcpVaultRoot = runRaw(cliBin, ['overview', 'not-a-vault'], { cwd: projectDir });
  assert.equal(missingMcpVaultRoot.status, 2);
  assert.match(missingMcpVaultRoot.stderr, /Vault root not found/);
  assert.doesNotMatch(missingMcpVaultRoot.stderr, /mcp exited|vault root 검증 실패/);

  const installedMcpPkg = JSON.parse(
    readFileSync(join(installDir, 'node_modules', 'oh-my-ontology-mcp', 'package.json'), 'utf-8'),
  );
  assert.equal(installedMcpPkg.version, MCP_PKG.version);

  const mcpVerify = run(
    'npm',
    ['--prefix', join(installDir, 'node_modules', 'oh-my-ontology-mcp'), 'run', 'verify'],
    {
      cwd: projectDir,
      env: { OMOT_VAULT: join(projectDir, 'ontology') },
    },
  );
  assert.match(mcpVerify.stdout, /validate_vault/);
  assert.match(mcpVerify.stdout, /list_kinds/);
  assert.match(mcpVerify.stdout, /workspace_brief/);
  assert.match(mcpVerify.stdout, /workspace_brief — .*next actions, .*health checks/);
  assert.match(mcpVerify.stdout, /workspace_brief_tuned — .*next actions, .*health checks/);
  assert.match(mcpVerify.stdout, /workspace_brief advisory nextActions/);
  assert.match(mcpVerify.stdout, /compile_issues:warn/);
  assert.match(mcpVerify.stdout, /health — .*checks/);
  assert.match(mcpVerify.stdout, /health — .*compile_issues:(pass|warn)/);
  assert.match(mcpVerify.stdout, /health_tuned — .*checks/);
  assert.match(mcpVerify.stdout, /health_tuned — .*compile_issues:(pass|warn)/);
  assert.match(mcpVerify.stdout, /compile_ontology/);
  assert.match(mcpVerify.stdout, /overview/);
  assert.match(mcpVerify.stdout, /overview query_plan/);
  assert.match(mcpVerify.stdout, /project_map query_plan/);
  assert.match(mcpVerify.stdout, /maintenance cursor — missing afterActionId reported/);
  assert.match(mcpVerify.stdout, /neighbors — elements\/example/);
  assert.match(mcpVerify.stdout, /path — elements\/example → project \(1 hop, 1 edge\)/);
  assert.match(mcpVerify.stdout, /project_scope/);

  const directMcpVerify = run(
    'npm',
    [
      '--prefix',
      join(installDir, 'node_modules', 'oh-my-ontology-mcp'),
      'run',
      'verify',
      '--',
      join(projectDir, 'ontology'),
      '--timeout-ms',
      '1000',
    ],
    { cwd: projectDir },
  );
  assert.match(directMcpVerify.stdout, /timeout=1000ms/);
  assert.match(directMcpVerify.stdout, /project probe — 1 project node/);
  assert.match(directMcpVerify.stdout, /workspace_brief — .*next actions, .*health checks/);
  assert.match(directMcpVerify.stdout, /workspace_brief_tuned — .*next actions, .*health checks/);
  assert.match(directMcpVerify.stdout, /health_tuned — .*checks/);
  assert.match(directMcpVerify.stdout, /maintenance cursor — missing afterActionId reported/);

  const directMcpVerifyVaultFlag = run(
    'npm',
    [
      '--prefix',
      join(installDir, 'node_modules', 'oh-my-ontology-mcp'),
      'run',
      'verify',
      '--',
      '--vault',
      join(projectDir, 'ontology'),
      '--timeout-ms=1000',
    ],
    { cwd: projectDir, env: { OMOT_VAULT: emptyVault } },
  );
  assert.match(directMcpVerifyVaultFlag.stdout, /timeout=1000ms/);
  assert.match(directMcpVerifyVaultFlag.stdout, /vault total 5 nodes/);
  assert.match(directMcpVerifyVaultFlag.stdout, /project probe — 1 project node/);
  assert.match(directMcpVerifyVaultFlag.stdout, /maintenance cursor — missing afterActionId reported/);

  const directMcpVerifyHelp = run(
    'npm',
    ['--prefix', join(installDir, 'node_modules', 'oh-my-ontology-mcp'), 'run', 'verify', '--', '--help'],
    { cwd: projectDir },
  );
  assert.match(directMcpVerifyHelp.stdout, /node mcp\/scripts\/verify\.mjs --vault path --timeout-ms 15000/);
  assert.match(directMcpVerifyHelp.stdout, /npm run verify -- \[vault\] \[--timeout-ms N\]/);
  assert.match(directMcpVerifyHelp.stdout, /npm run verify -- --vault path --timeout-ms 15000/);
  assert.match(directMcpVerifyHelp.stdout, /Explicit \[vault\] or --vault arguments take precedence over OMOT_VAULT/);
  assert.match(directMcpVerifyHelp.stdout, /project probe/);
  assert.match(directMcpVerifyHelp.stdout, /strict unknown-argument \/ invalid-enum rejection/);
  assert.match(directMcpVerifyHelp.stdout, /maintenance_plan filter enums/);
  assert.match(directMcpVerifyHelp.stdout, /missing maintenance_plan\.afterActionId cursor handling/);
  assert.match(directMcpVerifyHelp.stdout, /cursor\.found=false, reason, empty page/);

  const mcpEmptyVerify = run(
    'npm',
    ['--prefix', join(installDir, 'node_modules', 'oh-my-ontology-mcp'), 'run', 'verify'],
    {
      cwd: projectDir,
      env: { OMOT_VAULT: emptyVault },
    },
  );
  assert.match(mcpEmptyVerify.stdout, /vault total 0 nodes/);
  assert.match(mcpEmptyVerify.stdout, /neighbors\/path — skipped \(vault has no nodes\)/);
  assert.match(mcpEmptyVerify.stdout, /project_scope — skipped \(no project node in vault\)/);

  const invalidMcpVerifyTimeout = runRaw(
    'npm',
    ['--prefix', join(installDir, 'node_modules', 'oh-my-ontology-mcp'), 'run', 'verify'],
    {
      cwd: projectDir,
      env: {
        OMOT_VAULT: join(projectDir, 'ontology'),
        OMOT_VERIFY_TIMEOUT_MS: '1000ms',
      },
    },
  );
  assert.equal(invalidMcpVerifyTimeout.status, 1);
  assert.match(
    `${invalidMcpVerifyTimeout.stdout}\n${invalidMcpVerifyTimeout.stderr}`,
    /verify timeout must be a positive integer/,
  );

  const invalidDirectMcpVerifyTimeout = runRaw(
    'npm',
    [
      '--prefix',
      join(installDir, 'node_modules', 'oh-my-ontology-mcp'),
      'run',
      'verify',
      '--',
      join(projectDir, 'ontology'),
      '--timeout-ms',
      '1000ms',
    ],
    { cwd: projectDir },
  );
  assert.equal(invalidDirectMcpVerifyTimeout.status, 1);
  assert.match(
    `${invalidDirectMcpVerifyTimeout.stdout}\n${invalidDirectMcpVerifyTimeout.stderr}`,
    /verify timeout must be a positive integer/,
  );

  const invalidDirectMcpVerifyVault = runRaw(
    'npm',
    [
      '--prefix',
      join(installDir, 'node_modules', 'oh-my-ontology-mcp'),
      'run',
      'verify',
      '--',
      '--vault',
      '--timeout-ms',
      '1000',
    ],
    { cwd: projectDir },
  );
  assert.equal(invalidDirectMcpVerifyVault.status, 1);
  assert.match(
    `${invalidDirectMcpVerifyVault.stdout}\n${invalidDirectMcpVerifyVault.stderr}`,
    /--vault requires a path value/,
  );

  const compile = runRaw(cliBin, ['compile', 'ontology', '--summary'], { cwd: projectDir });
  assert.equal(compile.status, 1);
  assert.match(compile.stdout, /compiled ontology/);
  assert.match(compile.stdout, /5 nodes/);
  assert.match(compile.stdout, /issues.*1/);

  const cycleVault = join(projectDir, 'cycle-vault');
  writeCycleVault(cycleVault);
  const blockingBrief = runRaw(cliBin, ['workspace-brief', cycleVault, '--json'], { cwd: projectDir });
  assert.equal(blockingBrief.status, 1);
  const blockingBriefPayload = JSON.parse(blockingBrief.stdout);
  assert.equal(blockingBriefPayload.status, 'needs_attention');
  assert.equal(
    blockingBriefPayload.nextActions.some((action) => (
      action.severity === 'fail' && action.id === 'dependency_cycles'
    )),
    true,
  );

  const blockingCycles = runRaw(cliBin, ['cycles', cycleVault, '--json'], { cwd: projectDir });
  assert.equal(blockingCycles.status, 1);
  const blockingCyclesPayload = JSON.parse(blockingCycles.stdout);
  assert.equal(blockingCyclesPayload.operation, 'cycles');
  assert.equal(blockingCyclesPayload.totalCycles, 1);

  const danglingVault = join(projectDir, 'dangling-vault');
  writeDanglingVault(danglingVault);
  const blockingCompile = runRaw(cliBin, ['compile', danglingVault, '--json'], { cwd: projectDir });
  assert.equal(blockingCompile.status, 1);
  const blockingCompilePayload = JSON.parse(blockingCompile.stdout);
  assert.equal(blockingCompilePayload.summary.issues, 1);
  assert.equal(blockingCompilePayload.summary.unresolvedEdges, 1);

  const disconnectedVault = join(projectDir, 'disconnected-vault');
  writeDisconnectedVault(disconnectedVault);
  const missingPath = runRaw(
    cliBin,
    ['path', 'capabilities/a', 'capabilities/b', disconnectedVault, '--json'],
    { cwd: projectDir },
  );
  assert.equal(missingPath.status, 1);
  const missingPathPayload = JSON.parse(missingPath.stdout);
  assert.equal(missingPathPayload.found, false);

  const mcpSummary = packSummary(MCP_DIR);
  checkMcpLeanTarballFiles(mcpSummary.files);
  const cliSummary = packSummary(CLI_DIR);
  console.log(
    `packed CLI smoke passed: ${temp}\n` +
      `  ${mcpSummary.name}@${mcpSummary.version}: ${mcpSummary.entryCount} files, ${mcpSummary.size}B tarball, ${mcpSummary.unpackedSize}B unpacked\n` +
      `  ${cliSummary.name}@${cliSummary.version}: ${cliSummary.entryCount} files, ${cliSummary.size}B tarball, ${cliSummary.unpackedSize}B unpacked`,
  );
} finally {
  if (process.env.OMOT_KEEP_SMOKE_TMP !== '1') {
    rmSync(temp, { recursive: true, force: true });
  }
}
