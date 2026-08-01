#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function request(id, method, params = {}) {
  return `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
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

function flagValue(argv, name) {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  return inline?.slice(`${name}=`.length);
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
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
