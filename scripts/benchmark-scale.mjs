#!/usr/bin/env node
// R13 #60 — vault size scaling measurement.
//
// Question: 23-node dogfood vault 의 MCP effect (Cat A hallucinations 9→0,
// tool calls 7→1.67) 가 *더 큰 vault* 에서도 holds? 또는 saturate / 약화?
//
// Method: 100-node tmp vault 생성 (perf-vault.mjs 패턴) + 1 high-MCP-advantage
// task (find_backlinks of a known popular slug) × 2 mode × Codex.
//
// 4 cell × ~30s = ~2 min. Scope minimal — 더 큰 측정은 D 결과 보고 결정.
//
// Usage:
//   node scripts/benchmark-scale.mjs --bypass

import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const bypass = args.includes("--bypass");
const dryRun = args.includes("--dry-run");
const N = Number(args.find((a) => a.startsWith("--n="))?.slice(4) ?? 100);

if (!bypass && !dryRun) {
  console.error("[benchmark-scale] requires --bypass (codex exec MCP path)");
  console.error("[benchmark-scale] read-only vault queries against tmp scale vault");
  console.error("[benchmark-scale] or --dry-run to verify configuration without spawning codex");
  process.exit(2);
}

const REPO = resolve(".");
const today = new Date().toISOString().slice(0, 10);
const outDir = resolve("docs/benchmark/results");
mkdirSync(outDir, { recursive: true });

console.log(`[benchmark-scale] repo: ${REPO}`);
console.log(`[benchmark-scale] output: ${outDir}/`);
console.log(`[benchmark-scale] N: ${N}`);
if (dryRun) {
  console.log("[benchmark-scale] --dry-run - exiting without tmp vault or codex spawn");
  process.exit(0);
}

// Generate scale vault — N nodes with a "popular" hub that everyone references
// (gives find_backlinks something interesting to find).
const root = mkdtempSync(join(tmpdir(), `ontology-atlas-scale-${N}-`));
console.log(`[benchmark-scale] tmp vault: ${root} (N=${N})`);

mkdirSync(join(root, "domains"), { recursive: true });
mkdirSync(join(root, "capabilities"), { recursive: true });
mkdirSync(join(root, "elements"), { recursive: true });

// 1 hub element that 30%+ of capabilities reference
writeFileSync(
  join(root, "elements/hub.md"),
  "---\nslug: elements/hub\nkind: element\ntitle: Hub element\ndomain: domains/dom-0\n---\n\n# Hub\n",
);

// Domain stubs
const numDomains = 5;
for (let d = 0; d < numDomains; d += 1) {
  writeFileSync(
    join(root, `domains/dom-${d}.md`),
    `---\nslug: domains/dom-${d}\nkind: domain\ntitle: Domain ${d}\n---\n\n# Domain ${d}\n`,
  );
}

// Capability nodes — 30% reference elements/hub via relates
let hubReferers = 0;
for (let i = 0; i < N - numDomains - 1; i += 1) {
  const refsHub = i % 3 === 0;
  if (refsHub) hubReferers += 1;
  const dom = `domains/dom-${i % numDomains}`;
  writeFileSync(
    join(root, `capabilities/cap-${i}.md`),
    `---\nslug: capabilities/cap-${i}\nkind: capability\ntitle: Cap ${i}\ndomain: ${dom}\n${
      refsHub ? "relates:\n  - elements/hub\n" : ""
    }---\n\n# Cap ${i}\n`,
  );
}

console.log(
  `[benchmark-scale] vault generated · ${N - numDomains - 1} capabilities (${hubReferers} reference hub) · ${numDomains} domains · 1 hub element`,
);

const PROMPT = `이 ontology vault 에서 elements/hub 를 frontmatter 에서 참조하고 있는 모든 노드를 찾아 list. 답은 slug list 만.`;

