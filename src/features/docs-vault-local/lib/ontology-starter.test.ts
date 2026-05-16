import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ONTOLOGY_STARTER_FILES,
  buildMcpConfigJson,
} from "./ontology-starter";

const ROOT = path.resolve(__dirname, "../../../..");

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
    expect(readme).toContain("codex mcp add oh-my-ontology");
    expect(readme).toContain(".mcp.json.example");
    expect(readme).toContain("OMOT_VAULT");
  });

  it("starter README 는 현재 MCP tool inventory 를 안내", () => {
    const readme = ONTOLOGY_STARTER_FILES.find(
      (f) => f.relPath === "README.md",
    )?.content;

    expect(readme).toContain("agent gets 23");
    expect(readme).toContain("**read 15**");
    expect(readme).toContain("**write 8**");
    expect(readme).toContain("find_neighbors");
    expect(readme).toContain("compile_ontology");
    expect(readme).toContain("query_ontology");
    expect(readme).not.toContain("agent gets 20");
    expect(readme).not.toContain("**read 12**");
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
