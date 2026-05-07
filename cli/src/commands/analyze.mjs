// R16 (b3) — `oh-my-ontology analyze [rootPath]`
// Wraps MCP analyze_repo_structure. side effect 0 — vault 변경 안 함, 후보만.
// 사용자가 결과 보고 *명시적으로* `oh-my-ontology add` 또는 AI agent 의
// add_concept 로 진입.

import { resolve } from 'node:path';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { getVaultCensus, writeVaultCensus } from '../lib/vault-census.mjs';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

const KIND_COLOR = {
  project: COLORS.magenta,
  domain: COLORS.blue,
  capability: COLORS.cyan,
  element: COLORS.green,
};

export async function runAnalyze(args) {
  const { rootPath, vault, json, maxDepth, apply, error } = parseArgs(args);
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 1;
  }

  const target = resolve(process.cwd(), rootPath);
  // analyze 는 *vault 와 무관* 한 도구지만 mcp 통과 시 OMOT_VAULT 가 필요해서
  // 그냥 cwd 또는 사용자 지정. mcp 의 analyze 도 vault 안 만지지만
  // initialization 흐름에 vault path 가 필요. --apply 모드는 vault 에
  // 실제로 쓰므로 vault 위치 정확히 지정 필요.
  const vaultRoot = resolve(process.cwd(), vault);
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'analyze_repo_structure', {
      rootPath: target,
      maxDepth,
    });
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  // --apply 분기 — 후보를 vault 에 batch land. mcp 의 add_concepts +
  // add_relations 호출. partial result OK (이미 존재하는 노드는 ok:false 로
  // skip). agent-less 워크플로 (CI · plain CLI) 가 /ontology-bootstrap skill
  // 의 K round-trip 을 우회.
  if (apply) {
    return await runApply(vaultRoot, result, json);
  }

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }

  const proj = result.project;
  const fw = result.framework ?? 'generic';
  process.stdout.write(
    `${COLORS.bold}analyze${COLORS.reset} ${COLORS.dim}${target}${COLORS.reset} ` +
      `${COLORS.dim}(framework=${fw})${COLORS.reset}\n\n`,
  );

  if (proj) {
    process.stdout.write(
      `  ${KIND_COLOR.project}project${COLORS.reset}     ${proj.slug} ${COLORS.dim}— ${proj.title}${COLORS.reset}\n\n`,
    );
  }

  printSection('domains', result.domains ?? [], COLORS, KIND_COLOR.domain);
  printSection(
    'capabilities',
    result.capabilities ?? [],
    COLORS,
    KIND_COLOR.capability,
  );
  printSection('elements', result.elements ?? [], COLORS, KIND_COLOR.element);

  const rels = result.suggestedRelations ?? [];
  if (rels.length > 0) {
    process.stdout.write(
      `  ${COLORS.bold}suggested relations${COLORS.reset} ${COLORS.dim}(${rels.length})${COLORS.reset}\n`,
    );
    for (const r of rels.slice(0, 8)) {
      process.stdout.write(
        `    ${COLORS.dim}${r.from} —${r.type}→ ${r.to}${COLORS.reset}\n`,
      );
    }
    if (rels.length > 8)
      process.stdout.write(
        `    ${COLORS.dim}… ${rels.length - 8} more${COLORS.reset}\n`,
      );
    process.stdout.write('\n');
  }

  process.stdout.write(
    `${COLORS.dim}side effect 0 — vault 변경 안 함. 후보가 맞으면${COLORS.reset} ` +
      `${COLORS.bold}oh-my-ontology add${COLORS.reset} ` +
      `${COLORS.dim}또는 AI agent 의 add_concept 로 명시 작성.${COLORS.reset}\n`,
  );
  return 0;
}

