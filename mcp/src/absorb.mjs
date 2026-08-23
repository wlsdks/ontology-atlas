// The "absorption tool" (single spine — one spine). See
// docs/plans/PRODUCT-PLAN-2026-07.md §4 (target — "CLAUDE.md is not replaced but absorbed":
// the target, absorbing CLAUDE.md rather than replacing it), §7 (trust architecture —
// injection Tier 1: trust architecture, injection Tier 1), §9 (roadmap — the roadmap).
//
// Converts a CLAUDE.md/AGENTS.md-style markdown file into typed vault nodes
// without dual maintenance: rule/policy/decision sections become
// `kind: document` nodes with a `role: policy` frontmatter extra;
// architecture/component sections become element/capability *suggestions*
// only (never auto-written — a human or agent must explicitly `add`/
// `add_concept` them). Sections the tool cannot confidently classify, and any
// section flagged injection-suspect, are excluded from absorption and stay
// verbatim in the rewritten "slim pointer" file.
//
// Mirror copy: `mcp/src/absorb.mjs` (the `absorb_document` MCP tool). Kept in
// lock-step by `tests/contract/absorb.contract.test.ts` — if you change
// anything here, mirror it there (and vice versa).
//
// Pure module — no filesystem access. Callers supply `isSlugTaken` so the
// plan stays deterministic and unit-testable; the CLI/MCP write path wires
// that predicate to a real vault existence check.

import { folderForKind } from './schema.mjs';

