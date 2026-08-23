#!/usr/bin/env node
/**
 * Every `.md` path cited from a code comment must resolve.
 *
 * ## Why this exists
 *
 * `docs/GLOSSARY.md` §6 tells authors to move long rationale out of doc-blocks
 * into a markdown file and leave a one-line pointer behind. That trade is only
 * safe if the pointer is guaranteed to keep working — otherwise one folder
 * rename silently breaks every pointer at once, and the rationale a comment used
 * to carry is now unreachable from the code it explains.
 *
 * The owner named this risk before the first pointer was written: *"the doc
 * location has to be exact — the moment a folder moves, everything breaks"* ("the doc
 * location has to be exact — the moment a folder moves, everything breaks").
 *
 * `pnpm docs:links` already gives this guarantee for markdown-to-markdown links,
 * but it only walks markdown files (`listMarkdownFiles`). Code comments were
 * outside every gate's field of view.
 *
 * ## What counts as a citation
 *
 * A repo-relative path ending in `.md`, inside a comment. Both backticked
 * (`` `docs/<NAME>.md` ``) and bare forms are scanned: the pointer
 * idiom in the glossary is a bare path on its own line, so requiring backticks
 * would leave the idiom itself unchecked.
 *
 * ## What is deliberately not an error
 *
 * - **Vault paths** (`docs/ontology/**`, `domains/foo.md`). `docs/ontology/` is
 *   this project's own vault — a comment naming `docs/ontology/project.md` is
 *   citing a node address as an example, not pointing at documentation. Measured
 *   2026-08-22: 5 of the first 10 hits were exactly this.
 * - **Deleted files named as history.** "we removed `docs/GUIDE.md`" is a record,
 *   not rot. Same carve-out `doc-links.mjs` makes.
 * - **Placeholders** — anything containing `<`, `{`, `*`, or `...`.
 *
 * ## Why bare filenames are not scanned
 *
 * A citation must carry a repo-relative path. `design.md` on its own is below
 * this gate's pattern and therefore unchecked — `docs/GLOSSARY.md` §6 asks
 * authors to write `.claude/rules/design.md` instead, and a 2026-08-22 pass
 * upgraded the ones that mattered.
 *
 * Widening the pattern to bare names was measured and **rejected**. Inventory of
 * the 302 bare `.md` mentions in comments at the time:
 *
 *   146  resolve to exactly one file   → real pointers, already fine
 *   130  match several files           → `AGENTS.md`, `SKILL.md`, `README.md`;
 *                                        only context disambiguates them
 *    29  match nothing in the repo     → and **none of them is a pointer**:
 *                                        `baz.md`, `oldSlug.md`, `path.md`,
 *                                        `document.md` are example filenames
 *                                        inside a sentence; `po-pass.md`,
 *                                        `design-prescription.md` name vault
 *                                        and skill concepts
 *
 * So the wide version would report 29 false positives and zero real defects.
 * `.claude/rules/design-gates.md` states the rule this follows: count the
 * violations before switching a rule on, and if the count is noise rather than
 * defects, the rule buries the signal it was meant to raise.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const SCAN_DIRS = ["src", "mcp/src", "cli/src", "scripts", "tests"];
const CODE_EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".cjs"]);
const SKIP_DIR = new Set(["node_modules", "dist", "build", ".next", "data"]);

/**
 * Paths whose absence is a record rather than rot. Kept deliberately short: a
 * long allowlist is how this kind of gate quietly stops checking anything.
 */
const HISTORICAL = new Set([
  "docs/DEPLOYMENT.md",
  "docs/GUIDE.md",
]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      walk(full, out);
    } else if (CODE_EXT.has(path.extname(e.name))) {
      out.push(full);
    }
  }
  return out;
}

/** Comment lines only — a `.md` inside a string literal is data, not a pointer. */
function commentLines(source) {
  const out = [];
  let inBlock = false;
  source.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    if (inBlock) {
      out.push([i + 1, line]);
      if (trimmed.includes("*/")) inBlock = false;
      return;
    }
    if (trimmed.startsWith("/*")) {
      out.push([i + 1, line]);
      if (!trimmed.includes("*/")) inBlock = true;
      return;
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) out.push([i + 1, line]);
  });
  return out;
}

const CITATION = /(?:^|[\s`("'[])((?:src|mcp|cli|app|docs|tests|scripts|public|\.claude|\.agents)\/[A-Za-z0-9._/-]*\.md)/g;

function citationsIn(line) {
  const found = [];
  for (const m of line.matchAll(CITATION)) {
    const p = m[1];
    if (/[<>{}*]/.test(p) || p.includes("...")) continue;
    // The vault is data, not documentation — see the doc-block above.
    if (p.startsWith("docs/ontology/")) continue;
    found.push(p);
  }
  return found;
}

const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
const missing = [];
let checked = 0;

for (const file of files) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (!source.includes(".md")) continue;
  for (const [lineNo, line] of commentLines(source)) {
    for (const cited of citationsIn(line)) {
      checked += 1;
      if (HISTORICAL.has(cited)) continue;
      const abs = path.join(ROOT, cited);
      if (!existsSync(abs) || !statSync(abs).isFile()) {
        missing.push({ file: path.relative(ROOT, file), lineNo, cited });
      }
    }
  }
}

if (missing.length > 0) {
  console.error("\n[comment-refs] code comments point at markdown that does not exist:\n");
  for (const m of missing) {
    console.error(`  ${m.file}:${m.lineNo}  →  ${m.cited}`);
  }
  console.error(
    "\nFix the path, or — if the file was deliberately deleted and the comment is\n" +
      "recording that history — add it to HISTORICAL in scripts/check-comment-refs.mjs.\n",
  );
  process.exit(1);
}

/*
 * A gate that never sees anything is indistinguishable from no gate. If the scan
 * finds zero citations, the walk or the pattern broke rather than the repo being
 * clean — say so instead of printing a green line.
 */
if (checked === 0) {
  console.error(
    "\n[comment-refs] found zero markdown citations in code comments.\n" +
      "That is almost certainly a broken scan, not a clean repo — check SCAN_DIRS\n" +
      "and the CITATION pattern in scripts/check-comment-refs.mjs.\n",
  );
  process.exit(1);
}

console.log(
  `[comment-refs] ok · ${checked} markdown citations in code comments, all resolve ` +
    `(${files.length} files scanned)`,
);
