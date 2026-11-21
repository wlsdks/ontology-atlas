import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import surface from "../../../docs/.generated/mcp-surface.json";
import {
  starterFilesForLocale,
  VAULT_AGENT_GUIDE_PATH,
  VAULT_CLAUDE_BRIDGE_PATH,
  vaultAgentGuideForLocale,
  vaultClaudeBridgeForLocale,
} from "@/entities/vault-session/lib/ontology-starter";
import { MCP_SERVER_NAME } from "@/shared/config/mcp/mcp-server-launch";
import { analyzeAgentFiles } from "../../../cli/src/lib/agent-setup/agent-files.mjs";
import { runCliJson } from "../../helpers/run-cli-json";

/**
 * Contract for the agent guide placed in the vault: the CLI and the app produce the same file, and
 * every `snake_case` name in backticks is a registered MCP tool, read from
 * `docs/.generated/mcp-surface.json` rather than a hand-kept list.
 */

const templatePath = (locale: "en" | "ko", relPath: string) =>
  join(process.cwd(), "cli", "templates", locale === "ko" ? "vault-ko" : "vault", relPath);

type SurfaceTool = { name: string; arguments?: string[] };
const surfaceTools = (surface as { mcp?: { tools?: SurfaceTool[] } }).mcp?.tools ?? [];

const registeredTools = new Set(surfaceTools.map((tool) => tool.name));
/**
 * Tool names **and their argument names**. The guide names arguments too, as in
 * `patch_concept(expected_mtime)`, and those names can go stale, so they are locked
 * alongside. Both come from the generated surface, so there is no list for a human
 * to maintain.
 */
/**
 * The frontmatter keys the starter vault **actually uses**. Locale-suffixed keys
 * like `display_ko` are not written out as words in the schema, so extracting them
 * from the shipped data is the only source that cannot go stale. A typo
 * (`dispaly_ko`) is absent here too, so it is caught.
 */
const starterFrontmatterKeys = new Set(
  (["en", "ko"] as const).flatMap((locale) =>
    starterFilesForLocale(locale).flatMap((file) =>
      [...file.content.matchAll(/^([a-z][a-z0-9_]*):/gmu)].map((m) => m[1]),
    ),
  ),
);

/**
 * The health-check names the product **actually emits**. This list exists as no
 * constant in the code (the checks are built inline), and copying it here would
 * create a copy that eventually diverges. So health is run once against the dogfood
 * vault to obtain it — 0.2 s.
 */
const healthCheckIds = (() => {
  const payload = runCliJson<{ checks?: Array<{ id?: string }> }>([
    join(process.cwd(), "cli", "src", "index.mjs"),
    "health",
    "docs/ontology",
    "--json",
  ]);
  return new Set((payload.checks ?? []).map((check) => check.id ?? ""));
})();

const knownNames = new Set([
  ...registeredTools,
  ...surfaceTools.flatMap((tool) => tool.arguments ?? []),
  ...starterFrontmatterKeys,
  ...healthCheckIds,
]);

/** `snake_case` words inside backticks — the shape a tool name takes in this document. */
const toolMentions = (markdown: string): string[] =>
  [...markdown.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b[^`]*`/gu)].map((m) => m[1]);

