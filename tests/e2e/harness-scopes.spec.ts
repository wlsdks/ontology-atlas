import { expect, test, type Page } from "@playwright/test";

import { HARNESS_SOURCE_ROOT, installHarnessRuntime, mountHarnessVault } from "./harness-tab-fixture";

/*
 * Where settings live: the popup that explains every agent settings scope: what each file is and what
 * the files read from every scope hold, and Setup lists hooks from files outside the repository under
 * their own headings.
 */

const HOME = "/Users/probe";

function file(id: string, tool: "claude-code" | "codex", scope: string, path: string, hooks: unknown[] = [], status = "read") {
  return {
    id,
    tool,
    scope,
    path,
    picked: false,
    status,
    failure: null,
    bytes: status === "read" ? 200 : null,
    modifiedMs: null,
    hooks,
    hooksTruncated: 0,
    unknownEvents: 0,
    disableAllHooks: null,
    allowManagedHooksOnly: null,
    permissionCounts: status === "read" ? { allow: 2, deny: 0, ask: 0 } : null,
  };
}

function hook(event: string, command: string, matcher: string | null = null, handler = 0) {
  return { event, group: 0, handler, matcher, kind: "command", command, timeoutSeconds: null, async: null };
}

const SCOPES_FIXTURE = {
  platform: "macos",
  repository: HARNESS_SOURCE_ROOT,
  files: [
    file("claude-project", "claude-code", "project", `${HARNESS_SOURCE_ROOT}/.claude/settings.json`, [
      hook("PreToolUse", "bash .claude/hooks/block-unsafe-git.sh", "Bash"),
    ]),
    file("claude-local", "claude-code", "local", `${HARNESS_SOURCE_ROOT}/.claude/settings.local.json`, [], "missing"),
    {
      ...file("claude-user", "claude-code", "user", `${HOME}/.claude/settings.json`, [
        hook("PreToolUse", "bash ~/.claude/hooks/agent-status.sh pre-tool", "Bash"),
        hook("Stop", "bash ~/.claude/hooks/agent-status.sh stop"),
      ]),
      hooksTruncated: 497,
      unknownEvents: 2,
    },
    file("claude-managed", "claude-code", "managed", "/Library/Application Support/ClaudeCode/managed-settings.json", [], "missing"),
    file("codex-project", "codex", "project", `${HARNESS_SOURCE_ROOT}/.codex/hooks.json`, [
      hook("PreToolUse", "bash .codex/hooks/block-unsafe-git.sh", "Bash"),
    ]),
    file("codex-user", "codex", "user", `${HOME}/.codex/hooks.json`, [hook("PreToolUse", "bash ~/.codex/hooks/agent-status.sh pre-tool", "Bash")]),
    file("codex-system", "codex", "system", "/etc/codex/hooks.json", [], "missing"),
  ],
  inlineHooks: [],
  worktree: { linked: false, unusedLocalFile: null },
  localFileGit: { tracked: false, ignored: true },
};

/** Answers the two scope commands on top of the Harness fixture's bridge. */
async function installScopeBridge(page: Page, scopes: unknown = SCOPES_FIXTURE) {
  await page.addInitScript(
    (scopes) => {
      const internals = (window as unknown as {
        __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
      }).__TAURI_INTERNALS__;
      const inner = internals.invoke.bind(internals);
      internals.invoke = (command, args = {}) => {
        if (command === "read_harness_scopes") return Promise.resolve(scopes);
        if (command === "pick_harness_scope_file") {
          return Promise.resolve({
            outcome: "refused",
            reason: "in-repository",
            path: "/Users/probe/dotfiles/.claude/settings.json",
            repository: "/Users/probe/dotfiles",
          });
        }
        return inner(command, args);
      };
    },
    scopes,
  );
}

test.describe("Where settings live", () => {
  test("the app explains every scope from the keyboard, and Escape closes it", async ({ page }) => {
    await installHarnessRuntime(page);
    await installScopeBridge(page);
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/?view=overview");
    const open = page.getByTestId("where-settings-open");
    await expect(open).toBeVisible({ timeout: 60_000 });
    await open.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByTestId("where-settings");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Claude Code 설정이 있는 곳" })).toBeVisible();
    const stack = dialog.getByTestId("where-settings-stack");
    await expect(stack.getByRole("option")).toHaveText([/Managed/, /User/, /Project/, /Local/]);
    await expect(dialog.getByTestId("where-settings-detail")).toContainText(`${HARNESS_SOURCE_ROOT}/.claude/settings.json`);

    /* The kinds are a tab set: arrows move between them. */
    await dialog.getByRole("tab", { name: "훅" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(dialog.getByRole("tab", { name: "권한 규칙" })).toHaveAttribute("aria-selected", "true");

    /* The stack is a listbox: arrows move the selected scope. */
    await stack.getByRole("option", { name: /Project/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(stack.getByRole("option", { name: /Local/ })).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByTestId("where-settings-detail")).toHaveAttribute("data-where-row", "local");

    await dialog.getByTestId("where-settings-tool").getByText("Codex").click();
    await expect(dialog.getByRole("heading", { name: "Codex 설정이 있는 곳" })).toBeVisible();
    await expect(stack.getByRole("option")).toHaveText([/System/, /User/, /Project/]);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("the app lists outside hooks by file and the popup counts what each scope holds", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installHarnessRuntime(page);
    await installScopeBridge(page);
    await mountHarnessVault(page);
    await page.goto("/ko/architecture/");
    await expect(page.getByTestId("harness-setup")).toBeVisible({ timeout: 60_000 });

    const outside = page.getByTestId("harness-scopes-outside");
    await expect(outside).toContainText("이 저장소 밖 파일에 훅 3개가 있어요");
    await page.getByTestId("harness-scopes-outside-show").click();
    const detail = page.getByTestId("scope-hook-detail");
    await expect(detail).toContainText("User");
    await expect(detail).toContainText("~/.claude/hooks/agent-status.sh");
    const excerpt = detail.getByTestId("scope-hook-excerpt");
    await expect(excerpt).toContainText('"matcher": "Bash"');
    await expect(excerpt).toContainText('"command": "bash ~/.claude/hooks/agent-status.sh pre-tool"');
    await expect(page.locator('[data-scope-heading="claude-user"]')).toBeVisible();
    await expect(page.locator('[data-scope-file-note="truncated"]').first()).toContainText("이 파일의 훅 499개 중 처음 2개만");
    await expect(page.locator('[data-scope-file-note="unknown-events"]').first()).toContainText("도구 문서에 없는 이벤트 2개");

    await detail.locator("[data-scope-explain-detail]").click();
    const dialog = page.getByTestId("where-settings");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("where-settings-detail")).toHaveAttribute("data-where-row", "user");
    await expect(dialog.getByTestId("where-settings-sum")).toContainText("3개");
    await expect(dialog.getByRole("tab", { name: /훅/ })).toHaveAttribute("aria-selected", "true");

    await dialog.getByTestId("where-settings-pick").click();
    await expect(dialog.getByTestId("where-settings-pick-answer")).toHaveAttribute("data-pick-outcome", "in-repository");
    await expect(dialog.getByTestId("where-settings-pick-answer")).toContainText("/Users/probe/dotfiles");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