function ensureMcp(enabled, vaultPath) {
  spawnSync("codex", ["mcp", "remove", "ontology-atlas"], { stdio: "ignore" });
  if (enabled) {
    spawnSync(
      "codex",
      [
        "mcp",
        "add",
        "ontology-atlas",
        "--env",
        `OATLAS_VAULT=${vaultPath}`,
        "--",
        "node",
        join(REPO, "mcp", "src", "index.js"),
      ],
      { stdio: "ignore" },
    );
  }
}

function runOnce(mode, vaultPath) {
  const start = Date.now();
  const result = spawnSync(
    "codex",
    [
      "exec",
      "--cd",
      vaultPath, // run codex with cwd=tmp vault so its rg sees only the tmp vault
      "--dangerously-bypass-approvals-and-sandbox",
      PROMPT,
    ],
    { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 },
  );
  const out = (result.stdout ?? "") + (result.stderr ? `\n[stderr]\n${result.stderr}` : "");
  const mcpCalls = (out.match(/mcp: ontology-atlas\/\w+ \(completed\)/g) ?? []).length;
  const shellCalls = (out.match(/^exec$/gm) ?? []).length;
  const durationMs = Date.now() - start;
  writeFileSync(
    resolve(outDir, `${today}-codex-scale-N${N}-${mode}.txt`),
    out,
    "utf-8",
  );
  console.log(
    `  ${mode.toUpperCase()}  shell=${shellCalls}  mcp=${mcpCalls}  ${(durationMs / 1000).toFixed(1)}s`,
  );
  return { mode, shellCalls, mcpCalls, durationMs };
}

try {
  console.log(`[benchmark-scale] OFF run...`);
  ensureMcp(false, root);
  const off = runOnce("off", root);
  console.log(`[benchmark-scale] ON run...`);
  ensureMcp(true, root);
  const on = runOnce("on", root);

  // Restore dogfood MCP after measurement
  ensureMcp(true, resolve(REPO, "docs/ontology"));

  // Summary
  let md = `# Benchmark scale — ${today} — Codex (N=${N})\n\n`;
  md += `Tmp vault: \`${root}\` (N=${N} nodes, ${hubReferers} reference \`elements/hub\`).\n\n`;
  md += `Single high-MCP-advantage task (\`find_backlinks(elements/hub)\`).\n\n`;
  md += `## Result\n\n`;
  md += `| Mode | Shell exec | MCP calls | Duration |\n|---|---|---|---|\n`;
  md += `| OFF | ${off.shellCalls} | ${off.mcpCalls} | ${(off.durationMs / 1000).toFixed(1)}s |\n`;
  md += `| ON | ${on.shellCalls} | ${on.mcpCalls} | ${(on.durationMs / 1000).toFixed(1)}s |\n\n`;
  md += `## Interpretation\n\n`;
  md += `- Δ shell calls: ${on.shellCalls - off.shellCalls} (negative = MCP saved exec calls)\n`;
  md += `- Δ MCP calls: ${on.mcpCalls - off.mcpCalls} (positive = MCP path actually exercised)\n`;
  md += `- Compare with 23-node dogfood A3 (\`docs/benchmark/results/2026-05-04-codex.md\`):\n`;
  md += `  - 23-node OFF/ON: 5 shell / 1 MCP\n`;
  md += `  - ${N}-node OFF/ON: ${off.shellCalls} shell / ${on.mcpCalls} MCP\n\n`;
  md += `Correctness/hallucinations need human grading against \`${today}-codex-scale-N${N}-{off,on}.txt\`.\n`;
  const summaryPath = resolve(outDir, `${today}-codex-scale-N${N}-summary.md`);
  writeFileSync(summaryPath, md, "utf-8");
  console.log(`\n[benchmark-scale] summary: ${summaryPath}`);
} finally {
  rmSync(root, { recursive: true, force: true });
  console.log(`[benchmark-scale] tmp vault cleaned`);
}
