import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMcpToolMetadataFromDescription } from "../../../../cli/src/lib/mcp-metadata.mjs";
import {
  ONTOLOGY_STARTER_FILES,
  buildCodexConfigToml,
  buildCodexConfigTomlTemplate,
  buildCodexMcpAddCommandTemplate,
  buildMcpConfigJson,
  buildVaultMcpConfigJson,
} from "./ontology-starter";

const ROOT = path.resolve(__dirname, "../../../..");
const MCP_PKG = JSON.parse(
  readFileSync(path.join(ROOT, "mcp", "package.json"), "utf8"),
);
const MCP_TOOL_METADATA = parseMcpToolMetadataFromDescription(
  MCP_PKG.description,
);

describe("ONTOLOGY_STARTER_FILES", () => {
  it("5 시드 파일 제공 — README + project + 3 example (domain/capability/element)", () => {
    expect(ONTOLOGY_STARTER_FILES).toHaveLength(5);
    const paths = ONTOLOGY_STARTER_FILES.map((f) => f.relPath);
    expect(paths).toContain("README.md");
    expect(paths).toContain("project.md");
    expect(paths).toContain("domains/example.md");
    expect(paths).toContain("capabilities/example.md");
    expect(paths).toContain("elements/example.md");
  });

  it("모든 파일이 frontmatter 시작 (---) + kind 키 포함", () => {
    for (const f of ONTOLOGY_STARTER_FILES) {
      expect(f.content.startsWith("---\n")).toBe(true);
      expect(f.content).toMatch(/^kind:\s/m);
    }
  });

  it("3 example 파일은 정확히 1 줄로 example slug 가짐 (도메인/역량/요소 컨벤션)", () => {
    const example = ONTOLOGY_STARTER_FILES.find(
      (f) => f.relPath === "domains/example.md",
    );
    expect(example?.content).toMatch(/^slug:\s+domains\/example/m);
  });

  it("web starter 와 CLI template 은 같은 vault README/setup 안내를 제공", () => {
    for (const starterFile of ONTOLOGY_STARTER_FILES) {
      const template = readFileSync(
        path.join(ROOT, "cli/templates/vault", starterFile.relPath),
        "utf8",
      );
      expect(starterFile.content).toBe(template);
    }
  });

  it("starter README 는 Claude/Cursor 와 Codex MCP setup 을 같이 안내", () => {
    const readme = ONTOLOGY_STARTER_FILES.find(
      (f) => f.relPath === "README.md",
    )?.content;

    expect(readme).toContain("## AI agent setup");
    expect(readme).toContain("Claude Code / Cursor");
    expect(readme).toContain("Codex");
    expect(readme).toContain(".codex/config.toml");
    expect(readme).toContain("codex mcp add oh-my-ontology");
    expect(readme).toContain(".mcp.json.example");
    expect(readme).toContain("OMOT_VAULT");
  });

  it("starter README 는 현재 MCP package tool inventory 를 안내", () => {
    const readme = ONTOLOGY_STARTER_FILES.find(
      (f) => f.relPath === "README.md",
    )?.content;

    expect(MCP_TOOL_METADATA).toBeTruthy();
    expect(readme).toContain(`agent gets ${MCP_TOOL_METADATA?.toolCount}`);
    expect(readme).toContain(`**read ${MCP_TOOL_METADATA?.readCount}**`);
    expect(readme).toContain(`**write ${MCP_TOOL_METADATA?.writeCount}**`);
    expect(readme).toContain("find_neighbors");
    expect(readme).toContain("compile_ontology");
    expect(readme).toContain("query_ontology");
    expect(readme).not.toContain("agent gets 20");
    expect(readme).not.toContain("**read 12**");
  });

  it("starter README 는 첫 agent 연결 검증 루프를 안내", () => {
    const readme = ONTOLOGY_STARTER_FILES.find(
      (f) => f.relPath === "README.md",
    )?.content;

    expect(readme).toContain("## Verify the agent loop");
    expect(readme).toContain("validate_vault");
    expect(readme).toContain('"operation": "workspace_brief"');
    expect(readme).toContain('"operation": "agent_brief"');
    expect(readme).toContain("oh-my-ontology bootstrap . --vault");
    expect(readme).toContain("If the CLI is installed");
    expect(readme).toContain("oh-my-ontology validate .");
    expect(readme).toContain("oh-my-ontology agent-brief . --graph-db-pack");
    expect(readme).toContain("oh-my-ontology agent-brief . --verify-fallbacks");
    expect(readme).toContain("oh-my-ontology agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000");
    expect(readme).toContain("oh-my-ontology mcp-verify . --timeout-ms 15000");
    expect(readme).toMatch(/before it edits\s+anything/);
  });
});

