// The Markdown the benchmark writes: the run summary, the missed-evidence
// table and the re-score preamble.
import { classifyEvidence } from './definitions.mjs';

export function renderSummary({ date, summary, rows, title = 'Greenfield/brownfield lifecycle benchmark', preamble = [] }) {
  const lines = [
    `# ${title} — ${date}`,
    '',
    'Two sides answer the same questions about the same source code. `off` has no Atlas vault, no MCP server, and no answer key in its workspace; `on` has the identical source plus a checked Atlas vault and the read-only Atlas MCP server. These scores count whether an answer contained the things it should have named. They do not judge whether the answer was true or useful — read the saved answers before making any claim about the product.',
    ...preamble,
    '',
    `Runs per cell: **${summary.repeat}**`,
    '',
    '| Subject | Side | Cells | Content passes | Usable cells | Blended | Comparable (both sides) | Atlas names (Atlas side only) | Median duration | Median shell | Median MCP | Process failures |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const arm of summary.arms) {
    lines.push(`| ${arm.caseId} | ${arm.mode} | ${arm.cells} | ${arm.contentPasses} | ${arm.usableCells} | ${arm.coverage ?? '—'} | ${arm.comparableCoverage ?? '—'} | ${arm.vocabularyCoverage ?? '—'} | ${arm.medianDurationMs == null ? '—' : `${arm.medianDurationMs} ms`} | ${arm.medianShellCalls ?? '—'} | ${arm.medianMcpCalls ?? '—'} | ${arm.processFailures} |`);
  }
  lines.push('', '## Paired gaps', '', '| Subject | Comparable gap | Atlas-name gap | Blended gap | ON passes − OFF | ON duration − OFF |', '|---|---:|---:|---:|---:|---:|');
  for (const row of summary.paired) lines.push(`| ${row.caseId} | ${row.comparableDelta ?? '—'} | ${row.vocabularyDelta ?? '—'} | ${row.coverageDelta ?? '—'} | ${row.passDelta ?? '—'} | ${row.durationDeltaMs == null ? '—' : `${row.durationDeltaMs} ms`} |`);
  lines.push(
    '',
    '## How to read this',
    '',
    '- **Only the comparable column compares the two sides.** It scores source paths and boundary words, which either side could have written.',
    '- **The Atlas-name column is not a comparison.** It scores Atlas concept names, which live only in the vault, so the control side scores zero on it no matter how good its answer is. What it does show is worth showing: a name like `capabilities/checkout` can be looked up again next session by a person or an agent, and the phrase "the checkout feature" cannot.',
    '- The blended column exists only so earlier published runs still reproduce. Do not quote it.',
    '- **Boundary words are matched literally.** An answer that says "explicitly outside" instead of "excludes" scores zero for it, so a gap that rests on one word is a wording difference until a human grader says otherwise. The table at the end names the word behind every miss.',
    '- A positive comparable gap is a lead, not proof that the meaning layer helped.',
    '- A gap of zero, or a negative one, is a real result and should redirect the next slice.',
    '- Build and upkeep cost, the source-hidden handoff, whether citations are true, and human grading of meaning are separate measurements. None of them is folded into these numbers.',
    '- A cell that failed its setup check is a broken run, not evidence for or against Atlas.',
    '',
    '## Cells',
    '',
    '| Subject | Task | Side | Iteration | Blended | Comparable | Atlas names | Said what it did not know | Content pass | Setup | Usable | Status | Transcript |',
    '|---|---|---|---:|---:|---:|---:|---|---|---|---|---:|---|',
  );
  for (const row of rows) lines.push(`| ${row.caseId} | ${row.taskId} | ${row.mode} | ${row.iteration} | ${row.grade.coverage} | ${row.grade.comparableCoverage ?? '—'} | ${row.grade.vocabularyCoverage ?? '—'} | ${row.grade.breakdown?.unknownSignal ? 'yes' : 'no'} | ${row.grade.pass ? 'yes' : 'no'} | ${row.integrity.passed ? 'yes' : `no (${row.integrity.reason})`} | ${row.usable ? 'yes' : 'no'} | ${row.status ?? '—'} | [raw transcript](${row.transcript}) |`);
  lines.push(...renderMissedEvidence(rows));
  return `${lines.join('\n')}\n`;
}

function renderMissedEvidence(rows) {
  const tally = new Map();
  for (const row of rows) {
    for (const token of row.grade.required?.missing ?? []) {
      const key = `${row.caseId}:${row.mode}:${token}`;
      const entry = tally.get(key) ?? { caseId: row.caseId, mode: row.mode, token, cells: 0 };
      entry.cells += 1;
      tally.set(key, entry);
    }
  }
  if (tally.size === 0) return [];
  const ordered = [...tally.values()].sort((a, b) => (
    a.caseId.localeCompare(b.caseId) || a.mode.localeCompare(b.mode) || b.cells - a.cells || a.token.localeCompare(b.token)
  ));
  return [
    '',
    '## Which word decided each miss',
    '',
    'Every point of a gap is one specific thing a side did not write. `phrase` rows are the fragile ones: they are matched as literal words, so an answer that states the same boundary in other words scores zero. Send boundary judgement to blind human grading before reading a phrase gap as a difference in quality.',
    '',
    '| Subject | Side | What was missing | Kind | Cells |',
    '|---|---|---|---|---:|',
    ...ordered.map((entry) => `| ${entry.caseId} | ${entry.mode} | \`${entry.token}\` | ${classifyEvidence(entry.token)} | ${entry.cells} |`),
  ];
}

export function renderRegrade({ runId, summary, rows, reproduction }) {
  const checked = reproduction.filter((row) => row.reproduced != null);
  const failed = checked.filter((row) => !row.reproduced);
  const preamble = [
    '',
    `**This file re-scores the answers already saved for \`${runId}\`. Nothing was re-run: no Codex process started, no fixture was rebuilt, and no answer changed.** Only the scoring is new. The single score published for that run is split in two — the part both sides could earn, and the part only the Atlas side could.`,
    '',
    '### Does this read the same answers the run scored?',
    '',
    checked.length === 0
      ? 'The original summary was not found beside the transcripts, so the published score could not be re-derived. Treat the split below as unchecked.'
      : failed.length === 0
        ? `Yes. All ${checked.length} published averages came back exactly from the saved answers, so the split below is a different reading of the same run — not a different run.`
        : `**No. ${failed.length} of ${checked.length} published averages did not come back.** Treat the split below as unverified until that is explained.`,
    '',
    '| Side | Published score | Recomputed | Same |',
    '|---|---:|---:|---|',
    ...reproduction.map((row) => `| ${row.arm} | ${row.published ?? '—'} | ${row.recomputed ?? '—'} | ${row.reproduced == null ? 'not published' : row.reproduced ? 'yes' : 'no'} |`),
  ];
  return renderSummary({
    date: runId,
    summary,
    rows,
    title: 'Lifecycle benchmark, re-scored with the two halves separated',
    preamble,
  });
}
