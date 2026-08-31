#!/usr/bin/env node
/**
 * **Sweeps the installed Claude Agent Skills and measures their integrity** — a
 * discovery tool.
 *
 * ## Why it lives in this repository (2026-08-09)
 *
 * Owner: *"Since skills are all made of md too, can't we graph the skills themselves?
 * With a structure linking skills?"*
 * (skills are all markdown too, so could the skills themselves be turned into a
 * graph, with the skills linked to each other?)
 * This was built to **measure** whether there is anything real in that direction.
 * It is not a product feature, has no screen, and is not a public CLI command
 * (that would require convening the PO council).
 *
 * ## How a skill is triggered (the premise for what this measures)
 *
 * A skill is a folder containing one `SKILL.md`. At session start only the
 * frontmatter's `name` and `description` are loaded (50–100 tokens per skill). If
 * it looks relevant the body is read, and if the body points at another file, only
 * that file is read then — three-stage progressive disclosure. So **one
 * `description` line decides triggering**, and if the body's pointers do not
 * resolve the third stage silently comes back empty.
 *
 * Public documentation:
 * platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
 *
 * ## The three things measured, and why those three
 *
 * ① **Name collisions** — with several installs under one name, which one wins is
 *    non-deterministic. When the descriptions differ too, things with different
 *    trigger conditions compete under the same name.
 * ② **Trigger overlap** — even with distinct names, descriptions sharing words let
 *    one skill mask another. The published prescription is to narrow the scope and
 *    write `Do not use for X`, which means a human has to maintain it.
 * ③ **Integrity of self-folder references** — does the file a skill points at
 *    inside its own folder actually exist?
 *
 * ## ⚠️ What gets counted is the whole tool — and it was wrong twice
 *
 * **First misclassification: references counted as one lump.** 700 references
 * pointed at non-existent files, but 666 of them were **conditional** ("read this
 * file if the project has one") and not defects. The number only becomes actionable
 * once they are separated.
 *
 * **Second misclassification (the larger one): counting files that are never
 * loaded.** The first version swept all of `~/.claude/plugins` and reported
 * **207**. That tree mixes in ⓐ `cache/` — version-pinned download snapshots (the
 * same plugin at 5.1.0 **and** 6.2.0, one copy per commit hash) and ⓑ
 * `marketplaces/` — catalogue clones that include things **never installed**. The
 * authority is `~/.claude/plugins/installed_plugins.json`, which names exactly
 * **one** `installPath` per plugin.
 *
 * Narrowing and recounting changed the numbers (measured 2026-08-09):
 *
 * | | Whole disk | **Actually loaded** |
 * |---|---|---|
 * | Skills | 209 | **60** |
 * | Name collisions | 38 names | **2** (`frontend-design` · `skill-creator`) |
 * | Strong trigger overlap | 41 pairs | **1 pair** |
 * | Missing self-folder references | 37 | **0** (all 7 were false positives that really exist at the repository root) |
 *
 * So the first report's "8 copies of `frontend-design` are competing" was **wrong**
 * — six of the eight were unused snapshots and catalogues, and the description
 * differences were **version drift within one plugin**. That is what a download
 * cache normally looks like.
 *
 * **So the default counts only what is loaded.** `--all` sweeps the whole disk, and
 * in that mode the output says of itself that it includes things that are not
 * loaded.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Subfolders a skill promises to carry in its own folder — pointers into these must resolve. */
const BUNDLED_PREFIX = /^(\.\/)?(references|scripts|assets|templates|examples)\//;

/**
 * Words removed from descriptions. Measuring trigger overlap requires dropping the
 * words that appear in every skill — otherwise every pair looks overlapping and the
 * ranking means nothing.
 */
const STOP = new Set(
  (
    'use when this the a an and or for to of in on with that if you your is are be it its as by from at not do using used ' +
    'claude user users any all only also more most other others than then there their them into over under about after before ' +
    'should must can could would may might will need needs needed want wants asks ask asking request requests requested ' +
    'skill skills file files folder directory create creating creates make makes making build building builds ' +
    'etc via per each one two both new like such same out up down off'
  ).split(/\s+/),
);

export function distinctiveTerms(description) {
  return [
    ...new Set(
      String(description)
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 2 && !STOP.has(word)),
    ),
  ];
}

