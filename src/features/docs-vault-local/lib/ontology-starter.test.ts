import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ONTOLOGY_STARTER_FILES,
  buildCodexConfigToml,
  buildCodexConfigTomlTemplate,
  buildCodexMcpAddCommandTemplate,
  buildAgentSetupCliCommandTemplate,
  buildAgentSetupCheckCliCommandTemplate,
  buildMcpConfigJson,
  buildVaultMcpConfigJson,
  materializeStarterFiles,
  starterFilesForLocale,
} from "./ontology-starter";

const ROOT = path.resolve(__dirname, "../../../..");

describe("ONTOLOGY_STARTER_FILES", () => {
  it("5 시드 파일 제공 — README + project + 3 example (domain/capability/element)", () => {
    expect(ONTOLOGY_STARTER_FILES).toHaveLength(5);
    const paths = ONTOLOGY_STARTER_FILES.map((f) => f.relPath);
    expect(paths).toContain("README.md");
    expect(paths).toContain("project.md");
    expect(paths).toContain("domains/example-domain.md");
    expect(paths).toContain("capabilities/example-capability.md");
    expect(paths).toContain("elements/example-element.md");
  });

  it("모든 파일이 frontmatter 시작 (---) + kind 키 포함", () => {
    for (const f of ONTOLOGY_STARTER_FILES) {
      expect(f.content.startsWith("---\n")).toBe(true);
      expect(f.content).toMatch(/^kind:\s/m);
    }
  });

  it("정적 템플릿에는 UID를 고정하지 않고 scaffold마다 모든 노드에 새 UID를 발급", () => {
    const firstUids = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000004",
      "00000000-0000-4000-8000-000000000005",
    ];
    const secondUids = Array.from(
      { length: 5 },
      (_, index) => `00000000-0000-4000-8000-${String(index + 6).padStart(12, "0")}`,
    );
    const uidFactory = (uids: string[]) => () => uids.shift()!;

    for (const template of starterFilesForLocale("en")) {
      expect(template.content).not.toMatch(/^uid:/m);
    }

    const first = materializeStarterFiles("en", uidFactory([...firstUids]));
    const second = materializeStarterFiles("en", uidFactory([...secondUids]));
    const extractUids = (files: ReadonlyArray<{ content: string }>) =>
      files.map(({ content }) => content.match(/^uid:\s*(.+)$/m)?.[1]);

    expect(extractUids(first)).toEqual(firstUids);
    expect(new Set(extractUids(first)).size).toBe(5);
    expect(new Set([...extractUids(first), ...extractUids(second)]).size).toBe(10);
    expect(first.find(({ relPath }) => relPath === "README.md")?.content).toContain(
      `uid: ${firstUids[0]}`,
    );
  });

  it("starter prose never teaches a node example or file copy that reuses or omits identity", () => {
    for (const locale of ["en", "ko"] as const) {
      const files = starterFilesForLocale(locale);
      const readme = files.find(({ relPath }) => relPath === "README.md")?.content ?? "";
      const project = files.find(({ relPath }) => relPath === "project.md")?.content ?? "";
      const markdownBlocks = [...readme.matchAll(/```markdown\n([\s\S]*?)```/g)].map(
        (match) => match[1],
      );

      expect(
        markdownBlocks.filter((value) => /^\s*kind:\s*\S+/m.test(value)),
      ).toHaveLength(0);
      expect(readme).toContain("node $ATLAS/cli/src/index.mjs add domain auth");
      expect(project).not.toMatch(/rename or copy starters|바꾸거나\s+복사합니다/i);
    }
  });

  it("3 example 파일은 정확히 1 줄로 example slug 가짐 (도메인/역량/요소 컨벤션)", () => {
    const example = ONTOLOGY_STARTER_FILES.find(
      (f) => f.relPath === "domains/example-domain.md",
    );
    expect(example?.content).toMatch(/^slug:\s+domains\/example-domain/m);
  });

  it("app starter 와 CLI template 은 같은 vault README/setup 안내를 제공", () => {
    for (const starterFile of ONTOLOGY_STARTER_FILES) {
      const template = readFileSync(
        path.join(ROOT, "cli/templates/vault", starterFile.relPath),
        "utf8",
      );
      expect(starterFile.content).toBe(template);
    }
  });

  it("starter README 는 두 채널(설치 앱 · 소스 체크아웃)만 안내한다", () => {
    const readme = ONTOLOGY_STARTER_FILES.find(
      (f) => f.relPath === "README.md",
    )?.content;

    expect(readme).toContain("## AI agent setup");
    expect(readme).toContain("Claude Code / Cursor");
    expect(readme).toContain("Codex");
    expect(readme).toContain(".codex/config.toml");
    expect(readme).toContain("installed Ontology Atlas app");
    expect(readme).toContain("press the connect button");
    expect(readme).toContain(
      "cli/src/index.mjs agent-setup <this vault folder> --root . --write",
    );
    expect(readme).toContain(".mcp.json.example");
    expect(readme).toContain("OATLAS_VAULT");
  });

  // The npm publishing plan was dropped (docs/DECISIONS.md 2026-07-27). This locks the starter
  // against planting a command that fails when pasted — a fake absolute-path placeholder and `npx`
  // guidance had survived here in 12 places.
  it("starter README 에 실행 불가능한 명령이 없다", () => {
    for (const locale of ["en", "ko"] as const) {
      const readme = starterFilesForLocale(locale).find(
        (f) => f.relPath === "README.md",
      )?.content;

      expect(readme).not.toContain("npx");
      expect(readme).not.toContain("codex mcp add");
      expect(readme).not.toContain("/absolute/path/to/");
      expect(readme).not.toContain("/소스/절대/경로");
      expect(readme).not.toContain("/이-문서함의/절대/경로");
    }
  });

  it("starter README 는 live MCP inventory 와 read-first 시작점을 안내", () => {
    for (const locale of ["en", "ko"] as const) {
      const readme = starterFilesForLocale(locale).find(
        (f) => f.relPath === "README.md",
      )?.content ?? "";

      expect(readme).toContain("tools/list");
      expect(readme).toContain("mcp-verify");
      expect(readme).toContain("connection_info");
      expect(readme).toContain("list_kinds");
      expect(readme).toContain("validate_vault");
      expect(readme).toContain('operation: "agent_brief"');
      expect(readme).not.toMatch(/\b\d+\s+(?:read|write|tools?)\b/i);
      expect(readme).not.toMatch(/(?:읽기|쓰기|도구)\s*\d+\s*개/);
    }
  });

  it("starter README 는 첫 agent 연결 검증 루프를 안내", () => {
    const readme = ONTOLOGY_STARTER_FILES.find(
      (f) => f.relPath === "README.md",
    )?.content;

    expect(readme).toContain("## Verify the agent loop");
    expect(readme).toContain("validate_vault");
    expect(readme).toContain('"operation": "workspace_brief"');
    expect(readme).toContain('"operation": "agent_brief"');
    expect(readme).toContain('"operation": "health"');
    expect(readme).toContain('"operation": "cycles"');
    expect(readme).toContain('"operation": "growth_plan"');
    expect(readme).toContain('"operation": "maintenance_plan"');
    // With npm publishing dropped (docs/DECISIONS.md 2026-07-27) the bare CLI name has no way onto
    // PATH — the old "If the CLI is installed" was an unreachable conditional. It points at the
    // terminal-side survivor of the two live paths: invocation from a source checkout.
    expect(readme).toContain("From an Ontology Atlas source checkout");
    expect(readme).toContain("export ATLAS=<path to your ontology-atlas source checkout>");
    expect(readme).toContain("node $ATLAS/cli/src/index.mjs validate .");
    expect(readme).toContain("node $ATLAS/cli/src/index.mjs agent-brief . --graph-db-pack");
    expect(readme).toContain("node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks");
    expect(readme).toContain("node $ATLAS/cli/src/index.mjs cycles . --max-hops 8");
    expect(readme).toContain("node $ATLAS/cli/src/index.mjs growth . --limit 20");
    expect(readme).toContain("node $ATLAS/cli/src/index.mjs maintenance . --limit 20");
    expect(readme).toContain("node $ATLAS/cli/src/index.mjs agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4");
    expect(readme).toContain("node $ATLAS/cli/src/index.mjs mcp-verify . --timeout-ms 15000");
    expect(readme).toMatch(/before it edits\s+anything/);
  });
});

