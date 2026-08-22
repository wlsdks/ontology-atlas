import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  APP_BUNDLE_IDENTIFIER,
  CLAUDE_ISOLATED_CONFIG_SUBPATH,
  claudeLoginRepairCommand,
} from "@/features/acp-session/model/claude-login-repair";

/**
 * **The one line the screen offers when a login is stale has to actually work**
 * (2026-08-17).
 *
 * The previous guidance ("log in again in the terminal") was a dead end in this
 * case — the owner followed it exactly and the app kept failing, because the app
 * launches Claude with a dedicated config directory and Claude stores the login in
 * a **keychain entry per config directory**.
 *
 * So if the folder this line names is not the folder the app actually uses, the
 * new guidance is just as much of a dead end. That is why **three copies** are
 * pinned together: the identifier in `tauri.conf.json`, the path Rust builds, and
 * this command.
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
   * If that fragment disappears, this command points at a folder that does not exist.
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
   * **It must not be a command that logs in again** (corrected 2026-08-20).
   *
   * The previous command (`CLAUDE_CONFIG_DIR=<app folder> claude /login`) was the
   * cause of this defect. That login creates a keychain entry under the app folder,
   * the entry shadows the linked user credential, and it dies when the token
   * rotates — at which point the screen offers the same command and re-arms the same
   * trap. The fix direction is **removing the entry**.
   */
  it("로그인이 아니라 그림자 항목을 지우는 명령이다", () => {
    const cmd = claudeLoginRepairCommand();
    expect(cmd).toContain("delete-generic-password");
    expect(cmd).toContain("Claude Code-credentials-");
    expect(cmd, "다시 로그인시키면 같은 덫을 다시 놓는 것이다").not.toContain("claude /login");
    expect(cmd).not.toContain("claude auth login");
  });

  /**
   * A pinned hash is correct only on that one machine — home paths differ per
   * person. Let the shell compute it, and check that the computation targets the
   * same place as Rust.
   */
  it("항목 이름을 셸이 계산한다 — 그 기계의 홈 경로로", () => {
    const cmd = claudeLoginRepairCommand();
    expect(cmd).toMatch(/shasum -a 256/);
    expect(cmd).toMatch(/cut -c1-8/);
    expect(cmd).not.toMatch(/Claude Code-credentials-[0-9a-f]{8}/);
  });

  /** Uses the same rule as the Rust-side shadow walk — two copies, so they are pinned together. */
  it("Rust 도 같은 이름 규칙으로 그림자를 걷는다", () => {
    expect(ACP_RS).toContain("Claude Code-credentials-");
    expect(ACP_RS).toContain("delete-generic-password");
    expect(ACP_RS).toContain("fn clear_shadowing_credentials");
  });

  it("사용자 폴더를 건드리지 않는다", () => {
    expect(claudeLoginRepairCommand()).not.toMatch(/\$HOME\/\.claude(\/|"|\s|$)/);
  });

  /*
   * ⚠️ Without this check, the checks above would pass on an empty string.
   */
  it("명령이 비어 있지 않다", () => {
    expect(claudeLoginRepairCommand().length).toBeGreaterThan(40);
  });
});
