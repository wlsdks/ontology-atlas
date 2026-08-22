import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGENT_CLIENTS,
  allAgentConfigFiles,
  filesForClient,
} from '@/features/docs-vault-local/lib/agent-clients';

/**
 * The connect button's **file contract** — it writes only the file of the tool that
 * was clicked.
 *
 * **What was wrong.** Until 2026-07-30 one click on "Connect to Claude Code" wrote
 * three files: `.mcp.json`, `.mcp.json.example`, and `.codex/config.toml`, because
 * the Rust planner emitted the **entire** allowlist as `targets` and the caller
 * iterated all of them.
 *
 * It was found while filming a demo, when "`.mcp.json` ready" and "Codex config
 * ready" appeared on screen **at the same time**. Two things break together:
 *
 * 1. **The label lies.** A category this repository already gates against — "back to
 *    the map" pointing at `/` (`map-destination-route.contract`), decorative trailing
 *    arrows on labels, dead npm commands.
 * 2. **A file for a tool the user does not use shows up in their git diff**, directly
 *    contradicting this product's claim that *every change is a readable diff*.
 *
 * **Why a contract test.** The verdict requires **comparing lists across two
 * languages** — TS is the UI's source of truth and Rust is the security boundary.
 * `no-restricted-syntax` sees one file's AST and cannot express this.
 *
 * The two lists can diverge in two directions with **different symptoms**: present
 * only in TS, the button exists but the write is refused (the user sees a
 * "file not allowed" error); present only in Rust, a path nobody can write stays in
 * the security list (and an auditor cannot tell why it is there).
 */

const ROOT = join(import.meta.dirname, '../..');

/** Reads Rust's security allowlist from source — duplicating the values here would create a copy that drifts. */
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
   * The reverse direction **need not match.** No tool's connect button writes
   * `.mcp.json.example` (it is an absolute-path template for teammates, a different
   * audience), but another path does. So "present only in Rust" is not a defect —
   * provided **the reason is documented**.
   */
  it('Rust 에만 있는 파일은 그 이유가 소스에 적혀 있다', () => {
    const declared = new Set(allAgentConfigFiles());
    const rustOnly = rustAllowedFiles().filter((file) => !declared.has(file));
    const source = readFileSync(join(ROOT, 'src-tauri/src/agent_setup.rs'), 'utf8');
    for (const file of rustOnly) {
      expect(source, `${file} 이 도구 목록에 없는데 왜 허용되는지가 안 적혀 있다`).toContain(file);
    }
    // There is one exception today. If the count grows, each needs its own reason.
    expect(rustOnly).toEqual(['.mcp.json.example']);
  });

  /** **One button, one file.** A tool that writes two would be a design decision, not an accident. */
  it.each(AGENT_CLIENTS.map((client) => [client.id, client.files] as const))(
    '%s 는 파일을 정확히 선언한다',
    (id, files) => {
      expect(files.length, `${id} 가 파일 ${files.length}개를 쓴다 — 하나가 아니면 라벨이 그것을 말해야 한다`).toBe(1);
      expect(filesForClient(id)).toEqual(files);
    },
  );

  /** If one tool writes another tool's file, the label is a lie again. */
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
   * The list was decided by research (2026-07-30). **VS Code's absence is the
   * contract** — not because it cannot be supported, but because `.vscode/mcp.json`
   * keys its entries under `servers` rather than `mcpServers`, which needs a second
   * writer, expensive relative to the overlap. Reviving it means building that writer
   * too, and this check remembers that.
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
    // The reasons for what was excluded and what was rejected must stay in the code so
    // the next person does not ask again.
    for (const note of ['servers', 'openclaw', 'opencode']) {
      expect(source, `${note} 에 대한 판단이 안 적혀 있다`).toContain(note);
    }
  });

  /** Each tool must point at its own official docs — "why this file appears" in their words, not ours. */
  it('각 도구가 공식 문서 URL 을 든다', () => {
    for (const client of AGENT_CLIENTS) {
      expect(client.docsUrl, `${client.id} 의 문서 URL 이 https 가 아니다`).toMatch(/^https:\/\//);
    }
  });

  /**
   * **Preview and write must look at the same list.**
   *
   * This defect appeared **twice, each time as half of itself**. First the write
   * iterated everything; after that was fixed, **the preview still drew everything** —
   * the screen promising 5 files while 1 was written, which made the name
   * "See what will be written" itself a lie.
   *
   * So the gate checks in source that **both places use the same filter**. Calling the
   * same function twice is the contract; calling it in only one place splits screen
   * from disk at that moment.
   */
  it('미리보기와 쓰기가 같은 필터를 쓴다', () => {
    const source = readFileSync(
      join(ROOT, 'src/features/docs-vault-local/ui/AgentConnectAction.tsx'),
      'utf8',
    );
    const uses = source.match(/filesForClient\(clientId\)/g) ?? [];
    expect(
      uses.length,
      '`filesForClient(clientId)` 가 두 번(미리보기·쓰기) 쓰이지 않는다 — 한쪽이 전부를 본다',
    ).toBeGreaterThanOrEqual(2);
    // If an unfiltered full iteration survives anywhere, that becomes the truth.
    expect(source).not.toMatch(/plan\.targets\.map\(/);
  });
});