describe("buildMcpConfigJson", () => {
  // The default for a surface that does not know the launch method (the web) is the source-checkout
  // placeholder. With npm publishing dropped, `npx` is on no path (docs/DECISIONS.md 2026-07-27).
  it("MCP server 'ontology-atlas' 항목과 OATLAS_VAULT env placeholder 포함", () => {
    const json = buildMcpConfigJson("my-vault");
    const parsed = JSON.parse(json);
    expect(parsed).toEqual({
      mcpServers: {
        "ontology-atlas": {
          command: "node",
          args: ["<absolute path to your ontology-atlas checkout>/mcp/src/index.js"],
          env: {
            OATLAS_VAULT: "<absolute path to your my-vault folder>",
          },
        },
      },
    });
  });

  it("vaultName 이 문자 그대로 placeholder 안에 박힘", () => {
    expect(buildMcpConfigJson("foo")).toContain("your foo folder");
    expect(buildMcpConfigJson("한글-vault")).toContain("your 한글-vault folder");
  });

  it("설치 앱이 알고 있는 vault 절대경로를 OATLAS_VAULT 에 바로 넣을 수 있다", () => {
    const parsed = JSON.parse(
      buildMcpConfigJson("team-vault", "/Users/dana/Team Vault/docs/ontology"),
    );

    expect(parsed.mcpServers["ontology-atlas"].env.OATLAS_VAULT).toBe(
      "/Users/dana/Team Vault/docs/ontology",
    );
  });

  it("출력 끝에 newline 추가 (편집기 친화)", () => {
    expect(buildMcpConfigJson("v")).toMatch(/\n$/);
  });

  it("2-space 들여쓰기로 pretty-print", () => {
    const json = buildMcpConfigJson("v");
    expect(json).toContain("  \"mcpServers\":");
    expect(json).toContain("    \"ontology-atlas\":");
  });
});

