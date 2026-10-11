#!/usr/bin/env node
// R13 #62 — pnpm benchmark
//
// Codex 10 task × 2 mode automated re-measurement. Records per-cell:
//   - raw stdout transcript → docs/benchmark/results/<date>-codex-<id>-<mode>.txt
//   - shell exec count + MCP tool-call count (regex extracted)
// And produces a markdown summary table (tool calls only — correctness
// and hallucination counts still need human review of transcripts).
//
// Usage:
//   pnpm benchmark --bypass          # full 20-cell run
//   pnpm benchmark --bypass --with-none # 30-cell no-vault control matrix
//   pnpm benchmark --bypass --on-only # ON mode 10 cells (faster)
//   pnpm benchmark --dry-run         # verify config without burning calls
//
// Why --bypass is required:
//   `codex exec` (non-interactive) default-denies all MCP tool calls.
//   The only way to actually exercise MCP is
//   `--dangerously-bypass-approvals-and-sandbox`. The script makes that
//   choice **explicit** — accidental runs that miss the bypass produce
//   meaningless data (Codex falls back to grep, MCP path untested).
//
// What this script does NOT do:
//   - Auto-grade correctness (no LLM-as-judge)
//   - Auto-count hallucinations
//   These remain human-grade against the saved transcripts.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const TASKS = [
  {
    id: "A1",
    label: "Domain composition",
    prompt:
      "이 repo 의 ontology vault (docs/ontology/) 에서 human-workbench 도메인 아래에 어떤 capability 와 element 들이 있는지 정리해줘. 도메인 자체의 한 줄 설명도 포함.",
  },
  {
    id: "A2",
    label: "Stub / unfinished detection",
    prompt:
      "이 repo 의 ontology 에서 kind: capability 인데 elements 배열이 비어 있는 노드들 (= 미완료 후보) 을 모두 찾아 slug 로 나열해줘. 답은 list 만.",
  },
  {
    id: "A3",
    label: "Reference graph",
    prompt:
      "capabilities/mcp-tool-server 를 frontmatter 에서 참조하고 있는 모든 노드를 찾아 kind 별로 분류해줘.",
  },
  {
    id: "B1",
    label: "Capability boundary (decision, not description)",
    prompt:
      "ontology-atlas 의 ACP runtime capability 가 명시적으로 무엇을 포함하고 무엇을 제외하는지, 그 경계를 그렇게 그은 이유와 함께 설명해줘.",
  },
  {
    id: "B2",
    label: "Conflict guard mechanism",
    prompt:
      "ontology-atlas MCP 의 write 도구들이 사용자의 외부 에디터 변경을 어떻게 감지하는지, 어떤 도구가 어떤 인자를 받는지 설명해줘.",
  },
  {
    id: "C1",
    label: "Function exports (negative control)",
    prompt:
      "src/shared/lib/vault-document/validate-vault-document.ts 에서 export 되는 함수들을 모두 나열해줘.",
  },
  /*
   * D group measures meaning, not lookup. Phrase tasks as change requests, never "should we build
   * this?": that sends the agent through the product decision gate in `AGENTS.md`. Grade whether the
   * answer names the boundary and cites where it lives.
   */
  {
    id: "D1",
    label: "Documented exclusion (meaning)",
    prompt:
      "MCP 서버에 코드 심볼 검색을 넣으려고 해. 이 기능이 mcp-tool-server capability 의 범위 안인지 밖인지, 이 프로젝트에 이미 기록된 경계가 뭐라고 말하는지 알려줘. 새로 판단하지 말고 기록된 것만.",
    /*
     * The key is pinned to what `capabilities/mcp-tool-server` `## Excludes`
     * says today. If that section changes, this key is wrong and must
     * change with it — that is the point of keeping it beside the prompt.
     */
    key: {
      /*
       * The prompt contains the words for "symbol search", so matching them would give a free point to
       * any answer restating the question. The signals below only the vault can supply.
       */
      boundary: [/\bAST\b/i, /제외|[Ee]xclud/, /범위 밖|밖입니다|밖에 있|out of scope|not in scope/i],
      provenance: [/capabilities\/mcp-tool-server/, /Inclusions? \/ Exclusions?|## Exclude/],
      /*
       * Only unambiguous affirmative scope claims. A bare affirmation ("that is
       * right") was tried first and rejected: correct answers use it too, as in
       * "it is right that this is recorded as excluded", and a contradiction
       * detector that fires on correct answers is worse than none.
       *
       * The patterns themselves stay in the answer language, the way the prompts do:
       * they are match data, not prose.
       */
      contradicts: [/범위\s*안에?\s*(포함|들어|속)/, /mcp-tool-server\s*가?\s*담당해야/, /포함하는 것이 맞/],
    },
  },
  {
    id: "D2",
    label: "Impact boundary before a change (meaning)",
    prompt:
      "ontology-atlas 의 vault 스키마를 바꾸면 무엇이 영향을 받는다고 이 프로젝트에 기록돼 있어? 그 영향의 이유가 어디에 적혀 있는지도 같이 알려줘. 새로 분석하지 말고 기록된 것만.",
    key: {
      mustRefuse: false,
      boundary: [/read and write contract|읽기.{0,4}쓰기 계약|agent-facing/i],
      provenance: [/elements\/vault-kind-schema/, /relation_notes|dependencies:/],
      contradicts: [],
    },
  },
  {
    id: "D3",
    label: "Verification path (meaning)",
    prompt:
      "ACP runtime capability 가 명시적으로 책임지지 않는다고 기록해 둔 범위가 뭐야? 그리고 그 기록이 어디에 있는지도 알려줘. 새로 판단하지 말고 기록된 것만.",
    key: {
      mustRefuse: false,
      boundary: [/Job Object|taskkill/i, /브라우저|[Bb]rowsers? cannot|프로세스를 실행할 수 없/],
      provenance: [/elements\/acp-runtime-gate/, /## Boundaries|`Boundaries`|Boundaries \uc139\uc158/],
      // The vault says the opposite of each of these.
      contradicts: [/Windows.{0,30}(프로세스 트리|process tree).{0,30}(보장|책임|covered|guarantee)/i],
    },
  },
  {
    id: "C2",
    label: "package.json scripts (negative control)",
    prompt:
      "이 repo 의 package.json 의 scripts: 객체에 정의된 명령어들을 모두 나열해줘.",
  },
];

const args = process.argv.slice(2);

/*
 * `codex mcp remove` edits only `~/.codex/config.toml`; the committed `.codex/config.toml` also
 * declares `mcp_servers.ontology-atlas` and Codex merges both. The project config must be parked
 * too, or OFF cells still serve the MCP server.
 */
const PROJECT_CODEX_CONFIG = resolve(".codex/config.toml");
const PARKED_CODEX_CONFIG = resolve(".codex/config.toml.benchmark-parked");

/*
 * Three modes: `none` (no vault on disk, no MCP: can the source alone answer?), `off` (vault
 * markdown present, no MCP), `on` (vault plus MCP tools). `none` is the control; `off` measures
 * what markdown adds over source, `on` what the tools add over markdown.
 */
const PARK_ROOT = join(tmpdir(), "oatlas-benchmark-park");

/*
 * Everything parked must leave the tree the agent can search; renaming inside the repo was not
 * enough. Generated vault copies are parked too. The answer files are parked in every mode: an
 * answer key in the repo is cheating. `docs/benchmark/results/` stays: the harness writes into it.
 */
const VAULT_PARK = ["docs/ontology", "public/docs-vault", "src/entities/docs-vault/data"];
const ANSWER_PARK = ["docs/benchmark/tasks.md", "docs/benchmark/rubric.md"];

function parkedPath(rel) {
  return join(PARK_ROOT, rel.replace(/[/\\]/g, "__"));
}

function park(relPaths, hidden) {
  if (!existsSync(PARK_ROOT)) mkdirSync(PARK_ROOT, { recursive: true });
  for (const rel of relPaths) {
    const live = resolve(rel);
    const away = parkedPath(rel);
    if (hidden && existsSync(live)) renameSync(live, away);
    if (!hidden && existsSync(away)) {
      mkdirSync(dirname(live), { recursive: true });
      renameSync(away, live);
    }
  }
}

function setVault(present) {
  park(VAULT_PARK, !present);
}

function setProjectConfig(present) {
  const parked = existsSync(PARKED_CODEX_CONFIG);
  const live = existsSync(PROJECT_CODEX_CONFIG);
  if (!present && live) renameSync(PROJECT_CODEX_CONFIG, PARKED_CODEX_CONFIG);
  if (present && parked) renameSync(PARKED_CODEX_CONFIG, PROJECT_CODEX_CONFIG);
}

/*
 * A killed run must never leave the committed config parked: `process.on("exit")` is not enough
 * (SIGKILL), so each run repairs state found on the way in.
 */
setProjectConfig(true);
setVault(true);
park(ANSWER_PARK, false);
process.on("exit", () => {
  setProjectConfig(true);
  setVault(true);
  park(ANSWER_PARK, false);
});
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => process.exit(1));
const bypass = args.includes("--bypass");
const dryRun = args.includes("--dry-run");
const onOnly = args.includes("--on-only");
const offOnly = args.includes("--off-only");
const noneOnly = args.includes("--none-only");
const withNone = args.includes("--with-none") || noneOnly;
/*
 * Repeats: at n=1 an agent benchmark reports its own sampling noise; a median over an odd number
 * of runs survives one outlier cell.
 */
