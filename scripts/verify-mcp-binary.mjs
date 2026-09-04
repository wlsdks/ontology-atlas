#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

function request(id, method, params = {}) {
  return `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
}

export function countExactReadmeAddresses(value) {
  const counts = { lowercase: 0, uppercase: 0 };
  const visit = (entry) => {
    if (entry === 'readme.md') counts.lowercase += 1;
    else if (entry === 'README.md') counts.uppercase += 1;
    else if (Array.isArray(entry)) entry.forEach(visit);
    else if (entry && typeof entry === 'object') Object.values(entry).forEach(visit);
  };
  visit(value);
  return counts;
}

export function assessMcpExactCaseAnalysis(analysis) {
  const counts = countExactReadmeAddresses(analysis);
  const projectEvidence = analysis?.project?.evidence;
  return {
    ok:
      counts.lowercase > 0 &&
      counts.uppercase === 0 &&
      Array.isArray(projectEvidence) &&
      projectEvidence.includes('readme.md'),
    lowercaseAddresses: counts.lowercase,
    uppercaseAddresses: counts.uppercase,
    projectEvidence: Array.isArray(projectEvidence) ? projectEvidence : null,
  };
}

function structuredToolResult(result) {
  if (result?.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent;
  }
  const text = result?.content?.[0]?.text;
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function verifyMcpExactCase({ binaryPath, timeoutMs = 25_000 }) {
  const binary = path.resolve(binaryPath);
  if (!fs.statSync(binary, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`compiled MCP binary is missing: ${binary}`);
  }

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ontology-atlas-mcp-exact-case-'));
  const repoRoot = path.join(fixtureRoot, 'repo');
  const vaultRoot = path.join(fixtureRoot, 'vault');
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.mkdirSync(vaultRoot, { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'package.json'),
    `${JSON.stringify({ name: 'exact-case-fixture', private: true }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(repoRoot, 'readme.md'),
    [
      '# Exact Case Fixture',
      '',
      '## Purpose',
      '',
      'Exact Case Fixture coordinates queued work for local teams.',
      '',
      '## Capabilities',
      '',
      '### Queue admission',
      '',
      'The queue admits bounded work and reports when each task begins.',
      '',
    ].join('\n'),
  );

  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(binary, [], {
        cwd: repoRoot,
        env: {
          ...process.env,
          OATLAS_VAULT: vaultRoot,
          OATLAS_REPO_ROOT: repoRoot,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      let deadline;

      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        child.kill();
        if (error) reject(error);
        else resolve(result);
      };
      const inspect = () => {
        const messages = stdout
          .split('\n')
          .filter(Boolean)
          .flatMap((line) => {
            try {
              return [JSON.parse(line)];
            } catch {
              return [];
            }
          });
        const response = messages.find((message) => message.id === 2);
        if (!response) return;
        if (response.error || response.result?.isError) {
          finish(
            new Error(
              `compiled MCP exact-case probe failed: ${JSON.stringify(response.error ?? response.result)}`,
            ),
          );
          return;
        }
        const analysis = structuredToolResult(response.result);
        if (!analysis) {
          finish(new Error('compiled MCP exact-case probe returned no structured analysis'));
          return;
        }
        const assessment = assessMcpExactCaseAnalysis(analysis);
        if (!assessment.ok) {
          finish(
            new Error(
              'compiled MCP changed the exact lowercase readme.md source address ' +
                `(lowercase=${assessment.lowercaseAddresses}, ` +
                `uppercase=${assessment.uppercaseAddresses}, ` +
                `project=${JSON.stringify(assessment.projectEvidence)})`,
            ),
          );
          return;
        }
        finish(null, {
          lowercaseAddresses: assessment.lowercaseAddresses,
          uppercaseAddresses: assessment.uppercaseAddresses,
          projectEvidence: assessment.projectEvidence,
        });
      };

      child.on('error', (error) => {
        finish(new Error(`could not spawn the compiled MCP exact-case probe: ${error.message}`));
      });
      child.on('exit', (code, signal) => {
        if (!settled) {
          finish(
            new Error(
              `compiled MCP exact-case probe exited before responding ` +
                `(code=${code}, signal=${signal}); stderr: ${stderr.slice(0, 600)}`,
            ),
          );
        }
      });
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        inspect();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.stdin.write(
        request(1, 'initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'verify-mcp-exact-case', version: '1' },
        }),
      );
      child.stdin.write(request(2, 'tools/call', { name: 'analyze_repo_structure', arguments: {} }));

      deadline = setTimeout(() => {
        finish(
          new Error(
            `compiled MCP exact-case probe timed out after ${timeoutMs}ms; stderr: ${stderr.slice(0, 600)}`,
          ),
        );
      }, timeoutMs);
    });
  } finally {
    removeFixtureRoot(fixtureRoot);
  }
}

