#!/usr/bin/env node
/**
 * Every `.md` path cited from a code comment must resolve (`docs/GLOSSARY.md` section 6). Not
 * errors: vault paths (`docs/ontology/**`), deleted files named as history. Bare filenames are not
 * scanned: ambiguous.
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
const HISTORICAL = new Set(["docs/GUIDE.md"]);

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

/*
 * A decision number cited in a comment must exist in `docs/DECISIONS.md`; an invented number reads
 * as authority. Cite a record without a number by date and title.
 */
const LEDGER = path.join(ROOT, "docs/DECISIONS.md");
const ledgerText = existsSync(LEDGER) ? readFileSync(LEDGER, "utf8") : "";
const knownDecisions = new Set(
  [...ledgerText.matchAll(/^## .*\((\d+)\)/gm)].map((match) => match[1]),
);
const DECISION_CITATION = /decisions? \((\d+)\)/g;
const danglingDecisions = [];
let decisionsChecked = 0;

for (const file of files) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (!source.includes("ecision")) continue;
  for (const [lineNo, line] of commentLines(source)) {
    for (const match of line.matchAll(DECISION_CITATION)) {
      decisionsChecked += 1;
      if (!knownDecisions.has(match[1])) {
        danglingDecisions.push({ file: path.relative(ROOT, file), lineNo, cited: match[1] });
      }
    }
  }
}

if (danglingDecisions.length > 0) {
  console.error("\n[comment-refs] code comments cite decision numbers that the ledger does not have:\n");
  for (const row of danglingDecisions) {
    console.error(`  ${row.file}:${row.lineNo}  →  decision (${row.cited})`);
  }
  console.error(
    `\ndocs/DECISIONS.md numbers ${knownDecisions.size} record(s). The newest records carry a\n` +
      "date and a title instead of a number — cite those the way the ledger writes them, e.g.\n" +
      '"the 2026-08-26 decision \\"Architecture is a separate reviewed contract\\"".\n',
  );
  process.exit(1);
}

/*
 * The ledger must have parsed. Zero known numbers means the heading pattern broke, and every
 * citation would then pass for the wrong reason.
 */
if (knownDecisions.size === 0) {
  console.error(
    "\n[comment-refs] parsed zero numbered records from docs/DECISIONS.md.\n" +
      "The heading pattern broke — every decision citation would pass unchecked.\n",
  );
  process.exit(1);
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
  `[comment-refs] ok · ${checked} markdown citations and ${decisionsChecked} decision citations ` +
    `in code comments, all resolve (${files.length} files scanned, ` +
    `${knownDecisions.size} numbered records)`,
);