/* `--only=B1,A3` narrows the matrix while iterating on one measured failure. */
const only = (args.find((a) => a.startsWith("--only="))?.split("=")[1] ?? "").split(",").filter(Boolean);
const SELECTED = only.length ? TASKS.filter((t) => only.includes(t.id)) : TASKS;
const repeat = Math.max(1, Number(args.find((a) => a.startsWith("--repeat="))?.split("=")[1] ?? 1));

if (!bypass && !dryRun) {
  console.error(
    "[benchmark] this script invokes `codex exec --dangerously-bypass-approvals-and-sandbox`",
  );
  console.error(
    "[benchmark] without --bypass, codex exec default-denies MCP — measurement is meaningless",
  );
  console.error(
    "[benchmark] re-run with --bypass to confirm intent (read-only vault queries; no write tools)",
  );
  console.error(
    "[benchmark] or --dry-run to verify configuration without burning calls",
  );
  process.exit(2);
}

const REPO = resolve(".");
const VAULT = resolve("docs/ontology");
const TODAY = new Date().toISOString().slice(0, 10);
const OUT_DIR = resolve("docs/benchmark/results");
mkdirSync(OUT_DIR, { recursive: true });

if (!existsSync(resolve("mcp/src/index.js"))) {
  console.error(`[benchmark] mcp/src/index.js not found at ${REPO}/mcp/src/index.js`);
  process.exit(2);
}

