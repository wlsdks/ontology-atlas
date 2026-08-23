#!/usr/bin/env node
/**
 * Generates the gateway evidence section's **specimen** — one real vault file, read verbatim.
 *
 * ## Why this is generated and not written by hand
 *
 * The section's whole claim is *"this is a file that is actually in this repository."* A hand-typed
 * copy of that file stops being true the moment someone edits the file, and nothing would say so.
 * This repository has been burned by exactly that twice in two days: the demo section's lead
 * described a scene that had been cut from the video, and its caption described a recording that
 * had been replaced. Both were prose that had drifted from the artefact it described.
 *
 * So the rule this follows is the repository's own (`.claude/rules/documentation.md`): **only what
 * a machine can generate may be checked**, and the way to check it is to generate it again and
 * diff. `--check` does that, and CI runs it.
 *
 * ## What is a "specimen"
 *
 * One capability node, chosen because it satisfies all of:
 *
 *  - it has a Korean **and** an English name, so neither locale shows the other's
 *  - it declares a `dependencies:` edge, because a lone node is not evidence of a *graph*
 *  - it names a `path:`, so the fact "this points at real code" is visible
 *  - its frontmatter is short enough to read at a glance
 *
 * `SPECIMEN_SLUG` pins which one. It is pinned rather than picked heuristically because the
 * screen's other half explains this exact node in prose; a specimen that silently changed under a
 * fixed explanation would be the same drift in a new place.
 *
 * ## Verbatim, and honest about what is left out
 *
 * Lines longer than `MAX_LINE` are dropped (in practice `relation_notes`, a paragraph of prose per
 * edge) and **counted**, so the page can say how many lines it is not showing rather than quietly
 * presenting a subset as the whole file.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const VAULT = path.join(ROOT, 'docs', 'ontology');
const OUT = path.join(ROOT, 'src', 'views', 'download', 'model', 'evidence-specimen.generated.ts');

/** The pinned specimen. Changing this is a content decision, not a refactor. */
const SPECIMEN_SLUG = 'capabilities/mcp-server';
/** Longer lines are elided and counted — `relation_notes` carries a paragraph per edge. */
const MAX_LINE = 64;
const REPO_BLOB = 'https://github.com/wlsdks/ontology-atlas/blob/main';

function readFrontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) throw new Error(`${file}: frontmatter 가 없다`);
  return match[1].split('\n');
}

/** `key: value` from a frontmatter line list; returns null when the key is absent. */
function field(lines, key) {
  const hit = lines.find((line) => line.startsWith(`${key}:`));
  return hit ? hit.slice(key.length + 1).trim() : null;
}

function unquote(value) {
  return value?.replace(/^["']|["']$/g, '') ?? null;
}

/** Both display names for a slug, falling back to `title` when a locale is missing. */
function namesFor(slug) {
  const lines = readFrontmatter(path.join(VAULT, `${slug}.md`));
  const title = unquote(field(lines, 'title')) ?? slug;
  return {
    ko: unquote(field(lines, 'display_ko')) ?? title,
    en: unquote(field(lines, 'display_en')) ?? title,
  };
}

function countNodes() {
  let total = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) {
        const text = fs.readFileSync(full, 'utf8');
        if (/^---\n[\s\S]*?^kind:/m.test(text)) total += 1;
      }
    }
  };
  walk(VAULT);
  return total;
}

function build() {
  const file = path.join(VAULT, `${SPECIMEN_SLUG}.md`);
  const lines = readFrontmatter(file);

  const shown = lines.filter((line) => line.length <= MAX_LINE);
  const omitted = lines.length - shown.length;

  const self = namesFor(SPECIMEN_SLUG);
  const domainSlug = field(lines, 'domain');
  const domain = domainSlug ? namesFor(domainSlug) : null;
  const depsRaw = field(lines, 'dependencies') ?? '[]';
  const depSlug = depsRaw.replace(/[[\]]/g, '').split(',')[0]?.trim() || null;
  const dependency = depSlug ? namesFor(depSlug) : null;
  const implPath = unquote(field(lines, 'path'));

  if (!domain || !dependency || !implPath) {
    throw new Error(
      `${SPECIMEN_SLUG}: 표본은 domain · dependencies · path 를 전부 가져야 한다 ` +
        `(domain=${!!domain} dependencies=${!!dependency} path=${!!implPath})`,
    );
  }

  return {
    slug: SPECIMEN_SLUG,
    file: path.posix.join('docs/ontology', `${SPECIMEN_SLUG}.md`),
    url: `${REPO_BLOB}/docs/ontology/${SPECIMEN_SLUG}.md`,
    frontmatter: shown,
    omittedLines: omitted,
    facts: {
      name: self,
      kind: unquote(field(lines, 'kind')) ?? 'capability',
      domain,
      dependency,
      implPath,
    },
    vaultNodeCount: countNodes(),
  };
}

function render(spec) {
  const json = JSON.stringify(spec, null, 2).replace(/^/gm, '  ').trim();
  return `// Generated by \`pnpm gateway:specimen\` — do not edit by hand.
//
// One real file from this repository's own vault, read verbatim, plus the facts an agent reads
// out of it. The gateway's evidence section renders both halves; the claim it makes is that the
// left side is a file you can open in this repo, so nothing here may be hand-typed.
//
// Re-run the generator when the specimen file changes; \`pnpm gateway:specimen:check\` fails the
// build when this file and the vault disagree. Rationale: \`scripts/generate-evidence-specimen.mjs\`.

export interface EvidenceSpecimenName {
  readonly ko: string;
  readonly en: string;
}

export interface EvidenceSpecimen {
  /** Vault-relative slug — the string MCP and the CLI accept verbatim. */
  readonly slug: string;
  /** Repo-relative path, shown above the frontmatter block. */
  readonly file: string;
  /** The same file on GitHub, so the claim is checkable in one click. */
  readonly url: string;
  /** Frontmatter lines, verbatim, in file order. */
  readonly frontmatter: readonly string[];
  /** How many lines were too long to show — stated on screen, never hidden. */
  readonly omittedLines: number;
  readonly facts: {
    readonly name: EvidenceSpecimenName;
    readonly kind: string;
    readonly domain: EvidenceSpecimenName;
    readonly dependency: EvidenceSpecimenName;
    readonly implPath: string;
  };
  /** Every \`kind:\` node in the vault — the caption's "there are N of these" number. */
  readonly vaultNodeCount: number;
}

export const EVIDENCE_SPECIMEN: EvidenceSpecimen = ${json} as const;
`;
}

const spec = build();
const next = render(spec);

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current !== next) {
    console.error(
      '[gateway:specimen] 생성물이 볼트와 어긋난다 — `pnpm gateway:specimen` 을 돌리고 커밋해라.',
    );
    process.exit(1);
  }
  console.log(`[gateway:specimen] current · ${spec.file} · ${spec.frontmatter.length} lines shown`);
} else {
  fs.writeFileSync(OUT, next);
  console.log(
    `[gateway:specimen] ${spec.file} → ${path.relative(ROOT, OUT)} ` +
      `(${spec.frontmatter.length} lines shown, ${spec.omittedLines} elided, vault ${spec.vaultNodeCount} nodes)`,
  );
}
