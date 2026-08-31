/**
 * Turns evidence Atlas already computes into findings that survive being
 * re-run.
 *
 * The screen this feeds does not need another count. It needs to answer "what
 * is worse than last time, and what should I look at first" — and that question
 * is unanswerable unless two runs can be compared. Comparing prose cannot do it:
 * the same problem, described twice, is two different paragraphs. So every
 * finding carries an id derived from what it is *about* — the check that raised
 * it and the thing it points at — and never from how it is worded. Two runs
 * agree on an id or they do not; that is the whole comparison.
 *
 * Nothing here calls a model or reads a file. It takes evidence in and returns
 * findings, a diff, and Markdown.
 */

/** Severity order, worst first. `unknown` is deliberately not `ok`. */
export const SEVERITIES = Object.freeze(['violation', 'unknown', 'review', 'info']);

const SEVERITY_RANK = Object.freeze(Object.fromEntries(SEVERITIES.map((value, index) => [value, index])));

/**
 * An id is `source/check/target`. The target is a slug, a path, or an edge — a
 * thing that exists in the repository, so the same problem raised by two runs
 * lands on the same id even when the wording moves.
 */
export function findingId({ source, check, target }) {
  const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
  return `${clean(source)}/${clean(check)}/${clean(target)}`;
}

function finding({ source, check, target, severity, title, detail, evidence = [] }) {
  if (!SEVERITY_RANK[severity]) {
    if (SEVERITY_RANK[severity] !== 0) throw new Error(`unknown severity: ${severity}`);
  }
  return Object.freeze({
    id: findingId({ source, check, target }),
    source,
    check,
    target,
    severity,
    title,
    detail,
    evidence: Object.freeze([...evidence]),
  });
}

/**
 * Health checks already carry a status and a count. Only the ones that are not
 * passing become findings: a green check is not a finding, it is the absence of
 * one, and listing it would rebuild the census this replaces.
 *
 * **The app cannot raise every finding this does.** The CLI's health emits eight
 * checks; the browser computes six. The two it lacks — `vault_validation` and
 * `meaning_assessment` — are the ones that need the vault read from disk, and
 * `meaning_assessment` is the only finding open on this repository today. So an
 * in-app view of this record would, right now, show nothing while the record
 * shows something. That gap is the reason a screen for this is not built yet;
 * it is not a detail to paper over when one is.
 *
 * (The CLI's own `--help` still says "6 checks". It emits eight.)
 */
export function findingsFromHealth(health) {
  const found = [];
  for (const check of health?.checks ?? []) {
    if (check.status === 'pass') continue;
    found.push(finding({
      source: 'vault',
      check: check.id,
      target: health?.vaultSlug ?? 'vault',
      severity: check.status === 'fail' ? 'violation' : 'review',
      title: check.message ?? check.id,
      detail: check.count == null ? '' : `${check.count} affected.`,
      evidence: ['cli: health'],
    }));
  }
  return found;
}

/** One finding per validation problem, keyed by the file and code it names. */
export function findingsFromValidation(validation) {
  return (validation?.problems ?? []).flatMap((problem) => {
    const target = problem.file ?? problem.slug ?? 'vault';
    return (problem.issues ?? [problem]).map((issue) => finding({
      source: 'vault',
      check: issue.code ?? 'validation',
      target,
      severity: issue.severity === 'error' ? 'violation' : 'review',
      title: issue.message ?? 'Vault validation problem.',
      detail: '',
      evidence: ['cli: validate'],
    }));
  });
}

/**
 * Architecture contributes two different things, and collapsing them would be
 * the product's own documented mistake: a declared violation is a fact, while an
 * unmapped edge is an absence of evidence. The profile contract says unknown
 * import usage never means compliant, so unmapped coverage is reported as its
 * own finding rather than rounded to green.
 */
