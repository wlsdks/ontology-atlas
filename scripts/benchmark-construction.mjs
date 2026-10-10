#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVaultDocs } from '../mcp/src/vault/documents.mjs';
import { compileOntology } from '../mcp/src/ontology-compiler.mjs';
import { detectVaultPathDrift } from '../mcp/src/detect-drift.mjs';
import { validateVaultDocument } from '../mcp/src/validate.mjs';
import { READ_TOOL_NAMES } from '../mcp/src/server/registry.mjs';

const bytes = (value) => value === undefined ? null : Buffer.byteLength(
  typeof value === 'string' ? value : JSON.stringify(value));
const ratio = (n, d) => d === 0 ? null : Number((n / d).toFixed(4));

export function acpToolCalls(events) {
  const calls = new Map();
  for (const event of events) {
    const row = event.params?.update;
    if (!row || !['tool_call', 'tool_call_update'].includes(row.sessionUpdate)) continue;
    if (typeof row.toolCallId !== 'string') throw new Error('ACP tool update missing id');
    const previous = calls.get(row.toolCallId) ?? { id: row.toolCallId, startedAt: event.at };
    const rawName = row._meta?.claudeCode?.toolName ?? row.name ?? previous.name ?? row.title ?? '';
    const name = rawName.replace(/^mcp__[\s\S]*?__/, '').replace(/^mcp\.[^.]+\./, '')
      .replace(/^.*?atlas-vault[/: ]+/, '');
    const next = { ...previous, name, status: row.status ?? previous.status ?? 'unknown' };
    if (row.rawInput !== undefined) next.args = row.rawInput;
    if (row.rawOutput !== undefined) next.output = row.rawOutput;
    if (['completed', 'failed'].includes(next.status)) next.endedAt = event.at;
    calls.set(row.toolCallId, next);
  }
  return [...calls.values()];
}

export function toolMetrics(calls) {
  const signatures = new Set(), byName = {};
  let repeatedReads = 0, failed = 0, incomplete = 0;
  for (const call of calls) {
    if (!call.name) throw new Error('Tool call missing name');
    byName[call.name] = (byName[call.name] ?? 0) + 1;
    if (['failed', 'error', 'args-invalid', 'unknown-tool'].includes(call.status)) failed++;
    if (!['completed', 'ok', 'blocked-write', 'failed', 'error', 'args-invalid', 'unknown-tool'].includes(call.status)) incomplete++;
    if (READ_TOOL_NAMES.has(call.name)) {
      const signature = JSON.stringify([call.name, canonicalObject(call.args ?? {})]);
      if (signatures.has(signature)) repeatedReads++;
      signatures.add(signature);
    }
  }
  return { calls: calls.length, failed, incomplete, repeatedReads,
    errorRate: ratio(failed, calls.length), byName,
    resultBytes: calls.some((call) => call.output !== undefined)
      ? calls.reduce((sum, call) => sum + (bytes(call.output) ?? 0), 0) : null };
}

function canonicalObject(value) {
  if (Array.isArray(value)) return value.map(canonicalObject);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalObject(value[key])]));
  return value;
}

export function qualityMetrics(quality) {
  if (!quality) return { status: 'not_measured' };
  if (!Array.isArray(quality.questions) || !Array.isArray(quality.claims)) {
    throw new Error('Quality needs question verdicts and an audited atomic claim ledger');
  }
  const statuses = ['answered', 'partial', 'unknown', 'incorrect'];
  const counts = Object.fromEntries(statuses.map((status) => [status, 0]));
  const ids = new Set();
  for (const q of quality.questions) {
    if (!q.id || ids.has(q.id) || !statuses.includes(q.verdict)) throw new Error('Invalid question verdict');
    ids.add(q.id); counts[q.verdict]++;
  }
  const claimIds = new Set();
  for (const claim of quality.claims) {
    if (!claim.id || claimIds.has(claim.id) || !claim.statement ||
      !['verified', 'failed', 'unknown'].includes(claim.verdict)) throw new Error('Invalid claim ledger');
    if (claim.verdict === 'verified' && !claim.sourceRef) throw new Error('Verified claim missing source reference');
    claimIds.add(claim.id);
  }
  const verified = quality.claims.filter((c) => c.verdict === 'verified').length;
  return { status: quality.questions.length && quality.claims.length ? 'reported_audit' : 'insufficient',
    isolation: quality.isolation ?? 'unknown', questions: { total: quality.questions.length, ...counts },
    answeredRate: ratio(counts.answered, quality.questions.length),
    claims: { total: quality.claims.length, verified,
      failed: quality.claims.filter((c) => c.verdict === 'failed').length,
      unknown: quality.claims.filter((c) => c.verdict === 'unknown').length },
    claimAccuracy: ratio(verified, quality.claims.length),
    unanswered: quality.questions.filter((q) => q.verdict !== 'answered'),
    failedClaims: quality.claims.filter((c) => c.verdict === 'failed') };
}

