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
    expect(cmd).toMatch(/CLAUDE_CONFIG_DIR="\$HOME\/[^"]+"/);
  });

  it("앱 몫 폴더에서 로그인시키는 명령이다 — 사용자 폴더를 건드리지 않는다", () => {
    const cmd = claudeLoginRepairCommand();
    expect(cmd).toContain("claude /login");
    expect(cmd).not.toMatch(/\$HOME\/\.claude(\/|"|\s|$)/);
  });

  /*
   * ⚠️ 이 검사가 없으면 위 검사들이 빈 문자열로도 통과한다.
   */
  it("명령이 비어 있지 않다", () => {
    expect(claudeLoginRepairCommand().length).toBeGreaterThan(40);
  });
});