export function findingsFromArchitecture(architecture) {
  const conformance = architecture?.conformance;
  if (!conformance) return [];
  const profile = architecture?.profile?.slug ?? 'profile';
  const found = conformance.violations?.map((violation) => finding({
    source: 'architecture',
    check: 'role-dependency',
    target: `${violation.from ?? violation.fromRole} -> ${violation.to ?? violation.toRole}`,
    severity: 'violation',
    title: `${violation.fromRole ?? 'a role'} may not depend on ${violation.toRole ?? 'that role'}.`,
    detail: violation.importUsage ? `Import usage: ${violation.importUsage}.` : '',
    evidence: ['cli: architecture'],
  })) ?? [];

  const unmapped = conformance.unknown?.unmappedEdges ?? 0;
  if (unmapped > 0) {
    found.push(finding({
      source: 'architecture',
      check: 'unmapped-edges',
      target: profile,
      severity: 'unknown',
      title: `Conformance is unknown, not clean: ${unmapped} import edges match no declared role.`,
      detail: 'The profile contract holds that unknown import usage never means compliant. Either a role is missing from the profile or the scope excludes code that belongs in it.',
      evidence: ['cli: architecture'],
    }));
  }
  if (conformance.unknown?.coverageIncomplete) {
    found.push(finding({
      source: 'architecture',
      check: 'coverage-incomplete',
      target: profile,
      severity: 'unknown',
      title: 'The import scan did not cover the declared scope.',
      detail: 'Conformance cannot be read as evidence until coverage completes.',
      evidence: ['cli: architecture'],
    }));
  }
  for (const role of conformance.unknown?.emptyRoles ?? []) {
    found.push(finding({
      source: 'architecture',
      check: 'empty-role',
      target: role,
      severity: 'review',
      title: `The declared role "${role}" matched no files.`,
      detail: 'A role nothing implements is either retired or misdeclared.',
      evidence: ['cli: architecture'],
    }));
  }
  return found;
}

export function collectFindings({ health, validation, architecture }) {
  const all = [
    ...findingsFromHealth(health),
    ...findingsFromValidation(validation),
    ...findingsFromArchitecture(architecture),
  ];
  const byId = new Map();
  for (const item of all) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id)
  ));
}

/**
 * What changed since the last run. `changed` is deliberately narrow: a finding
 * whose severity moved. Re-wording is not a change, which is the entire reason
 * ids exist.
 */
export function diffFindings(previous, current) {
  const before = new Map((previous ?? []).map((item) => [item.id, item]));
  const after = new Map((current ?? []).map((item) => [item.id, item]));
  const opened = [...after.values()].filter((item) => !before.has(item.id));
  const resolved = [...before.values()].filter((item) => !after.has(item.id));
  const changed = [...after.values()]
    .filter((item) => before.has(item.id) && before.get(item.id).severity !== item.severity)
    .map((item) => ({ ...item, wasSeverity: before.get(item.id).severity }));
  const carried = [...after.values()].filter((item) => before.has(item.id) && before.get(item.id).severity === item.severity);
  return { opened, resolved, changed, carried, hadPrevious: Boolean(previous) };
}

function severityCounts(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((value) => [value, 0]));
  for (const item of findings) counts[item.severity] += 1;
  return counts;
}

function line(item) {
  return `- \`${item.id}\` — ${item.title}${item.detail ? ` ${item.detail}` : ''}`;
}

/**
 * Reads the findings back out of a record this module wrote.
 *
 * One artifact, not two. The record has to be readable by a person, and the next
 * run has to know what the last one found; embedding a JSON block beside the
 * prose would satisfy the second at the cost of the first. So the prose is the
 * format: an id in backticks under a severity heading. `renderAnalysis` and this
 * function are a round trip, and a test holds them to it.
 */
