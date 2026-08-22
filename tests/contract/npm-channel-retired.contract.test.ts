import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Gate against guidance that resurrects the retired npm channel.
 *
 * The npm publishing plan was retired on 2026-07-27 (`docs/DECISIONS.md`).
 * `ontology-atlas` and `ontology-atlas-mcp` are not in the registry and never will
 * be — so guidance like `npx ontology-atlas init` is not future tense but **a
 * lie**. Running it produces a 404. The live app and documentation surfaces were
 * swept, and this gate stops it creeping back.
 *
 * **Why a contract test rather than lint**: the violations live in markdown prose,
 * YAML issue templates, and launch drafts — a layer ESLint's AST selectors cannot
 * see. So a contract test carries `design.md`'s "a spec without a rule is not
 * kept" here.
 *
 * **No exception list.** The archive (`docs/archive/**`), past CHANGELOG entries,
 * dated audit and benchmark records, and prototype drafts **were true at the
 * time** and must stay as they are. So the gate is an **allowlist**, not a
 * denylist — history is not on the list and is therefore structurally untouched.
 * Having zero exceptions to maintain is the point of this design.
 *
 * The tiers exist because **quoting and instructing are different**:
 *
 * - **Tier A — banned outright.** These surfaces have no reason to mention the
 *   dead channel: launch drafts, issue templates, contribution guidance, starter
 *   READMEs. Any `npx` here is 100% an instruction to a user.
 * - **Tier B — banned inside code blocks only.** Documents that must tell users
 *   "that does not work" (TROUBLESHOOTING, README status, the CLI README) have to
 *   **name the command**. The discriminator is **position, not glyph** — inside a
 *   fence means "copy and paste this", in prose it is a quotation. The same
 *   principle by which the label-decoration gate judges an arrow by position
 *   rather than glyph.
 * - **Tier C — bare invocations in source.** Added 2026-07-29; see "reach" below.
 *
 * **Why the reach was widened** (measured 2026-07-29). For a long time this gate
 * saw only `npx ontology-atlas`. But what the app had users copy was the **bare**
 * `ontology-atlas validate .` — with no runner it did not match the pattern, and
 * `which ontology-atlas` returns not found. An exhaustive count found 116
 * occurrences across 22 source files in that form.
 *
 * **A rule whose reach is short is the same as no rule.** The same failure as the
 * label-decoration gate exempting `→` wholesale and the primary save button
 * slipping through that exemption the next day. Hence Tier C: bare invocations in
 * an executable form are banned in TS/TSX under `src/` and `app/`, and the live
 * form is produced by a single source
 * (`src/shared/config/cli-invocation.ts`).
 */