// The probe passed and then the release run failed on this line (Windows, 2026-09-05): EPERM
// while removing the fixture, because the just-exited child or Defender still held a handle.
// Node retries EBUSY/EPERM-style removals only when asked; and a scratch folder that stays
// behind is not a verification failure, so the last resort is a warning, not an exit code.
function removeFixtureRoot(fixtureRoot) {
  try {
    fs.rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (error) {
    console.warn(`[verify-mcp-binary] left the exact-case fixture behind: ${fixtureRoot} (${error.code ?? error.message})`);
  }
}

export async function verifyMcpBinary({ binaryPath, vaultPath, expectedMinTools = 32, timeoutMs = 25_000 }) {
  const binary = path.resolve(binaryPath);
  const vault = path.resolve(vaultPath);
  if (!fs.statSync(binary, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`compiled MCP binary is missing: ${binary}`);
  }
  if (!fs.statSync(vault, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`verification vault is missing: ${vault}`);
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(binary, [], {
      env: { ...process.env, OATLAS_VAULT: vault },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let deadline;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      child.kill();
      if (error) reject(error);
      else resolve(result);
    };

    const inspect = () => {
      const messages = stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      const initialize = messages.find((message) => message.id === 1)?.result;
      const tools = messages.find((message) => message.id === 2)?.result?.tools;
      const concept = messages.find((message) => message.id === 3)?.result;
      if (!initialize || !tools || !concept) return;
      if (concept.isError) {
        finish(new Error('compiled MCP binary started but could not read the verification vault'));
        return;
      }
      if (tools.length < expectedMinTools) {
        finish(new Error(`compiled MCP binary advertised ${tools.length} tools, expected at least ${expectedMinTools}`));
        return;
      }
      finish(null, {
        version: initialize.serverInfo?.version ?? 'unknown',
        toolCount: tools.length,
      });
    };

    child.on('error', (error) => finish(new Error(`could not spawn the compiled MCP binary: ${error.message}`)));
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      inspect();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdin.write(
      request(1, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'verify-mcp-binary', version: '1' },
      }),
    );
    child.stdin.write(request(2, 'tools/list'));
    child.stdin.write(request(3, 'tools/call', { name: 'get_concept', arguments: { slug: 'project' } }));

    deadline = setTimeout(() => {
      finish(
        new Error(
          `compiled MCP binary did not answer within ${timeoutMs}ms; stderr: ${stderr.slice(0, 600)}`,
        ),
      );
    }, timeoutMs);
  });
}

