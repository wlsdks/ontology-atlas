import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AGENT_CLIENTS } from '@/features/docs-vault-local/lib/agent-clients';
import { globalScopeInstruction } from '@/features/docs-vault-local/lib/agent-global-scope';

/**
 * **Boundary contract** for the "this whole computer" scope.
 *
 * **What it guards.** Global scope exists to accommodate the owner's observation
 * (*"Most ... will likely do it globally"*). But if that
 * accommodation grows into **the app editing the user's home directory on their
 * behalf**, three things break at once: ① this product's claim that everything is
 * auditable by `git diff` ② lost updates on `~/.claude.json` (a runtime state store)
 * ③ industry precedent, 0 of 12
 * (`.qa-scratch/mcp-install-ux-survey-2026-07-30.md`).
 *
 * So the rule is one line: **inside the vault or repo, the app writes; outside it,
 * the tool writes.**
 *
 * **Why a contract test.** The verdict requires **comparing lists across two
 * languages** — the key assertion is that the global path (TS) must be **absent**
 * from Rust's write allowlist. `no-restricted-syntax` sees one file's AST and cannot
 * express that direction.
 *
 * And this defect fails quietly: adding one home path to the allowlist passes types
 * and lint, makes the screen more convenient, and **the only thing lost is
 * auditability.**
 */

const ROOT = join(import.meta.dirname, '../..');
const VAULT = '/Users/someone/Documents/my vault';
const LAUNCH = { kind: 'app-bundled', command: '/Applications/A.app/x', args: [] } as const;