export function constructionReport(run) {
  if (!run.id || !run.model || !run.sourceRevision || !Number.isFinite(run.wallMs) || run.wallMs < 0) {
    throw new Error('Run needs id, model, sourceRevision and measured wallMs');
  }
  const calls = run.events ? acpToolCalls(readFileSync(run.events, 'utf8').trim().split('\n')
    .filter(Boolean).map((line) => JSON.parse(line))) : (run.toolCalls ?? []);
  const docs = loadVaultDocs(run.vaultRoot).filter((d) => d.frontmatter.kind);
  const authorable = docs.filter((d) => d.frontmatter.kind !== 'vault-readme');
  const graph = compileOntology(docs);
  const issues = authorable.flatMap((doc) => validateVaultDocument(doc.raw, { slug: doc.slug }).issues
    .map((issue) => ({ slug: doc.slug, ...issue })));
  const { drifts: drift } = detectVaultPathDrift({ docs: authorable, repoRoot: run.repoRoot });
  const declaredPaths = authorable.filter((d) => typeof d.frontmatter.path === 'string' &&
    d.frontmatter.path.trim().length > 0);
  const pathDrifts = drift.filter((d) => d.key === 'path');
  const metrics = toolMetrics(calls);
  const finalization = calls.filter((call) => call.name === 'finalize_project_meaning')
    .map((call) => toolPayload(call.output)).findLast((payload) => payload?.ok === true &&
      payload.contract === 'projectMeaningReceipt:v1' && typeof payload.bodyDigest === 'string');
  return { id: run.id, model: run.model, transport: run.transport, profile: run.profile ?? 'full',
    sourceRevision: run.sourceRevision, promptDigest: run.promptDigest ?? null,
    outcome: run.outcome ?? { status: 'not_reported', reason: null },
    wallMs: run.wallMs, costUsd: run.costUsd ?? null, tokens: run.tokens ?? null,
    toolInputBytes: run.toolInputBytes ?? null, tools: metrics,
    finalization: finalization ? { status: 'receipt_observed_in_trace',
      meaningStatusAtFinalization: finalization.meaningAssessment?.status ?? 'unknown' }
      : { status: 'not_observed', meaningStatusAtFinalization: 'unknown' },
    structure: { nodes: docs.length, authorableNodes: authorable.length, edges: graph.edges.length,
      byKind: Object.fromEntries([...new Set(docs.map((d) => d.frontmatter.kind))]
        .map((kind) => [kind, docs.filter((d) => d.frontmatter.kind === kind).length])),
      validationIssues: issues, graphIssues: graph.issues,
      declaredPathClaims: declaredPaths.length, missingPaths: drift,
      declaredPathAccuracy: ratio(declaredPaths.length - pathDrifts.length, declaredPaths.length) },
    quality: qualityMetrics(run.quality),
    limits: ['Static structure and declared path existence do not establish semantic qualification.',
      'Quality verdicts are supplied audit evidence, not a model-independent qualification receipt.',
      'Repeated reads may be necessary after a write; inspect the trace before calling them waste.'] };
}

function toolPayload(output) {
  if (typeof output === 'string') {
    try { return JSON.parse(output); } catch { return null; }
  }
  const result = output?.result ?? output;
  if (result?.structuredContent) return result.structuredContent;
  const text = result?.content?.find((row) => row.type === 'text')?.text;
  if (text) { try { return JSON.parse(text); } catch { return null; } }
  return result;
}

function runCli() {
  const input = process.argv[2];
  if (!input || input === '--help') {
    console.log('Usage: pnpm benchmark:construction <runs.json> [--json]\nRead-only report; runs is a nonempty array of construction run manifests. See docs/benchmark/CONSTRUCTION.md.');
    return;
  }
  const runs = JSON.parse(readFileSync(resolve(input), 'utf8'));
  if (!Array.isArray(runs) || runs.length === 0) throw new Error('Construction run inventory is empty');
  const rows = runs.map(constructionReport);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ version: 1, rows }, null, 2));
  else {
    console.log('| Run | Model | Profile | Outcome | Seconds | Calls / errors | Nodes / edges | Questions answered | Verified claims |');
    console.log('|---|---|---|---|---:|---:|---:|---:|---:|');
    for (const row of rows) {
      const q = row.quality;
      console.log(`| ${row.id} | ${row.model} | ${row.profile} | ${row.outcome.status} | ${(row.wallMs / 1000).toFixed(1)} | ${row.tools.calls} / ${row.tools.failed} | ${row.structure.authorableNodes} / ${row.structure.edges} | ${q.questions ? `${q.questions.answered}/${q.questions.total}` : 'not measured'} | ${q.claims ? `${q.claims.verified}/${q.claims.total}` : 'not measured'} |`);
    }
    console.log('\nDescriptive measurements; no aggregate quality grade or model ranking.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runCli(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
