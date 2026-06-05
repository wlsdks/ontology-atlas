#!/usr/bin/env node
// R13 #62 — pnpm benchmark
//
// Codex 7 task × 2 mode automated re-measurement. Records per-cell:
//   - raw stdout transcript → docs/benchmark/results/<date>-codex-<id>-<mode>.txt
//   - shell exec count + MCP tool-call count (regex extracted)
// And produces a markdown summary table (tool calls only — correctness
// and hallucination counts still need human review of transcripts).
//
// Usage:
//   pnpm benchmark --bypass          # full 14-cell run
//   pnpm benchmark --bypass --on-only # ON mode 7 cells (faster)
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
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const TASKS = [
  {
    id: "A1",
    label: "Domain composition",
    prompt:
      "이 repo 의 ontology vault (docs/ontology/) 에서 vault-local-first 도메인 아래에 어떤 capability 와 element 들이 있는지 정리해줘. 도메인 자체의 한 줄 설명도 포함.",
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
      "capabilities/mcp-server 를 frontmatter 에서 참조하고 있는 모든 노드를 찾아 kind 별로 분류해줘.",
  },
  {
    id: "B1",
    label: "Validator issue codes",
    prompt:
      "ontology-atlas 의 vault validator 가 detect 하는 issue code 들을 모두 나열하고 각각의 의미를 한 줄씩 설명해줘.",
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
      "src/shared/lib/validate-vault-document.ts 에서 export 되는 함수들을 모두 나열해줘.",
  },
  {
    id: "C2",
    label: "package.json scripts (negative control)",
    prompt:
      "이 repo 의 package.json 의 scripts: 객체에 정의된 명령어들을 모두 나열해줘.",
  },
];

const args = process.argv.slice(2);
const bypass = args.includes("--bypass");
const dryRun = args.includes("--dry-run");
const onOnly = args.includes("--on-only");
const offOnly = args.includes("--off-only");

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
console.log(`[benchmark] tasks: ${TASKS.length}, modes: ${onOnly ? "on" : offOnly ? "off" : "off+on"}`);
if (dryRun) {
  console.log("[benchmark] --dry-run — exiting without spawn");
  process.exit(0);
}

const cells = [];

function runTask(task, mode) {
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
  const durationMs = Date.now() - start;
  const filePath = resolve(OUT_DIR, `${TODAY}-codex-${task.id}-${mode}.txt`);
  writeFileSync(filePath, out, "utf-8");
  console.log(
    `  ${task.id} ${mode.toUpperCase()}  shell=${shellCalls}  mcp=${mcpCalls}${mcpFailed ? `(+${mcpFailed} failed)` : ""}  ${(durationMs / 1000).toFixed(1)}s`,
  );
  return { task: task.id, mode, mcpCalls, mcpFailed, shellCalls, durationMs };
}

function ensureMcp(enabled) {
  // Always start clean.
  spawnSync("codex", ["mcp", "remove", "ontology-atlas"], { stdio: "ignore" });
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

if (!onOnly) {
  console.log("[benchmark] OFF mode (ontology-atlas MCP unregistered)...");
  ensureMcp(false);
  for (const task of TASKS) cells.push(runTask(task, "off"));
}

if (!offOnly) {
  console.log("[benchmark] ON mode (ontology-atlas MCP registered)...");
  ensureMcp(true);
  for (const task of TASKS) cells.push(runTask(task, "on"));
}

// Markdown summary
let md = `# Benchmark — ${TODAY} — Codex automated\n\n`;
md += `Generated by \`scripts/benchmark.mjs\`. Per-cell raw stdout in \`${TODAY}-codex-<task>-<mode>.txt\`.\n\n`;
md += `**Note**: this summary captures *tool-call efficiency* automatically. **Correctness and hallucination counts require human review of the transcripts.**\n\n`;
md += `## Per-task tool calls\n\n`;
md += `| Task | OFF shell / MCP | ON shell / MCP | Δ shell | Δ MCP |\n|---|---|---|---|---|\n`;
for (const t of TASKS) {
  const off = cells.find((c) => c.task === t.id && c.mode === "off");
  const on = cells.find((c) => c.task === t.id && c.mode === "on");
  const offText = off ? `${off.shellCalls} / ${off.mcpCalls}` : "—";
  const onText = on ? `${on.shellCalls} / ${on.mcpCalls}` : "—";
  const dShell = off && on ? on.shellCalls - off.shellCalls : null;
  const dMcp = off && on ? on.mcpCalls - off.mcpCalls : null;
  const fmt = (n) => (n === null ? "—" : n > 0 ? `+${n}` : `${n}`);
  md += `| **${t.id}** ${t.label} | ${offText} | ${onText} | ${fmt(dShell)} | ${fmt(dMcp)} |\n`;
}

md += `\n## Aggregates\n\n`;
function avg(items) {
  if (items.length === 0) return null;
  return items.reduce((s, n) => s + n, 0) / items.length;
}
const offShell = cells.filter((c) => c.mode === "off").map((c) => c.shellCalls);
const onShell = cells.filter((c) => c.mode === "on").map((c) => c.shellCalls);
const offMcp = cells.filter((c) => c.mode === "off").map((c) => c.mcpCalls);
const onMcp = cells.filter((c) => c.mode === "on").map((c) => c.mcpCalls);
md += `- Avg shell exec: OFF ${(avg(offShell) ?? 0).toFixed(1)} → ON ${(avg(onShell) ?? 0).toFixed(1)}\n`;
md += `- Avg MCP calls: OFF ${(avg(offMcp) ?? 0).toFixed(1)} → ON ${(avg(onMcp) ?? 0).toFixed(1)}\n`;
md += `- Total cells run: ${cells.length}\n`;
md += `\n## Next: human grading\n\n`;
md += `Open each transcript and score per \`docs/benchmark/rubric.md\` (correctness 0–3, hallucinations count, subjective utility 1–5). Drop the result in a new \`${TODAY}-codex-graded.md\`.\n`;

const summaryPath = resolve(OUT_DIR, `${TODAY}-codex-summary.md`);
writeFileSync(summaryPath, md, "utf-8");
console.log(`\n[benchmark] summary: ${summaryPath}`);
console.log(`[benchmark] ${cells.length} cells in ${(cells.reduce((s, c) => s + c.durationMs, 0) / 1000).toFixed(0)}s total`);
