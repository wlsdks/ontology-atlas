import type { Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **A repository with a harness, served through the native file commands.**
 *
 * The Harness tab reads dot directories, and the browser's File System Access API cannot see a dot
 * entry at all — so there is no way to exercise this view through OPFS the way the other vault
 * gates do. The installed app is a WKWebView running the same static export, so injecting the Tauri
 * runtime exercises the same code path (`desktop-shell-rail.spec.ts` established that reasoning).
 *
 * Two trees are served: the **vault** the person opened, and the **source repository** bound to its
 * one project. They are genuinely separate here because they are separate in life — Atlas's own
 * vault is `docs/ontology` inside the checkout — and a fixture that collapsed them would hide the
 * resolution step this screen depends on.
 *
 * The source tree is shaped around the failures this view exists to expose: a nested `AGENTS.md`
 * that Codex merges and Claude Code never loads, a declared skill pair whose two copies differ by
 * one byte, a hook whose script the config names and the disk does not have, and a Codex config
 * that repeats one script across three matchers.
 */

export const HARNESS_VAULT_ROOT = "/Users/probe/atlas-vault";
export const HARNESS_SOURCE_ROOT = "/Users/probe/storefront";

/** The vault: one project node plus the sidecar binding that says where its source lives. */
const VAULT_FILES: Record<string, string> = {
  "projects/storefront.md": [
    "---",
    "kind: project",
    "slug: projects/storefront",
    "uid: 3f1c2f94-1d6a-4c0e-9f2b-8a7d6e5c4b3a",
    "title: Storefront",
    "---",
    "",
    "The shop.",
    "",
  ].join("\n"),
  "architecture/storefront-web.md": [
    "---",
    "architecture_schema: architecture-profile/v1",
    "profile_uid: 0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
    "profile_slug: storefront-web",
    "project_uid: 3f1c2f94-1d6a-4c0e-9f2b-8a7d6e5c4b3a",
    "title: Storefront Web",
    "created_by: human",
    "patterns: [source-organization:feature-sliced-design]",
    "scope_paths: [app/**, src/**]",
    "exclude_paths: [**/*.test.ts, **/*.test.tsx, **/*.test.mjs, **/*.spec.ts]",
    "role_order: [routing, app, views, widgets, features, entities, shared]",
    "role_routing: [app/**]",
    "role_app: [src/app/**]",
    "role_views: [src/views/**]",
    "role_widgets: [src/widgets/**]",
    "role_features: [src/features/**]",
    "role_entities: [src/entities/**]",
    "role_shared: [src/shared/**]",
    "summary_routing: The entry point for each page address. It only names which screen to open and hands over; no logic lives here.",
    "summary_routing_ko: 각 주소가 들어오는 입구입니다. 어떤 화면을 열지 정해 넘기기만 하고, 로직은 여기 두지 않습니다.",
    "summary_app: What every screen shares from the start: theme, language, and the app-wide data every page expects to be ready.",
    "summary_app_ko: 모든 화면이 처음부터 함께 쓰는 것입니다. 테마, 언어, 그리고 모든 페이지가 준비돼 있다고 믿는 앱 전체 데이터입니다.",
    "summary_views: One module per screen a page can open, put together from the layers below.",
    "summary_views_ko: 열 수 있는 화면 하나마다 모듈 하나이며, 아래 계층을 조립해 만듭니다.",
    "summary_widgets: A large block a screen drops in whole, such as the map or the agent panel.",
    "summary_widgets_ko: 지도나 에이전트 패널처럼 화면이 통째로 가져다 쓰는 큰 블록입니다.",
    "summary_features: One thing a person does, such as opening a folder or writing a relation, with the state that action needs.",
    "summary_features_ko: 폴더 열기, 관계 쓰기처럼 사람이 하는 한 가지 행동과 그 행동에 필요한 상태입니다.",
    "summary_entities: A thing the product talks about, with its shape and the rules for reading and writing it.",
    "summary_entities_ko: 제품이 이야기하는 대상으로, 그 형태와 읽고 쓰는 규칙을 함께 담습니다.",
    "summary_shared: Basic parts anything may use: design tokens, UI pieces, small helpers, and types. It depends on nothing here.",
    "summary_shared_ko: 무엇이든 쓸 수 있는 기본 부품(토큰, UI 조각, 도우미 함수, 타입)이며, 여기 있는 어느 것에도 의존하지 않습니다.",
    "dependency_policy: lower-only",
    "dependency_usages: [value]",
    "evidence: [docs/ARCHITECTURE.md#fsd-layers, eslint.config.mjs]",
    "---",
    "",
    "# Storefront Web Architecture",
    "",
  ].join("\n"),
  ".ontology-atlas/project-sources.json": JSON.stringify({
    contractVersion: 1,
    bindings: [
      {
        projectSlug: "projects/storefront",
        sourceId: "src-1",
        rootPath: HARNESS_SOURCE_ROOT,
        kind: "folder",
        boundAt: "2026-09-10T00:00:00.000Z",
      },
    ],
  }),
};

const SKILL_BODY = "# po-pass\n\nRoute the work.\n";

/** The source repository, with one deliberate divergence and one deliberate missing script. */
const SOURCE_FILES: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "storefront",
    scripts: {
      dev: "next dev",
      lint: "eslint",
      typecheck: "tsc --noEmit",
      "test:run": "vitest run",
      "agents:check": "node cli/src/index.mjs agent-files",
    },
  }),
  "AGENTS.md": "# Storefront\n\nCanonical contributor guide.\n",
  "CLAUDE.md": "# CLAUDE.md\n\n@AGENTS.md\n",
  "src/AGENTS.md": "# src\n\nCodex merges this one root-down. Claude Code never auto-loads it.\n",
  ".claude/rules/forbidden.md": "# Forbidden\n",
  ".claude/skills/po-pass/SKILL.md": SKILL_BODY,
  // One byte apart from its declared twin: the drift the difference door opens.
  ".agents/skills/po-pass/SKILL.md": `${SKILL_BODY}\nDiverged line.\n`,
  ".claude/agents/chief.md": "# chief\n",
  ".agents/agents/chief.md": "# chief\n",
  ".claude/hooks/block-unsafe-git.sh": "#!/bin/sh\nexit 0\n",
  ".codex/hooks/block-unsafe-git.sh": "#!/bin/sh\nexit 0\n",
  ".codex/config.toml": 'default_permissions = "hardened"\n',
  ".githooks/pre-commit": "#!/bin/sh\nexit 0\n",
  ".claude/settings.json": JSON.stringify({
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [
            { type: "command", command: '"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/block-unsafe-git.sh"' },
            // Named by the config, absent from the disk: the guard that fails in silence.
            { type: "command", command: '"${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/block-npm-publish.sh"' },
          ],
        },
      ],
    },
  }),
  ".codex/hooks.json": JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "Bash", hooks: [{ type: "command", command: "bash .codex/hooks/block-unsafe-git.sh" }] },
        { matcher: "exec_command", hooks: [{ type: "command", command: "bash .codex/hooks/block-unsafe-git.sh" }] },
        { matcher: "functions.exec_command", hooks: [{ type: "command", command: "bash .codex/hooks/block-unsafe-git.sh" }] },
      ],
    },
  }),
};

