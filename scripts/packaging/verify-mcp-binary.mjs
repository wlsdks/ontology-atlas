#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EXPECTED_TOOLS } from '../../mcp/scripts/verify/tools-list/inventory.mjs';

function request(id, method, params = {}) {
  return `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
}

/** The breadth map names the README by the file's own name; a program that folds case would print the other spelling. */
export function assessMcpExactCaseSurvey(text) {
  const lines = String(text).split('\n');
  const lowercaseAddresses = lines.filter((line) => line.startsWith('readme.md:')).length;
  const uppercaseAddresses = lines.filter((line) => line.startsWith('README.md:')).length;
  return { ok: lowercaseAddresses > 0 && uppercaseAddresses === 0, lowercaseAddresses, uppercaseAddresses };
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
        const survey = response.result?.content?.[0]?.text;
        if (typeof survey !== 'string') {
          finish(new Error('compiled MCP exact-case probe returned no breadth map'));
          return;
        }
        const assessment = assessMcpExactCaseSurvey(survey);
        if (!assessment.ok) {
          finish(
            new Error(
              'compiled MCP changed the exact lowercase readme.md source address ' +
                `(lowercase=${assessment.lowercaseAddresses}, uppercase=${assessment.uppercaseAddresses})`,
            ),
          );
          return;
        }
        finish(null, {
          lowercaseAddresses: assessment.lowercaseAddresses,
          uppercaseAddresses: assessment.uppercaseAddresses,
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

// Retried removal: on Windows a just-exited child or Defender can still hold a handle (EPERM). A
// leftover scratch folder only warns.
function removeFixtureRoot(fixtureRoot) {
  try {
    fs.rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (error) {
    console.warn(`[verify-mcp-binary] left the exact-case fixture behind: ${fixtureRoot} (${error.code ?? error.message})`);
  }
}

export async function verifyMcpBinary({ binaryPath, vaultPath, expectedMinTools = EXPECTED_TOOLS.length, timeoutMs = 25_000 }) {
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
      if (concept.isError || concept.structuredContent?.concepts?.[0]?.ok !== true) {
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
    child.stdin.write(request(3, 'tools/call', { name: 'get_concepts', arguments: { slugs: ['ontology-atlas'] } }));

    deadline = setTimeout(() => {
      finish(
        new Error(
          `compiled MCP binary did not answer within ${timeoutMs}ms; stderr: ${stderr.slice(0, 600)}`,
        ),
      );
    }, timeoutMs);
  });
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
    console.error('Usage: node scripts/packaging/verify-mcp-binary.mjs --binary=<path> [--vault=<path>]');
    process.exit(1);
  }
  try {
    const result = await verifyMcpBinary({ binaryPath, vaultPath });
    console.log(`✔ MCP binary spawn check — version ${result.version}, ${result.toolCount} tools`);
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
