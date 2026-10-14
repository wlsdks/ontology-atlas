import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `created_by` names the connecting client: the heartbeat in `.ontology-atlas/agent-activity.json`,
 * else the `clientInfo.name` sent at connect. The proof is the real server over stdio.
 */
function addConcept(vaultRoot: string, clientName: string, args: Record<string, unknown>) {
  const script = `
    const { spawn } = require('node:child_process');
    const { writeSync } = require('node:fs');
    const child = spawn(process.execPath, [${JSON.stringify(join(process.cwd(), 'mcp/src/index.js'))}], {
      env: { ...process.env, OATLAS_VAULT: ${JSON.stringify(vaultRoot)} },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let buffer = '';
    let sentCall = false;
    let finished = false;
    const send = (o) => child.stdin.write(JSON.stringify(o) + '\\n');
    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill();
      writeSync(2, 'timed out waiting for MCP tools/call response');
      process.exitCode = 2;
    }, 25_000);
    child.on('exit', (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      writeSync(2, 'MCP child exited before response: ' + String(code) + '/' + String(signal));
      process.exitCode = 2;
    });
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      while (buffer.includes('\\n')) {
        const at = buffer.indexOf('\\n');
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1 && !sentCall) {
          sentCall = true;
          send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'add_concept', arguments: ${JSON.stringify(args)} } });
        }
        if (message.id === 2 && !finished) {
          finished = true;
          clearTimeout(timeout);
          writeSync(1, JSON.stringify({ isError: Boolean(message.result?.isError), text: String(message.result?.content?.[0]?.text ?? '') }));
          child.kill();
        }
      }
    });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: ${JSON.stringify(clientName)}, version: '1' } } });
  `;
  const raw = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 30_000 });
  return JSON.parse(raw) as { isError: boolean; text: string };
}

function makeVault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-created-by-'));
  writeFileSync(
    join(dir, 'project.md'),
    '---\nuid: 11111111-1111-4111-8111-111111111111\nslug: project\nkind: project\ntitle: Probe\ncontains: [domains/works]\n---\n\nProbe project.\n',
    'utf8',
  );
  mkdirSync(join(dir, 'domains'), { recursive: true });
  writeFileSync(
    join(dir, 'domains', 'works.md'),
    '---\nuid: 22222222-2222-4222-8222-222222222222\nslug: domains/works\nkind: domain\ntitle: Works\ncapabilities: []\nelements: []\n---\n\nPhysical works.\n',
    'utf8',
  );
  return dir;
}

describe('created_by names the connecting client', () => {
  it('stamps agent:<clientInfo.name> on a node written with no heartbeat registered', () => {
    const vault = makeVault();
    const result = addConcept(vault, 'claude-code', {
      slug: 'elements/timber-sash-frames',
      kind: 'element',
      title: 'Timber sash frames',
      domain: 'domains/works',
      body: '## Definition\nThe nine timber sashes on the south elevation.\n',
    });
    expect(result.isError, result.text).toBe(false);
    const path = join(vault, 'elements', 'timber-sash-frames.md');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toMatch(/created_by:\s*"?agent:claude-code"?/);
  });

  it('lets a registered heartbeat outrank the greeting, as the activity log does', () => {
    const vault = makeVault();
    mkdirSync(join(vault, '.ontology-atlas'), { recursive: true });
    writeFileSync(
      join(vault, '.ontology-atlas', 'agent-activity.json'),
      JSON.stringify({ agent: 'codex', state: 'editing', updatedAt: new Date().toISOString() }),
      'utf8',
    );
    const result = addConcept(vault, 'claude-code', {
      slug: 'elements/platform-lift',
      kind: 'element',
      title: 'Platform lift',
      domain: 'domains/works',
      body: '## Definition\nThe lift at the entrance steps.\n',
    });
    expect(result.isError, result.text).toBe(false);
    expect(readFileSync(join(vault, 'elements', 'platform-lift.md'), 'utf8')).toMatch(/created_by:\s*"?agent:codex"?/);
  });
});