/**
 * Installs the runtime before any application script runs. Everything lives inside the init
 * script's own scope: `addInitScript` serializes the function, so a module-level reference here
 * would be `undefined` in the page.
 */
export async function installHarnessRuntime(page: Page): Promise<void> {
  await seedFirstRunSeen(page);
  await page.addInitScript(
    (input: {
      vaultRoot: string;
      sourceRoot: string;
      vaultFiles: Record<string, string>;
      sourceFiles: Record<string, string>;
    }) => {
      const { vaultRoot, sourceRoot, vaultFiles, sourceFiles } = input;
      const mtime = Date.UTC(2026, 8, 10, 12, 0, 0);
      const callbacks = new Map<number, (event: { event: string; payload: unknown }) => void>();
      let nextCallback = 1;

      const trim = (value: unknown): string =>
        String(value ?? "").replace(/^\/+/, "").replace(/\/+$/, "");

      const treeFor = (rootPath: unknown): Record<string, string> | null => {
        const root = String(rootPath ?? "");
        if (root === vaultRoot) return vaultFiles;
        if (root === sourceRoot) return sourceFiles;
        return null;
      };

      const answer = (command: string, args: Record<string, unknown>): Promise<unknown> | null => {
        switch (command) {
          case "list_vault_directory": {
            const files = treeFor(args.rootPath);
            if (!files) return Promise.reject(new Error("unknown root"));
            const directory = trim(args.relativePath);
            const prefix = directory ? `${directory}/` : "";
            const entries = new Map<string, "file" | "directory">();
            let seen = false;
            for (const file of Object.keys(files)) {
              if (!file.startsWith(prefix)) continue;
              const rest = file.slice(prefix.length);
              if (!rest) continue;
              seen = true;
              const [name, child] = rest.split("/");
              entries.set(name, child ? "directory" : "file");
            }
            // The bridge throws on a path that is not there, and most repositories have no
            // `.cursor/rules`. The caller treats the rejection as an ordinary absence.
            if (!seen && directory !== "") return Promise.reject(new Error(`missing ${directory}`));
            return Promise.resolve([...entries].map(([name, kind]) => ({ name, kind })));
          }
          case "read_vault_text_file": {
            const files = treeFor(args.rootPath);
            if (!files) return Promise.reject(new Error("unknown root"));
            const path = trim(args.relativePath);
            if (!(path in files)) return Promise.reject(new Error(`missing ${path}`));
            return Promise.resolve({ text: files[path], lastModified: mtime });
          }
          case "read_vault_binary_file": {
            const files = treeFor(args.rootPath);
            if (!files) return Promise.reject(new Error("unknown root"));
            const path = trim(args.relativePath);
            if (!(path in files)) return Promise.reject(new Error(`missing ${path}`));
            return Promise.resolve({
              bytes: [...new TextEncoder().encode(files[path])],
              lastModified: mtime,
            });
          }
          case "vault_path_exists": {
            const files = treeFor(args.rootPath);
            if (!files) return Promise.resolve(false);
            const path = trim(args.relativePath);
            if (args.kind === "directory") {
              return Promise.resolve(path === "" || Object.keys(files).some((f) => f.startsWith(`${path}/`)));
            }
            return Promise.resolve(path in files);
          }
          case "pick_vault_directory":
            return Promise.resolve(vaultRoot);
          case "vault_fingerprint":
            return Promise.resolve(`harness-${Object.keys(vaultFiles).length}`);
          case "hash_vault_files":
            return Promise.resolve(
              (args.relativePaths as string[]).map((relativePath) => ({ relativePath, hash: "0".repeat(64) })),
            );
          case "plugin:event|listen":
            return Promise.resolve(Number(args.handler));
          case "plugin:event|unlisten":
          case "start_vault_watch":
          case "ensure_vault_directory":
            return Promise.resolve(null);
          case "acp_detect_runtimes":
            return Promise.resolve([]);
          case "discover_mcp_connectors":
            return Promise.resolve({ servers: [], problems: [] });
          case "discover_source_candidates":
            return Promise.resolve({ candidates: [], truncated: false, unreadableRoots: [] });
          case "mcp_bundled_server":
            return Promise.resolve({ path: `${vaultRoot}/mcp`, available: false, reason: "fixture" });
          case "git_probe":
            return Promise.resolve({ installed: false, version: null, path: null });
          case "secret_status":
            return Promise.resolve({ provider: args.provider, stored: false, last4: null });
          case "llm_audit_tail":
            return Promise.resolve([]);
          default:
            return null;
        }
      };

      (window as unknown as { isTauri?: boolean }).isTauri = true;
      (
        window as unknown as {
          __TAURI_INTERNALS__: {
            transformCallback(callback: (event: { event: string; payload: unknown }) => void): number;
            invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__ = {
        transformCallback(callback) {
          const id = nextCallback++;
          callbacks.set(id, callback);
          return id;
        },
        invoke(command, args = {}) {
          const result = answer(command, args);
          // An unknown command must reject rather than hang: a pending promise is
          // indistinguishable from a slow machine and would make the assertions below a lie.
          return result ?? Promise.reject(new Error(`unstubbed command: ${command}`));
        },
      };
      (
        window as unknown as { __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener(): void } }
      ).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
      void callbacks;
    },
    {
      vaultRoot: HARNESS_VAULT_ROOT,
      sourceRoot: HARNESS_SOURCE_ROOT,
      vaultFiles: VAULT_FILES,
      sourceFiles: SOURCE_FILES,
    },
  );
}

/** Opens the installed-app entry point and mounts the fixture vault through the native picker. */
export async function mountHarnessVault(page: Page): Promise<void> {
  await page.goto("/ko/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-open").click();
  await page.getByTestId("app-nav-rail").waitFor({ timeout: 60_000 });
}

/**
 * The same vault with **no architecture profile** — the shape that exposed the tab set being a
 * property of the panel it switches. The blueprint's `!selected` branch returns early, so a tab set
 * rendered inside it disappears exactly where a person most needs the other two views.
 */
export async function installProfilelessHarnessRuntime(page: Page): Promise<void> {
  await installHarnessRuntime(page);
  await page.addInitScript(() => {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
    }).__TAURI_INTERNALS__;
    const inner = internals.invoke.bind(internals);
    internals.invoke = (command, args = {}) => {
      const path = String((args as { relativePath?: unknown }).relativePath ?? "");
      if (path.startsWith("architecture/")) return Promise.reject(new Error(`missing ${path}`));
      if (command === "list_vault_directory" && path === "") {
        return inner(command, args).then((entries) =>
          (entries as { name: string }[]).filter((entry) => entry.name !== "architecture"),
        );
      }
      return inner(command, args);
    };
  });
}