describe("buildVaultMcpConfigJson", () => {
  it("vault 폴더 자체를 agent에서 열 때 바로 쓰는 OATLAS_VAULT=. config 제공", () => {
    const parsed = JSON.parse(buildVaultMcpConfigJson());
    expect(parsed.mcpServers["ontology-atlas"].command).toBe("node");
    expect(parsed.mcpServers["ontology-atlas"].args).toEqual([
      "<absolute path to your ontology-atlas checkout>/mcp/src/index.js",
    ]);
    expect(parsed.mcpServers["ontology-atlas"].env.OATLAS_VAULT).toBe(".");
  });
});

describe("buildCodexConfigToml", () => {
  it("Codex repo-local MCP config 를 vault-relative 로 제공", () => {
    const toml = buildCodexConfigToml();
    expect(toml).toContain("[mcp_servers.ontology-atlas]");
    expect(toml).toContain('command = "node"');
    expect(toml).toContain(
      'args = ["<absolute path to your ontology-atlas checkout>/mcp/src/index.js"]',
    );
    expect(toml).toContain("[mcp_servers.ontology-atlas.env]");
    expect(toml).toContain('OATLAS_VAULT = "."');
    expect(toml).toMatch(/\n$/);
  });

  it("Codex codebase-root MCP config template 은 절대경로 placeholder 를 제공", () => {
    const toml = buildCodexConfigTomlTemplate("team-vault");
    expect(toml).toContain("[mcp_servers.ontology-atlas]");
    expect(toml).toContain('command = "node"');
    expect(toml).toContain(
      'args = ["<absolute path to your ontology-atlas checkout>/mcp/src/index.js"]',
    );
    expect(toml).toContain(
      'OATLAS_VAULT = "<absolute path to your team-vault folder>"',
    );
    expect(toml).toMatch(/\n$/);
  });

  it("Codex codebase-root MCP config template 은 알려진 vault 절대경로를 바로 넣을 수 있다", () => {
    const toml = buildCodexConfigTomlTemplate(
      "team-vault",
      "/Users/dana/Team Vault/docs/ontology",
    );

    expect(toml).toContain(
      'OATLAS_VAULT = "/Users/dana/Team Vault/docs/ontology"',
    );
    expect(toml).not.toContain("<absolute path to your team-vault folder>");
  });

  it("Codex MCP config 는 OATLAS_VAULT 값을 TOML string 으로 escape 한다", () => {
    const toml = buildCodexConfigToml('/tmp/vault "quoted"');
    expect(toml).toContain('OATLAS_VAULT = "/tmp/vault \\"quoted\\""');
  });
});

