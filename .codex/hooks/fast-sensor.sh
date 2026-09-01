#!/usr/bin/env bash
# PostToolUse hook — the fast sensor lane: run the cheapest relevant check on
# the file that was just edited and hand violations straight back to the agent.
#
# Why this exists (measured 2026-09-01, cutting v1.0.1). Three of the four
# pre-push round-trips that day were violations a per-file check would have
# caught at the keystroke: an em-dash in the changelog, a Korean sentence in the
# ledger, an unused import. Each round-trip cost 8-12 minutes of lanes; the
# per-file checks cost 0.1-0.6s (measured: eslint --cache 0.57s, the
# markdown-language scan 0.11s repo-wide). The feedback-loop principle this
# repository already applies to gates applies to timing too: the fastest layer
# that can catch a violation should be the one that does.
#
# What it runs, by edited file type:
#   - code (.ts/.tsx/.js/.jsx/.mjs/.cjs)  → `eslint --cache` on that file
#   - markdown                            → the repo markdown-language gate, and
#     for user-rendered docs (samples/storefront, docs/guide, docs/ontology,
#     docs/CHANGELOG.md) a prose em-dash check outside code fences
#   - messages/{ko,en}.json               → em-dash count over string values
#
# The em-dash and language CONTRACTS remain the authority
# (tests/contract/em-dash-ratchet.contract.test.ts, pnpm docs:language); this
# hook is an advisory copy of their verdicts at edit time and can never replace
# them. PostToolUse cannot block and should not — the edit already happened —
# so it reports through hookSpecificOutput.additionalContext and stays silent
# when the file is clean. A hook that speaks on every edit spends context to
# say nothing.
#
# It also appends edited source files to a per-session ledger
# (.tmp/harness/session-<id>.edits) that the Stop-time verification reminder
# reads. Ledger append is source code only: a docs edit does not gate a stop.
#
# The Codex mirror. Measured 2026-09-01 with codex-cli 0.151.0 rather than
# assumed: PostToolUse fires for both Bash and edit tools, and an edit arrives
# as `tool_name: apply_patch` whose `tool_input.command` is a patch envelope
# with `*** Update File: <path>` lines. There is no `file_path` key at all, so
# the path extraction below is the Codex-shaped half of this mirror; copying
# the Claude reader verbatim would produce a hook that runs and sees nothing.
# The same measurement retired the earlier claim in this header that Codex was
# Bash-event-only, and found the generated-file guard beside it already dead
# for exactly this reason.

set -u

INPUT="$(cat)"
REPO_ROOT="${CODEX_PROJECT_DIR:-$(pwd)}"

RESULT="$(
  REPO_ROOT="$REPO_ROOT" node --input-type=module -e '
