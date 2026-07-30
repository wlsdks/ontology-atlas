import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AGENT_CLIENTS } from '@/features/docs-vault-local/lib/agent-clients';
import { globalScopeInstruction } from '@/features/docs-vault-local/lib/agent-global-scope';

/**
 * 「이 컴퓨터 전체」 스코프의 **경계 계약**.
 *
 * ## 무엇을 지키는가
 *
 * 전역 스코프는 소유자 관측(*"대부분 … 전역으로 할텐데"*)을 수용해 생겼다. 그런데
 * 그 수용이 **앱이 사용자 홈을 대신 고치는 것**으로 번지면 세 가지가 동시에
 * 깨진다: ① `git diff` 로 감사된다는 이 제품의 주장 ② `~/.claude.json` 의
 * lost-update(런타임 상태 저장소다) ③ 업계 선례 0/12
 * (`.qa-scratch/mcp-install-ux-survey-2026-07-30.md`).
 *
 * 그래서 규칙은 하나다: **볼트/리포 안은 앱이 쓴다. 볼트 밖은 그 도구가 쓴다.**
 *
 * ## 왜 계약 테스트인가
 *
 * 판정에 **두 언어의 목록을 맞대야** 한다 — 전역 경로(TS)가 Rust 의 쓰기
 * allowlist 에 **없어야** 한다는 것이 핵심 단언이다. `no-restricted-syntax` 는 한
 * 파일의 AST 만 보므로 이 방향을 표현할 수 없다.
 *
 * 그리고 이 결함의 실패 모드가 조용하다: 홈 경로를 allowlist 에 한 줄 더하면
 * 타입도 lint 도 통과하고, 화면은 더 편해지고, **없어진 것은 감사 가능성뿐**이다.
 */

const ROOT = join(import.meta.dirname, '../..');
const VAULT = '/Users/someone/Documents/my vault';
const LAUNCH = { kind: 'app-bundled', command: '/Applications/A.app/x', args: [] } as const;

