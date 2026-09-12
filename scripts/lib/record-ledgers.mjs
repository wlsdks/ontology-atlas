import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DOCUMENTS = new Set(['docs/DECISIONS.md', 'docs/CHANGELOG.md']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHANGE_CATEGORIES = ['Added', 'Changed', 'Fixed', 'Removed'];

class RecordLedgerError extends Error {
  constructor(message) { super(`[record-ledgers] ${message}`); this.name = 'RecordLedgerError'; }
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const posix = (value) => value.split(path.sep).join('/');
export const isCalendarDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

function filesBelow(root, relativeDir) {
  const absolute = path.join(root, relativeDir);
  try {
    return readdirSync(absolute, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => posix(path.join(relativeDir, entry.name))).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function policyAt(root) {
  const file = path.join(root, 'docs/records/legacy.json');
  try {
    const policy = JSON.parse(readFileSync(file, 'utf8'));
    if (policy?.version !== 1 || !policy.documents || typeof policy.documents !== 'object') {
      throw new RecordLedgerError('docs/records/legacy.json must have version 1 and documents');
    }
    return { file: 'docs/records/legacy.json', policy };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error instanceof RecordLedgerError) throw error;
    throw new RecordLedgerError(`cannot read docs/records/legacy.json: ${error.message}`);
  }
}

/**
 * The freeze is a claim about a ledger's **content**, not about the line endings this
 * filesystem happened to check out. A Windows checkout with `core.autocrlf` hands the
 * same three ledgers back as CRLF, so hashing raw bytes reported every one of them as
 * tampered with and refused to compose the changelog at all. Normalizing first keeps
 * `legacy.json`'s existing checksums valid, so nothing is re-frozen and no history moves,
 * and it returns one canonical text so a composed document does not vary by platform.
 */
export function readFrozenDocument(relativePath, { root = process.cwd() } = {}) {
  const raw = readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
  const policy = policyAt(root);
  if (!policy) return raw;
  const expected = policy.policy.documents[relativePath];
  if (!expected?.sha256) throw new RecordLedgerError(`legacy policy has no checksum for ${relativePath}`);
  const actual = sha256(raw);
  if (actual !== expected.sha256) {
    throw new RecordLedgerError(`${relativePath} changed after it was frozen (expected ${expected.sha256}, received ${actual}${expected.blob ? `; recover from Git blob ${expected.blob}` : ''})`);
  }
  return raw;
}

function parseFrontmatter(raw, file) {
  if (!raw.startsWith('---\n')) throw new RecordLedgerError(`${file}: frontmatter is required`);
  const end = raw.indexOf('\n---\n', 4);
  if (end < 0) throw new RecordLedgerError(`${file}: frontmatter is not closed`);
  const meta = {};
  for (const line of raw.slice(4, end).split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!match) throw new RecordLedgerError(`${file}: unsupported frontmatter line ${JSON.stringify(line)}`);
    if (Object.hasOwn(meta, match[1])) throw new RecordLedgerError(`${file}: duplicate frontmatter key ${match[1]}`);
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    meta[match[1]] = value;
  }
  return { meta, body: raw.slice(end + 5).trim() };
}

function requireUuid(meta, file) {
  if (!UUID.test(meta.id ?? '')) throw new RecordLedgerError(`${file}: id must be a UUIDv4`);
  const basename = path.basename(file, '.md');
  if (!basename.endsWith(`-${meta.id}`)) throw new RecordLedgerError(`${file}: filename must end with its id`);
}

function readFragments(root, dir, kind) {
  return filesBelow(root, dir).map((file) => {
    const raw = readFileSync(path.join(root, file), 'utf8');
    const parsed = parseFrontmatter(raw, file);
    requireUuid(parsed.meta, file);
    if (!isCalendarDate(parsed.meta.date)) throw new RecordLedgerError(`${file}: date must be a real YYYY-MM-DD calendar date`);
    if (!path.basename(file).startsWith(`${parsed.meta.date}-`)) throw new RecordLedgerError(`${file}: filename date must match frontmatter date`);
    return { file, raw, ...parsed, kind };
  });
}

function assertUnique(items) {
  const seen = new Map();
  for (const item of items) {
    const prior = seen.get(item.meta.id);
    if (prior) throw new RecordLedgerError(`duplicate id ${item.meta.id}: ${prior} and ${item.file}`);
    seen.set(item.meta.id, item.file);
  }
}

function ledgerPreamble(raw, pattern, file) {
  const at = raw.search(pattern);
  if (at < 0) throw new RecordLedgerError(`${file}: no legacy records found`);
  return { preamble: raw.slice(0, at).trimEnd(), records: raw.slice(at).trim() };
}

function decisions(root, legacy) {
  const fragments = readFragments(root, 'docs/records/decisions', 'decision');
  assertUnique(fragments);
  for (const fragment of fragments) {
    const heading = /^## (\d{4}-\d{2}-\d{2}) [—–-]+ \S.+$/m.exec(fragment.body);
    if (!heading || heading[1] !== fragment.meta.date || heading.index !== 0) throw new RecordLedgerError(`${fragment.file}: body must begin with one matching dated decision heading`);
    if ((fragment.body.match(/^## \d{4}-\d{2}-\d{2}/gm) ?? []).length !== 1) throw new RecordLedgerError(`${fragment.file}: exactly one decision record is required`);
  }
  const split = ledgerPreamble(legacy, /^## \d{4}-\d{2}-\d{2}(?=\s)/m, 'docs/DECISIONS.md');
  const legacyDates = [...split.records.matchAll(/^## (\d{4}-\d{2}-\d{2})/gm)].map((match) => match[1]);
  const newestLegacyDate = legacyDates.sort().at(-1);
  for (const fragment of fragments) if (newestLegacyDate && fragment.meta.date < newestLegacyDate) throw new RecordLedgerError(`${fragment.file}: date predates the newest frozen decision ${newestLegacyDate}`);
  fragments.sort((a, b) => b.meta.date.localeCompare(a.meta.date) || a.meta.id.localeCompare(b.meta.id));
  return { content: `${split.preamble}\n\n${[...fragments.map((f) => f.body), split.records].filter(Boolean).join('\n\n')}\n`, fragments };
}

function releases(root) {
  return filesBelow(root, 'docs/records/releases').map((file) => {
    const { meta, body } = parseFrontmatter(readFileSync(path.join(root, file), 'utf8'), file);
    if (!/^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(meta.version ?? '')) throw new RecordLedgerError(`${file}: invalid release version`);
    if (path.basename(file, '.md') !== meta.version) throw new RecordLedgerError(`${file}: filename must equal version`);
    if (!isCalendarDate(meta.date) || !meta.title) throw new RecordLedgerError(`${file}: a real calendar date and title are required`);
    if (meta.title.includes('\n') || Buffer.byteLength(meta.title) > 200) throw new RecordLedgerError(`${file}: title must fit one 200-byte line`);
    const lines = body.split('\n').filter((line) => line.trim());
    const ids = lines.map((line) => /^-\s+([0-9a-f-]+)\s*$/i.exec(line)?.[1]);
    if (ids.length === 0 || ids.some((id) => !id || !UUID.test(id))) throw new RecordLedgerError(`${file}: body must contain only change UUID bullets`);
    return { file, meta, ids };
  });
}

function changelog(root, legacy) {
  const changes = readFragments(root, 'docs/records/changes', 'change');
  assertUnique(changes);
  for (const change of changes) {
    if (!CHANGE_CATEGORIES.includes(change.meta.category)) throw new RecordLedgerError(`${change.file}: category must be ${CHANGE_CATEGORIES.join(', ')}`);
    if (!change.body || change.body.includes('\n')) throw new RecordLedgerError(`${change.file}: body must be one non-empty line`);
    if (Buffer.byteLength(change.body) > 900) throw new RecordLedgerError(`${change.file}: change fact exceeds 900 bytes`);
  }
  const byId = new Map(changes.map((item) => [item.meta.id, item]));
  const split = ledgerPreamble(legacy, /^## \d{4}-\d{2}-\d{2} · /m, 'docs/CHANGELOG.md');
  if (/^## \d{4}-\d{2}-\d{2} · Unreleased:/m.test(split.records)) {
    throw new RecordLedgerError('docs/CHANGELOG.md still contains a legacy Unreleased entry; finalize it before freezing and adding fragments so release ownership stays explicit');
  }
  const legacyDates = [...split.records.matchAll(/^## (\d{4}-\d{2}-\d{2})/gm)].map((match) => match[1]);
  const newestLegacyDate = legacyDates.sort().at(-1);
  const legacyVersions = new Set([...split.records.matchAll(/^## \d{4}-\d{2}-\d{2} · (v\d+\.\d+\.\d+(?:-rc\.\d+)?):/gm)].map((match) => match[1]));
  for (const change of changes) if (newestLegacyDate && change.meta.date < newestLegacyDate) throw new RecordLedgerError(`${change.file}: date predates the newest frozen changelog entry ${newestLegacyDate}`);
  const assigned = new Map();
  const markers = releases(root);
  const versions = new Set();
  for (const marker of markers) {
    if (newestLegacyDate && marker.meta.date < newestLegacyDate) throw new RecordLedgerError(`${marker.file}: date predates the newest frozen changelog entry ${newestLegacyDate}`);
    if (legacyVersions.has(marker.meta.version)) throw new RecordLedgerError(`${marker.file}: version ${marker.meta.version} already exists in the frozen changelog`);
    if (versions.has(marker.meta.version)) throw new RecordLedgerError(`duplicate release version ${marker.meta.version}`);
    versions.add(marker.meta.version);
    for (const id of marker.ids) {
      if (!byId.has(id)) throw new RecordLedgerError(`${marker.file}: unknown change id ${id}`);
      if (assigned.has(id)) throw new RecordLedgerError(`change ${id} assigned by both ${assigned.get(id)} and ${marker.file}`);
      assigned.set(id, marker.file);
    }
  }
  const renderFacts = (facts) => CHANGE_CATEGORIES.flatMap((category) => {
    const rows = facts.filter((f) => f.meta.category === category).sort((a, b) => a.meta.id.localeCompare(b.meta.id));
    return rows.length ? [`**${category}**: ${rows.map((r) => r.body).join('; ')}`] : [];
  }).join('\n\n');
  const unassigned = changes.filter((item) => !assigned.has(item.meta.id));
  const sections = [];
  if (unassigned.length) {
    const date = unassigned.reduce((latest, item) => item.meta.date > latest ? item.meta.date : latest, unassigned[0].meta.date);
    sections.push(`## ${date} · Unreleased: changes since the latest release\n\n${renderFacts(unassigned)}`);
  }
  const versionParts = (value) => value.slice(1).split(/[-.]/).map((part) => /^\d+$/.test(part) ? Number(part) : part);
  markers.sort((a, b) => {
    const date = b.meta.date.localeCompare(a.meta.date);
    if (date) return date;
    const left = versionParts(a.meta.version); const right = versionParts(b.meta.version);
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      if (left[index] === right[index]) continue;
      if (left[index] === undefined) return -1;
      if (right[index] === undefined) return 1;
      if (typeof left[index] === 'number' && typeof right[index] === 'number') return right[index] - left[index];
      return String(right[index]).localeCompare(String(left[index]));
    }
    return 0;
  });
  for (const marker of markers) sections.push(`## ${marker.meta.date} · ${marker.meta.version}: ${marker.meta.title}\n\n${renderFacts(marker.ids.map((id) => byId.get(id)))}`);
  return { content: `${split.preamble}\n\n${[...sections, split.records].filter(Boolean).join('\n\n')}\n`, fragments: [...changes, ...markers] };
}

export function readLedgerSource(relativePath, { root = process.cwd() } = {}) {
  if (!DOCUMENTS.has(relativePath)) return null;
  const decisionFiles = filesBelow(root, 'docs/records/decisions');
  const changeFiles = filesBelow(root, 'docs/records/changes');
  const releaseFiles = filesBelow(root, 'docs/records/releases');
  const hasFragments = decisionFiles.length + changeFiles.length + releaseFiles.length > 0;
  const policy = policyAt(root);
  if (hasFragments && !policy) throw new RecordLedgerError('record fragments require docs/records/legacy.json');
  const legacy = readFrozenDocument(relativePath, { root });
  const relevant = relativePath === 'docs/DECISIONS.md' ? decisionFiles.length : changeFiles.length + releaseFiles.length;
  if (relevant === 0) return { content: legacy, inputs: [relativePath, ...(policy ? [policy.file] : [])].sort() };
  const result = relativePath === 'docs/DECISIONS.md' ? decisions(root, legacy) : changelog(root, legacy);
  const inputs = [relativePath, ...(policy ? [policy.file] : []), ...result.fragments.map((f) => f.file)].sort();
  return { content: result.content, inputs };
}

/** Validate a prospective immutable record against all current sources without writing it. */
export function validateNewRecord({ kind, date, id, version, changes = [], root = process.cwd() }) {
  const document = kind === 'decision' ? 'docs/DECISIONS.md' : 'docs/CHANGELOG.md';
  try { readFileSync(path.join(root, document), 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') return; throw error; } // standalone writer fixture
  readLedgerSource(document, { root }); // current state must itself be valid and frozen when fragmented

  const decisionFragments = readFragments(root, 'docs/records/decisions', 'decision');
  const changeFragments = readFragments(root, 'docs/records/changes', 'change');
  const releaseMarkers = releases(root);
  const allIds = new Map([...decisionFragments, ...changeFragments].map((item) => [item.meta.id, item.file]));
  if (id && allIds.has(id)) throw new RecordLedgerError(`duplicate id ${id}: already used by ${allIds.get(id)}`);

  const legacy = readFrozenDocument(document, { root });
  const legacyDates = [...legacy.matchAll(/^## (\d{4}-\d{2}-\d{2})(?=\s)/gm)].map((match) => match[1]);
  // Concurrent branches may finish out of date order; only frozen history is the floor.
  const newest = legacyDates.sort().at(-1);
  if (newest && date < newest) throw new RecordLedgerError(`new ${kind} date ${date} predates current newest record ${newest}`);

  if (kind === 'release') {
    const existingVersions = new Set([
      ...[...legacy.matchAll(/^## \d{4}-\d{2}-\d{2} · (v\d+\.\d+\.\d+(?:-rc\.\d+)?):/gm)].map((match) => match[1]),
      ...releaseMarkers.map((marker) => marker.meta.version),
    ]);
    if (existingVersions.has(version)) throw new RecordLedgerError(`release version ${version} already exists`);
    const known = new Set(changeFragments.map((item) => item.meta.id));
    const assigned = new Set(releaseMarkers.flatMap((marker) => marker.ids));
    for (const changeId of changes) {
      if (!known.has(changeId)) throw new RecordLedgerError(`release references unknown change id ${changeId}`);
      if (assigned.has(changeId)) throw new RecordLedgerError(`change ${changeId} is already assigned to a release`);
    }
  }
}
