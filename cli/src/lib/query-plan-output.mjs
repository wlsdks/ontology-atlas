export function shouldBlockPlannedExecution(plan) {
  return plan.execution.shouldRun !== true || plan.warnings.length > 0;
}

export function formatQueryHint(query, fallback = 'narrow the query before running it') {
  if (!query || typeof query !== 'object') return fallback;
  return JSON.stringify(query);
}

export function formatQueryPlanLines(plan, colors, { fallbackHint } = {}) {
  const runColor = plan.execution.shouldRun ? colors.green : colors.yellow;
  const warningSuffix = plan.warnings.length > 0
    ? ` warnings=${plan.warnings.length}`
    : '';
  const lines = [
    `${colors.bold}query_plan${colors.reset} ${runColor}${plan.execution.nextStep}${colors.reset}` +
      ` ${colors.dim}strategy=${plan.estimate.strategy} cost=${plan.estimate.costClass}` +
      ` resultUpperBound=${plan.estimate.resultUpperBound ?? 'n/a'}${warningSuffix}${colors.reset}`,
    `  ${plan.execution.recommendation}`,
  ];

  if (plan.execution.saferQuery) {
    lines.push(
      `  ${colors.yellow}safer${colors.reset} ${formatQueryHint(plan.execution.saferQuery, fallbackHint)}`,
    );
  }
  for (const warning of plan.warnings) {
    lines.push(`  ${colors.yellow}warning${colors.reset} ${warning}`);
  }
  return lines;
}

export function printQueryPlan(plan, colors, options = {}) {
  for (const line of formatQueryPlanLines(plan, colors, options)) {
    process.stdout.write(`${line}\n`);
  }
}