/** Extracts only the two frontmatter values that decide triggering. */
export function parseSkill(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  const frontmatter = {};
  let key = null;
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      frontmatter[key] = kv[2].trim();
    } else if (key && /^\s+\S/.test(line)) {
      // YAML folded lines (several lines after `|-`) — common for long descriptions.
      frontmatter[key] += ` ${line.trim()}`;
    }
  }
  return { name: frontmatter.name ?? null, description: frontmatter.description ?? '', body: match[2] };
}

/** Extracts the body's file references and splits them into self-folder and conditional. */
export function classifyReferences(body) {
  const bundled = new Set();
  const conditional = new Set();
  // The third category is decided at the existence check, not in
  // `classifyReferences` — the same `scripts/x.mjs` may be relative to the skill
  // folder or to the repository root, and the string alone cannot tell them apart
  // (see the repoRoot check in `auditSkills` below).
  for (const hit of body.matchAll(
    /(?:^|[\s(`'"])([A-Za-z0-9_./-]+\.(?:md|py|js|mjs|ts|sh|json|csv|txt))/g,
  )) {
    const ref = hit[1];
    if (ref.startsWith('http') || ref.includes('://')) continue;
    (BUNDLED_PREFIX.test(ref) ? bundled : conditional).add(ref);
  }
  return { bundled: [...bundled], conditional: [...conditional] };
}

export function findSkillFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'SKILL.md') out.push(full);
    }
  };
  walk(root);
  // Empty templates carried by a marketplace are not installed skills.
  return out.filter((file) => !/\/template\//.test(file));
}

export function auditSkills(skills, { exists = fs.existsSync, repoRoot = process.cwd() } = {}) {
  const byName = new Map();
  for (const skill of skills) {
    if (!byName.has(skill.name)) byName.set(skill.name, []);
    byName.get(skill.name).push(skill);
  }

  const duplicates = [...byName.entries()]
    .filter(([, copies]) => copies.length > 1)
    .map(([name, copies]) => ({
      name,
      copies: copies.length,
      // Differing descriptions mean things with different trigger conditions compete under one name.
      descriptionsDiffer: new Set(copies.map((c) => c.description)).size > 1,
      files: copies.map((c) => c.file),
    }))
    .sort((a, b) => b.copies - a.copies);

  const overlaps = [];
  for (let i = 0; i < skills.length; i += 1) {
    for (let j = i + 1; j < skills.length; j += 1) {
      const a = skills[i];
      const b = skills[j];
      if (a.name === b.name) continue; // Name collisions are counted separately above
      const termsB = new Set(b.terms);
      const shared = a.terms.filter((term) => termsB.has(term));
      if (shared.length < 3) continue;
      const union = new Set([...a.terms, ...b.terms]).size;
      overlaps.push({ a: a.name, b: b.name, shared, score: Number((shared.length / union).toFixed(3)) });
    }
  }
  overlaps.sort((x, y) => y.score - x.score);

  let bundledTotal = 0;
  let repoRelative = 0;
  const bundledMissing = [];
  let conditionalTotal = 0;
  let conditionalMissing = 0;
  for (const skill of skills) {
    const dir = path.dirname(skill.file);
    const refs = classifyReferences(skill.body);
    for (const ref of refs.bundled) {
      bundledTotal += 1;
      if (exists(path.resolve(dir, ref))) continue;
      /*
       * ⚠️ **Look again at the repository root** (corrected 2026-08-09). A reference
       * beginning `scripts/…` may be something the skill carries in its own folder, or
       * **a script in the repository that uses the skill** — the string alone cannot
       * tell. Without this check, all 7 of our skills were reported as broken
       * references, and all 7 really existed at the repository root
       * (`scripts/measure-contrast.mjs` among them). The instrument was calling healthy
       * things defects.
       */
      if (exists(path.resolve(repoRoot, ref))) {
        repoRelative += 1;
        continue;
      }
      bundledMissing.push({ name: skill.name, ref, file: skill.file });
    }
    for (const ref of refs.conditional) {
      conditionalTotal += 1;
      if (!exists(path.resolve(dir, ref))) conditionalMissing += 1;
    }
  }

  return {
    total: skills.length,
    uniqueNames: byName.size,
    duplicates,
    overlaps,
    references: { bundledTotal, bundledMissing, repoRelative, conditionalTotal, conditionalMissing },
    withBoundary: skills.filter((s) =>
      /do not use|don't use|not for|instead of|rather than|대신|쓰지 않/i.test(s.description),
    ).length,
  };
}

/**
 * **The plugin roots that actually load** — `installed_plugins.json` is the
 * authority. It names one `installPath` per plugin, so sweeping only those drops
 * download snapshots and catalogue clones automatically.
 */
export function installedPluginRoots(home, readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))) {
  try {
    const manifest = readJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'));
    const out = [];
    for (const entries of Object.values(manifest?.plugins ?? {})) {
      for (const entry of entries ?? []) {
        if (typeof entry?.installPath === 'string' && entry.installPath) out.push(entry.installPath);
      }
    }
    return [...new Set(out)];
  } catch {
    // Without the authority file, plugin skills are not counted — reporting "could
    // not count" beats reporting an inflated number. `--all` sweeps the whole disk.
    return [];
  }
}

function loadSkills(roots) {
  const skills = [];
  for (const [scope, root] of roots) {
    for (const file of findSkillFiles(root)) {
      const parsed = parseSkill(fs.readFileSync(file, 'utf8'));
      if (!parsed?.name) continue;
      skills.push({ ...parsed, file, scope, terms: distinctiveTerms(parsed.description) });
    }
  }
  return skills;
}

function main() {
  const args = process.argv.slice(2);
  const extra = args.filter((a) => !a.startsWith('--'));
  const home = os.homedir();
  const scanAll = args.includes('--all');
  const roots = extra.length
    ? extra.map((r) => ['arg', path.resolve(r)])
    : scanAll
      ? [
          ['personal', path.join(home, '.claude', 'skills')],
          ['disk', path.join(home, '.claude', 'plugins')],
          ['project', path.join(process.cwd(), '.claude', 'skills')],
        ]
      : [
          ['personal', path.join(home, '.claude', 'skills')],
          ...installedPluginRoots(home).map((r) => ['plugin', r]),
          ['project', path.join(process.cwd(), '.claude', 'skills')],
        ];

  const skills = loadSkills(roots);
  if (skills.length === 0) {
    console.log('[skill-audit] found no skills at all — pass a path as an argument or check the install location.');
    process.exit(0);
  }
  const report = auditSkills(skills);
  const scopes = skills.reduce((acc, s) => ((acc[s.scope] = (acc[s.scope] ?? 0) + 1), acc), {});

  console.log(
    `[skill-audit] ${scanAll ? '⚠️ whole disk (including snapshots and catalogs that are never loaded)' : 'skills that actually load'} ` +
      `${report.total} · unique names ${report.uniqueNames} (${Object.entries(scopes)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')})`,
  );
  if (!scanAll && !skills.some((s) => s.scope === 'plugin')) {
    console.log('   ⚠️ could not read installed_plugins.json, so plugin skills were not counted (--all scans the whole disk)');
  }

  console.log(`\n① name collisions — ${report.duplicates.length} shared names, ${report.total - report.uniqueNames} copies beyond the first`);
  const risky = report.duplicates.filter((d) => d.descriptionsDiffer);
  console.log(`   of those, ones whose descriptions also differ: ${risky.length} ← different trigger conditions competing under one name`);
  for (const dup of risky.slice(0, 6)) console.log(`   ✗ ${dup.name} × ${dup.copies}`);

  const strong = report.overlaps.filter((o) => o.score >= 0.25);
  console.log(`\n② trigger overlap — ${report.overlaps.length} candidate pairs · strong overlap (≥0.25) ${strong.length} pairs`);
  for (const pair of strong.slice(0, 6)) {
    console.log(`   ${pair.score}  ${pair.a} ↔ ${pair.b}  [${pair.shared.slice(0, 5).join(', ')}]`);
  }
  console.log(`   skills whose description states a boundary ("Do not use for X"): ${report.withBoundary}/${report.total}`);

  const { bundledTotal, bundledMissing, conditionalTotal, conditionalMissing } = report.references;
  console.log(`\n③ self-folder references — ${bundledMissing.length} of ${bundledTotal} missing`);
  for (const miss of bundledMissing.slice(0, 6)) console.log(`   ✗ ${miss.name}: ${miss.ref}`);
  console.log(
    `   (the ${report.references.repoRelative} resolved from the repository root are not defects — they are that repository's scripts, not the skill's)`,
  );
  console.log(
    `   (${conditionalMissing} of ${conditionalTotal} conditional project-side references may be absent — they say "read it if it exists", so absence is not a defect)`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
