#!/usr/bin/env node
// The ledger of a "map the rest" chain: one JSON line per request in <out>/ledger.jsonl, the stop
// rule the app applies between requests, and the closing table.
//
//   map-rest-ledger.mjs record <checkout> <target> <vault> <out> <request> <agent> <exit> <seconds> <commit> [transcript]
//   map-rest-ledger.mjs next <out> <max-requests>     prints "continue" or the stop reason
//   map-rest-ledger.mjs table <out>                   exit 1 on agentError or a damaged vault
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Abilities one request was measured to put on the map; the app's estimate is ceil(R / this). */
const ABILITIES_PER_REQUEST = 13;
/** The most abilities one request put on the map: a line gone after a larger count was lost, not finished. */
const ABILITIES_ONE_REQUEST_REACHES = 31;
/** The app sends at most this many requests per press, whatever the note says. */
const REQUESTS_AT_MOST = 100;
/** A survey of a large repository takes longer than call-tool's default 15 seconds. */
const VALIDATE_TIMEOUT_MS = 300_000;
// Line-anchored: the measure's line starts a line, a quoted copy of the note's line does not.
const SERVER_SUMMARY = /^Not mapped yet:\s*(\d+)\s+of\s+(\d+)\s+areas?,\s*(\d+)\s+of\s+(\d+)\s+abilities\b/im;
const LINE_CITE = /:L\d+/;

const importFrom = (checkout, file) => import(pathToFileURL(join(checkout, file)).href);
const ledgerPath = (out) => join(out, 'ledger.jsonl');
const snapshotPath = (out, request) => join(out, 'steps', `${request}.json`);

function readLedger(out) {
  if (!existsSync(ledgerPath(out))) return [];
  return readFileSync(ledgerPath(out), 'utf8').split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
}

/** The request number allowed by `min(2 × ceil(R / 13) + 2, 100)`, the app's stop for a run past its estimate. */
export function requestCeiling(uncoveredAtStart) {
  return Math.min(2 * Math.ceil(uncoveredAtStart / ABILITIES_PER_REQUEST) + 2, REQUESTS_AT_MOST);
}

/** Cost, turns, refusals and answer sizes from a Claude stream-json transcript. */
function claudeTranscript(text) {
  let result = null;
  const toolNames = new Map();
  const answers = [];
  for (const line of text.split('\n')) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'result') result = event;
    const content = event.message?.content;
    for (const block of Array.isArray(content) ? content : []) {
      if (block.type === 'tool_use') toolNames.set(block.id, String(block.name));
      if (block.type !== 'tool_result') continue;
      const body = typeof block.content === 'string'
        ? block.content
        : (Array.isArray(block.content) ? block.content : []).map((part) => part.text ?? '').join('');
      answers.push({ tool: toolNames.get(block.tool_use_id) ?? null, chars: body.length, refused: Boolean(block.is_error) });
    }
  }
  const foreign = [...toolNames.values()].filter((name) => !name.startsWith('mcp__atlas-vault__') && name !== 'ToolSearch');
  return {
    costUsd: result?.total_cost_usd ?? null,
    turns: result?.num_turns ?? null,
    resultError: result ? Boolean(result.is_error) : true,
    answers,
    foreign,
    tokens: null,
  };
}

/** The same from a `codex exec --json` transcript; Codex reports tokens, never cost or turns. */
function codexTranscript(text) {
  const answers = [];
  const foreign = [];
  let completed = false;
  let failed = false;
  let tokens = null;
  for (const line of text.split('\n')) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'turn.completed') { completed = true; tokens = event.usage ?? null; }
    if (event.type === 'turn.failed') failed = true;
    const item = event.type === 'item.completed' ? event.item : null;
    if (!item) continue;
    if (item.type === 'mcp_tool_call') {
      const content = item.result?.content ?? [];
      const body = (Array.isArray(content) ? content : []).map((part) => part.text ?? '').join('');
      answers.push({ tool: `${item.server}/${item.tool}`, chars: body.length, refused: item.status === 'failed' || Boolean(item.error) });
      if (item.server !== 'atlas-vault') foreign.push(`${item.server}/${item.tool}`);
    } else if (item.type === 'command_execution' || item.type === 'file_change' || item.type === 'web_search') {
      foreign.push(item.type);
    }
  }
  return { costUsd: null, turns: null, resultError: failed || !completed, answers, foreign, tokens };
}