describe("vault agent guide", () => {
  it("actually read the registered MCP tool list, otherwise everything below spins idle", () => {
    expect(registeredTools.size).toBeGreaterThan(20);
    expect(registeredTools.has("list_concepts")).toBe(true);
  });

  it("actually read the health check names the product exposes", () => {
    // The guide's closing step tells the agent to read these checks by name. A renamed
    // check makes that instruction false, so the names are locked here.
    expect(healthCheckIds.size).toBeGreaterThan(5);
    expect(healthCheckIds.has("components")).toBe(true);
    expect(healthCheckIds.has("relation_recommendations")).toBe(true);
  });

  it("actually read the starter's frontmatter fields too", () => {
    expect(starterFrontmatterKeys.has("display_ko")).toBe(true);
    expect(starterFrontmatterKeys.has("title")).toBe(true);
    // Idling guard — a typo must not be present here.
    expect(starterFrontmatterKeys.has("dispaly_ko")).toBe(false);
  });

  for (const locale of ["en", "ko"] as const) {
    describe(`locale: ${locale}`, () => {
      const guide = vaultAgentGuideForLocale(locale);

      const bridge = vaultClaudeBridgeForLocale(locale);

      it("is byte-identical to the CLI template", () => {
        expect(guide.content).toBe(
          readFileSync(templatePath(locale, VAULT_AGENT_GUIDE_PATH), "utf8"),
        );
        expect(bridge.content).toBe(
          readFileSync(templatePath(locale, VAULT_CLAUDE_BRIDGE_PATH), "utf8"),
        );
      });

      /*
       * A single guide file leaves one runtime with nothing: Codex reads `AGENTS.md` directly, Claude Code
       * reaches it through the `@AGENTS.md` import in `CLAUDE.md`. The product own checker
       * (`claude-agents-bridge`) decides, so the rule is not reimplemented here.
       */
      it("the bridge to Claude Code is really connected, judged by the product's own checker", () => {
        const analysis = analyzeAgentFiles({
          files: [
            { path: VAULT_AGENT_GUIDE_PATH, content: guide.content },
            { path: VAULT_CLAUDE_BRIDGE_PATH, content: bridge.content },
          ],
        });
        expect(analysis.checks.claudeAgentsBridge.status).toBe("ok");
        expect(analysis.drift).toEqual([]);
      });

      it("that check goes red when the bridge exists but the guide does not, so it does not spin idle", () => {
        const analysis = analyzeAgentFiles({
          files: [{ path: VAULT_CLAUDE_BRIDGE_PATH, content: bridge.content }],
        });
        expect(analysis.checks.claudeAgentsBridge.status).toBe("drift");
      });

      it("actually recommends tools, otherwise the guide is worthless", () => {
        // In the measurement, what changed the behaviour was the "call this first" table.
        expect(toolMentions(guide.content).length).toBeGreaterThanOrEqual(1);
      });

      it("every recommended tool exists", () => {
        const missing = [...new Set(toolMentions(guide.content))].filter(
          (name) => !knownNames.has(name),
        );
        expect(missing, "the guide tells the agent to call a tool that does not exist").toEqual([]);
      });

      it("names the server, since an agent that does not know the name cannot call it", () => {
        // Measured: before the name was given, the agent could not find us in its tool list.
        expect(MCP_SERVER_NAME.length).toBeGreaterThan(0);
        expect(guide.content).toContain(MCP_SERVER_NAME);
      });
    });
  }

  /*
   * The guide claims every node keeps `title` in English; the shipped starter data is asked instead of
   * pinning the sentence, so a changed convention breaks this check first.
   */
  it("the starter really keeps that convention, so the guide's claim matches the data", () => {
    const named = starterFilesForLocale("ko").filter((file) =>
      /^display_en:/m.test(file.content),
    );
    expect(named.length).toBeGreaterThanOrEqual(4);
    for (const file of named) {
      const title = /^title:\s*(.+)$/m.exec(file.content)?.[1]?.trim();
      const displayEn = /^display_en:\s*(.+)$/m.exec(file.content)?.[1]?.trim();
      expect(title, `${file.relPath}: title must be the canonical (English) name`).toBe(displayEn);
    }
  });

  it("both languages recommend the same tools, since fixing only one leaves the other stale", () => {
    const named = (locale: "en" | "ko") =>
      [...new Set(toolMentions(vaultAgentGuideForLocale(locale).content))].sort();
    expect(named("ko")).toEqual(named("en"));
  });

  it("an unknown locale falls back to English, the same discipline as the starter", () => {
    expect(vaultAgentGuideForLocale("fr")).toEqual(vaultAgentGuideForLocale("en"));
  });
});