export function parseFindings(markdown) {
  const findings = [];
  let severity = null;
  let inOpenList = false;
  for (const raw of String(markdown ?? '').split('\n')) {
    const openSection = raw.match(/^## Every open finding\s*$/);
    if (openSection) { inOpenList = true; continue; }
    if (inOpenList && /^## /.test(raw)) break;
    if (!inOpenList) continue;
    const heading = raw.match(/^### ([a-z]+) — \d+\s*$/);
    if (heading && SEVERITIES.includes(heading[1])) { severity = heading[1]; continue; }
    const row = raw.match(/^- `([^`]+)` — (.*)$/);
    if (row && severity) {
      const [, id, rest] = row;
      const [source = '', check = '', ...targetParts] = id.split('/');
      findings.push(Object.freeze({
        id,
        source,
        check,
        target: targetParts.join('/'),
        severity,
        title: rest.trim(),
        detail: '',
        evidence: Object.freeze([]),
      }));
    }
  }
  return findings;
}

/**
 * The record is Markdown with no `kind:` in its frontmatter, so the compiler
 * does not count it as an ontology node. It is committed, and therefore
 * versioned and readable in a diff, without becoming reviewed meaning.
 */
export function renderAnalysis({ findings, diff, basis, previousLabel = null }) {
  const counts = severityCounts(findings);
  const lines = [
    '---',
    `analysis: ${basis.id}`,
    `measured_at: ${basis.measuredAt}`,
    `commit: ${basis.commit ?? 'unknown'}`,
    `graph_hash: ${basis.graphHash ?? 'unknown'}`,
    `files_scanned: ${basis.filesScanned ?? 0}`,
    '---',
    '',
    `# Analysis — ${basis.id}`,
    '',
    'Every line below was derived from evidence this repository already computes:',
    'vault health, vault validation, and architecture conformance. Nothing here was',
    'written by a model, and nothing here is reviewed meaning — this file carries no',
    '`kind:`, so the ontology does not count it as a concept.',
    '',
    `**${findings.length} open finding(s)**: `
      + SEVERITIES.map((severity) => `${counts[severity]} ${severity}`).join(' · '),
    '',
  ];

  lines.push('## What changed', '');
  if (!diff.hadPrevious) {
    lines.push('This is the first run. There is nothing to compare it against yet — run it', 'again after some work lands and this section becomes the point of the file.', '');
  } else {
    lines.push(`Compared with ${previousLabel ?? 'the previous run'}.`, '');
    const section = (title, rows, render) => {
      lines.push(`### ${title} — ${rows.length}`, '');
      if (rows.length === 0) lines.push('_None._', '');
      else lines.push(...rows.map(render), '');
    };
    section('Newly opened', diff.opened, line);
    section('Resolved since last run', diff.resolved, (item) => `- \`${item.id}\` — ${item.title}`);
    section('Severity moved', diff.changed, (item) => `- \`${item.id}\` — ${item.wasSeverity} → **${item.severity}**. ${item.title}`);
    lines.push(`### Still open, unchanged — ${diff.carried.length}`, '');
  }

  lines.push('## Every open finding', '');
  if (findings.length === 0) {
    lines.push('_No open findings. Every check this record derives from is passing._', '');
  } else {
    for (const severity of SEVERITIES) {
      const rows = findings.filter((item) => item.severity === severity);
      if (rows.length === 0) continue;
      lines.push(`### ${severity} — ${rows.length}`, '');
      for (const item of rows) {
        lines.push(line(item));
        if (item.evidence.length > 0) lines.push(`  - derived from ${item.evidence.join(', ')}`);
      }
      lines.push('');
    }
  }

  lines.push(
    '## What this record cannot tell you',
    '',
    '- It reports what the checks can see. A responsibility nobody declared raises',
    '  no finding, and silence here is not proof that nothing is wrong.',
    '- It judges no meaning. Whether a capability describes the right boundary is a',
    '  human decision, and this file never makes it.',
    '- Its findings age. Each one names the commit and graph hash it was derived',
    '  from; once the source moves past them, re-run rather than trusting the page.',
    '',
  );
  return `${lines.join('\n')}\n`;
}