function readTranscript(agent, file) {
  if (!file || !existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  return agent === 'codex' ? codexTranscript(text) : claudeTranscript(text);
}

/** Every concept by uid (slug when it has none), with what a later request must not take away. */
async function vaultSnapshot(checkout, target, vault) {
  const { loadVaultDocs } = await importFrom(checkout, 'mcp/src/vault/documents/document-cache.mjs');
  const { measureRules } = await importFrom(checkout, 'mcp/src/construction/build-depth/read-depth.mjs');
  const docs = loadVaultDocs(vault).filter((doc) => typeof doc.frontmatter?.kind === 'string');
  // No session reads: a cite counts when the cited lines exist and hold a condition.
  const uncited = new Set(measureRules(docs, null, target).uncited.map((row) => row.slug));
  const concepts = {};
  for (const doc of docs) {
    const kind = doc.frontmatter.kind.trim();
    const uid = typeof doc.frontmatter.uid === 'string' && doc.frontmatter.uid ? doc.frontmatter.uid : `slug:${doc.slug}`;
    concepts[uid] = {
      slug: doc.slug,
      kind,
      title: typeof doc.frontmatter.title === 'string' ? doc.frontmatter.title.trim() : '',
      citedRule: kind === 'capability' && !uncited.has(doc.slug) && LINE_CITE.test(doc.body ?? ''),
    };
  }
  return concepts;
}

function duplicateTitles(concepts) {
  const byTitle = new Map();
  for (const { title } of Object.values(concepts)) {
    const key = title.toLowerCase();
    if (key) byTitle.set(key, [...(byTitle.get(key) ?? []), title]);
  }
  return [...byTitle.values()].filter((titles) => titles.length > 1).map((titles) => titles[0]).sort();
}

async function serverReport(checkout, target, vault) {
  process.env.OATLAS_MCP_CALL_TIMEOUT_MS ??= String(VALIDATE_TIMEOUT_MS);
  const { callMcpTool } = await importFrom(checkout, 'mcp/scripts/call-tool.mjs');
  const report = await callMcpTool(vault, 'validate_vault', {}, { repoRoot: target });
  const summary = SERVER_SUMMARY.exec(String(report?.coverage ?? ''));
  return {
    figures: summary ? { uncovered: Number(summary[3]), total: Number(summary[4]) } : null,
    errorFiles: report?.summary?.errorFiles ?? null,
    warningFiles: report?.summary?.warningFiles ?? null,
  };
}

/** Both turns of a first build by acp-replay.sh, from its replay.json; null when it did not run. */
function firstBuildTotals(out) {
  const file = join(out, 'first-build', 'replay.json');
  if (!existsSync(file)) return null;
  const turns = Object.values(JSON.parse(readFileSync(file, 'utf8')).turns ?? {}).filter(Boolean);
  const sum = (key) => (turns.some((turn) => turn[key] != null) ? turns.reduce((total, turn) => total + (turn[key] ?? 0), 0) : null);
  return { costUsd: sum('total_cost_usd'), turns: sum('num_turns') };
}

const sameFigures = (left, right) => (left === null && right === null)
  || (left !== null && right !== null && left.uncovered === right.uncovered && left.total === right.total);

async function record([checkout, target, vault, out, requestText, agent, exitText, secondsText, vaultCommit, transcriptFile]) {
  const request = Number(requestText);
  const { noteFigures } = await importFrom(checkout, '.claude/skills/ontology-field-trial/scripts/map-area-request.mjs');
  const note = await noteFigures(checkout, vault);
  const server = await serverReport(checkout, target, vault);
  const concepts = await vaultSnapshot(checkout, target, vault);
  mkdirSync(join(out, 'steps'), { recursive: true });
  writeFileSync(snapshotPath(out, request), JSON.stringify(concepts));
  const previous = request > 0 && existsSync(snapshotPath(out, request - 1))
    ? JSON.parse(readFileSync(snapshotPath(out, request - 1), 'utf8'))
    : {};
  const transcript = readTranscript(agent, transcriptFile);
  const firstBuild = request === 0 ? firstBuildTotals(out) : null;
  const exitCode = Number(exitText);
  const count = (kind) => Object.values(concepts).filter((concept) => concept.kind === kind).length;
  const line = {
    request,
    agent,
    vaultCommit,
    seconds: Number(secondsText),
    costUsd: firstBuild?.costUsd ?? transcript?.costUsd ?? null,
    turns: firstBuild?.turns ?? transcript?.turns ?? null,
    tokens: transcript?.tokens ?? null,
    exitCode,
    // A chain started from a copied vault has no transcript for request 0, and no error.
    agentError: exitCode !== 0 || (transcript ? transcript.resultError : Boolean(transcriptFile)),
    note,
    server: server.figures,
    countsAgree: sameFigures(note, server.figures),
    capabilities: count('capability'),
    domains: count('domain'),
    elements: count('element'),
    deletedConcepts: Object.entries(previous)
      .filter(([uid]) => !(uid in concepts))
      .map(([uid, concept]) => ({ uid, slug: concept.slug })),
    lostCitedRules: Object.entries(previous)
      .filter(([uid, concept]) => concept.citedRule && concepts[uid] && !concepts[uid].citedRule)
      .map(([, concept]) => concept.slug),
    duplicateTitles: duplicateTitles(concepts),
    validateErrorFiles: server.errorFiles,
    validateWarningFiles: server.warningFiles,
    refusedCalls: transcript ? transcript.answers.filter((answer) => answer.refused).length : null,
    largestAnswerChars: transcript ? Math.max(0, ...transcript.answers.map((answer) => answer.chars)) : null,
    foreignCalls: transcript ? transcript.foreign : null,
    ...(request === 0 ? { requestCeiling: requestCeiling((note ?? server.figures)?.uncovered ?? 0) } : {}),
  };
  appendFileSync(ledgerPath(out), `${JSON.stringify(line)}\n`);
}

/** Why the chain stops before the next request, or null to send it. Pure over the ledger. */
export function stopReason(lines, maxRequests) {
  const last = lines.at(-1);
  if (last.agentError && last.request > 0) return 'agentError';
  const hadLine = lines.slice(0, -1).some((line) => line.note !== null);
  // Before any request a vault built before the summary line has none: the server's count stands in.
  if (last.note === null && last.request === 0 && (last.server?.uncovered ?? 0) > 0) return null;
  if (last.note === null) {
    if (!hadLine) return 'noProgress';
    // As the app reads it: a gone line is finished only when the last count read was one request's reach.
    const lastRead = lines.slice(0, -1).findLast((line) => line.note !== null).note;
    return lastRead.uncovered <= ABILITIES_ONE_REQUEST_REACHES ? 'finished' : 'lineLost';
  }
  if (last.note.uncovered === 0) return 'finished';
  const before = lines.at(-2);
  if (before && before.note !== null && last.note.uncovered >= before.note.uncovered) return 'noProgress';
  const ceiling = lines.find((line) => line.request === 0)?.requestCeiling ?? requestCeiling(last.note.uncovered);
  if (last.request + 1 > ceiling) return 'pastEstimate';
  if (last.request + 1 > maxRequests) return 'maxRequests';
  return null;
}

/** The server's count before the first request as `R/T`, for a vault that keeps no line yet. */
function measured([out]) {
  const first = readLedger(out).find((line) => line.request === 0);
  const figures = first?.server;
  process.stdout.write(figures ? `${figures.uncovered}/${figures.total}\n` : '\n');
}

function next([out, maxText]) {
  const lines = readLedger(out);
  const reason = stopReason(lines, Number(maxText));
  if (reason) {
    lines.at(-1).stopReason = reason;
    writeFileSync(ledgerPath(out), lines.map((line) => `${JSON.stringify(line)}\n`).join(''));
  }
  process.stdout.write(`${reason ?? 'continue'}\n`);
}

function table([out]) {
  const lines = readLedger(out);
  const figures = (value) => (value ? `${value.uncovered}/${value.total}` : '-');
  const cost = (value) => (value === null ? '?' : `$${value.toFixed(2)}`);
  const rows = [['req', 'secs', 'cost', 'turns', 'note R/T', 'server R/T', 'agree', 'cap/dom/el', 'deleted', 'lost rule', 'dup titles', 'val err/warn', 'refused', 'largest']];
  for (const line of lines) {
    rows.push([
      String(line.request), String(line.seconds), cost(line.costUsd), String(line.turns ?? '?'),
      figures(line.note), figures(line.server), line.countsAgree ? 'yes' : 'NO',
      `${line.capabilities}/${line.domains}/${line.elements}`,
      String(line.deletedConcepts.length), String(line.lostCitedRules.length), String(line.duplicateTitles.length),
      `${line.validateErrorFiles ?? '?'}/${line.validateWarningFiles ?? '?'}`,
      String(line.refusedCalls ?? '?'), String(line.largestAnswerChars ?? '?'),
    ]);
  }
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  for (const row of rows) console.log(`  ${row.map((cell, column) => cell.padEnd(widths[column])).join('  ')}`);
  const stop = lines.at(-1)?.stopReason ?? 'none';
  const total = lines.reduce((sum, line) => sum + (line.costUsd ?? 0), 0);
  const damaged = lines.some((line) => line.deletedConcepts.length > 0 || line.lostCitedRules.length > 0);
  const foreign = lines.flatMap((line) => line.foreignCalls ?? []);
  console.log('');
  console.log(`  stopped       ${stop} after ${lines.at(-1)?.request ?? 0} requests (ceiling ${lines[0]?.requestCeiling ?? '?'})`);
  console.log(`  reported cost $${total.toFixed(2)} (null where the agent reports none)`);
  console.log(`  damage        ${damaged ? 'a concept was deleted or a cited rule lost: see deletedConcepts and lostCitedRules' : 'none'}`);
  if (foreign.length > 0) console.log(`  foreign calls ${[...new Set(foreign)].join(', ')} (${foreign.length})`);
  console.log(`  ledger        ${ledgerPath(out)}`);
  console.log('');
  console.log('  Writes were pre-approved; this chain is not evidence that the permission card holds.');
  if (stop === 'agentError' || stop === 'none' || damaged) process.exitCode = 1;
}

async function main([command, ...args]) {
  if (command === 'record') return record(args);
  if (command === 'next') return next(args);
  if (command === 'table') return table(args);
  if (command === 'measured') return measured(args);
  process.stderr.write('usage: map-rest-ledger.mjs record|next|table ...\n');
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main(process.argv.slice(2));
