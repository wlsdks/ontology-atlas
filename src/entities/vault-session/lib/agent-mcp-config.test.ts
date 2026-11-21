import { describe, expect, it } from "vitest";
import {
  buildCodexConfigToml,
  buildCodexConfigTomlTemplate,
  buildCodexMcpAddCommandTemplate,
  buildAgentSetupCliCommandTemplate,
  buildAgentSetupCheckCliCommandTemplate,
  buildMcpConfigJson,
  buildVaultMcpConfigJson,
} from "./agent-mcp-config";

describe("buildMcpConfigJson", () => {
  it("includes the MCP server 'ontology-atlas' entry and the OATLAS_VAULT env placeholder", () => {
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

  it("embeds vaultName verbatim in the placeholder", () => {
    expect(buildMcpConfigJson("foo")).toContain("your foo folder");
    expect(buildMcpConfigJson("한글-vault")).toContain("your 한글-vault folder");
  });

  it("lets the installed app put the vault absolute path it knows straight into OATLAS_VAULT", () => {
    const parsed = JSON.parse(
      buildMcpConfigJson("team-vault", "/Users/dana/Team Vault/docs/ontology"),
    );

    expect(parsed.mcpServers["ontology-atlas"].env.OATLAS_VAULT).toBe(
      "/Users/dana/Team Vault/docs/ontology",
    );
  });

  it("appends a newline at the end of the output (editor friendly)", () => {
    expect(buildMcpConfigJson("v")).toMatch(/\n$/);
  });

  it("pretty-prints with 2-space indentation", () => {
    const json = buildMcpConfigJson("v");
    expect(json).toContain("  \"mcpServers\":");
    expect(json).toContain("    \"ontology-atlas\":");
  });
});

describe("buildVaultMcpConfigJson", () => {
  it("provides the OATLAS_VAULT=. config for opening the vault folder itself in an agent", () => {
    const parsed = JSON.parse(buildVaultMcpConfigJson());
    expect(parsed.mcpServers["ontology-atlas"].command).toBe("node");
    expect(parsed.mcpServers["ontology-atlas"].args).toEqual([
      "<absolute path to your ontology-atlas checkout>/mcp/src/index.js",
    ]);
    expect(parsed.mcpServers["ontology-atlas"].env.OATLAS_VAULT).toBe(".");
  });
});

describe("buildCodexConfigToml", () => {
  it("provides the Codex repo-local MCP config as vault-relative", () => {
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

  it("provides an absolute-path placeholder in the Codex codebase-root MCP config template", () => {
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

  it("lets the Codex codebase-root MCP config template take the known vault absolute path directly", () => {
    const toml = buildCodexConfigTomlTemplate(
      "team-vault",
      "/Users/dana/Team Vault/docs/ontology",
    );

    expect(toml).toContain(
      'OATLAS_VAULT = "/Users/dana/Team Vault/docs/ontology"',
    );
    expect(toml).not.toContain("<absolute path to your team-vault folder>");
  });

  it("escapes the OATLAS_VAULT value in the Codex MCP config as a TOML string", () => {
    const toml = buildCodexConfigToml('/tmp/vault "quoted"');
    expect(toml).toContain('OATLAS_VAULT = "/tmp/vault \\"quoted\\""');
  });
});

describe("buildCodexMcpAddCommandTemplate", () => {
  it("provides the Codex CLI one-line MCP registration command with an absolute-path placeholder", () => {
    const command = buildCodexMcpAddCommandTemplate("team-vault");

    expect(command).toContain("codex mcp add ontology-atlas");
    expect(command).toContain(
      "OATLAS_VAULT='<absolute path to your team-vault folder>'",
    );
    expect(command).toContain(
      "'node' '<absolute path to your ontology-atlas checkout>/mcp/src/index.js'",
    );
  });

  it("puts the known vault absolute path into the Codex CLI one-line MCP registration command shell-safely", () => {
    const command = buildCodexMcpAddCommandTemplate(
      "team-vault",
      "/Users/dana/Team Vault/docs/ontology",
    );

    expect(command).toContain(
      "OATLAS_VAULT='/Users/dana/Team Vault/docs/ontology'",
    );
    expect(command).not.toContain("<absolute path to your team-vault folder>");
  });

  it("escapes a single quote in the vault name shell-safely", () => {
    const command = buildCodexMcpAddCommandTemplate("team's vault");

    expect(command).toContain(
      "OATLAS_VAULT='<absolute path to your team'\\''s vault folder>'",
    );
  });
});

describe("buildAgentSetupCliCommandTemplate", () => {
  it("provides a safe CLI repair command that attaches an existing vault to the codebase root", () => {
    const command = buildAgentSetupCliCommandTemplate("team-vault");

    expect(command).toBe(
      "node $ATLAS/cli/src/index.mjs agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --write",
    );
  });

  it("escapes a single quote in the vault name shell-safely", () => {
    const command = buildAgentSetupCliCommandTemplate("team's vault");

    expect(command).toContain(
      "'<absolute path to your team'\\''s vault folder>'",
    );
  });
});

describe("buildAgentSetupCheckCliCommandTemplate", () => {
  it("provides a command that checks an existing vault's codebase-root setup state as a JSON dry-run", () => {
    const command = buildAgentSetupCheckCliCommandTemplate("team-vault");

    expect(command).toBe(
      "node $ATLAS/cli/src/index.mjs agent-setup '<absolute path to your team-vault folder>' --root '<absolute path to your codebase root>' --json",
    );
  });

  it("escapes a single quote in the vault name shell-safely", () => {
    const command = buildAgentSetupCheckCliCommandTemplate("team's vault");

    expect(command).toContain(
      "'<absolute path to your team'\\''s vault folder>'",
    );
  });
});