describe("buildCodexMcpAddCommandTemplate", () => {
  it("Codex CLI one-line MCP 등록 명령을 절대경로 placeholder 로 제공", () => {
    const command = buildCodexMcpAddCommandTemplate("team-vault");

    expect(command).toContain("codex mcp add ontology-atlas");
    expect(command).toContain(
      "OATLAS_VAULT='<absolute path to your team-vault folder>'",
    );
    expect(command).toContain(
      "'node' '<absolute path to your ontology-atlas checkout>/mcp/src/index.js'",
    );
  });

  it("Codex CLI one-line MCP 등록 명령은 알려진 vault 절대경로를 shell-safe 하게 넣는다", () => {
    const command = buildCodexMcpAddCommandTemplate(
      "team-vault",
      "/Users/dana/Team Vault/docs/ontology",
    );

    expect(command).toContain(
      "OATLAS_VAULT='/Users/dana/Team Vault/docs/ontology'",
    );
    expect(command).not.toContain("<absolute path to your team-vault folder>");
  });

  it("vault 이름의 작은따옴표를 shell-safe 하게 escape 한다", () => {
    const command = buildCodexMcpAddCommandTemplate("team's vault");

    expect(command).toContain(
      "OATLAS_VAULT='<absolute path to your team'\\''s vault folder>'",
    );
  });
});

describe("buildAgentSetupCliCommandTemplate", () => {
  it("기존 vault 를 codebase-root 에 연결하는 안전한 CLI repair 명령을 제공", () => {
    const command = buildAgentSetupCliCommandTemplate("team-vault");

    expect(command).toBe(
      "node $ATLAS/cli/src/index.mjs agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --write",
    );
  });

  it("vault 이름의 작은따옴표를 shell-safe 하게 escape 한다", () => {
    const command = buildAgentSetupCliCommandTemplate("team's vault");

    expect(command).toContain(
      "'<absolute path to your team'\\''s vault folder>'",
    );
  });
});

describe("buildAgentSetupCheckCliCommandTemplate", () => {
  it("기존 vault 의 codebase-root 설정 상태를 JSON dry-run 으로 점검하는 명령을 제공", () => {
    const command = buildAgentSetupCheckCliCommandTemplate("team-vault");

    expect(command).toBe(
      "node $ATLAS/cli/src/index.mjs agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --json",
    );
  });

  it("vault 이름의 작은따옴표를 shell-safe 하게 escape 한다", () => {
    const command = buildAgentSetupCheckCliCommandTemplate("team's vault");

    expect(command).toContain(
      "'<absolute path to your team'\\''s vault folder>'",
    );
  });
});