console.log(`[benchmark] repo: ${REPO}`);
console.log(`[benchmark] vault: ${VAULT}`);
console.log(`[benchmark] output: ${OUT_DIR}/`);
console.log(`[benchmark] tasks: ${SELECTED.length}, modes: ${noneOnly ? "none" : onOnly ? "on" : offOnly ? "off" : withNone ? "none+off+on" : "off+on"}`);
if (dryRun) {
  console.log("[benchmark] --dry-run — exiting without spawn");
  process.exit(0);
}


/*
 * The last block of assistant prose in a `codex exec` transcript. Everything the
 * tools printed sits above it, so this is the only part that is the agent's own
 * claim rather than something the vault handed it.
 */
function finalAnswerOf(out) {
  const stopIndex = out.lastIndexOf("hook: Stop");
  const body = stopIndex === -1 ? out : out.slice(0, stopIndex);
  // Keep a generous tail: D answers run long, and the boundary usually lands last.
  return body.slice(-12_000);
}

/*
 * `boundary` 0-3, `provenance` 0-2, `contradicted` boolean. The scale matches
 * `docs/benchmark/rubric.md`; a contradiction caps the cell regardless of the rest,
 * because asserting the opposite of a documented boundary is the failure this
 * group exists to catch.
 */
function gradeAnswer(answer, key) {
  const hit = (patterns) => patterns.filter((re) => re.test(answer)).length;
  const contradicted = key.contradicts.some((re) => re.test(answer));
  const boundaryHits = hit(key.boundary);
  const boundary = contradicted ? 0 : Math.round((boundaryHits / Math.max(key.boundary.length, 1)) * 3);
  const provenance = Math.min(2, hit(key.provenance));
  return { boundary, provenance, contradicted, boundaryHits, of: key.boundary.length };
}

const cells = [];

