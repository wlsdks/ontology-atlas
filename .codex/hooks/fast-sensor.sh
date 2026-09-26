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
#   - markdown                            → the repo markdown-language gate
#
# Measured 2026-09-02 to 2026-09-26: eslint spoke 117 times, the language gate
# twice, and the em-dash branches this hook used to carry never spoke, so they
# were removed; their contracts still run in the lanes. This hook is an advisory
# copy of the lint and language verdicts at edit time, never their authority.
# PostToolUse cannot block and should not — the edit already happened —
# so it reports through hookSpecificOutput.additionalContext and stays silent
# when the file is clean. A hook that speaks on every edit spends context to
# say nothing.
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
# Codex sets no project-directory variable for hooks (none exists in the
# 0.151.0 binary or the hooks reference); commands run in the session cwd,
# which is the repository root because hooks.json paths are relative to it.
# ATLAS_HOOK_ROOT is a test seam only, so a fixture can point at a temp root.
REPO_ROOT="${ATLAS_HOOK_ROOT:-$(pwd)}"

RESULT="$(
  REPO_ROOT="$REPO_ROOT" node --input-type=module -e '
import { readFileSync, existsSync, realpathSync } from "node:fs";
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
let ranLanguageGate = false;

for (const p of paths) {
  const r = rel(p);
  // A path that stays absolute after rel() lies outside the repository (a
  // scratch file, a file in another checkout). That edit does not belong to
  // this repository, and judging it ran the repo-wide Markdown gate for a note
  // written in a temp directory (observed 2026-09-02).
  if (r.startsWith("/") || r.includes("node_modules/") || r.startsWith(".tmp/")) continue;

  if (CODE_EXT.test(r) && CODE_ROOTS.some((c) => r.startsWith(c))) {
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
  }
}

if (findings.length === 0) process.exit(0);

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
