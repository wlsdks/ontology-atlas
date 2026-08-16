import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **이 서버는 열어 준 폴더만 읽는다.**
 *
 * ## 왜 이 검사가 있나 (2026-08-16 검수, 실측으로 확인)
 *
 * 폴더를 훑는 도구 넷(`analyze_repo_structure` · `infer_imports` ·
 * `index_project` · `validate_vault`)이 `rootPath` 를 `resolve()` 만 하고
 * **아무 경계도 안 봤다.** 그래서 이 호출이 그대로 성공했다:
 *
 * ```
 * analyze_repo_structure {"rootPath":"/etc"}  → ok, 디렉터리 구조를 돌려줌
 * ```
 *
 * 게다가 넷 다 **읽기 도구**라 `OATLAS_READ_ONLY` 가 안 막는다 — 그 모드의
 * 설명은 「등록한 사람이 볼트 주인이 아닐 때 권한다」인데, 쓰기는 못 해도
 * 디스크 전체를 훑을 수는 있는 상태였다.
 *
 * 이 제품이 사용자에게 한 약속과 정면으로 부딪힌다: *"사용자 디스크에 있는
 * 비밀번호·인증 키 같은 파일은 절대 자동으로 훑지 않는다"*
 * (`.claude/rules/local-first.md`). 프롬프트 한 줄로 유도되는 도구 호출이 그
 * 약속을 깨서는 안 된다.
 *
 * ## 왜 진짜 서버를 띄우나
 *
 * 함수만 부르면 그 함수가 **실제로 그 자리에서 불리는지**는 확인이 안 된다.
 * 이 저장소가 오늘 이미 그 실패를 겪었다 — 지어낸 입력으로 통과하던 게이트가
 * 하나 있었다. 그래서 서버를 프로세스로 띄우고 JSON-RPC 로 부른다.
 */

const OUTSIDE = '/etc';

function callTool(vaultRoot: string, name: string, args: Record<string, unknown>) {
  const script = `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, [${JSON.stringify(
      join(process.cwd(), 'mcp/src/index.js'),
    )}], {
      env: { ...process.env, OATLAS_VAULT: ${JSON.stringify(vaultRoot)} },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    const send = (o) => child.stdin.write(JSON.stringify(o) + '\\n');
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'probe', version: '1' } } });
    setTimeout(() => send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: ${JSON.stringify(
      name,
    )}, arguments: ${JSON.stringify(args)} } }), 500);
    setTimeout(() => {
      child.kill();
      for (const line of out.split('\\n')) {
        if (!line.trim()) continue;
        try {
          const m = JSON.parse(line);
          if (m.id === 2) { process.stdout.write(JSON.stringify({ isError: Boolean(m.result?.isError), text: String(m.result?.content?.[0]?.text ?? '') })); break; }
        } catch {}
      }
      process.exit(0);
    }, 2200);
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
   * 2026-08-16 검수가 **실제로 문서가 사라지는 것을 재현했다**:
   *
   * ```
   * rename_concept{oldSlug:"Auth", newSlug:"auth", confirm:true, overwrite:true}
   *   → ok:true, moved:true, backlinkUpdates:{totalUpdated:1}
   *   → 디스크에서 Auth.md 도 auth.md 도 없어짐. 참조는 매달린 채 남음
   * ```
   *
   * 앞단의 충돌 검사가 **문자열 비교**라 그 둘을 다른 것으로 봤고, macOS 는
   * 같은 파일로 봤다. 그래서 새 이름으로 쓰고 옛 이름을 지우니 방금 쓴 것이
   * 지워졌다. 그리고 도구는 성공이라고 답했다.
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
    // 그리고 무엇보다 — **파일이 그대로 있어야 한다.**
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
    // 왜 막혔는지 사람이 읽을 수 있어야 한다 — 에이전트가 다음에 뭘 할지 정한다.
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