describe('전역 스코프 — 앱이 쓰지 않는 자리', () => {
  /**
   * **경계는 파일 이름이 아니라 자리다.**
   *
   * 첫 판에서 이 검사를 "전역 경로가 Rust allowlist 에 없다" 로 썼는데 틀렸다 —
   * `.codex/config.toml` 은 전역이든 프로젝트든 **상대 이름이 같아서** `~/` 만 떼면
   * 무조건 충돌한다. allowlist 는 *이름* 목록이고, 스코프를 정하는 것은 그 이름이
   * 붙는 **뿌리 디렉토리**다. 그래서 뿌리를 정하는 코드를 본다.
   *
   * 이 검사가 이 파일의 존재 이유다. 통과 못 하면 앱이 사용자 홈을 쓸 수 있게 된
   * 것이고, 실패 모드가 조용하다 — 타입도 lint 도 통과하고 화면은 더 편해지고
   * 없어진 것은 감사 가능성뿐이다.
   */
  it('앱의 쓰기 뿌리는 리포 최상위 또는 볼트 폴더뿐이다', () => {
    const source = readFileSync(join(ROOT, 'src-tauri/src/agent_setup.rs'), 'utf8');
    const fn = source.match(/fn resolve_config_root\([\s\S]*?\n\}/);
    expect(fn, 'resolve_config_root 를 못 찾았다 — 이름이 바뀌었으면 이 게이트도 고쳐라').toBeTruthy();
    expect(fn![0]).toContain('repo-root');
    expect(fn![0]).toContain('vault-folder');
    // 홈 디렉토리로 가는 갈래가 생기면 걸린다. 이름이 무엇이든 홈을 해석해야 한다.
    expect(fn![0], '설정 뿌리가 홈 디렉토리로 갈 수 있게 됐다').not.toMatch(
      /home_dir|HOME|dirs::home|BaseDirs/,
    );
  });

  /** 전역 화면은 **복사만** 한다 — 디스크를 건드리는 경로가 붙으면 위 경계가 무의미해진다. */
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
   * 절대 경로를 화면에 박으면 사용자 이름이 스크린샷·문서·이슈로 새어 나간다.
   * 홈 상대 표기는 프라이버시 결정이지 표기 취향이 아니다.
   */
  it('경로는 홈 상대 표기로 보여준다', () => {
    for (const client of AGENT_CLIENTS) {
      const { path } = globalScopeInstruction(client.id, { launch: LAUNCH, vaultAbsolute: VAULT });
      expect(path.startsWith('~/'), `${client.id} 의 전역 경로가 홈 상대 표기가 아니다`).toBe(true);
    }
  });

  /**
   * **사용자가 조립하지 않는다.** 앱만이 볼트 절대 경로를 안다 — 그것을 넣어 주는
   * 것이 앱의 값이고, "경로를 당신 것으로 바꾸세요" 는 그 값을 되돌려 주는 것이다.
   */
  it('본문에 볼트 절대 경로가 이미 박혀 있다', () => {
    for (const client of AGENT_CLIENTS) {
      const { text } = globalScopeInstruction(client.id, { launch: LAUNCH, vaultAbsolute: VAULT });
      expect(text, `${client.id} 의 본문에 볼트 경로가 없다`).toContain(VAULT);
      expect(text, `${client.id} 의 본문에 플레이스홀더가 남아 있다`).not.toMatch(/<[^>]*path[^>]*>/i);
    }
  });

  /** 공백이 든 경로가 셸에서 조용히 쪼개지면 붙지 않는 설정이 만들어진다. */
  it('명령형은 공백이 든 경로를 따옴표로 감싼다', () => {
    const { kind, text } = globalScopeInstruction('claude-code', {
      launch: LAUNCH,
      vaultAbsolute: VAULT,
    });
    expect(kind).toBe('command');
    expect(text).toContain(`'${VAULT}'`);
  });

  /**
   * 조사 결론의 집행: 12곳 중 `~/.claude.json` 을 직접 고치라고 안내한 곳이 0곳이고,
   * 그 파일은 Claude Code 가 런타임에 쓰는 상태 저장소다. 그래서 **명령**이어야 한다.
   */
  it('Claude Code 전역은 그 도구의 명령으로 넘긴다', () => {
    const { kind, text } = globalScopeInstruction('claude-code', {
      launch: LAUNCH,
      vaultAbsolute: VAULT,
    });
    expect(kind).toBe('command');
    expect(text).toMatch(/^claude mcp add --scope user\b/);
  });

  /** 확인하지 못한 CLI 를 있다고 말하면 죽은 CTA 가 된다 — 나머지 셋은 스니펫이다. */
  it('CLI 를 확인하지 못한 도구는 스니펫으로 준다', () => {
    for (const id of ['codex', 'cursor', 'antigravity'] as const) {
      expect(globalScopeInstruction(id, { launch: LAUNCH, vaultAbsolute: VAULT }).kind).toBe('snippet');
    }
  });

  /**
   * **상실 문장은 짝이다.** 프로젝트 스코프는 "git diff 로 확인된다"고 말한다
   * (`connectPlanAuditNote`). 전역에서 그 말이 참이 아니므로 짝이 되는 문장이
   * 있어야 하고, **두 로케일 모두**에 있어야 한다 — 한쪽만 있으면 다른 언어
   * 사용자에게는 감사 가능성이 어디서 끝나는지 안 알려 준다.
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
   * 기본값은 프로젝트다 — 벤더 12곳 중 전역을 기본으로 미는 곳이 0곳이고, 되돌릴
   * 수 있는 쪽이 기본이어야 한다. 소유자 관측은 **기억**(sticky)으로 존중한다.
   * 뒤집으려면 이 검사를 일부러 고쳐야 하고, 그때 위 근거를 다시 마주하게 된다.
   */
  it('기본 스코프는 프로젝트다', () => {
    const source = readFileSync(
      join(ROOT, 'src/features/docs-vault-local/lib/agent-scope-preference.ts'),
      'utf8',
    );
    expect(source).toMatch(/const FALLBACK: AgentConfigScope = 'project'/);
  });
});
