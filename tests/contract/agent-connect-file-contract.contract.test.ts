import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGENT_CLIENTS,
  allAgentConfigFiles,
  filesForClient,
} from '@/features/docs-vault-local/lib/agent-clients';

/**
 * 「연결」 버튼의 **파일 계약** — 누른 도구의 파일만 쓴다.
 *
 * ## 무엇이 틀렸었나
 *
 * 2026-07-30 까지 「Connect to Claude Code」 한 번이 세 파일을 썼다: `.mcp.json` ·
 * `.mcp.json.example` · `.codex/config.toml`. Rust 플래너가 허용 목록 **전체**를
 * `targets` 로 내고 호출부가 그것을 전부 순회했기 때문이다.
 *
 * 시연 촬영 중 화면에 「.mcp.json ready」와 「Codex config ready」가 **동시에** 떠서
 * 발견됐다. 두 가지가 동시에 깨진다:
 *
 * 1. **라벨이 거짓말한다.** 이 저장소가 이미 게이트로 막는 부류다 —
 *    「지도로 돌아가기」가 `/` 를 가리킨 것(`map-destination-route.contract`),
 *    라벨 끝 장식 화살표, 죽은 npm 명령.
 * 2. **안 쓰는 도구의 파일이 사용자 git diff 에 뜬다.** *"모든 변경이 읽을 수 있는
 *    diff"* 라는 이 제품의 주장에 정면으로 반한다.
 *
 * ## 왜 계약 테스트인가
 *
 * 판정에 **두 언어의 목록을 맞대야** 한다 — TS 는 UI 의 진실원이고 Rust 는 보안
 * 경계다. `no-restricted-syntax` 는 한 파일의 AST 만 보므로 표현할 수 없다.
 *
 * 두 목록이 어긋나는 방향이 둘이고 **증상이 다르다**: TS 에만 있으면 버튼은 있는데
 * 쓰기가 거절되고(사용자에게 "허용되지 않은 파일" 오류), Rust 에만 있으면 아무도
 * 못 쓰는 경로가 보안 목록에 남는다(감사할 때 왜 있는지 모른다).
 */

const ROOT = join(import.meta.dirname, '../..');

/** Rust 의 보안 allowlist 를 소스에서 읽는다 — 값을 여기 복제하면 그 복제가 드리프트한다. */
function rustAllowedFiles(): string[] {
  const source = readFileSync(join(ROOT, 'src-tauri/src/agent_setup.rs'), 'utf8');
  const block = source.match(/const ALLOWED_CONFIG_FILES: \[&str; \d+\] = \[([\s\S]*?)\];/);
  expect(block, 'ALLOWED_CONFIG_FILES 선언을 못 찾았다 — 이름이 바뀌었으면 이 게이트도 고쳐라').toBeTruthy();
  return [...block![1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

describe('에이전트 연결 — 파일 계약', () => {
  it('선언한 파일이 전부 Rust 보안 목록 안에 있다', () => {
    const allowed = new Set(rustAllowedFiles());
    for (const client of AGENT_CLIENTS) {
      for (const file of client.files) {
        expect(allowed.has(file), `${client.id} 가 쓰는 ${file} 이 Rust allowlist 에 없다 — 쓰기가 거절된다`).toBe(true);
      }
    }
  });

  /**
   * 역방향은 **같지 않아도 된다.** `.mcp.json.example` 은 어느 도구의 연결 버튼도
   * 쓰지 않지만(팀원용 절대경로 템플릿이라 청중이 다르다) 다른 경로가 쓴다.
   * 그래서 "Rust 에만 있는 것"은 결함이 아니고, **이유가 문서에 있어야** 결함이 아니다.
   */
  it('Rust 에만 있는 파일은 그 이유가 소스에 적혀 있다', () => {
    const declared = new Set(allAgentConfigFiles());
    const rustOnly = rustAllowedFiles().filter((file) => !declared.has(file));
    const source = readFileSync(join(ROOT, 'src-tauri/src/agent_setup.rs'), 'utf8');
    for (const file of rustOnly) {
      expect(source, `${file} 이 도구 목록에 없는데 왜 허용되는지가 안 적혀 있다`).toContain(file);
    }
    // 오늘의 예외는 하나다. 늘어나면 각각 이유가 필요하다.
    expect(rustOnly).toEqual(['.mcp.json.example']);
  });

  /** **버튼 하나 = 파일 하나.** 둘을 쓰는 도구가 생기면 그건 설계 판단이지 사고가 아니다. */
  it.each(AGENT_CLIENTS.map((client) => [client.id, client.files] as const))(
    '%s 는 파일을 정확히 선언한다',
    (id, files) => {
      expect(files.length, `${id} 가 파일 ${files.length}개를 쓴다 — 하나가 아니면 라벨이 그것을 말해야 한다`).toBe(1);
      expect(filesForClient(id)).toEqual(files);
    },
  );

  /** 한 도구의 파일을 다른 도구가 쓰면 라벨이 다시 거짓이 된다. */
  it('도구끼리 파일을 공유하지 않는다', () => {
    const seen = new Map<string, string>();
    for (const client of AGENT_CLIENTS) {
      for (const file of client.files) {
        const owner = seen.get(file);
        expect(owner, `${file} 을 ${owner} 와 ${client.id} 가 함께 쓴다`).toBeUndefined();
        seen.set(file, client.id);
      }
    }
  });

  /**
   * 목록은 조사로 정했다(2026-07-30). **VS Code 가 없는 것이 계약이다** — 지원
   * 못 해서가 아니라 `.vscode/mcp.json` 의 키가 `mcpServers` 가 아니라 `servers`
   * 라서 라이터를 하나 더 요구하는데 겹침 대비 비싸기 때문이다. 되살리려면 그
   * 라이터를 함께 만들어야 하고, 이 검사가 그 사실을 기억한다.
   */
  it('지원 목록이 조사 결론과 같다', () => {
    expect(AGENT_CLIENTS.map((client) => client.id)).toEqual([
      'claude-code',
      'codex',
      'cursor',
      'antigravity',
    ]);
    const source = readFileSync(
      join(ROOT, 'src/features/docs-vault-local/lib/agent-clients.ts'),
      'utf8',
    );
    // 뺀 것과 기각한 것의 이유가 코드에 남아 있어야 다음 사람이 다시 묻지 않는다.
    for (const note of ['servers', 'openclaw', 'opencode']) {
      expect(source, `${note} 에 대한 판단이 안 적혀 있다`).toContain(note);
    }
  });

  /** 도구마다 그 도구의 공식 문서를 가리켜야 한다 — "왜 이 파일이 생기나" 를 우리 말이 아니라 그쪽 말로. */
  it('각 도구가 공식 문서 URL 을 든다', () => {
    for (const client of AGENT_CLIENTS) {
      expect(client.docsUrl, `${client.id} 의 문서 URL 이 https 가 아니다`).toMatch(/^https:\/\//);
    }
  });
});