function printSection(label, items, colors, kindColor) {
  if (items.length === 0) return;
  process.stdout.write(
    `  ${colors.bold}${label}${colors.reset} ${colors.dim}(${items.length})${colors.reset}\n`,
  );
  for (const it of items.slice(0, 12)) {
    const ev = it.evidence?.source ? `${colors.dim} ← ${it.evidence.source}${colors.reset}` : '';
    process.stdout.write(
      `    ${kindColor}${(it.slug || '').padEnd(36)}${colors.reset} ${it.title || ''}${ev}\n`,
    );
  }
  if (items.length > 12)
    process.stdout.write(
      `    ${colors.dim}… ${items.length - 12} more${colors.reset}\n`,
    );
  process.stdout.write('\n');
}

function parseArgs(args) {
  const flags = { vault: '.', json: false, apply: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = args[++i] || '.';
    else if (a.startsWith('--vault=')) flags.vault = a.slice('--vault='.length);
    else if (a === '--json') flags.json = true;
    else if (a === '--apply') flags.apply = true;
    else if (a === '--max-depth')
      flags.maxDepth = Number(args[++i]) || undefined;
    else if (a.startsWith('--max-depth='))
      flags.maxDepth = Number(a.slice('--max-depth='.length)) || undefined;
    else if (a.startsWith('--')) return { error: `unknown flag: ${a}` };
    else positional.push(a);
  }
  return {
    rootPath: positional[0] ?? '.',
    vault: flags.vault,
    json: flags.json,
    apply: flags.apply,
    maxDepth: flags.maxDepth,
  };
}

// R+ — analyze 결과를 vault 에 land. add_concepts + add_relations 배치 호출.
// /ontology-bootstrap skill 의 CLI 짝 — agent-less 흐름 (CI / plain shell)
// 도 1줄로 vault 부트스트랩.
async function runApply(vaultRoot, result, json) {
  // concepts[] 조립 — project 먼저 (capability 의 domain reference 가 의미
  // 가 있으려면 domain 이 먼저 와야 하고, 그 전에 project 가). add_concepts
  // 는 cap 50 이라 여기 한 번에 land 가능한 수준이 아니면 chunk 가 필요
  // 하지만 analyze 의 current heuristic 은 보통 30 이하라 하나로 충분.
  const concepts = [];
  if (result.project) {
    concepts.push({
      slug: result.project.slug,
      kind: 'project',
      title: result.project.title,
    });
  }
  for (const d of result.domains ?? []) {
    concepts.push({ slug: d.slug, kind: 'domain', title: d.title });
  }
  for (const c of result.capabilities ?? []) {
    concepts.push({
      slug: c.slug,
      kind: 'capability',
      title: c.title,
      ...(c.domain ? { domain: c.domain } : {}),
    });
  }
  for (const e of result.elements ?? []) {
    concepts.push({
      slug: e.slug,
      kind: 'element',
      title: e.title,
      ...(e.domain ? { domain: e.domain } : {}),
    });
  }

  let conceptsResult;
  try {
    conceptsResult = await callBatch(vaultRoot, 'add_concepts', { concepts });
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  add_concepts: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  const relations = result.suggestedRelations ?? [];
  let relationsResult = { concepts: [] };
  if (relations.length > 0) {
    try {
      relationsResult = await callBatch(vaultRoot, 'add_relations', {
        relations,
      });
    } catch (err) {
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  add_relations: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
  }

  // mcp 응답 shape — add_concepts 는 { concepts: [...] }, add_relations 는
  // { relations: [...] }. 두 도구가 다른 키.
  const conceptRows = conceptsResult.concepts ?? [];
  const relationRows = relationsResult.relations ?? [];

  const summary = summarize(conceptRows, relationRows);
  // R+ — apply 흐름 마무리 census (cycle 38, shared helper).
  const vaultCensus = await getVaultCensus(vaultRoot);

  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          rootPath: result.rootPath,
          framework: result.framework,
          applied: { concepts: conceptRows, relations: relationRows },
          summary,
          vaultCensus,
        },
        null,
        2,
      ) + '\n',
    );
    return summary.errors === 0 ? 0 : 1;
  }

  process.stdout.write(
    `${COLORS.bold}analyze --apply${COLORS.reset} ${COLORS.dim}vault=${vaultRoot}${COLORS.reset}\n\n`,
  );
  process.stdout.write(
    `  ${COLORS.bold}concepts${COLORS.reset}   ${COLORS.green}${summary.conceptsLanded}${COLORS.reset} landed · ` +
      `${COLORS.dim}${summary.conceptsExisting}${COLORS.reset} already existed · ` +
      `${summary.conceptsErrors > 0 ? COLORS.red : COLORS.dim}${summary.conceptsErrors}${COLORS.reset} errors\n`,
  );
  process.stdout.write(
    `  ${COLORS.bold}relations${COLORS.reset}  ${COLORS.green}${summary.relationsLanded}${COLORS.reset} landed · ` +
      `${COLORS.dim}${summary.relationsExisting}${COLORS.reset} already existed · ` +
      `${summary.relationsErrors > 0 ? COLORS.red : COLORS.dim}${summary.relationsErrors}${COLORS.reset} errors\n\n`,
  );
  // 에러 행만 사용자에게 노출 (성공/idempotent 는 noise).
  for (const row of conceptRows) {
    if (row.ok === false) {
      process.stdout.write(
        `  ${COLORS.red}✗${COLORS.reset} ${row.slug} ${COLORS.dim}— ${row.error}${COLORS.reset}\n`,
      );
    }
  }
  for (const row of relationRows) {
    if (row.ok === false) {
      process.stdout.write(
        `  ${COLORS.red}✗${COLORS.reset} ${row.from} —${row.type}→ ${row.to} ${COLORS.dim}— ${row.error}${COLORS.reset}\n`,
      );
    }
  }
  writeVaultCensus(vaultCensus);
  return summary.errors === 0 ? 0 : 1;
}

