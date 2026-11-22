import { COLORS, KIND_COLORS } from '../../../lib/colors.mjs';
import { diagnosisStatusColor } from '../../../lib/diagnosis/diagnosis-colors.mjs';
import { cliInvocation } from '../../../lib/self-invocation.mjs';
import { modeComparisonRows } from './graph-db-pack.mjs';

const READINESS_COLORS = {
  ready: COLORS.green,
  needs_attention: COLORS.yellow,
  needs_shape: COLORS.red,
};

export function renderCompact(result) {
  process.stdout.write(`${COLORS.bold}AGENT BRIEF${COLORS.reset} ${COLORS.dim}${result.project.slug} · compact${COLORS.reset}\n`);
  const navigation = result.focus.taskNavigation;
  process.stdout.write(
    `${COLORS.bold}TASK NAVIGATION${COLORS.reset} ${navigation.status}/${navigation.currentness}`
    + `${navigation.blockedBy ? ` · blocked ${navigation.blockedBy}` : ''}\n`,
  );
  process.stdout.write(`${COLORS.dim}PRIMARY${COLORS.reset} ${formatTaskNavigationTarget(navigation.primary)}\n`);
  if (navigation.supporting) {
    process.stdout.write(`${COLORS.dim}SUPPORTING${COLORS.reset} ${formatTaskNavigationTarget(navigation.supporting)}\n`);
  }
  process.stdout.write(
    `${COLORS.dim}FOCUSED TESTS${COLORS.reset} `
    + `${navigation.tests.length > 0 ? navigation.tests.map(formatTaskNavigationTarget).join(' · ') : 'unknown'}\n`,
  );
  process.stdout.write(`${COLORS.dim}IN${COLORS.reset} ${navigation.boundary.in || 'unknown'}\n`);
  process.stdout.write(`${COLORS.dim}OUT${COLORS.reset} ${navigation.boundary.out || 'unknown'}\n`);
  process.stdout.write(`${COLORS.dim}STATUS${COLORS.reset} ${result.status} · ${result.readiness.status} ${result.readiness.score}/100\n`);
  process.stdout.write(
    `${COLORS.dim}VALIDATION${COLORS.reset} ${result.validation.status} · `
    + `${result.validation.errorFiles} errors · ${result.validation.warningFiles} warnings · `
    + `${result.validation.driftCount} path drifts${result.validation.sourcePathsChecked ? '' : ' · source paths not checked'}\n`,
  );
  process.stdout.write(
    `${COLORS.dim}SOURCE${COLORS.reset} ${result.currentness.source.status}/${result.currentness.source.currentness}`
    + ` · gap ${compactGapLabel(result.currentness.source.topGap)}`
    + ` · next ${compactActionLabel(result.currentness.source.nextAction)}\n`,
  );
  process.stdout.write(
    `${COLORS.dim}MEANING${COLORS.reset} ${result.currentness.meaning.status}`
    + ` · gap ${compactGapLabel(result.currentness.meaning.topGap)}`
    + ` · next ${compactActionLabel(result.currentness.meaning.nextAction)}\n`,
  );
  const repair = result.meaningRepair;
  process.stdout.write(
    `${COLORS.dim}MEANING REPAIR${COLORS.reset} ${repair.status}`
    + `${repair.blockedBy ? ` · blocked ${repair.blockedBy}` : ''}`
    + `${repair.primaryQuestion ? ` · question ${repair.primaryQuestion}` : ''}`
    + ` · approval required · automatic write/finalize off\n`,
  );
  const repairCall = repair.firstStep?.calls?.[0] ?? repair.workflow?.[0]?.calls?.[0];
  if (repairCall) process.stdout.write(`${COLORS.dim}REPAIR READ${COLORS.reset} ${formatToolCall(repairCall)}\n`);
  if (repair.omitted?.steps.length > 0) {
    process.stdout.write(
      `${COLORS.dim}REPAIR OMITTED${COLORS.reset} ${omissionSummary(repair.omitted)}; read FULL DETAIL before step 2\n`,
    );
  }
  process.stdout.write(`${COLORS.dim}TASK MATCH${COLORS.reset} ${result.focus.capability?.slug ?? 'not recorded'}\n`);
  for (const anchor of result.focus.evidenceAnchors) {
    process.stdout.write(`  ${COLORS.dim}- ${anchor.slug}${anchor.path ? ` · ${anchor.path}` : ''} · ${anchor.sourceStatus}${COLORS.reset}\n`);
  }
  process.stdout.write(`${COLORS.dim}IMPACT${COLORS.reset} ${result.focus.impact.status} (${result.focus.impact.completeness})\n`);
  const verification = result.focus.verification;
  const runner = verification.runner && verification.manifest
    ? `${verification.runner} via ${verification.manifest}`
    : 'runner unknown';
  const verificationPaths = verification.recordedPaths.length > 0
    ? verification.recordedPaths.join(' · ')
    : 'tests unknown';
  process.stdout.write(
    `${COLORS.dim}VERIFY${COLORS.reset} ${verification.status} · ${runner} · ${verificationPaths}\n`,
  );
  if (result.focus.uncertainty) {
    process.stdout.write('Uncertainty scope: selected task documents; not_recorded means unknown.\n');
    for (const row of result.focus.uncertainty.system) {
      process.stdout.write(`Unknown: ${JSON.stringify({ system: row.code, text: result.focus.unknowns[row.unknownIndex] })}\n`);
    }
    for (const row of result.focus.uncertainty.sources) {
      process.stdout.write(`Uncertainty: ${JSON.stringify(row.slug)} ${row.unknownIndexes.length}/${row.totalUnits} units; ${row.omittedUnits} omitted${row.status === 'not_recorded' ? '; not_recorded' : ''}.\n`);
      for (const index of row.unknownIndexes) {
        process.stdout.write(`Unknown: ${JSON.stringify({ slug: row.slug, text: result.focus.unknowns[index] })}\n`);
      }
    }
    process.stdout.write('Recovery: require ok:true and bodyInfo.truncated:false; otherwise unknown.\n');
  } else if (result.focus.unknowns.length > 0) {
    process.stdout.write(`${COLORS.dim}UNKNOWNS${COLORS.reset}\n`);
    for (const unknown of result.focus.unknowns) process.stdout.write(`  ${COLORS.dim}- ${unknown}${COLORS.reset}\n`);
  }
  process.stdout.write(`${COLORS.dim}NEXT READ${COLORS.reset} ${formatToolCall(result.nextReads[0])}\n`);
  process.stdout.write(`${COLORS.dim}FULL DETAIL${COLORS.reset} ${formatToolCall(result.fullDetail)}\n`);
}