function jsonRpcRequest(id, method, params = {}) {
  return `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

/**
 * Probe the narrow first-contact contract that must be identical in source and
 * in the app sidecar. The binary is generated from the same entrypoint, but a
 * bundler can still drop or rewrite JSON schemas; comparing the live payloads
 * catches that release-only failure.
 */
async function probeMcpEndpoint({ command, args, vaultPath, cwd, timeoutMs }) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, OATLAS_VAULT: vaultPath, OATLAS_REPO_ROOT: cwd },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let deadline;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      child.kill();
      if (error) reject(error);
      else resolve(result);
    };

    const inspect = () => {
      const messages = stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      const byId = new Map(messages.map((message) => [message.id, message]));
      if (![1, 2, 3, 4, 5].every((id) => byId.has(id))) return;
      const initialize = byId.get(1).result;
      const tools = byId.get(2).result?.tools;
      if (!initialize || !Array.isArray(tools)) {
        finish(new Error('MCP endpoint did not return initialize/tools/list results'));
        return;
      }
      const callResults = Object.fromEntries(
        [3, 4, 5].map((id) => [id, byId.get(id).result]),
      );
      if (Object.values(callResults).some((result) => !result)) {
        finish(new Error('MCP endpoint returned an empty first-contact result'));
        return;
      }
      finish(null, { initialize, tools, callResults });
    };

    child.on('error', (error) => finish(new Error(`could not spawn MCP endpoint: ${error.message}`)));
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      inspect();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.stdin.write(
      jsonRpcRequest(1, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'verify-mcp-parity', version: '1' },
      }),
    );
    child.stdin.write(jsonRpcRequest(2, 'tools/list'));
    child.stdin.write(jsonRpcRequest(3, 'tools/call', { name: 'connection_info', arguments: {} }));
    child.stdin.write(jsonRpcRequest(4, 'tools/call', { name: 'list_kinds', arguments: {} }));
    child.stdin.write(jsonRpcRequest(5, 'tools/call', { name: 'validate_vault', arguments: {} }));

    deadline = setTimeout(() => {
      finish(
        new Error(
          `MCP endpoint parity probe timed out after ${timeoutMs}ms; stderr: ${stderr.slice(0, 600)}`,
        ),
      );
    }, timeoutMs);
  });
}

export function compareMcpContracts(source, bundled) {
  const mismatches = [];
  if (!isDeepStrictEqual(canonicalize(source.tools), canonicalize(bundled.tools))) {
    mismatches.push('tools/list schemas');
  }
  const resultContract = (result) => ({
    isError: Boolean(result?.isError),
    structuredContent: result?.structuredContent,
  });
  for (const [id, label] of [
    [3, 'connection_info'],
    [4, 'list_kinds'],
    [5, 'validate_vault'],
  ]) {
    if (
      !isDeepStrictEqual(
        canonicalize(resultContract(source.callResults[id])),
        canonicalize(resultContract(bundled.callResults[id])),
      )
    ) {
      mismatches.push(`tools/call ${label} result`);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

export async function verifyMcpParity({ binaryPath, vaultPath, timeoutMs = 25_000 }) {
  const binary = path.resolve(binaryPath);
  const vault = path.resolve(vaultPath);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = await probeMcpEndpoint({
    command: process.execPath,
    args: [path.join(root, 'mcp', 'src', 'index.js')],
    vaultPath: vault,
    cwd: root,
    timeoutMs,
  });
  const bundled = await probeMcpEndpoint({
    command: binary,
    args: [],
    vaultPath: vault,
    cwd: root,
    timeoutMs,
  });
  const comparison = compareMcpContracts(source, bundled);
  if (!comparison.ok) {
    throw new Error(`source/bundled MCP parity failed: ${comparison.mismatches.join(', ')}`);
  }
  return {
    toolCount: bundled.tools.length,
    sourceVersion: source.initialize.serverInfo?.version ?? 'unknown',
    bundledVersion: bundled.initialize.serverInfo?.version ?? 'unknown',
  };
}

function flagValue(argv, name) {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  return inline?.slice(prefix.length);
}

async function main() {
  const argv = process.argv.slice(2);
  const binaryPath = flagValue(argv, 'binary');
  const vaultPath = flagValue(argv, 'vault') ?? path.join(process.cwd(), 'docs', 'ontology');
  if (!binaryPath) {
    console.error('Usage: node scripts/verify-mcp-binary.mjs --binary=<path> [--vault=<path>]');
    process.exit(1);
  }
  try {
    const result = await verifyMcpBinary({ binaryPath, vaultPath });
    console.log(`✔ MCP binary spawn check — version ${result.version}, ${result.toolCount} tools`);
    const parity = await verifyMcpParity({ binaryPath, vaultPath });
    console.log(
      `✔ source/bundled MCP parity — ${parity.toolCount} tools, ${parity.sourceVersion} / ${parity.bundledVersion}`,
    );
    const exactCase = await verifyMcpExactCase({ binaryPath });
    console.log(
      `✔ exact-case source address — readme.md ${exactCase.lowercaseAddresses}, ` +
        `README.md ${exactCase.uppercaseAddresses}, project evidence present`,
    );
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