describe("buildMcpConfigJson", () => {
  it("MCP server 'oh-my-ontology' 항목과 OMOT_VAULT env placeholder 포함", () => {
    const json = buildMcpConfigJson("my-vault");
    const parsed = JSON.parse(json);
    expect(parsed).toEqual({
      mcpServers: {
        "oh-my-ontology": {
          command: "npx",
          args: ["-y", "oh-my-ontology-mcp"],
          env: {
            OMOT_VAULT: "<absolute path to your my-vault folder>",
          },
        },
      },
    });
  });

  it("vaultName 이 문자 그대로 placeholder 안에 박힘", () => {
    expect(buildMcpConfigJson("foo")).toContain("your foo folder");
    expect(buildMcpConfigJson("한글-vault")).toContain("your 한글-vault folder");
  });

  it("출력 끝에 newline 추가 (편집기 친화)", () => {
    expect(buildMcpConfigJson("v")).toMatch(/\n$/);
  });

  it("2-space 들여쓰기로 pretty-print", () => {
    const json = buildMcpConfigJson("v");
    expect(json).toContain("  \"mcpServers\":");
    expect(json).toContain("    \"oh-my-ontology\":");
  });
});

describe("buildVaultMcpConfigJson", () => {
  it("vault 폴더 자체를 agent에서 열 때 바로 쓰는 OMOT_VAULT=. config 제공", () => {
    const parsed = JSON.parse(buildVaultMcpConfigJson());
    expect(parsed.mcpServers["oh-my-ontology"].command).toBe("npx");
    expect(parsed.mcpServers["oh-my-ontology"].args).toEqual([
      "-y",
      "oh-my-ontology-mcp",
    ]);
    expect(parsed.mcpServers["oh-my-ontology"].env.OMOT_VAULT).toBe(".");
  });
});

describe("buildCodexConfigToml", () => {
  it("Codex repo-local MCP config 를 vault-relative 로 제공", () => {
    const toml = buildCodexConfigToml();
    expect(toml).toContain("[mcp_servers.oh-my-ontology]");
    expect(toml).toContain('command = "npx"');
    expect(toml).toContain('args = ["-y", "oh-my-ontology-mcp"]');
    expect(toml).toContain("[mcp_servers.oh-my-ontology.env]");
    expect(toml).toContain('OMOT_VAULT = "."');
    expect(toml).toMatch(/\n$/);
  });

  it("Codex codebase-root MCP config template 은 절대경로 placeholder 를 제공", () => {
    const toml = buildCodexConfigTomlTemplate("team-vault");
    expect(toml).toContain("[mcp_servers.oh-my-ontology]");
    expect(toml).toContain('command = "npx"');
    expect(toml).toContain('args = ["-y", "oh-my-ontology-mcp"]');
    expect(toml).toContain(
      'OMOT_VAULT = "<absolute path to your team-vault folder>"',
    );
    expect(toml).toMatch(/\n$/);
  });

  it("Codex MCP config 는 OMOT_VAULT 값을 TOML string 으로 escape 한다", () => {
    const toml = buildCodexConfigToml('/tmp/vault "quoted"');
    expect(toml).toContain('OMOT_VAULT = "/tmp/vault \\"quoted\\""');
  });
});

describe("buildCodexMcpAddCommandTemplate", () => {
  it("Codex CLI one-line MCP 등록 명령을 절대경로 placeholder 로 제공", () => {
    const command = buildCodexMcpAddCommandTemplate("team-vault");

    expect(command).toContain("codex mcp add oh-my-ontology");
    expect(command).toContain(
      "OMOT_VAULT='<absolute path to your team-vault folder>'",
    );
    expect(command).toContain("npx -y oh-my-ontology-mcp");
  });

  it("vault 이름의 작은따옴표를 shell-safe 하게 escape 한다", () => {
    const command = buildCodexMcpAddCommandTemplate("team's vault");

    expect(command).toContain(
      "OMOT_VAULT='<absolute path to your team'\\''s vault folder>'",
    );
  });
});