import { readFileSync, existsSync, mkdirSync, appendFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const input = payload?.tool_input ?? {};
const paths = [input.file_path, input.path, input.notebook_path]
  .concat(Array.isArray(input.edits) ? input.edits.map((e) => e?.file_path) : [])
  .filter((p) => typeof p === "string" && p.length > 0);
// Codex apply_patch: every file the patch envelope names.
if (typeof input.command === "string" && input.command.length > 0) {
  for (const line of input.command.split("\n")) {
    const named = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/.exec(line);
    if (named) paths.push(named[1].trim());
  }
}
if (paths.length === 0) process.exit(0);

const root = process.env.REPO_ROOT;
/*
 * Repository-relative, through the real path on both sides. A plain prefix
 * strip breaks wherever the root and the reported path disagree about
 * symlinks (measured 2026-09-01: macOS reports /private/tmp/x for a root the
 * shell calls /tmp/x), and the sensor then judges an absolute path against
 * repo-relative rules and silently finds nothing.
 */
const realOf = (p) => { try { return realpathSync(p); } catch { return p; } };
const roots = [...new Set([root, realOf(root)])];
const rel = (p) => {
  for (const candidate of [p, realOf(p)]) {
    for (const base of roots) {
      if (candidate.startsWith(base + "/")) return candidate.slice(base.length + 1);
    }
  }
  return p;
};
const findings = [];

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const CODE_ROOTS = ["src/", "app/", "mcp/src/", "cli/src/", "scripts/", "tests/"];
// The rendered-docs boundary is "does a user read it", copied from the em-dash
// contract test, which stays the authority for the list.
const RENDERED_MD = ["samples/storefront/", "docs/guide/", "docs/ontology/"];
const RENDERED_MD_FILES = ["docs/CHANGELOG.md"];

function proseEmDashLines(text) {
  let inFence = false;
  const hits = [];
  text.split("\n").forEach((line, i) => {
    if (line.trimStart().startsWith("```")) { inFence = !inFence; return; }
    if (!inFence && line.includes("—")) hits.push(i + 1);
  });
  return hits;
}

let ranLanguageGate = false;
const sessionId = typeof payload?.session_id === "string" ? payload.session_id.replace(/[^\w-]/g, "") : "";

for (const p of paths) {
  const r = rel(p);
  if (r.includes("node_modules/") || r.startsWith(".tmp/")) continue;

  if (CODE_EXT.test(r) && CODE_ROOTS.some((c) => r.startsWith(c))) {
    // Session ledger for the Stop-time reminder — source code only.
    if (sessionId) {
      try {
        const dir = join(root, ".tmp", "harness");
        mkdirSync(dir, { recursive: true });
        appendFileSync(join(dir, `session-${sessionId}.edits`), `${Date.now()}\t${r}\n`);
      } catch { /* the ledger is a convenience, never a failure */ }
    }
    try {
      // --max-warnings 0 matches the CI lint lane: a warning-only file exits 0
      // otherwise, and the planted-defect probe proved that silence (2026-09-01).
      execFileSync("pnpm", ["exec", "eslint", "--max-warnings", "0", "--cache", "--cache-location", ".tmp/harness/eslint-cache", r], {
        cwd: root, encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"],
      });
    } catch (err) {
      const out = typeof err?.stdout === "string" ? err.stdout.trim() : "";
      // eslint exits 1 with findings on stdout; any other failure shape stays silent.
      if (out) findings.push(`eslint on ${r}:\n${out.split("\n").slice(0, 15).join("\n")}`);
    }
    continue;
  }

  if (r.endsWith(".md")) {
    if (!ranLanguageGate && existsSync(join(root, "scripts/quality/markdown-language/check.mjs"))) {
      ranLanguageGate = true;
      try {
        execFileSync(process.execPath, ["scripts/quality/markdown-language/check.mjs"], {
          cwd: root, encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err) {
        const out = `${err?.stdout ?? ""}${err?.stderr ?? ""}`.trim();
        if (out) findings.push(`markdown-language gate after editing ${r}:\n${out.split("\n").slice(-6).join("\n")}`);
      }
    }
    const rendered = RENDERED_MD.some((d) => r.startsWith(d)) || RENDERED_MD_FILES.includes(r);
    if (rendered) {
      try {
        const hits = proseEmDashLines(readFileSync(p, "utf8"));
        if (hits.length > 0) {
          findings.push(
            `em-dash in user-rendered prose ${r} (line${hits.length > 1 ? "s" : ""} ${hits.slice(0, 8).join(", ")}). ` +
            "Sentence over: full stop. Continuation: colon. Aside: parentheses. Code blocks are exempt.",
          );
        }
      } catch { /* unreadable file: the contract will judge it later */ }
    }
    continue;
  }

  if (/^messages\/(ko|en)\.json$/.test(r)) {
    try {
      const raw = JSON.parse(readFileSync(p, "utf8"));
      let withDash = 0;
      const walk = (node) => {
        if (typeof node === "string") {
          if (node.includes("—") && node.trim() !== "—") withDash += 1;
          return;
        }
        if (Array.isArray(node)) node.forEach(walk);
        else if (node && typeof node === "object") Object.values(node).forEach(walk);
      };
      walk(raw);
      if (withDash > 0) {
        findings.push(`${r} carries ${withDash} em-dash string(s); the ratchet baseline is 0 (lone "—" placeholder glyphs are exempt).`);
      }
    } catch { /* invalid JSON will fail louder elsewhere */ }
  }
}

if (findings.length === 0) process.exit(0);

/*
 * Record what was caught, so the lane can be judged instead of trusted.
 * The falsifier in the header above (remove this sensor if two weeks of use
 * catch nothing) needs a count that exists; without this line the hook reports
 * to the agent and forgets, and `pnpm harness:report` reads nothing.
 * Local and gitignored: measurement of our own tooling, never vault data.
 *
 * NOTE: this whole block runs inside a single-quoted bash argument, so an
 * apostrophe here terminates the script. Keep the prose apostrophe-free.
 */
try {
  const dir = join(root, ".tmp", "harness");
  mkdirSync(dir, { recursive: true });
  appendFileSync(
    join(dir, "findings.jsonl"),
    findings
      .map((finding) =>
        JSON.stringify({
          at: new Date().toISOString(),
          session: sessionId || null,
          // The first token names the check that spoke; the body can be long.
          kind: /^eslint/.test(finding)
            ? "eslint"
            : /^markdown-language/.test(finding)
              ? "markdown-language"
              : /^em-dash/.test(finding)
                ? "em-dash"
                : "messages-em-dash",
        }),
      )
      .join("\n") + "\n",
  );
} catch { /* a missed record costs a count, never the report to the agent */ }

process.stdout.write(
  [
    "Fast sensor findings on the file(s) you just edited:",
    ...findings.map((f) => `- ${f}`),
    "",
    "These same rules are enforced later by lint/contract lanes; fixing them now saves a pre-push round-trip.",
  ].join("\n"),
);
' <<<"$INPUT" 2>/dev/null || true
)"

[ -n "$RESULT" ] || exit 0

node --input-type=module -e '
import { readFileSync } from "node:fs";
const context = readFileSync(0, "utf8");
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context },
}));
' <<<"$RESULT"

exit 0
