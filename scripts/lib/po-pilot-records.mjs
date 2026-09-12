import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { parsePoPilot } from './po-pilot.mjs';
import { readFrozenDocument } from './record-ledgers.mjs';

const RUN_DIR = 'docs/records/po-runs';
const UPDATE_DIR = 'docs/records/po-updates';
const POLICY_DIR = 'docs/records/po-policy';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const fail = (message) => { throw new Error(`[po-pilot-records] ${message}`); };
const cleanCell = (value, label) => {
  if (typeof value !== 'string' || value.length === 0 || /[|\r\n]/.test(value)) fail(`${label} must be a non-empty single table cell`);
  return value;
};
const id = (value, label) => {
  if (typeof value !== 'string' || !UUID.test(value)) fail(`${label} must be UUIDv4`);
  return value.toLowerCase();
};
const instant = (value, label) => {
  if (typeof value !== 'string' || !INSTANT.test(value) || Number.isNaN(Date.parse(value))) fail(`${label} must be an ISO instant`);
  return value;
};
const object = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
};

function fragments(root, directory, schema) {
  const absolute = join(root, directory);
  let names;
  try { names = readdirSync(absolute).filter((name) => name.endsWith('.json')).sort(); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return names.map((name) => {
    const path = join(absolute, name);
    let value;
    try { value = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { fail(`${directory}/${name} is not valid JSON: ${error.message}`); }
    object(value, `${directory}/${name}`);
    if (value.schema !== schema) fail(`${directory}/${name} schema must be ${schema}`);
    id(value.id, `${directory}/${name} id`);
    instant(value.recordedAt, `${directory}/${name} recordedAt`);
    return { ...value, id: value.id.toLowerCase(), path: `${directory}/${name}` };
  });
}

const list = (value, label) => {
  if (!Array.isArray(value) || value.length === 0) fail(`${label} must be a non-empty array`);
  return value.map((entry, index) => cleanCell(entry, `${label}[${index}]`));
};
const boundaries = (value, label) => Object.entries(object(value, label)).map(([name, state]) => `${cleanCell(name, label)}=${cleanCell(state, label)}`).join(';');
const updateRow = (update) => `| ${update.runId} | ${cleanCell(update.date, 'update date')} | ${cleanCell(update.proof, 'update proof')} | ${cleanCell(update.ownerClear, 'update ownerClear')} | ${cleanCell(update.boundaryMiss, 'update boundaryMiss')} | ${cleanCell(update.laterResult, 'update laterResult')} |`;
const runRow = (run) => `| ${run.id} | ${cleanCell(run.date, 'run date')} | ${cleanCell(run.decision, 'run decision')} | ${cleanCell(run.door, 'run door')} | ${cleanCell(run.route, 'run route')} | ${cleanCell(run.outcome, 'run outcome')} | ${list(run.changes, 'run changes').join('+')} | ${boundaries(run.boundaries, 'run boundaries')} | ${cleanCell(run.risk, 'run risk')} | ${run.firstTurns} | ${run.rebuttalTurns} | ${cleanCell(run.delta, 'run delta')} | ${run.uniqueContributors?.length ? list(run.uniqueContributors, 'run uniqueContributors').join('+') : 'none'} |`;

function appendRows(source, heading, rows) {
  if (rows.length === 0) return source;
  const start = source.indexOf(heading);
  if (start < 0) fail(`legacy source is missing ${heading}`);
  const next = source.indexOf('\n## ', start + heading.length);
  const at = next < 0 ? source.length : next;
  return `${source.slice(0, at).replace(/\s*$/, '')}\n${rows.join('\n')}\n${source.slice(at)}`;
}

export function loadPoPilotRecords({ root = process.cwd(), relativePath = 'docs/PO-PILOT.md' } = {}) {
  const legacy = readFrozenDocument(relativePath, { root });
  const runs = fragments(root, RUN_DIR, 'po-pilot-run/v1');
  const updates = fragments(root, UPDATE_DIR, 'po-pilot-update/v1');
  const policies = fragments(root, POLICY_DIR, 'po-pilot-policy/v1');
  const allIds = new Set();
  for (const record of [...runs, ...updates, ...policies]) {
    if (allIds.has(record.id)) fail(`duplicate record id ${record.id}`);
    allIds.add(record.id);
  }
  runs.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
  updates.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
  policies.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
  const initialUpdates = runs.map((run) => {
    object(run.initialUpdate, `run ${run.id} initialUpdate`);
    return { ...run.initialUpdate, runId: run.id, recordedAt: run.recordedAt, id: `${run.id}:initial` };
  });
  const seenUpdateInstant = new Map();
  for (const update of [...initialUpdates, ...updates]) {
    const key = `${update.runId}\0${update.recordedAt}`;
    const prior = seenUpdateInstant.get(key);
    const state = JSON.stringify([update.date, update.proof, update.ownerClear, update.boundaryMiss, update.laterResult]);
    if (prior && prior !== state) fail(`ambiguous updates for run ${update.runId} at ${update.recordedAt}`);
    seenUpdateInstant.set(key, state);
  }
  const seenPolicyInstant = new Map();
  for (const policy of policies) {
    const prior = seenPolicyInstant.get(policy.recordedAt);
    if (prior && prior !== policy.outcome) fail(`ambiguous policy outcomes at ${policy.recordedAt}`);
    seenPolicyInstant.set(policy.recordedAt, policy.outcome);
  }
  let content = appendRows(legacy, '## Structured runs', runs.map(runRow));
  content = appendRows(content, '## Outcome updates', [...initialUpdates, ...updates].map(updateRow));
  if (policies.length > 0) {
    const outcome = cleanCell(policies.at(-1).outcome, 'policy outcome');
    content = content.replace(/^outcome: .*$/m, `outcome: ${outcome}`);
  }
  const pilot = parsePoPilot(content);
  const inputs = [relativePath, ...runs.map((x) => x.path), ...updates.map((x) => x.path), ...policies.map((x) => x.path)];
  try { readFileSync(join(root, 'docs/records/legacy.json')); inputs.push('docs/records/legacy.json'); } catch {}
  return { pilot, content, inputs };
}

export function readPoPilotSource(relativePath, { root = process.cwd() } = {}) {
  if (relativePath !== 'docs/PO-PILOT.md') return null;
  const loaded = loadPoPilotRecords({ root, relativePath });
  return { content: loaded.content, inputs: loaded.inputs };
}

function preflight(type, record, root) {
  if (!readable(join(root, 'docs/PO-PILOT.md'))) return;
  const loaded = loadPoPilotRecords({ root });
  let content = loaded.content;
  if (type === 'run') {
    content = appendRows(content, '## Structured runs', [runRow(record)]);
    content = appendRows(content, '## Outcome updates', [updateRow({ ...record.initialUpdate, runId: record.id })]);
  } else if (type === 'update') {
    content = appendRows(content, '## Outcome updates', [updateRow(record)]);
  } else {
    content = content.replace(/^outcome: .*$/m, `outcome: ${record.outcome}`);
  }
  parsePoPilot(content);
}

function readable(path) {
  try { readFileSync(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export function writePoPilotFragment(type, input, { root = process.cwd(), now = () => new Date().toISOString(), uuid = randomUUID } = {}) {
  const config = {
    run: [RUN_DIR, 'po-pilot-run/v1'],
    update: [UPDATE_DIR, 'po-pilot-update/v1'],
    policy: [POLICY_DIR, 'po-pilot-policy/v1'],
  }[type];
  if (!config) fail('type must be run, update, or policy');
  object(input, 'input');
  if (type === 'run') {
    const initial = object(input.initialUpdate, 'run initialUpdate');
    for (const [field, expected] of Object.entries({ proof: 'pending', ownerClear: 'pending', boundaryMiss: 'pending', laterResult: 'pending' })) {
      if (initial[field] !== expected) fail(`run initialUpdate ${field} must be ${expected}`);
    }
  }
  if (type === 'update' && !((Number.isInteger(input.runId) && input.runId >= 1) || (typeof input.runId === 'string' && UUID.test(input.runId)))) {
    fail('update runId must be a legacy integer or UUIDv4');
  }
  if (type === 'policy' && !['pending', 'keep', 'adjust', 'revert'].includes(input.outcome)) fail('policy outcome is invalid');
  const recordId = id(input.id ?? uuid(), 'record id');
  const record = { ...input, schema: config[1], id: recordId, recordedAt: instant(input.recordedAt ?? now(), 'recordedAt') };
  preflight(type, record, root);
  const directory = join(root, config[0]);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${recordId}.json`);
  const descriptor = openSync(path, 'wx');
  try { writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`); }
  finally { closeSync(descriptor); }
  return { path: `${config[0]}/${recordId}.json`, record };
}
