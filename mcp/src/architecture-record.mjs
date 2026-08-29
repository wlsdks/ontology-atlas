// architectureRecord:v1 — a dated machine receipt for one architecture
// conformance measurement (docs/DECISIONS.md, 2026-08-27 "Conformance records
// are dated machine receipts").
//
// The record is a JSON envelope wrapping one stamped architectureBrief:v1 plus
// the reviewed profile's identity (uid, slug, content hash) — never the profile
// body. It is not an ontology kind and not in-vault Markdown: it lives at
// `.ontology-atlas/architecture/<profile-slug>.json`, overwritten per slug
// through the vault-sidecar atomic replacement, and is never committed.
//
// Fail-closed boundaries owned here:
//   - a record must carry a measured stamp whose git/folder fields are never
//     conflated (no fingerprint under git, no sha under folder)
//   - no absolute machine path leaves the sidecar: every `rootPath` field is
//     stripped recursively before the brief is wrapped
//   - the validator rejects profile-shaped input outright, so a profile can
//     never be mistaken for (or persisted as) a record

import { appendActivityEntry, buildActivityEntry } from './activity-log.mjs';
import { replaceVaultSidecarText } from './vault-sidecar.mjs';

const ARCHITECTURE_RECORD_CONTRACT = 'architectureRecord:v1';
const ARCHITECTURE_RECORD_SUBDIRECTORY = 'architecture';

const BRIEF_CONTRACT = 'architectureBrief:v1';
const CONTENT_HASH_RE = /^sha256:[0-9a-f]{64}$/;
const FOLDER_FINGERPRINT_RE = /^sha256:[0-9a-f]{64}$/;
const GIT_SHORT_SHA_RE = /^[0-9a-f]{7,40}$/;

function fail(message) {
  throw new Error(message);
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${name} must be an object.`);
  }
  return value;
}

function requireNonBlankString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${name} must be a non-empty string.`);
  }
  return value;
}

/** Recursively drop every `rootPath` key. No absolute machine path leaves the sidecar. */
function stripRootPaths(value) {
  if (Array.isArray(value)) return value.map((item) => stripRootPaths(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'rootPath')
        .map(([key, child]) => [key, stripRootPaths(child)]),
    );
  }
  return value;
}

