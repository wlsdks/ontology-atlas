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
 * Three kinds of line are dropped, and all are **counted** so the page can say how many it is not
 * showing rather than quietly presenting a subset as the whole file:
 *
 *  - lines longer than `MAX_LINE` (in practice `relation_notes`, a paragraph of prose per edge)
 *  - **the other locale's `display_*` line**
 *  - **bookkeeping keys** (`BOOKKEEPING`) — see below
 *
 * The third was added on 2026-08-23 after the owner read the shipped panel and said the content
 * was hard. It was: of ten lines, four taught nothing. `uid` is a UUID and it sat first, so it was
 * the first thing the eye landed on; `slug` repeats the file path printed directly above it;
 * `elements: []` is an empty list; `created_by: "agent:unknown"` reads as a defect to anyone who
 * does not know the convention. Verbatim was the right instinct for honesty and the wrong one for
 * teaching — a reader learns "these are plain files" from six legible lines and learns nothing at
 * all from a UUID. The count still states how many are missing.
 *
 * The second is not tidiness. `/en/download/` is one of two routes locked by
 * `tests/e2e/locale-purity.spec.ts` as drawing no vault text, so a `display_ko:` line rendered
 * there is Korean on an English screen — the spec caught exactly that in CI (2026-08-23) and its
 * own doc block predicts this case: *"if a route starts drawing vault data this spec breaks first
 * and forces the list to be revisited."* Revisiting it, the honest answer is that the panel should
 * show the file as it pertains to its reader, and say how many lines that leaves out. The reader's
 * own `display_*` line stays, so the localization mechanism is still visible.
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
/**
 * Keys that are machine bookkeeping rather than meaning. Dropped and counted.
 *
 * `elements` is here **only when empty** — a populated `elements:` line names real child nodes and
 * is exactly the kind of line this panel exists to show.
 */
const BOOKKEEPING = ['uid:', 'slug:', 'created_by:'];
const REPO_BLOB = 'https://github.com/wlsdks/ontology-atlas/blob/main';

function readFrontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) throw new Error(`${file}: has no frontmatter`);
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

/**
 * Names plus the **map node id** for a slug.
 *
 * The id is `kind:basename` — the form `derivationToInsight` mints (`domain:payment`) and the
 * gateway map instrument confirms live (`capability:mcp-server`, measured 2026-08-23). The
 * evidence section's linked demo drives the real engine's focus with these ids, so they are
 * generated here rather than re-derived by hand in the component — the same one-source rule as
 * every other value in this file.
 */
function namesFor(slug) {
  const lines = readFrontmatter(path.join(VAULT, `${slug}.md`));
  const title = unquote(field(lines, 'title')) ?? slug;
  const kind = unquote(field(lines, 'kind')) ?? 'capability';
  return {
    ko: unquote(field(lines, 'display_ko')) ?? title,
    en: unquote(field(lines, 'display_en')) ?? title,
    nodeId: `${kind}:${slug.split('/').pop()}`,
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
        // "Files like this" are concept files. The vault README carries a
        // `kind:` too (`vault-readme`) but is not a node the map draws, so
        // counting it said 97 here while the map said 96 concepts (audit
        // 2026-09-04). Count what the map counts.
        const kind = text.match(/^---\n[\s\S]*?^kind:\s*"?([^"\n]+)"?\s*$/m)?.[1]?.trim();
        if (kind && kind !== 'vault-readme') total += 1;
      }
    }
  };
  walk(VAULT);
  return total;
}

function build() {
  const file = path.join(VAULT, `${SPECIMEN_SLUG}.md`);
  const lines = readFrontmatter(file);

  /** Per locale: short lines, minus the *other* locale's display name. */
  const shownFor = (locale) => {
    const other = locale === 'ko' ? 'display_en:' : 'display_ko:';
    return lines.filter(
      (line) =>
        line.length <= MAX_LINE &&
        !line.startsWith(other) &&
        !BOOKKEEPING.some((key) => line.startsWith(key)) &&
        !/^elements:\s*\[\s*\]\s*$/.test(line),
    );
  };
  const frontmatter = { ko: shownFor('ko'), en: shownFor('en') };
  const omittedLines = {
    ko: lines.length - frontmatter.ko.length,
    en: lines.length - frontmatter.en.length,
  };

  const self = namesFor(SPECIMEN_SLUG);
  const domainSlug = field(lines, 'domain');
  const domain = domainSlug ? namesFor(domainSlug) : null;
  const depsRaw = field(lines, 'dependencies') ?? '[]';
  const depSlug = depsRaw.replace(/[[\]]/g, '').split(',')[0]?.trim() || null;
  const dependency = depSlug ? namesFor(depSlug) : null;
  const implPath = unquote(field(lines, 'path'));

  if (!domain || !dependency || !implPath) {
    throw new Error(
      `${SPECIMEN_SLUG}: the specimen must carry domain, dependencies and path together ` +
        `(domain=${!!domain} dependencies=${!!dependency} path=${!!implPath})`,
    );
  }

  return {
    slug: SPECIMEN_SLUG,
    file: path.posix.join('docs/ontology', `${SPECIMEN_SLUG}.md`),
    url: `${REPO_BLOB}/docs/ontology/${SPECIMEN_SLUG}.md`,
    frontmatter,
    omittedLines,
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

interface EvidenceSpecimenName {
  readonly ko: string;
  readonly en: string;
  /** The map engine's node id (kind:basename) — what focus/emphasis props accept. */
  readonly nodeId: string;
}

export interface EvidenceSpecimen {
  /** Vault-relative slug — the string MCP and the CLI accept verbatim. */
  readonly slug: string;
  /** Repo-relative path, shown above the frontmatter block. */
  readonly file: string;
  /** The same file on GitHub, so the claim is checkable in one click. */
  readonly url: string;
  /** Frontmatter lines, verbatim, in file order, per locale. */
  readonly frontmatter: { readonly ko: readonly string[]; readonly en: readonly string[] };
  /** How many lines are not shown, per locale — stated on screen, never hidden. */
  readonly omittedLines: { readonly ko: number; readonly en: number };
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
      '[gateway:specimen] the generated file disagrees with the vault — run `pnpm gateway:specimen` and commit the result.',
    );
    process.exit(1);
  }
  console.log(
    `[gateway:specimen] current · ${spec.file} · ko ${spec.frontmatter.ko.length} / en ${spec.frontmatter.en.length} lines shown`,
  );
} else {
  fs.writeFileSync(OUT, next);
  console.log(
    `[gateway:specimen] ${spec.file} → ${path.relative(ROOT, OUT)} ` +
      `(ko ${spec.frontmatter.ko.length} / en ${spec.frontmatter.en.length} lines shown, vault ${spec.vaultNodeCount} nodes)`,
  );
}
