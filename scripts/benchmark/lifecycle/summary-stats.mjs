// Per-side statistics and the paired gaps between the Atlas and control sides.

function median(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (numeric.length === 0) return null;
  const sorted = [...numeric].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (numeric.length === 0) return null;
  return Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(4));
}

function summarizeRows(rows, caseId, mode) {
  const selected = rows.filter((row) => row.caseId === caseId && row.mode === mode);
  return {
    caseId,
    mode,
    cells: selected.length,
    contentPasses: selected.filter((row) => row.grade.pass).length,
    usableCells: selected.filter((row) => row.usable).length,
    coverage: mean(selected.map((row) => row.grade.coverage)),
    vocabularyCoverage: mean(selected.map((row) => row.grade.vocabularyCoverage)),
    comparableCoverage: mean(selected.map((row) => row.grade.comparableCoverage)),
    unknownSignals: selected.filter((row) => row.grade.breakdown?.unknownSignal).length,
    medianDurationMs: median(selected.map((row) => row.durationMs)),
    medianShellCalls: median(selected.map((row) => row.shellCalls)),
    medianMcpCalls: median(selected.map((row) => row.mcpCalls)),
    processFailures: selected.filter((row) => !row.usable).length,
  };
}

function delta(on, off) {
  return on != null && off != null ? Number((on - off).toFixed(4)) : null;
}

export function buildSummary({ rows, cases, repeat, modes }) {
  const arms = cases.flatMap(({ id }) => modes.map((mode) => summarizeRows(rows, id, mode)));
  const paired = cases.map(({ id }) => {
    const off = arms.find((row) => row.caseId === id && row.mode === 'off');
    const on = arms.find((row) => row.caseId === id && row.mode === 'on');
    return {
      caseId: id,
      coverageDelta: delta(on?.coverage, off?.coverage),
      comparableDelta: delta(on?.comparableCoverage, off?.comparableCoverage),
      vocabularyDelta: delta(on?.vocabularyCoverage, off?.vocabularyCoverage),
      passDelta: off && on ? on.contentPasses - off.contentPasses : null,
      durationDeltaMs: off?.medianDurationMs != null && on?.medianDurationMs != null ? on.medianDurationMs - off.medianDurationMs : null,
    };
  });
  return { repeat, modes, arms, paired };
}