function findRootPathKey(value, path = '$') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findRootPathKey(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'rootPath') return `${path}.${key}`;
      const found = findRootPathKey(child, `${path}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

function assertMeasuredStamp(measured) {
  requireObject(measured, 'architecture record brief.measured');
  requireNonBlankString(measured.at, 'brief.measured.at');
  if (Number.isNaN(Date.parse(measured.at))) {
    fail('brief.measured.at must be an ISO-8601 time.');
  }
  const tool = requireObject(measured.tool, 'brief.measured.tool');
  requireNonBlankString(tool.name, 'brief.measured.tool.name');
  requireNonBlankString(tool.version, 'brief.measured.tool.version');
  const source = requireObject(measured.source, 'brief.measured.source');
  if (source.kind === 'git') {
    if (typeof source.revision !== 'string' || !GIT_SHORT_SHA_RE.test(source.revision)) {
      fail('brief.measured.source.revision must be a git commit short sha.');
    }
    if (typeof source.dirty !== 'boolean') {
      fail('brief.measured.source.dirty must be a boolean for git sources.');
    }
    if ('fingerprint' in source) {
      fail('A git measured stamp must not carry a folder fingerprint.');
    }
    return;
  }
  if (source.kind === 'folder') {
    if (typeof source.fingerprint !== 'string' || !FOLDER_FINGERPRINT_RE.test(source.fingerprint)) {
      fail('brief.measured.source.fingerprint must be a sha256: fingerprint for folder sources.');
    }
    if ('revision' in source || 'dirty' in source) {
      fail('A folder measured stamp must not carry a git revision or dirty flag.');
    }
    return;
  }
  fail('brief.measured.source.kind must be git or folder.');
}

/**
 * The record-rejects-profile gate. A reviewed profile document and a machine
 * receipt must never be interchangeable: any input wearing profile frontmatter
 * keys is refused before shape validation even starts.
 */
function assertNotProfileShaped(value) {
  const keys = Object.keys(value);
  if (
    'architecture_schema' in value
    || 'profile_uid' in value
    || keys.some((key) => key.startsWith('role_'))
  ) {
    fail(
      'This value looks like an architecture profile, not an architectureRecord:v1. '
      + 'Profiles are reviewed vault Markdown; records are machine receipts. Refusing.',
    );
  }
}

export function assertArchitectureRecord(value) {
  requireObject(value, 'architecture record');
  assertNotProfileShaped(value);
  if (value.contract !== ARCHITECTURE_RECORD_CONTRACT) {
    fail(`architecture record contract must be ${ARCHITECTURE_RECORD_CONTRACT}.`);
  }
  const profile = requireObject(value.profile, 'architecture record profile');
  requireNonBlankString(profile.uid, 'architecture record profile.uid');
  requireNonBlankString(profile.slug, 'architecture record profile.slug');
  if (typeof profile.contentHash !== 'string' || !CONTENT_HASH_RE.test(profile.contentHash)) {
    fail('architecture record profile.contentHash must be sha256:<64 hex>.');
  }
  const brief = requireObject(value.brief, 'architecture record brief');
  if (brief.contract !== BRIEF_CONTRACT) {
    fail(`architecture record brief.contract must be ${BRIEF_CONTRACT}.`);
  }
  assertMeasuredStamp(brief.measured);
  const conformance = requireObject(brief.conformance, 'architecture record brief.conformance');
  if (!['conforms', 'violated', 'unknown'].includes(conformance.status)) {
    fail('architecture record brief.conformance.status must be conforms, violated, or unknown.');
  }
  const leakedRootPath = findRootPathKey(value);
  if (leakedRootPath) {
    fail(`architecture record must not carry any rootPath field (found ${leakedRootPath}).`);
  }
  return value;
}

/**
 * Wrap one stamped architectureBrief:v1 into an architectureRecord:v1.
 * The brief must already carry its measured stamp; every rootPath field is
 * stripped recursively so the persisted receipt names no machine path.
 */
export function buildArchitectureRecord(brief, { profileUid, profileSlug, profileContentHash } = {}) {
  requireObject(brief, 'architecture brief');
  if (brief.contract !== BRIEF_CONTRACT) {
    fail(`architecture record requires a ${BRIEF_CONTRACT} brief.`);
  }
  const record = {
    contract: ARCHITECTURE_RECORD_CONTRACT,
    profile: {
      uid: requireNonBlankString(profileUid, 'profileUid'),
      slug: requireNonBlankString(profileSlug, 'profileSlug'),
      contentHash: profileContentHash,
    },
    brief: stripRootPaths(brief),
  };
  return assertArchitectureRecord(record);
}

/**
 * Persist one record at `.ontology-atlas/architecture/<profile-slug>.json`
 * (atomic replacement, single-writer, no expected_mtime dance) and append one
 * activity.jsonl line through the existing audit-log API.
 */
export function writeArchitectureRecord(vaultRoot, record, { agent = null } = {}) {
  assertArchitectureRecord(record);
  const filename = `${record.profile.slug}.json`;
  const relativePath = `.ontology-atlas/${ARCHITECTURE_RECORD_SUBDIRECTORY}/${filename}`;
  const revision = replaceVaultSidecarText(
    vaultRoot,
    filename,
    `${JSON.stringify(record, null, 2)}\n`,
    { subdirectory: ARCHITECTURE_RECORD_SUBDIRECTORY },
  );
  appendActivityEntry(vaultRoot, buildActivityEntry({
    tool: 'architecture_record',
    target: relativePath,
    summary:
      `architectureRecord:v1 ${record.brief.conformance.status} · `
      + `${record.brief.conformance.violationCount} violation(s) · measured ${record.brief.measured.at}`,
    agent,
    why: 'atlas architecture --record',
  }));
  return { path: relativePath, revision };
}