function runTask(task, mode, iter) {
  const start = Date.now();
  const result = spawnSync(
    "codex",
    ["exec", "--dangerously-bypass-approvals-and-sandbox", task.prompt],
    { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 },
  );
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const out = stdout + (stderr ? `\n[stderr]\n${stderr}` : "");
  const mcpCalls = (out.match(/mcp: ontology-atlas\/\w+ \(completed\)/g) ?? []).length;
  const mcpFailed = (out.match(/mcp: ontology-atlas\/\w+ \(failed\)/g) ?? []).length;
  const shellCalls = (out.match(/^exec$/gm) ?? []).length;
  // Cost is the axis the AGENTS.md study (arXiv:2602.11988) actually moved: context
  // that does not raise success still raised inference cost by over 20%. A benchmark
  // without this column cannot detect that failure.
  const tokens = Number((out.match(/tokens used:?\s*([\d,]+)/i) ?? [])[1]?.replace(/,/g, "") ?? 0);
  /*
   * **Grading a D cell without asking the model that ran it.**
   *
   * The May 2026 run was scored by the same model that produced the answers, and
   * the file still carries its own confirmation-bias warning. A second model
   * grading a first one only moves the bias. So a D task carries a pinned answer
   * key beside its prompt, and grading is string matching against the vault text
   * the key quotes: it is reproducible, it is arguable (open the key and disagree
   * with it), and it stays honest when the vault changes, because a key that no
   * longer matches the vault is a broken key rather than a silent pass.
   *
   * Only the **final answer** is graded. The transcript also contains tool output,
   * and the vault text appears there verbatim, so grading the whole transcript
   * would score the tool for the agent.
   */
  const answer = finalAnswerOf(out);
  const grade = task.key ? gradeAnswer(answer, task.key) : null;
  const durationMs = Date.now() - start;
  const suffix = repeat > 1 ? `-r${iter}` : "";
  const filePath = resolve(OUT_DIR, `${TODAY}-codex-${task.id}-${mode}${suffix}.txt`);
  writeFileSync(filePath, out, "utf-8");
  console.log(
    `  ${task.id} ${mode.toUpperCase()}${repeat > 1 ? ` r${iter}` : ""}${grade ? `  [boundary ${grade.boundary}/3 · provenance ${grade.provenance}/2${grade.contradicted ? " · contradicted ✗" : ""}]` : ""}  shell=${shellCalls}  mcp=${mcpCalls}${mcpFailed ? `(+${mcpFailed} failed)` : ""}  tok=${tokens || "?"}  ${(durationMs / 1000).toFixed(1)}s`,
  );
  return { task: task.id, mode, iter, mcpCalls, mcpFailed, shellCalls, tokens, grade, durationMs };
}


function ensureMode(mode) {
  // Always start clean: the global entry and the committed project entry both.
  spawnSync("codex", ["mcp", "remove", "ontology-atlas"], { stdio: "ignore" });
  setProjectConfig(mode === "on");
  setVault(mode !== "none");
  park(ANSWER_PARK, true);
  const enabled = mode === "on";
  if (enabled) {
    spawnSync(
      "codex",
      [
        "mcp",
        "add",
        "ontology-atlas",
        "--env",
        `OATLAS_VAULT=${VAULT}`,
        "--",
        "node",
        resolve("mcp/src/index.js"),
      ],
      { stdio: "ignore" },
    );
  }
}

if (!onOnly && !noneOnly) {
  console.log("[benchmark] OFF mode (ontology-atlas MCP unregistered)...");
  ensureMode("off");
  for (let i = 1; i <= repeat; i++) for (const task of SELECTED) cells.push(runTask(task, "off", i));
}

if (withNone && !onOnly && !offOnly) {
  console.log("[benchmark] NONE mode (vault folder hidden, no MCP)...");
  ensureMode("none");
  for (let i = 1; i <= repeat; i++) for (const task of SELECTED) cells.push(runTask(task, "none", i));
  setVault(true);
}

if (!offOnly && !noneOnly) {
  console.log("[benchmark] ON mode (ontology-atlas MCP registered)...");
  ensureMode("on");
  for (let i = 1; i <= repeat; i++) for (const task of SELECTED) cells.push(runTask(task, "on", i));
}