function formatTaskNavigationTarget(target) {
  return target
    ? `${target.path}#${target.symbol}:${target.line}${target.endLine === target.line ? '' : `-${target.endLine}`}`
    : 'unknown';
}

function omissionSummary({ steps, stopConditions }) {
  return `steps 2-${steps.length + 1} (${steps[0]} to ${steps.at(-1)}) and ${stopConditions} stop conditions`;
}

function compactGapLabel(gap) {
  if (!gap?.id) return 'none';
  return `${gap.id}${gap.questionId ? `:${gap.questionId}` : ''}${gap.nodeSlug ? `:${gap.nodeSlug}` : ''}`;
}

function compactActionLabel(action) {
  if (!action?.id) return 'none';
  return `${action.id}${action.target ? `:${action.target}` : ''}`;
}

export function render(result) {
  const status = result.status;
  const readiness = result.readiness;
  const graph = result.graph ?? {};
  const sc = diagnosisStatusColor(status, COLORS);
  const rc = READINESS_COLORS[readiness.status] ?? COLORS.dim;
  process.stdout.write(
    `${COLORS.bold}agent brief${COLORS.reset} ${sc}${status}${COLORS.reset}` +
      ` ${COLORS.dim}· readiness ${rc}${readiness.status}${COLORS.reset}` +
      ` ${COLORS.dim}${readiness.score}/100 · ${graph.nodes ?? 0} nodes · ${graph.edges ?? 0} relations` +
      ` · ${readiness.healthChecks} health checks${COLORS.reset}\n\n`,
  );

  const projectSourceLines = formatProjectSourceSummary(result.projectSource, result.projectSourceRemedy);
  if (projectSourceLines.length > 0) {
    process.stdout.write(`${COLORS.dim}PROJECT SOURCE${COLORS.reset} ${COLORS.dim}(receipt v${result.projectSource.contractVersion} · ${result.projectSlug})${COLORS.reset}\n`);
    for (const line of projectSourceLines) {
      process.stdout.write(`  ${COLORS.dim}${line}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');
  }

  const meaningLines = formatMeaningAssessmentSummary(result.meaningAssessment);
  if (meaningLines.length > 0) {
    process.stdout.write(`${COLORS.dim}PROJECT MEANING${COLORS.reset} ${COLORS.dim}(${result.meaningAssessment.contract} · categorical, no score)${COLORS.reset}\n`);
    for (const line of meaningLines) {
      process.stdout.write(`  ${COLORS.dim}${line}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');
  }

  if (typeof result.handoffPrompt === 'string' && result.handoffPrompt.trim()) {
    process.stdout.write(
      `${COLORS.dim}HANDOFF PROMPT${COLORS.reset} ${COLORS.dim}available in --json as .handoffPrompt for Claude Code/Codex paste-in setup${COLORS.reset}\n\n`,
    );
  }

  const modeRows = modeComparisonRows(result);
  if (modeRows.length > 0) {
    process.stdout.write(`${COLORS.dim}MODE GUIDE${COLORS.reset} ${COLORS.dim}(CLI-only / MCP-connected / Graph DB pack / setup gate)${COLORS.reset}\n`);
    for (const row of modeRows) {
      process.stdout.write(
        `  ${COLORS.bold}${row.label.padEnd(14)}${COLORS.reset}` +
          ` ${COLORS.dim}${row.gives}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  const entrypoints = Array.isArray(result.entrypoints) ? result.entrypoints : [];
  if (entrypoints.length > 0) {
    process.stdout.write(`${COLORS.dim}ENTRYPOINTS${COLORS.reset} ${COLORS.dim}(highly connected nodes an agent should read first)${COLORS.reset}\n`);
    for (let i = 0; i < Math.min(entrypoints.length, 5); i += 1) {
      const node = entrypoints[i];
      const kc = KIND_COLORS[node.kind] || COLORS.dim;
      const titleText = node.title && node.title !== node.slug ? ` ${COLORS.dim}· ${node.title}${COLORS.reset}` : '';
      process.stdout.write(
        `  ${String(i + 1).padStart(2)} ${kc}${node.slug.padEnd(48)}${COLORS.reset}` +
          `${titleText} ${COLORS.dim}deg ${node.degree}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  process.stdout.write(`${COLORS.dim}FIRST MCP CALLS${COLORS.reset}\n`);
  for (const call of result.firstCalls) {
    process.stdout.write(`  ${COLORS.cyan}${formatToolCall(call)}${COLORS.reset}\n`);
  }
  process.stdout.write('\n');

  const cliFallbackCommands = Array.isArray(result.cliFallbackCommands) ? result.cliFallbackCommands : [];
  if (cliFallbackCommands.length > 0) {
    process.stdout.write(`${COLORS.dim}CLI FALLBACKS${COLORS.reset} ${COLORS.dim}(MCP connector unavailable)${COLORS.reset}\n`);
    for (const command of cliFallbackCommands) {
      process.stdout.write(`  ${COLORS.cyan}${command}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');
  }

  const graphDbQueryPack = Array.isArray(result.graphDbQueryPack) ? result.graphDbQueryPack : [];
  if (graphDbQueryPack.length > 0) {
    process.stdout.write(`${COLORS.dim}GRAPH DB QUERY PACK${COLORS.reset} ${COLORS.dim}(MCP + CLI fallback)${COLORS.reset}\n`);
    for (const item of graphDbQueryPack) {
      const calls = item.calls.map((call) => formatToolCall(call)).join(' → ');
      process.stdout.write(`  ${COLORS.bold}${item.id}${COLORS.reset} ${COLORS.dim}${item.intent}${COLORS.reset}\n`);
      process.stdout.write(`     ${COLORS.dim}${item.goal}${COLORS.reset}\n`);
      process.stdout.write(`     ${COLORS.cyan}${calls}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');
  }

  process.stdout.write(`${COLORS.dim}PLAYBOOKS${COLORS.reset}\n`);
  for (const playbook of result.playbooks) {
    const calls = playbook.calls.map((call) => call.arguments.operation).join(' → ');
    process.stdout.write(`  ${COLORS.bold}${playbook.id}${COLORS.reset} ${COLORS.dim}${calls}${COLORS.reset}\n`);
    process.stdout.write(`     ${COLORS.dim}${playbook.goal}${COLORS.reset}\n`);
    renderChecklist('evidence', playbook.evidence, COLORS.green);
    renderChecklist('stop if', playbook.stopWhen, COLORS.yellow);
  }
  process.stdout.write('\n');

  if (Array.isArray(result.traversalStrategy) && result.traversalStrategy.length > 0) {
    process.stdout.write(`${COLORS.dim}TRAVERSAL STRATEGY${COLORS.reset}\n`);
    for (const strategy of result.traversalStrategy) {
      const calls = strategy.calls.map((call) => formatToolCall(call)).join(' → ');
      process.stdout.write(
        `  ${COLORS.bold}${String(strategy.id).padEnd(24)}${COLORS.reset}` +
          ` ${COLORS.dim}${strategy.priority} · ${strategy.goal}${COLORS.reset}\n`,
      );
      process.stdout.write(`     ${COLORS.dim}when: ${strategy.useWhen}${COLORS.reset}\n`);
      process.stdout.write(`     ${COLORS.cyan}${calls}${COLORS.reset}\n`);
      renderChecklist('evidence', strategy.evidence, COLORS.green);
      renderChecklist('stop if', strategy.stopWhen, COLORS.yellow);
    }
    process.stdout.write('\n');
  }

  if (Array.isArray(result.writeGuardrails) && result.writeGuardrails.length > 0) {
    process.stdout.write(`${COLORS.dim}WRITE GUARDRAILS${COLORS.reset}\n`);
    for (const guardrail of result.writeGuardrails) {
      const calls = guardrail.calls.map((call) => formatToolCall(call)).join(' → ');
      process.stdout.write(`  ${COLORS.bold}${guardrail.id}${COLORS.reset} ${COLORS.dim}${calls}${COLORS.reset}\n`);
      process.stdout.write(`     ${COLORS.dim}${guardrail.goal}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');
  }

  if (Array.isArray(result.relationDecisionGuide) && result.relationDecisionGuide.length > 0) {
    process.stdout.write(`${COLORS.dim}RELATION DECISION GUIDE${COLORS.reset}\n`);
    for (const row of result.relationDecisionGuide) {
      const color = row.severity === 'warn' ? COLORS.yellow : COLORS.dim;
      process.stdout.write(
        `  ${color}${row.decision.padEnd(18)}${COLORS.reset} ${COLORS.dim}${row.meaning}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  if (Array.isArray(result.resultContracts) && result.resultContracts.length > 0) {
    process.stdout.write(`${COLORS.dim}RESULT CONTRACTS${COLORS.reset}\n`);
    for (const contract of result.resultContracts) {
      const fields = Array.isArray(contract.mustReport) ? contract.mustReport.join(', ') : '';
      process.stdout.write(
        `  ${COLORS.cyan}${String(contract.operation).padEnd(14)}${COLORS.reset}` +
          ` ${COLORS.dim}report ${fields}; ${contract.policy}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  const checks = Array.isArray(result.health?.checks) ? result.health.checks : [];
  if (checks.length > 0) {
    const summary = checks.map((check) => `${check.id}:${check.status}:${check.count}`).join(', ');
    process.stdout.write(`${COLORS.dim}HEALTH CHECKS${COLORS.reset} ${COLORS.dim}${summary}${COLORS.reset}\n`);
  }

  const next = Array.isArray(result.nextActions) ? result.nextActions : [];
  if (next.length > 0) {
    process.stdout.write(`${COLORS.dim}NEXT ACTIONS${COLORS.reset} ${COLORS.dim}${next.map((action) => `${action.id}:${action.severity}`).join(', ')}${COLORS.reset}\n`);
  }

  process.stdout.write(`${COLORS.dim}WRITE POLICY${COLORS.reset}\n`);
  for (const policy of result.writePolicy) {
    process.stdout.write(`  ${COLORS.dim}- ${policy}${COLORS.reset}\n`);
  }
}

export function formatProjectSourceSummary(projectSource, remedy = null) {
  if (!projectSource || typeof projectSource !== 'object') return [];
  const gap = projectSource.topGap?.id
    ? `${projectSource.topGap.id}${projectSource.topGap.nodeSlug ? `:${projectSource.topGap.nodeSlug}` : ''}`
    : 'none';
  const action = projectSource.nextAction?.id
    ? `${projectSource.nextAction.id}${projectSource.nextAction.target ? `:${projectSource.nextAction.target}` : ''}`
    : 'none';
  const lines = [
    `status       ${projectSource.status} (${projectSource.currentness})`,
    `measuredAt   ${projectSource.measuredAt ?? 'not measured'}`,
    `topGap       ${gap}`,
    `nextAction   ${action}`,
  ];
  if (remedy?.resolvable && remedy.cli?.command) {
    lines.push(`run          ${cliInvocation()} ${remedy.cli.command} ${(remedy.cli.args ?? []).join(' ')}`.trimEnd());
  }
  return lines;
}

export function formatMeaningAssessmentSummary(assessment) {
  if (!assessment || typeof assessment !== 'object') return [];
  const structure = assessment.dimensions?.structure?.status ?? 'invalid';
  const competency = assessment.dimensions?.competency?.status ?? 'needs_evidence';
  const sourceStatus = assessment.dimensions?.source?.status ?? 'invalid';
  const sourceCurrentness = assessment.dimensions?.source?.currentness ?? 'unavailable';
  const gap = assessment.topGap?.id
    ? `${assessment.topGap.dimension ?? 'assessment'}:${assessment.topGap.id}`
    : 'none';
  const action = assessment.nextAction?.id
    ? `${assessment.nextAction.id}${assessment.nextAction.target ? `:${assessment.nextAction.target}` : ''}`
    : 'none';
  return [
    `status       ${assessment.status}`,
    `dimensions   structure:${structure} · competency:${competency} · source:${sourceStatus}/${sourceCurrentness}`,
    `topGap       ${gap}`,
    `nextAction   ${action}`,
  ];
}

function renderChecklist(label, items, color) {
  if (!Array.isArray(items) || items.length === 0) return;
  process.stdout.write(`     ${color}${label}:${COLORS.reset} ${COLORS.dim}${items[0]}${COLORS.reset}\n`);
  for (const item of items.slice(1)) {
    process.stdout.write(`       ${COLORS.dim}- ${item}${COLORS.reset}\n`);
  }
}

function formatToolCall(call) {
  return `${call.tool}(${JSON.stringify(call.arguments)})`;
}
