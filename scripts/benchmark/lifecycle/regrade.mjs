// Re-scores saved transcripts without running Codex again, and checks the new
// scores reproduce the published ones.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CASES, MODES, TASKS } from './definitions.mjs';
import { armIntegrity, scoreFinalAnswer, transcriptCallCounts } from './scoring.mjs';
import { buildSummary } from './summary-stats.mjs';

const TRANSCRIPT_STDERR_MARKER = '\n[stderr]\n';

// A saved transcript is the answer on stdout followed by the captured log; re-grading reads
// only the answer object the original run scored.
export function parseTranscriptAnswer(transcript) {
  const stdout = transcript.split(TRANSCRIPT_STDERR_MARKER)[0].trim();
  if (!stdout) return { value: null, error: 'transcript has no stdout section' };
  try {
    return { value: JSON.parse(stdout), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

// If a re-grade cannot reproduce these published numbers it is reading different answers.
export function readPublishedCoverage(summaryMarkdown) {
  const published = new Map();
  for (const line of summaryMarkdown.split('\n')) {
    const match = line.match(/^\|\s*(\w+)\s*\|\s*(off|on)\s*\|\s*\d+\s*\|\s*\d+\s*\|\s*\d+\s*\|\s*([\d.]+)\s*\|/);
    if (match) published.set(`${match[1]}:${match[2]}`, Number(match[3]));
  }
  return published;
}

export function regradeRun({ runId, outputRoot, cases = CASES, modes = MODES }) {
  const taskById = new Map(cases.flatMap((entry) => TASKS[entry.id].map((task) => [`${entry.id}:${task.id}`, task])));
  const pattern = new RegExp(`^${runId}-(\\w+)-(\\w+)-(off|on)-r(\\d+)\\.txt$`);
  const rows = [];
  for (const filename of readdirSync(outputRoot).sort()) {
    const match = filename.match(pattern);
    if (!match) continue;
    const [, caseId, taskId, mode, iteration] = match;
    const task = taskById.get(`${caseId}:${taskId}`);
    if (!task || !modes.includes(mode)) continue;
    const transcript = readFileSync(join(outputRoot, filename), 'utf8');
    const { value, error } = parseTranscriptAnswer(transcript);
    const { mcpCalls, failedMcpCalls, shellCalls } = transcriptCallCounts(transcript);
    const integrity = armIntegrity(mode, { mcpCalls, failedMcpCalls });
    rows.push({
      caseId,
      mode,
      taskId,
      axis: task.axis,
      iteration: Number(iteration),
      status: null,
      durationMs: null,
      shellCalls,
      mcpCalls,
      failedMcpCalls,
      grade: scoreFinalAnswer(value, task),
      parseError: error,
      integrity,
      usable: !error && integrity.passed,
      transcript: filename,
    });
  }
  if (rows.length === 0) throw new Error(`no saved transcripts for --run-id=${runId} in ${outputRoot}`);
  const summary = buildSummary({ rows, cases, repeat: Math.max(...rows.map((row) => row.iteration)), modes });
  const originalPath = join(outputRoot, `${runId}-summary.md`);
  const published = existsSync(originalPath) ? readPublishedCoverage(readFileSync(originalPath, 'utf8')) : new Map();
  const reproduction = summary.arms.map((arm) => {
    const expected = published.get(`${arm.caseId}:${arm.mode}`);
    return {
      arm: `${arm.caseId}:${arm.mode}`,
      published: expected ?? null,
      recomputed: arm.coverage,
      reproduced: expected == null ? null : Math.abs(expected - arm.coverage) < 0.0005,
    };
  });
  return { summary, rows, reproduction };
}
