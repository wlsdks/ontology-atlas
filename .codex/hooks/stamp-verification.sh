#!/usr/bin/env bash
# PostToolUse (Bash) hook — stamp the session when a verification command runs.
#
# One half of the Stop-time verification reminder. `fast-sensor.sh` records
# which source files this session edited; this hook records the last moment a
# verification family command ran (a bare runner such as vitest, eslint,
# tsc, playwright, node --test, cargo test, or any pnpm test*/lint/typecheck/
# checks/build/*:check script). At Stop time the reminder
# compares the two timestamps: edits newer than the last verification get one
# nudge to run `pnpm checks:changed -- --run`.
#
# **Deliberately stamps the attempt, not the outcome.** Reading exit codes out
# of the PostToolUse payload is version-dependent, and the failure case is
# self-limiting: an agent that just watched its tests fail does not then claim
# the work is done — and if it does, the behavioral rules and CI still stand
# behind this hook. A reminder heuristic should be cheap and honest about being
# a heuristic, not a second CI.
#
# The Codex mirror. Measured 2026-09-01 (codex-cli 0.151.0): PostToolUse fires
# for Bash with the same `tool_input.command` shape, and the Stop event this
# stamp feeds does exist there, honouring `decision: block` and flipping
# `stop_hook_active` on the continuation exactly as Claude Code does. The
# earlier claim in this header that Codex had no Stop event was wrong.

set -u

INPUT="$(cat)"
# Codex sets no project-directory variable for hooks (none exists in the
# 0.151.0 binary or the hooks reference); commands run in the session cwd,
# which is the repository root because hooks.json paths are relative to it.
# ATLAS_HOOK_ROOT is a test seam only, so a fixture can point at a temp root.
REPO_ROOT="${ATLAS_HOOK_ROOT:-$(pwd)}"

REPO_ROOT="$REPO_ROOT" node --input-type=module -e '
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const command = payload?.tool_input?.command;
if (typeof command !== "string") process.exit(0);

// Two shapes: a bare runner, or a pnpm script from the verification families
// this repository actually uses (test*, lint, typecheck, checks:*, build, and
// every *:check gate). The first version listed nine runner names and missed
// 61 of the 65 verification scripts in package.json (measured 2026-09-02), so
// `pnpm lint` or `pnpm test:contracts` still ended in a false turn-back.
const VERIFY = /(vitest|eslint|tsc\s+--noEmit|playwright\s+test|node\s+--test|cargo\s+test|pnpm\s+(?:--dir\s+\S+\s+)?(?:run\s+)?(?:test|lint|typecheck|checks|build|[\w:-]*:check)\b)/;
if (!VERIFY.test(command)) process.exit(0);

const sessionId = typeof payload?.session_id === "string" ? payload.session_id.replace(/[^\w-]/g, "") : "";
if (!sessionId) process.exit(0);

try {
  const dir = join(process.env.REPO_ROOT, ".tmp", "harness");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `session-${sessionId}.verified`), String(Date.now()));
} catch { /* a missed stamp only costs one extra reminder */ }
' <<<"$INPUT" 2>/dev/null || true

exit 0