describe('전역 스코프 — 앱이 쓰지 않는 자리', () => {
  /**
   * **The boundary is the location, not the file name.**
   *
   * The first version wrote this check as "the global path is absent from Rust's
   * allowlist", which was wrong: `.codex/config.toml` has **the same relative name**
   * whether global or project-scoped, so stripping `~/` guarantees a collision. The
   * allowlist is a list of *names*; what decides scope is the **root directory** those
   * names hang off. So this reads the code that decides the root.
   *
   * This check is why this file exists. Failing it means the app can write to the
   * user's home, and the failure mode is quiet — types and lint pass, the screen gets
   * more convenient, and the only thing lost is auditability.
   */
  it('앱의 쓰기 뿌리는 리포 최상위 또는 볼트 폴더뿐이다', () => {
    const source = readFileSync(join(ROOT, 'src-tauri/src/agent_setup.rs'), 'utf8');
    const fn = source.match(/fn resolve_config_root\([\s\S]*?\n\}/);
    expect(fn, 'resolve_config_root 를 못 찾았다 — 이름이 바뀌었으면 이 게이트도 고쳐라').toBeTruthy();
    expect(fn![0]).toContain('repo-root');
    expect(fn![0]).toContain('vault-folder');
    // Any branch reaching the home directory is caught — whatever it is named, it has
    // to resolve home.
    expect(fn![0], '설정 뿌리가 홈 디렉토리로 갈 수 있게 됐다').not.toMatch(
      /home_dir|HOME|dirs::home|BaseDirs/,
    );
  });

  /** The global screen **only copies** — a path that touches disk would make the boundary above meaningless. */
  it('전역 화면은 쓰기 명령을 부르지 않는다', () => {
    const source = readFileSync(
      join(ROOT, 'src/features/docs-vault-local/ui/AgentGlobalScopePanel.tsx'),
      'utf8',
    );
    for (const forbidden of ['writeAgentConfig', 'planAgentConfig', 'invoke']) {
      expect(source, `전역 패널이 ${forbidden} 를 쓴다 — 이 화면은 복사만 한다`).not.toContain(
        forbidden,
      );
    }
  });

  /**
   * Putting an absolute path on screen leaks the user's name into screenshots, docs,
   * and issues. Home-relative notation is a privacy decision, not a formatting
   * preference.
   */
  it('경로는 홈 상대 표기로 보여준다', () => {
    for (const client of AGENT_CLIENTS) {
      const { path } = globalScopeInstruction(client.id, { launch: LAUNCH, vaultAbsolute: VAULT });
      expect(path.startsWith('~/'), `${client.id} 의 전역 경로가 홈 상대 표기가 아니다`).toBe(true);
    }
  });

  /**
   * **The user does not assemble it.** Only the app knows the vault's absolute path —
   * filling it in is the app's value, and "replace the path with yours" hands that
   * value back.
   */
  it('본문에 볼트 절대 경로가 이미 박혀 있다', () => {
    for (const client of AGENT_CLIENTS) {
      const { text } = globalScopeInstruction(client.id, { launch: LAUNCH, vaultAbsolute: VAULT });
      expect(text, `${client.id} 의 본문에 볼트 경로가 없다`).toContain(VAULT);
      expect(text, `${client.id} 의 본문에 플레이스홀더가 남아 있다`).not.toMatch(/<[^>]*path[^>]*>/i);
    }
  });

  /** A path containing spaces that splits silently in the shell produces a config that never attaches. */
  it('명령형은 공백이 든 경로를 따옴표로 감싼다', () => {
    const { kind, text } = globalScopeInstruction('claude-code', {
      launch: LAUNCH,
      vaultAbsolute: VAULT,
    });
    expect(kind).toBe('command');
    expect(text).toContain(`'${VAULT}'`);
  });

  /**
   * Enforcing the research conclusion: 0 of 12 vendors instruct editing
   * `~/.claude.json` directly, and that file is the state store Claude Code writes at
   * runtime. So it must be **a command**.
   */
  it('Claude Code 전역은 그 도구의 명령으로 넘긴다', () => {
    const { kind, text } = globalScopeInstruction('claude-code', {
      launch: LAUNCH,
      vaultAbsolute: VAULT,
    });
    expect(kind).toBe('command');
    expect(text).toMatch(/^claude mcp add --scope user\b/);
  });

  /** Claiming a CLI we have not verified exists produces a dead CTA — the other three are snippets. */
  it('CLI 를 확인하지 못한 도구는 스니펫으로 준다', () => {
    for (const id of ['codex', 'cursor', 'antigravity'] as const) {
      expect(globalScopeInstruction(id, { launch: LAUNCH, vaultAbsolute: VAULT }).kind).toBe('snippet');
    }
  });

  /**
   * **The loss statement is a pair.** Project scope says it is verifiable by
   * `git diff` (`connectPlanAuditNote`). That is not true globally, so a matching
   * sentence must exist, and it must exist in **both locales** — present in only one,
   * users of the other language are never told where auditability ends.
   */
  it('두 로케일에 감사 문장과 상실 문장이 짝으로 있다', () => {
    for (const locale of ['en', 'ko']) {
      const messages = JSON.parse(readFileSync(join(ROOT, `messages/${locale}.json`), 'utf8'));
      const section = messages.agentConnect;
      expect(section.connectPlanAuditNote, `${locale}: 프로젝트 감사 문장이 없다`).toBeTruthy();
      expect(section.scopeGlobalLossNote, `${locale}: 전역 상실 문장이 없다`).toBeTruthy();
      expect(
        section.scopeGlobalLossNote,
        `${locale}: 상실 문장이 git 을 언급하지 않는다 — 무엇을 잃는지 말해야 한다`,
      ).toMatch(/git/i);
    }
  });

  /**
   * The default is project scope — 0 of 12 vendors default to global, and the
   * reversible option should be the default. The owner's observation is honoured by
   * **stickiness** instead. Flipping it requires deliberately editing this check, at
   * which point the evidence above is faced again.
   */
  it('기본 스코프는 프로젝트다', () => {
    const source = readFileSync(
      join(ROOT, 'src/features/docs-vault-local/lib/agent-scope-preference.ts'),
      'utf8',
    );
    expect(source).toMatch(/const FALLBACK: AgentConfigScope = 'project'/);
  });
});
