import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  APP_BUNDLE_IDENTIFIER,
  CLAUDE_ISOLATED_CONFIG_SUBPATH,
  claudeLoginRepairCommand,
} from "@/features/acp-session/model/claude-login-repair";

/**
 * 로그인이 낡았을 때 화면이 내미는 **한 줄이 실제로 통해야 한다** (2026-08-17).
 *
 * 종전 안내(「터미널에서 다시 로그인하세요」)는 이 경우 막다른 길이었다 —
 * 소유자가 그대로 했는데도 앱은 계속 실패했다. 앱이 Claude 를 전용 설정 폴더로
 * 띄우고, Claude 는 로그인을 **설정 폴더별 키체인 항목**에 넣기 때문이다.
 *
 * 그러니 이 한 줄이 가리키는 폴더가 앱이 실제로 쓰는 그 폴더가 아니면, 새 안내도
 * 똑같이 막다른 길이 된다. 그래서 **사본 셋**을 묶는다:
 * `tauri.conf.json` 의 식별자 · Rust 가 만드는 경로 · 이 명령.
 */
const TAURI_CONF = JSON.parse(
  readFileSync(join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"),
) as { identifier?: string };
const ACP_RS = readFileSync(join(process.cwd(), "src-tauri", "src", "acp.rs"), "utf8");

describe("앱 몫 로그인 복구 명령", () => {
  it("번들 식별자가 실제 앱 설정과 같다", () => {
    expect(TAURI_CONF.identifier).toBe(APP_BUNDLE_IDENTIFIER);
  });

  /*
   * Rust: `app_data_dir.join("agent-config").join(spec.id)` · spec.id = "claude-acp".
   * 그 조각이 사라지면 이 명령이 없는 폴더를 가리키게 된다.
   */
  it("Rust 가 만드는 폴더 구조와 같은 자리를 가리킨다", () => {
    expect(ACP_RS).toContain('join("agent-config")');
    expect(ACP_RS).toContain('id: "claude-acp"');
    expect(CLAUDE_ISOLATED_CONFIG_SUBPATH).toContain("agent-config/claude-acp");
    expect(CLAUDE_ISOLATED_CONFIG_SUBPATH).toContain(APP_BUNDLE_IDENTIFIER);
  });

  it("공백이 있는 경로를 따옴표로 감싼다 — 안 그러면 붙여 넣어도 안 된다", () => {
    const cmd = claudeLoginRepairCommand();
    expect(CLAUDE_ISOLATED_CONFIG_SUBPATH).toContain("Application Support");
    expect(cmd).toMatch(/"\$HOME\/[^"]*Application Support[^"]+"/);
  });

  /**
   * **다시 로그인시키는 명령이면 안 된다** (2026-08-20 정정).
   *
   * 종전 명령(`CLAUDE_CONFIG_DIR=<앱 폴더> claude /login`)이 이 결함의 원인이었다.
   * 그 로그인이 앱 폴더 앞으로 키체인 항목을 만들고, 그 항목이 링크해 둔 사용자
   * 자격증명을 가리고, 토큰이 회전되면 죽는다 — 그러면 화면이 같은 명령을 다시
   * 내밀어 같은 덫을 다시 놓는다. 고치는 방향은 **항목을 없애는 것**이다.
   */
  it("로그인이 아니라 그림자 항목을 지우는 명령이다", () => {
    const cmd = claudeLoginRepairCommand();
    expect(cmd).toContain("delete-generic-password");
    expect(cmd).toContain("Claude Code-credentials-");
    expect(cmd, "다시 로그인시키면 같은 덫을 다시 놓는 것이다").not.toContain("claude /login");
    expect(cmd).not.toContain("claude auth login");
  });

  /**
   * 해시를 박아 두면 그 기계에서만 맞는다 — 홈 경로가 사람마다 다르다.
   * 셸이 계산하게 두고, 그 계산이 Rust 와 같은 자리를 겨냥하는지 본다.
   */
  it("항목 이름을 셸이 계산한다 — 그 기계의 홈 경로로", () => {
    const cmd = claudeLoginRepairCommand();
    expect(cmd).toMatch(/shasum -a 256/);
    expect(cmd).toMatch(/cut -c1-8/);
    expect(cmd).not.toMatch(/Claude Code-credentials-[0-9a-f]{8}/);
  });

  /** Rust 쪽 그림자 걷기와 같은 규칙을 쓰는지 — 사본이 둘이라 묶어 둔다. */
  it("Rust 도 같은 이름 규칙으로 그림자를 걷는다", () => {
    expect(ACP_RS).toContain("Claude Code-credentials-");
    expect(ACP_RS).toContain("delete-generic-password");
    expect(ACP_RS).toContain("fn clear_shadowing_credentials");
  });

  it("사용자 폴더를 건드리지 않는다", () => {
    expect(claudeLoginRepairCommand()).not.toMatch(/\$HOME\/\.claude(\/|"|\s|$)/);
  });

  /*
   * ⚠️ 이 검사가 없으면 위 검사들이 빈 문자열로도 통과한다.
   */
  it("명령이 비어 있지 않다", () => {
    expect(claudeLoginRepairCommand().length).toBeGreaterThan(40);
  });
});
