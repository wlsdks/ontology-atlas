import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  materializeStarterFiles,
  starterFilesForLocale,
} from "./ontology-starter";

const ROOT = path.resolve(__dirname, "../../../..");
const ONTOLOGY_STARTER_FILES = starterFilesForLocale("en");

describe("ONTOLOGY_STARTER_FILES", () => {
  it("ships 5 seed files: README, project, and 3 examples (domain/capability/element)", () => {
    expect(ONTOLOGY_STARTER_FILES).toHaveLength(5);
    const paths = ONTOLOGY_STARTER_FILES.map((f) => f.relPath);
    expect(paths).toContain("README.md");
    expect(paths).toContain("project.md");
    expect(paths).toContain("domains/example-domain.md");
    expect(paths).toContain("capabilities/example-capability.md");
    expect(paths).toContain("elements/example-element.md");
  });

  it("starts every file with frontmatter (---) and includes a kind key", () => {
    for (const f of ONTOLOGY_STARTER_FILES) {
      expect(f.content.startsWith("---\n")).toBe(true);
      expect(f.content).toMatch(/^kind:\s/m);
    }
  });

  it("leaves UID unpinned in the static template and mints a new UID for every node on each scaffold", () => {
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
      expect(readme).toContain("add_concept");
      expect(project).not.toMatch(/rename or copy starters|바꾸거나\s+복사합니다/i);
    }
  });

  it("gives each of the 3 example files exactly one line with the example slug (domain/capability/element convention)", () => {
    const example = ONTOLOGY_STARTER_FILES.find(
      (f) => f.relPath === "domains/example-domain.md",
    );
    expect(example?.content).toMatch(/^slug:\s+domains\/example-domain/m);
  });

  it("gives the app starter and the init template the same vault README and setup guidance", () => {
    for (const starterFile of ONTOLOGY_STARTER_FILES) {
      const template = readFileSync(
        path.join(ROOT, "cli/templates/vault", starterFile.relPath),
        "utf8",
      );
      expect(starterFile.content).toBe(template);
    }
  });

  it("has the starter README cover only two channels (installed app, hand merge)", () => {
    const readme = ONTOLOGY_STARTER_FILES.find(
      (f) => f.relPath === "README.md",
    )?.content;

    expect(readme).toContain("## AI agent setup");
    expect(readme).toContain("Claude Code / Cursor");
    expect(readme).toContain("Codex");
    expect(readme).toContain(".codex/config.toml");
    expect(readme).toContain("installed Ontology Atlas app");
    expect(readme).toContain("press the connect button");
    expect(readme).toContain(".mcp.json.example");
    expect(readme).toContain("OATLAS_VAULT");
  });

  it("keeps unrunnable commands out of the starter README", () => {
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

  it("has the starter README show the live MCP inventory and a read-first starting point", () => {
    for (const locale of ["en", "ko"] as const) {
      const readme = starterFilesForLocale(locale).find(
        (f) => f.relPath === "README.md",
      )?.content ?? "";

      expect(readme).toContain("tools/list");
      expect(readme).toContain("connection_info");
      expect(readme).toContain("list_kinds");
      expect(readme).toContain("validate_vault");
      expect(readme).toContain('operation: "agent_brief"');
      expect(readme).not.toMatch(/\b\d+\s+(?:read|write|tools?)\b/i);
      expect(readme).not.toMatch(/(?:읽기|쓰기|도구)\s*\d+\s*개/);
    }
  });

  it("has the starter README show a first agent connection verification loop", () => {
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
    expect(readme).not.toMatch(/\bnode\b[^\n]*\/cli\//);
    expect(readme).toMatch(/before it edits\s+anything/);
  });
});