function summarize(conceptRows, relationRows) {
  let conceptsLanded = 0;
  let conceptsExisting = 0;
  let conceptsErrors = 0;
  for (const r of conceptRows) {
    if (r.ok === true) conceptsLanded += 1;
    else if (/already exists/i.test(r.error || '')) conceptsExisting += 1;
    else conceptsErrors += 1;
  }
  let relationsLanded = 0;
  let relationsExisting = 0;
  let relationsErrors = 0;
  for (const r of relationRows) {
    if (r.ok === true && r.alreadyExists) relationsExisting += 1;
    else if (r.ok === true) relationsLanded += 1;
    else relationsErrors += 1;
  }
  return {
    conceptsLanded,
    conceptsExisting,
    conceptsErrors,
    relationsLanded,
    relationsExisting,
    relationsErrors,
    errors: conceptsErrors + relationsErrors,
  };
}

// callMcpTool 의 1차 wrapper 가 mcp 호출의 result.content[0].text 를 JSON.parse
// 해서 그대로 반환 — 우리도 그 shape 가정.
async function callBatch(vaultRoot, name, args) {
  return callMcpTool(vaultRoot, name, args);
}

function printUsage() {
  process.stderr.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology analyze [rootPath] [--vault path] [--apply] [--json] [--max-depth N]\n\n` +
      `${COLORS.bold}What it does:${COLORS.reset}\n` +
      `  Walk a code repository (default: cwd), detect package.json / README\n` +
      `  H2 sections / src/ folders, propose ontology node candidates.\n` +
      `  Default: ${COLORS.bold}side effect 0${COLORS.reset} — vault 변경 안 함, 후보만 출력.\n` +
      `  ${COLORS.bold}--apply${COLORS.reset}: 후보를 vault 에 batch land (add_concepts + add_relations).\n` +
      `  partial result — 이미 존재하는 노드는 skip, 새 노드만 land.\n\n` +
      `${COLORS.bold}Examples:${COLORS.reset}\n` +
      `  oh-my-ontology analyze                 # preview only (no writes)\n` +
      `  oh-my-ontology analyze ~/my-app --json # machine output\n` +
      `  oh-my-ontology analyze --apply         # bootstrap vault from cwd\n`,
  );
}
