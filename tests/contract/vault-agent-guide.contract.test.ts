import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import surface from "../../docs/.generated/mcp-surface.json";
import {
  starterFilesForLocale,
  VAULT_AGENT_GUIDE_PATH,
  VAULT_CLAUDE_BRIDGE_PATH,
  vaultAgentGuideForLocale,
  vaultClaudeBridgeForLocale,
} from "@/features/docs-vault-local/lib/ontology-starter";
import { analyzeAgentFiles } from "../../cli/src/lib/agent-files.mjs";
import { runCliJson } from "../helpers/run-cli-json";

/**
 * Contract for the **agent guide** placed inside the vault.
 *
 * **Why this file appears in the vault** (measured 2026-08-17). Even with the MCP
 * server attached, agents did not pick it up. Asked in the installed app,
 * *"이 폴더에 있는 개념들의 slug 를 전부 알려줘"* (list every concept slug in this
 * folder), codex did:
 *
 * | | What it did | MCP calls |
 * |---|---|---|
 * | Without the guide | read five files with `sed`, then again with `grep '^slug:'` | **0** |
 * | With the guide | *"I'll call list_concepts first"* → called it immediately | **1** |
 *
 * **What this contract locks.**
 *
 * **① The CLI and the app produce the same file.** The starter documents are already
 * locked for the same reason (`starter-templates.contract.test.ts`) — if vaults built
 * by the two paths differ, people using the same product two ways read different
 * guidance.
 *
 * **② The tools the guide names exist.** This is the file's real job. The guide is
 * prose, so it goes stale while nobody edits it, and stale guidance tells an agent to
 * call a tool that does not exist — the same species as the previous day's defect of
 * sending a person to a settings section that did not exist. So instead of pinning
 * sentences (forbidden by `.claude/rules/documentation.md`) it measures a
 * **relation**: is every `snake_case` name inside backticks a registered MCP tool?
 * The source of that verdict is the generated
 * `docs/.generated/mcp-surface.json`, so no human maintains it.
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

describe("볼트 에이전트 안내문", () => {
  it("등록된 MCP 도구 목록을 실제로 읽었다 — 아니면 아래가 전부 헛돈다", () => {
    expect(registeredTools.size).toBeGreaterThan(20);
    expect(registeredTools.has("list_concepts")).toBe(true);
  });

  it("제품이 내놓는 health 검사 이름을 실제로 읽었다", () => {
    // The guide's closing step tells the agent to read these checks by name. A renamed
    // check makes that instruction false, so the names are locked here.
    expect(healthCheckIds.size).toBeGreaterThan(5);
    expect(healthCheckIds.has("components")).toBe(true);
    expect(healthCheckIds.has("relation_recommendations")).toBe(true);
  });

  it("스타터의 frontmatter 칸도 실제로 읽었다", () => {
    expect(starterFrontmatterKeys.has("display_ko")).toBe(true);
    expect(starterFrontmatterKeys.has("title")).toBe(true);
    // Idling guard — a typo must not be present here.
    expect(starterFrontmatterKeys.has("dispaly_ko")).toBe(false);
  });

  for (const locale of ["en", "ko"] as const) {
    describe(`locale: ${locale}`, () => {
      const guide = vaultAgentGuideForLocale(locale);

      const bridge = vaultClaudeBridgeForLocale(locale);

      it("CLI 템플릿과 바이트 동일하다", () => {
        expect(guide.content).toBe(
          readFileSync(templatePath(locale, VAULT_AGENT_GUIDE_PATH), "utf8"),
        );
        expect(bridge.content).toBe(
          readFileSync(templatePath(locale, VAULT_CLAUDE_BRIDGE_PATH), "utf8"),
        );
      });

      /*
       * ⚠️ **A single guide file leaves one of the two runtimes with nothing.** This
       * repository's own tool table: Codex reads `AGENTS.md` directly, while Claude Code
       * reaches it through `CLAUDE.md`'s `@AGENTS.md` import.
       *
       * The verdict comes from **the product's own checker** (`analyzeAgentFiles`'s
       * `claude-agents-bridge`). Reimplementing the rule here would create a copy that
       * eventually diverges from the original, a failure this repository has had several
       * times.
       */
      it("Claude Code 로 가는 다리가 실제로 이어져 있다 — 제품 자신의 검사기로 판정", () => {
        const analysis = analyzeAgentFiles({
          files: [
            { path: VAULT_AGENT_GUIDE_PATH, content: guide.content },
            { path: VAULT_CLAUDE_BRIDGE_PATH, content: bridge.content },
          ],
        });
        expect(analysis.checks.claudeAgentsBridge.status).toBe("ok");
        expect(analysis.drift).toEqual([]);
      });

      it("다리만 있고 안내문이 없으면 그 검사가 빨개진다 — 헛돌지 않는다", () => {
        const analysis = analyzeAgentFiles({
          files: [{ path: VAULT_CLAUDE_BRIDGE_PATH, content: bridge.content }],
        });
        expect(analysis.checks.claudeAgentsBridge.status).toBe("drift");
      });

      it("도구를 실제로 추천한다 — 안 하면 이 안내문은 있으나 마나다", () => {
        // In the measurement, what changed the behaviour was the "call this first" table.
        expect(toolMentions(guide.content).length).toBeGreaterThanOrEqual(6);
      });

      it("추천한 도구가 전부 실재한다", () => {
        const missing = [...new Set(toolMentions(guide.content))].filter(
          (name) => !knownNames.has(name),
        );
        expect(missing, "안내문이 없는 도구를 부르라고 한다").toEqual([]);
      });

      it("서버 이름을 대 준다 — 이름을 모르면 못 부른다", () => {
        // Measured: before the name was given, the agent could not find us in its tool list.
        expect(guide.content).toContain("ontology-atlas");
      });

      it("직접 읽지 말라고 말한다 — 그게 종전의 기본 행동이었다", () => {
        expect(guide.content).toContain("grep");
        expect(guide.content).toContain("sed");
      });
    });
  }

  /*
   * The guide **claims** that every node in this folder keeps `title` in English.
   * Rather than pinning that claim as a sentence, **ask the shipped data** — if the
   * convention changes, that sentence becomes false and this check breaks first.
   *
   * Measured 2026-08-17: with a guide lacking that line, codex wrote
   * `title: 결제 환불 처리` (the same value as `display_ko`); with it, codex wrote
   * `title: Payment refund processing`.
   */
  it("스타터가 실제로 그 규약을 지킨다 — 안내문의 주장이 데이터와 맞는가", () => {
    const named = starterFilesForLocale("ko").filter((file) =>
      /^display_en:/m.test(file.content),
    );
    expect(named.length).toBeGreaterThanOrEqual(4);
    for (const file of named) {
      const title = /^title:\s*(.+)$/m.exec(file.content)?.[1]?.trim();
      const displayEn = /^display_en:\s*(.+)$/m.exec(file.content)?.[1]?.trim();
      expect(title, `${file.relPath}: title 이 정본(영어) 이름이어야 한다`).toBe(displayEn);
    }
  });

  it("두 언어가 같은 도구를 추천한다 — 한쪽만 고치면 다른 쪽이 낡는다", () => {
    const named = (locale: "en" | "ko") =>
      [...new Set(toolMentions(vaultAgentGuideForLocale(locale).content))].sort();
    expect(named("ko")).toEqual(named("en"));
  });

  it("모르는 로케일은 영어로 떨어진다 — 스타터와 같은 규율", () => {
    expect(vaultAgentGuideForLocale("fr")).toEqual(vaultAgentGuideForLocale("en"));
  });
});