const H1_RE = /^#\s+(.+?)\s*$/;
const SECTION_HEADING_RE = /^##\s+(.+?)\s*$/;
// Fenced-code-block delimiter (``` or ~~~, 3+ chars, optional leading indent).
// Lines inside a fence — and the delimiter lines themselves — are NEVER treated
// as headings, so `## comment` / `# title` written inside a shell/markdown code
// block don't spuriously split the document (real CONTRIBUTING/AGENTS docs are
// full of these). See the code-fence contract fixtures in absorb-cases.mjs.
const FENCE_RE = /^\s*(?:```+|~~~+)/;

// ── section splitting ───────────────────────────────────────────────────

/**
 * Split a markdown file by top-level (`##`) headings. Nested `###`+ headings
 * stay inside their parent section's body — only `##` is a split boundary.
 * The first `# ` line anywhere before the first `##` is taken as the title;
 * everything else before the first `##` (minus that title line) is `intro`.
 *
 * Fenced code blocks are respected: any `#`/`##` line inside a ``` or ~~~
 * fence is code content, not a heading, and never splits the document.
 *
 * @returns {{ title: string|null, intro: string, sections: Array<{heading: string, body: string, raw: string}> }}
 */
export function splitDocumentSections(rawText) {
  const text = String(rawText || '');
  const lines = text.split(/\r?\n/);

  // Precompute which lines are inside a fenced code block (delimiter lines
  // included) so heading detection can ignore them.
  const inFence = new Array(lines.length).fill(false);
  let fenceOpen = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (FENCE_RE.test(lines[i])) {
      inFence[i] = true;
      fenceOpen = !fenceOpen;
      continue;
    }
    inFence[i] = fenceOpen;
  }
  const isSectionHeading = (i) => !inFence[i] && SECTION_HEADING_RE.test(lines[i]);
  const isTitleHeading = (i) => !inFence[i] && H1_RE.test(lines[i]);

  let firstH2Index = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (isSectionHeading(i)) {
      firstH2Index = i;
      break;
    }
  }
  const preambleEnd = firstH2Index === -1 ? lines.length : firstH2Index;

  let titleIndex = -1;
  for (let i = 0; i < preambleEnd; i += 1) {
    if (isTitleHeading(i)) {
      titleIndex = i;
      break;
    }
  }
  const title = titleIndex === -1 ? null : lines[titleIndex].match(H1_RE)[1].trim();
  const introLines = [];
  for (let i = 0; i < preambleEnd; i += 1) {
    if (i === titleIndex) continue;
    introLines.push(lines[i]);
  }
  const intro = introLines.join('\n').trim();

  const sections = [];
  if (firstH2Index !== -1) {
    let i = firstH2Index;
    while (i < lines.length) {
      if (!isSectionHeading(i)) {
        i += 1;
        continue;
      }
      const heading = lines[i].match(SECTION_HEADING_RE)[1].trim();
      const bodyLines = [];
      let j = i + 1;
      while (j < lines.length && !isSectionHeading(j)) {
        bodyLines.push(lines[j]);
        j += 1;
      }
      const body = bodyLines.join('\n').trim();
      sections.push({ heading, body, raw: [lines[i], ...bodyLines].join('\n').trim() });
      i = j;
    }
  }
  return { title, intro, sections };
}

// ── kind-mapping heuristics ─────────────────────────────────────────────

// Policy/convention vocabulary. Plurals and common variants are matched
// explicitly — real AGENTS.md/CONTRIBUTING headings say "Conventions",
// "Commits", "Tests", "Style Guide", "Best Practices", not the bare singular,
// and missing them was the dominant driver of skipped policy sections.
const POLICY_HEADING_RE =
  /\b(rules?|polic(?:y|ies)|conventions?|guide(?:line)?s?|governance|principles?|practices?|workflows?|forbidden|do[-\s]?not|verification|test(?:s|ing)?|commit(?:s|ted|ting)?|contributing|security)\b/i;
const POLICY_HEADING_RE_KO =
  /(규칙|정책|가이드|원칙|규율|금지|워크플로우|절차|관례|컨벤션|커밋|테스트|검증|보안)/;
const ARCH_HEADING_RE =
  /\b(architecture|components?|modules?|folder|structure|routes?|tech\s*stack|stack|layers?|schemas?|api)\b/i;
const ARCH_HEADING_RE_KO = /(아키텍처|구조|폴더|모듈|컴포넌트|스택|라우트|레이어|스키마)/;
const ARCH_ELEMENT_HEADING_RE = /\b(components?|modules?|schemas?|routes?)\b/i;
const ARCH_ELEMENT_HEADING_RE_KO = /(컴포넌트|모듈|스키마|라우트)/;

function countMatches(text, regexes) {
  let count = 0;
  for (const re of regexes) {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    const found = text.match(global);
    if (found) count += found.length;
  }
  return count;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Heuristic mapping (task scope): rule/policy/decision headings → `document`
 * nodes with `role: policy`; architecture/component headings → `element` or
 * `capability` *suggestions* (never written automatically). Anything else is
 * `unclassified` and stays in the pointer file untouched.
 */
export function classifySection({ heading, body }) {
  const headingText = String(heading || '');
  const sample = `${headingText} ${String(body || '').slice(0, 200)}`;

  if (POLICY_HEADING_RE.test(headingText) || POLICY_HEADING_RE_KO.test(headingText)) {
    const hits = countMatches(sample, [POLICY_HEADING_RE, POLICY_HEADING_RE_KO]);
    return {
      category: 'policy',
      kind: 'document',
      role: 'policy',
      confidence: clamp(0.6 + 0.1 * Math.min(hits, 3), 0.6, 0.95),
      reason: 'heading matches rule/policy/decision vocabulary',
    };
  }

  if (ARCH_HEADING_RE.test(headingText) || ARCH_HEADING_RE_KO.test(headingText)) {
    const hits = countMatches(sample, [ARCH_HEADING_RE, ARCH_HEADING_RE_KO]);
    const isElement =
      ARCH_ELEMENT_HEADING_RE.test(headingText) || ARCH_ELEMENT_HEADING_RE_KO.test(headingText);
    return {
      category: 'architecture',
      kind: isElement ? 'element' : 'capability',
      role: null,
      confidence: clamp(0.55 + 0.1 * Math.min(hits, 3), 0.55, 0.9),
      reason: 'heading matches architecture/component vocabulary',
    };
  }

  return {
    category: 'unclassified',
    kind: null,
    role: null,
    confidence: 0,
    reason: 'no policy or architecture vocabulary detected in heading',
  };
}

// ── Injection Tier 1 (PRODUCT-PLAN-2026-07.md §7) ──────────────────────
//
// A vault body is untrusted data. Conservative, named patterns only — ordinary
// policy prose (which carries plenty of imperative Korean and English, e.g.
// "things you must never do", "never use --no-verify") must NOT be flagged. Only
// direct-address instruction-hijack phrasing and executable shell/SQL fragments
// count as suspect.

const INJECTION_PATTERNS = [
  {
    name: 'ignore-previous-instructions',
    re: /\b(ignore|disregard|override)\b(?:[^.\n]{0,40})\b(previous|prior|above|earlier|all)\b(?:[^.\n]{0,40})\b(instructions?|rules?|prompt|directives?)\b/i,
  },
  {
    name: 'agent-role-hijack',
    re: /\byou are now\b|\bact as\b|\bpretend (?:to be|you(?:'| a)re)\b|\bjailbreak\b|\bdan mode\b/i,
  },
  {
    name: 'system-prompt-exfiltration',
    re: /\b(reveal|print|show|output|leak)\b(?:[^.\n]{0,30})\b(system prompt|hidden instructions|your instructions|your prompt)\b/i,
  },
  {
    name: 'korean-instruction-override',
    re: /(이전|기존|위)\s*(지시|명령|프롬프트|지침)[^.\n]{0,20}(무시|잊)/,
  },
  {
    name: 'shell-destructive-fragment',
    re: /\brm\s+-rf\s+[/~]|\bcurl\b[^\n]{0,60}\|\s*(sh|bash)\b/i,
  },
  {
    name: 'sql-injection-fragment',
    re: /\bdrop\s+table\b|\bunion\s+select\b|;\s*--\s*$/im,
  },
];

/**
 * Scan section text for imperative instruction patterns aimed at agents
 * (prompt-injection Tier 1). Returns every matched pattern, not just the
 * first — the caller reports them all so a human reviewer sees why a
 * section was excluded.
 */
export function scanForInjection(text) {
  const value = String(text || '');
  const matches = [];
  for (const pattern of INJECTION_PATTERNS) {
    const found = value.match(pattern.re);
    if (found) {
      matches.push({ pattern: pattern.name, snippet: found[0].slice(0, 120) });
    }
  }
  return { suspect: matches.length > 0, matches };
}

// ── slug helpers ─────────────────────────────────────────────────────────

export function slugifyText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function nextFreeSlug(candidate, usedInPlan, isSlugTaken) {
  const taken = (slug) => usedInPlan.has(slug) || isSlugTaken(slug);
  if (!taken(candidate)) return candidate;
  for (let n = 2; n < 1000; n += 1) {
    const next = `${candidate}-${n}`;
    if (!taken(next)) return next;
  }
  return candidate;
}

// ── absorption plan ──────────────────────────────────────────────────────

/**
 * Build the full absorption plan for a source file's raw text: split
 * sections, classify each, flag injection-suspects, and decide each
 * section's `action`:
 *
 *   - `absorb`  — policy/document section, not injection-suspect. Written to
 *                 the vault when the caller passes `--write`/`confirm: true`.
 *   - `suggest` — architecture/component section. Reported as a candidate
 *                 element/capability; NEVER auto-written.
 *   - `skip`    — unclassified, or injection-suspect regardless of category.
 *                 Stays verbatim in the rewritten source file.
 *
 * @param {string} rawText
 * @param {{ sourceLabel: string, isSlugTaken?: (slug: string) => boolean }} options
 */
export function buildAbsorptionPlan(rawText, options = {}) {
  const sourceLabel = String(options.sourceLabel || '').trim() || 'document';
  const isSlugTaken = typeof options.isSlugTaken === 'function' ? options.isSlugTaken : () => false;
  const usedSlugs = new Set();
  const baseSlug = slugifyText(sourceLabel) || 'absorbed-doc';

  const { title, intro, sections: rawSections } = splitDocumentSections(rawText);

  const sections = rawSections.map((section, index) => {
    const classification = classifySection(section);
    const injection = scanForInjection(`${section.heading}\n${section.body}`);

    let action = 'skip';
    let targetKind = null;
    let targetSlug = null;

    if (!injection.suspect && classification.category === 'policy') {
      action = 'absorb';
      targetKind = 'document';
      const candidate = `${baseSlug}-${slugifyText(section.heading)}`;
      targetSlug = nextFreeSlug(candidate, usedSlugs, isSlugTaken);
      usedSlugs.add(targetSlug);
    } else if (!injection.suspect && classification.category === 'architecture') {
      action = 'suggest';
      targetKind = classification.kind;
      targetSlug = `${folderForKind(classification.kind)}${slugifyText(section.heading)}`;
    }

    return {
      index,
      heading: section.heading,
      body: section.body,
      raw: section.raw,
      category: classification.category,
      kind: classification.kind,
      role: classification.role,
      confidence: classification.confidence,
      reason: classification.reason,
      injection,
      action,
      targetKind,
      targetSlug,
      targetTitle: section.heading,
    };
  });

  const summary = {
    total: sections.length,
    absorbed: sections.filter((s) => s.action === 'absorb').length,
    suggested: sections.filter((s) => s.action === 'suggest').length,
    injectionSuspect: sections.filter((s) => s.injection.suspect).length,
    unclassified: sections.filter((s) => s.category === 'unclassified').length,
  };

  return { sourceLabel, title, intro, sections, summary };
}

// ── slim pointer rewrite ──────────────────────────────────────────────────

/**
 * Build the rewritten "slim pointer" markdown that replaces the original
 * source file after `--write`/`confirm: true`. Never destroys content: every
 * section that was not absorbed (suggested, unclassified, or
 * injection-suspect) is reproduced verbatim below the notice block.
 */
export function buildSlimPointer(plan) {
  const absorbed = plan.sections.filter((s) => s.action === 'absorb');
  const suggested = plan.sections.filter((s) => s.action === 'suggest');
  const injectionSuspects = plan.sections.filter((s) => s.injection.suspect);
  const keepVerbatim = plan.sections.filter((s) => s.action !== 'absorb');

  const lines = [];
  lines.push(`# ${plan.title || plan.sourceLabel}`);
  lines.push('');
  lines.push('> **Absorbed into the ontology-atlas vault.** The sections below were');
  lines.push('> converted into typed vault nodes. Edit the vault, not this file, for');
  lines.push('> the sections that moved: this file is now a slim pointer.');
  lines.push('');
  if (plan.intro) {
    lines.push(plan.intro);
    lines.push('');
  }

  if (absorbed.length > 0) {
    lines.push('## Absorbed into the vault');
    lines.push('');
    for (const s of absorbed) {
      lines.push(`- **${s.heading}** → \`${s.targetSlug}\` (document · role: policy)`);
    }
    lines.push('');
  }

  if (suggested.length > 0) {
    lines.push('## Suggested (not written: review before adding)');
    lines.push('');
    for (const s of suggested) {
      lines.push(`- **${s.heading}** → candidate \`${s.targetKind}\` \`${s.targetSlug}\``);
    }
    lines.push('');
  }

  if (injectionSuspects.length > 0) {
    lines.push('## ⚠ Injection-suspect sections (excluded, kept below for human review)');
    lines.push('');
    for (const s of injectionSuspects) {
      const patterns = s.injection.matches.map((m) => m.pattern).join(', ');
      lines.push(`- **${s.heading}**: matched: ${patterns}`);
    }
    lines.push('');
  }

  if (keepVerbatim.length > 0) {
    lines.push('---');
    lines.push('');
    for (const s of keepVerbatim) {
      lines.push(`## ${s.heading}`);
      lines.push('');
      lines.push(s.body);
      lines.push('');
    }
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
