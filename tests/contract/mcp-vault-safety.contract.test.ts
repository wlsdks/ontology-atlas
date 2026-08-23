import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **This server reads only the folder it was given.**
 *
 * ## Why this check exists (2026-08-16 review, confirmed by measurement)
 *
 * The four folder-walking tools (`analyze_repo_structure` · `infer_imports` ·
 * `index_project` · `validate_vault`) only called `resolve()` on `rootPath` and
 * **checked no boundary at all**. So this call simply succeeded:
 *
 * ```
 * analyze_repo_structure {"rootPath":"/etc"}  → ok, returns the directory structure
 * ```
 *
 * And because all four are **read tools**, `OATLAS_READ_ONLY` does not block them —
 * that mode is described as "recommended when whoever registered the server is not
 * the vault's owner", yet in that state writing was impossible while walking the
 * entire disk was not.
 *
 * This collides head-on with the promise this product makes to users: *"Files on the
 * user's disk such as passwords and credentials are never scanned automatically"* (files
 * on the user's disk such as passwords and credentials are never scanned
 * automatically) — `.claude/rules/local-first.md`. A tool call induced by one line
 * of a prompt must not break that promise.
 *
 * ## Why a real server is started
 *
 * Calling the function directly cannot confirm the function is **actually called at
 * that point**. This repository already hit that failure once — a gate that passed
 * on invented input. So the server is started as a process and called over
 * JSON-RPC.
 */

const OUTSIDE = '/etc';

function callTool(vaultRoot: string, name: string, args: Record<string, unknown>) {
  const script = `
    const { spawn } = require('node:child_process');
    const { writeSync } = require('node:fs');
    const child = spawn(process.execPath, [${JSON.stringify(
      join(process.cwd(), 'mcp/src/index.js'),
    )}], {
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
    child.on('error', (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      writeSync(2, 'MCP child failed to start: ' + error.message);
      process.exitCode = 2;
    });
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
          send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: ${JSON.stringify(
            name,
          )}, arguments: ${JSON.stringify(args)} } });
        }
        if (message.id === 2 && !finished) {
          finished = true;
          clearTimeout(timeout);
          writeSync(1, JSON.stringify({ isError: Boolean(message.result?.isError), text: String(message.result?.content?.[0]?.text ?? '') }));
          child.kill();
        }
      }
    });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'probe', version: '1' } } });
  `;
  const raw = execFileSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  return JSON.parse(raw) as { isError: boolean; text: string };
}

function makeVault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-scan-'));
  writeFileSync(
    join(dir, 'project.md'),
    '---\nkind: project\ntitle: Probe\nuid: 11111111-1111-4111-8111-111111111111\n---\n',
    'utf8',
  );
  return dir;
}

describe('MCP 이름 바꾸기 — 대소문자만 다른 이름은 같은 파일이다', () => {
  /**
   * The 2026-08-16 review **reproduced an actual document disappearing**:
   *
   * ```
   * rename_concept{oldSlug:"Auth", newSlug:"auth", confirm:true, overwrite:true}
   *   → ok:true, moved:true, backlinkUpdates:{totalUpdated:1}
   *   → on disk, neither Auth.md nor auth.md remains. The reference is left dangling
   * ```
   *
   * The upstream collision check is a **string comparison**, so it saw two different
   * names while macOS saw one file. Writing under the new name and then deleting the
   * old one deleted what had just been written — and the tool reported success.
   */
  it('대소문자만 다른 이름 바꾸기는 **거절**하고, 파일은 그대로 남는다', () => {
    const vault = mkdtempSync(join(tmpdir(), 'atlas-case-'));
    mkdirSync(join(vault, 'capabilities'), { recursive: true });
    writeFileSync(
      join(vault, 'capabilities', 'Auth.md'),
      '---\nkind: capability\ntitle: Auth\nuid: 22222222-2222-4222-8222-222222222222\n---\n\nbody\n',
      'utf8',
    );

    const result = callTool(vault, 'rename_concept', {
      oldSlug: 'capabilities/Auth',
      newSlug: 'capabilities/auth',
      confirm: true,
      overwrite: true,
    });

    expect(result.isError, `거절되지 않았다: ${result.text.slice(0, 200)}`).toBe(true);
    expect(result.text).toMatch(/letter case/);
    // And above all — **the file must still be there.**
    expect(
      readdirSync(join(vault, 'capabilities')),
      '문서가 사라졌다 — 이 검사가 막으려는 바로 그 일이다',
    ).toContain('Auth.md');
  }, 40_000);
});

describe('MCP 스캔 경계 — 열어 준 폴더만 읽는다', () => {
  it('볼트 밖 경로는 거절한다 (실제 서버에 JSON-RPC 로 물어본다)', () => {
    const vault = makeVault();
    const result = callTool(vault, 'analyze_repo_structure', { rootPath: OUTSIDE });
    expect(result.isError, `«${OUTSIDE}» 를 훑는 것이 통과했다: ${result.text.slice(0, 200)}`).toBe(
      true,
    );
    // Why it was blocked must be human-readable — the agent decides what to do next from it.
    expect(result.text).toMatch(/inside the vault/);
  }, 40_000);

  it('볼트 안은 그대로 통과한다 — 막는 것이 목적이 아니다', () => {
    const vault = makeVault();
    const result = callTool(vault, 'analyze_repo_structure', { rootPath: vault });
    expect(result.isError, `자기 볼트를 훑는 것이 막혔다: ${result.text.slice(0, 200)}`).toBe(false);
  }, 40_000);

  it('`repoRoot` 를 받는 검증 도구도 같은 경계를 본다', () => {
    const vault = makeVault();
    const result = callTool(vault, 'validate_vault', { repoRoot: OUTSIDE });
    expect(result.isError, `validate_vault 가 «${OUTSIDE}» 를 봤다`).toBe(true);
  }, 40_000);
});