/** An attempt to run the dead channel — only forms where runner and package meet on one line. */
const DEAD_INVOCATION: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "npx-ontology-atlas", pattern: /\bnpx\b[^\n]*\bontology-atlas\b/ },
  { id: "mcp-command-npx", pattern: /["']command["']\s*:\s*["']npx["']/ },
  { id: "codex-command-npx", pattern: /^\s*command\s*=\s*"npx"/m },
  {
    id: "npm-install-global",
    pattern: /\bnpm\s+(?:install|i)\s+(?:-g|--global)\b[^\n]*\bontology-atlas\b/,
  },
  { id: "dlx", pattern: /\b(?:pnpm|yarn)\s+dlx\b[^\n]*\bontology-atlas\b/ },
  /**
   * Bare invocation — no runner, so it escapes the patterns above, but **it fails to
   * run just the same**. `which ontology-atlas` → not found. Banned outright in
   * Tier A and inside fences only in Tier B (saying "that is dead" in prose requires
   * naming it).
   */
  {
    id: "bare-ontology-atlas",
    pattern:
      /(?<![\w/<-])ontology-atlas (?:absorb|add|agent-activity|agent-brief|agent-files|agent-setup|all-paths|analyze|backlinks|blast-radius|bootstrap|compile|components|cycles|delete|domain-matrix|explain|export|facets|find|growth|health|hubs|import|index|infer-imports|init|list|maintenance|match-edges|match-nodes|mcp-verify|merge|moment|node|node-profile|orphans|overview|path|pattern-walk|preflight|project-map|query|reachability|relate|relation-check|rename|schema|similar|snapshot|topological-order|validate|workspace-brief)(?![\w-])/,
  },
];

/**
 * Tier A — surfaces that must not contain one character of the dead channel.
 * Directories are matched by glob so **newly added files are covered
 * automatically**.
 */
const TIER_A_GLOBS = [
  "docs/launch/**/*.md",
  ".github/**/*.md",
  ".github/**/*.yml",
  ".github/**/*.yaml",
  "CONTRIBUTING.md",
  "cli/templates/vault/README.md",
  "cli/templates/vault-ko/README.md",
  // The web starter, which must stay byte-identical to the CLI template (starter-templates.contract).
  "src/features/docs-vault-local/lib/ontology-starter.ts",
];

/** Tier B — may say "that is dead" in prose, but must not put it in a code block. */
const TIER_B_FILES = [
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "docs/AGENT-GRAPH-WORKFLOW.md",
  "docs/FEATURES.md",
  "docs/TROUBLESHOOTING.md",
  "docs/PRODUCT-DIRECTION.md",
  "cli/README.md",
  "mcp/README.md",
];

/**
 * Tier C — bare invocations in source that **read as a command**. The product
 * name in prose ("ontology-atlas contributors", "Use this ontology-atlas run
 * order") is not a command, so it is a violation **only when a real CLI command
 * name follows**.
 */
const CLI_COMMANDS = [
  "absorb", "add", "agent-activity", "agent-brief", "agent-files", "agent-setup",
  "all-paths", "analyze", "backlinks", "blast-radius", "bootstrap",
  "compile", "components", "cycles", "delete", "domain-matrix", "explain",
  "export", "facets", "find", "growth", "health", "hubs", "import", "index",
  "infer-imports", "init", "list", "maintenance", "match-edges", "match-nodes",
  "mcp-verify", "merge", "moment", "node", "node-profile", "orphans", "overview",
  "path", "pattern-walk", "preflight", "project-map", "query", "reachability",
  "relate", "relation-check", "rename", "schema", "similar", "snapshot",
  "topological-order", "validate", "workspace-brief",
] as const;

/**
 * A name inside a **placeholder** such as `<ontology-atlas checkout>` is not a
 * command — it is part of the live form (`node <…>/cli/src/index.mjs`). So an
 * opening angle bracket and a path separator are excluded from the preceding
 * position.
 */
const BARE_CLI_PATTERN = new RegExp(
  `(?<![\\w/<-])ontology-atlas (?:${CLI_COMMANDS.map((c) => c.replace(/-/g, "\\-")).join("|")})(?![\\w-])`,
);

/**
 * Only these files may carry the dead name literally — one **produces the live
 * form** and one **explains this rule** (which requires naming it). A third entry
 * is the signal that the rule is leaking.
 */
const TIER_C_ALLOWED = [
  "src/shared/config/cli-invocation.ts",
  "src/shared/config/mcp-server-launch.ts",
];

interface Offence {
  file: string;
  line: number;
  rule: string;
  text: string;
}

function offencesIn(text: string, file: string, fencedOnly: boolean): Offence[] {
  const found: Offence[] = [];
  let insideFence = false;

  text.split("\n").forEach((line, index) => {
    // `ontology-starter.ts` holds markdown in a template literal and escapes the
    // backticks. Stripping backslashes before the fence test lets .md and .ts take
    // the same rule.
    const bare = line.replace(/\\/g, "");
    if (/^\s*(```|~~~)/.test(bare)) {
      insideFence = !insideFence;
      return;
    }
    if (fencedOnly && !insideFence) return;

    for (const { id, pattern } of DEAD_INVOCATION) {
      if (pattern.test(line)) found.push({ file, line: index + 1, rule: id, text: line.trim() });
    }
  });

  return found;
}

function report(offences: Offence[]): string {
  return offences.map((o) => `  ${o.file}:${o.line} [${o.rule}] ${o.text.slice(0, 110)}`).join("\n");
}

describe("npm 채널은 폐기됐다 — 죽은 npx 안내 차단", () => {
  it("Tier C: 소스가 실행 불가능한 맨몸 `ontology-atlas <명령>` 을 만들지 않는다", async () => {
    const { execFileSync } = await import("node:child_process");
    const files = execFileSync("git", ["ls-files", "src", "app"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\n")
      .filter((f) => /\.(ts|tsx)$/.test(f))
      // `git ls-files` still lists deleted-but-unstaged files from the index. The gate
      // must read the current working tree for a deletion itself to be verifiable.
      .filter((f) => existsSync(join(process.cwd(), f)))
      .filter((f) => !f.includes(".test."))
      // The generated mirror contains repository prose and would make **documentation be mistaken for source**.
      .filter((f) => !f.includes("docs-vault/data"))
      .filter((f) => !TIER_C_ALLOWED.includes(f));

    expect(files.length, "Tier C 파일 목록이 비었다 — 경로 계약이 깨졌다").toBeGreaterThan(100);

    const offences: Offence[] = [];
    for (const rel of files) {
      const text = readFileSync(join(process.cwd(), rel), "utf8");
      text.split("\n").forEach((line, index) => {
        if (BARE_CLI_PATTERN.test(line)) {
          offences.push({ file: rel, line: index + 1, rule: "bare-ontology-atlas", text: line.trim() });
        }
      });
    }

    expect(
      offences,
      offences.length
        ? `실행할 수 없는 맨몸 CLI 호출이다 — 이 이름의 전역 바이너리는 없다.\n` +
            `\`ATLAS_CLI\`(src/shared/config/cli-invocation.ts)로 만들어라.\n${report(offences)}`
        : "",
    ).toEqual([]);
  });

  /**
   * **A probe against the detector being silently disabled.** The check above
   * always passes when violations are 0, so a single typo killing the pattern goes
   * unnoticed. This feeds it one violating line and three valid ones and confirms
   * only the former is caught.
   */
  it("Tier C 프로브: 명령만 잡고 제품명·살아있는 형태는 통과시킨다", () => {
    expect(BARE_CLI_PATTERN.test('`ontology-atlas validate ${target}`')).toBe(true);
    expect(BARE_CLI_PATTERN.test('"ontology-atlas agent-brief [vault]"')).toBe(true);
    // The product name in prose — not a command.
    expect(BARE_CLI_PATTERN.test("name: 'ontology-atlas contributors'")).toBe(false);
    expect(BARE_CLI_PATTERN.test("Use this ontology-atlas first-contact run order")).toBe(false);
    // The live form — a name inside a path is not caught.
    expect(BARE_CLI_PATTERN.test("`node $ATLAS/cli/src/index.mjs validate ${t}`")).toBe(false);
    expect(BARE_CLI_PATTERN.test("node <ontology-atlas checkout>/cli/src/index.mjs agent-setup")).toBe(
      false,
    );
  });

  it("Tier A: 런치 초안 · 이슈 템플릿 · 기여 안내 · 스타터에 죽은 명령이 없다", async () => {
    const { glob } = await import("node:fs/promises");
    const files: string[] = [];
    for (const pattern of TIER_A_GLOBS) {
      for await (const entry of glob(pattern, { cwd: process.cwd() })) files.push(entry);
    }

    // The gate proves itself alive — if the glob matches nothing, this assertion
    // fails before "no violations" can be reported. (In 2026-07 a gate of the same
    // kind silently passed everything after an external process failed.)
    expect(files.length, "Tier A glob matched nothing — 경로 계약이 깨졌다").toBeGreaterThan(5);

    const offences = files.flatMap((rel) =>
      offencesIn(readFileSync(join(process.cwd(), rel), "utf8"), rel, false),
    );

    expect(
      offences,
      offences.length
        ? `죽은 npm 채널 안내 ${offences.length}건 (npm 발행 폐기, docs/DECISIONS.md 2026-07-27).\n` +
            `살아있는 경로는 둘뿐이다 — 설치 앱의 「에이전트 연결」 버튼, 또는 소스 체크아웃의\n` +
            `\`node <checkout>/cli/src/index.mjs\`.\n${report(offences)}`
        : "",
    ).toEqual([]);
  });

  it("Tier B: 참고 문서의 코드 블록 안에 죽은 명령이 없다 (산문 인용은 허용)", () => {
    const present = TIER_B_FILES.filter((rel) => existsSync(join(process.cwd(), rel)));
    expect(present, "Tier B 파일 경로가 깨졌다").toEqual(TIER_B_FILES);

    const offences = present.flatMap((rel) =>
      offencesIn(readFileSync(join(process.cwd(), rel), "utf8"), rel, true),
    );

    expect(
      offences,
      offences.length
        ? `코드 블록은 "이걸 복사해 실행하라" 는 뜻이다. 죽은 채널은 산문으로만 인용한다.\n${report(offences)}`
        : "",
    ).toEqual([]);
  });

  // ── Probe: proves the gate actually catches things ────────────────────────
  // design.md's procedure of proving "one violation fails, one valid line passes"
  // before switching a rule on, made resident inside the gate itself. A silently
  // disabled detector fails here first.
  it("프로브: 위반은 잡고, 정직한 산문과 살아있는 경로는 통과시킨다", () => {
    const violations = [
      "npx ontology-atlas init my-vault",
      "  - \"npx ontology-atlas init\"",
      '      "command": "npx",',
      'command = "npx"',
      "npm install -g ontology-atlas",
      "pnpm dlx ontology-atlas init",
    ];
    // **Overlapping matches are correct.** `npx ontology-atlas init` trips both the
    // runner rule and the bare rule — the same line is wrong for two reasons, and if
    // one rule is narrowed later the other still holds. So the requirement is "at
    // least one", not "exactly one".
    for (const line of violations) {
      expect(
        offencesIn(line, "probe", false).length,
        `놓쳤다: ${line}`,
      ).toBeGreaterThanOrEqual(1);
    }

    const allowed = [
      "node $ATLAS init ./ontology",
      '"command": "/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp"',
      "node <checkout>/cli/src/index.mjs agent-setup <vault> --root . --write",
      "npx create-next-app",
    ];
    for (const line of allowed) {
      expect(offencesIn(line, "probe", false), `오탐: ${line}`).toHaveLength(0);
    }

    // Does the inside/outside-fence discrimination really split — Tier B's core
    // property. The same glyph passes as a prose quotation ("that does not work") and
    // is caught inside a code block ("run this").
    const doc = [
      "`npx ontology-atlas` and `npx -y ontology-atlas-mcp` do not resolve and never will.",
      "```bash",
      "npx ontology-atlas init",
      "```",
    ].join("\n");
    // The point is the split by position, so this counts **lines** — one line
    // tripping several rules was established above as correct, and counting
    // occurrences would let that overlap move the number independently of this
    // property.
    const linesOf = (fencedOnly: boolean) =>
      new Set(offencesIn(doc, "probe", fencedOnly).map((o) => o.line)).size;
    expect(linesOf(true), "Tier B 는 펜스 안 한 줄만 잡아야 한다").toBe(1);
    expect(linesOf(false), "Tier A 는 산문 인용 줄까지 두 줄을 잡아야 한다").toBe(2);
  });
});