// Markdown summary
let md = `# Benchmark — ${TODAY} — Codex automated\n\n`;
md += `Generated by \`scripts/benchmark.mjs\`. Per-cell raw stdout in \`${TODAY}-codex-<task>-<mode>.txt\`.\n\n`;
md += `**Note**: this summary captures *tool-call efficiency* automatically. **Correctness and hallucination counts require human review of the transcripts.**\n\n`;
md += `## Per-task tool calls\n\n`;
const median = (xs) => {
  if (xs.length === 0) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const pick = (id, mode, key) => cells.filter((c) => c.task === id && c.mode === mode).map((c) => c[key]);
const span = (xs) => (xs.length > 1 && Math.min(...xs) !== Math.max(...xs) ? ` (${Math.min(...xs)}\u2013${Math.max(...xs)})` : "");
md += `Runs per cell: **${repeat}**. Cell values are the median; the observed range follows in parentheses.\n\n`;
const reportModes = noneOnly ? ['none'] : onOnly ? ['on'] : offOnly ? ['off'] : withNone ? ['none', 'off', 'on'] : ['off', 'on'];
md += `| Task | ${reportModes.map((mode) => `${mode.toUpperCase()} shell / MCP`).join(' | ')} | \u0394 ON\u2212OFF shell | \u0394 ON\u2212OFF MCP | OFF tok | ON tok | \u0394 tok |\n`;
md += `|---|${reportModes.map(() => '---').join('|')}|---|---|---|---|---|\n`;
for (const t of SELECTED) {
  const offShellM = median(pick(t.id, "off", "shellCalls"));
  const onShellM = median(pick(t.id, "on", "shellCalls"));
  const off = offShellM === null ? null : { shellCalls: offShellM, mcpCalls: median(pick(t.id, "off", "mcpCalls")), tokens: median(pick(t.id, "off", "tokens")) };
  const on = onShellM === null ? null : { shellCalls: onShellM, mcpCalls: median(pick(t.id, "on", "mcpCalls")), tokens: median(pick(t.id, "on", "tokens")) };
  const dShell = off && on ? on.shellCalls - off.shellCalls : null;
  const dMcp = off && on ? on.mcpCalls - off.mcpCalls : null;
  const fmt = (n) => (n === null ? "—" : n > 0 ? `+${n}` : `${n}`);
  const dTok = off && on && off.tokens && on.tokens ? on.tokens - off.tokens : null;
  const modeCells = reportModes.map((mode) => {
    const shell = median(pick(t.id, mode, "shellCalls"));
    const mcp = median(pick(t.id, mode, "mcpCalls"));
    return shell === null ? "—" : `${shell} / ${mcp}${span(pick(t.id, mode, "shellCalls"))}`;
  });
  md += `| **${t.id}** ${t.label} | ${modeCells.join(" | ")} | ${fmt(dShell)} | ${fmt(dMcp)} | ${off?.tokens ? off.tokens + span(pick(t.id, "off", "tokens")) : "—"} | ${on?.tokens ? on.tokens + span(pick(t.id, "on", "tokens")) : "—"} | ${fmt(dTok)} |\n`;
}

const gradedTasks = SELECTED.filter((t) => t.key);
if (gradedTasks.length > 0) {
  md += `\n## Meaning cells (D) — graded against the pinned key\n\n`;
  md += `Key lives beside each prompt in \`scripts/benchmark.mjs\`. Open it and disagree with it; that is the point of pinning it.\n\n`;
  md += `| Task | Mode | Boundary /3 | Provenance /2 | Contradicts the vault |\n|---|---|---|---|---|\n`;
  for (const t of gradedTasks) {
    for (const mode of reportModes) {
      for (const c of cells.filter((x) => x.task === t.id && x.mode === mode && x.grade)) {
        md += `| **${t.id}**${repeat > 1 ? ` r${c.iter}` : ""} | ${mode.toUpperCase()} | ${c.grade.boundary} (${c.grade.boundaryHits}/${c.grade.of}) | ${c.grade.provenance} | ${c.grade.contradicted ? "**yes**" : "no"} |\n`;
      }
    }
  }
  md += `\nInvented rationale (rubric D-c) is still a human count: a fabricated *why* can pass every string check.\n`;
}

md += `\n## Aggregates\n\n`;
function avg(items) {
  if (items.length === 0) return null;
  return items.reduce((s, n) => s + n, 0) / items.length;
}
for (const mode of reportModes) {
  const shell = cells.filter((c) => c.mode === mode).map((c) => c.shellCalls);
  const mcp = cells.filter((c) => c.mode === mode).map((c) => c.mcpCalls);
  const tok = cells.filter((c) => c.mode === mode && c.tokens).map((c) => c.tokens);
  md += `- Avg ${mode.toUpperCase()}: shell ${(avg(shell) ?? 0).toFixed(1)} · MCP ${(avg(mcp) ?? 0).toFixed(1)} · tokens ${tok.length ? (avg(tok) ?? 0).toFixed(0) : "not reported"}\n`;
}
md += `- Total cells run: ${cells.length}\n`;
md += `\n## Next: human grading\n\n`;
md += `Open each transcript and score per \`docs/benchmark/rubric.md\` (correctness 0–3, hallucinations count, subjective utility 1–5). Drop the result in a new \`${TODAY}-codex-graded.md\`.\n`;

const summaryPath = resolve(OUT_DIR, `${TODAY}-codex-summary.md`);
writeFileSync(summaryPath, md, "utf-8");
console.log(`\n[benchmark] summary: ${summaryPath}`);
// Teardown: leave the developer's codex config as it was found. The committed
// project entry is restored by the exit handler; the global entry was added by
// this script, so it goes away with it.
spawnSync("codex", ["mcp", "remove", "ontology-atlas"], { stdio: "ignore" });

console.log(`[benchmark] ${cells.length} cells in ${(cells.reduce((s, c) => s + c.durationMs, 0) / 1000).toFixed(0)}s total`);
