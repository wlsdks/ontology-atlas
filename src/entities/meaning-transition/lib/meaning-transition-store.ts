import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import {
  appendTauriMeaningTransitionBundle,
  canArchiveMeaningTransitions,
  listTauriMeaningTransitionHistory,
  observeMeaningTransitionRoot,
  readTauriMeaningTransitionArtifact,
  readTauriMeaningTransitionRecord,
  type MeaningTransitionRootIdentity,
} from '@/shared/lib/tauri-meaning-transition-archive';
import {
  parseMeaningTransition,
  serializeMeaningTransition,
  verifyMeaningTransitionDigest,
  type MeaningTransitionCandidate,
  type MeaningTransitionPreparation,
} from '@/shared/lib/meaning-transition';

export interface MeaningTransitionArtifactBytes { digest: `sha256:${string}`; content: string }
export interface MeaningTransitionArchivePage {
  records: MeaningTransitionCandidate[];
  problems: Array<{ fileName: string; reason: string }>;
  totalMembers: number;
  scanned: number;
  nextOffset: number | null;
}

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ARCHIVE_PREFIX = '.ontology-atlas/meaning-transitions/artifacts/';

export function meaningTransitionArtifactRef(digest: string): string {
  if (!DIGEST.test(digest)) throw new Error('Meaning transition artifact digest must be SHA-256.');
  return `${ARCHIVE_PREFIX}${digest.slice('sha256:'.length)}.artifact`;
}

function meaningTransitionRecordFileName(record: MeaningTransitionCandidate): string {
  return `${record.createdAt.replaceAll(':', '-').replace('.', '-')}-${record.eventId}.md`;
}

async function sha256(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function requiredArtifacts(record: MeaningTransitionCandidate): Map<string, string> {
  const refs = [record.proposal.artifact, record.codeEvidence.diffArtifact].filter((value): value is NonNullable<typeof value> => value !== null);
  const result = new Map<string, string>();
  for (const artifact of refs) {
    if (artifact.ref !== meaningTransitionArtifactRef(artifact.contentDigest)) throw new Error('Meaning transition artifact ref is not content-addressed.');
    result.set(artifact.contentDigest, artifact.ref);
  }
  return result;
}

function assertCurrent(isCurrent: () => boolean): void {
  if (!isCurrent()) throw new Error('Meaning transition vault context changed.');
}

async function captureRoot(rootPath: string | null | undefined, isCurrent: () => boolean): Promise<{ rootPath: string; identity: MeaningTransitionRootIdentity }> {
  if (!rootPath || !canArchiveMeaningTransitions()) throw new Error('Meaning transition archival requires the installed Atlas app.');
  const identity = await observeMeaningTransitionRoot(rootPath);
  assertCurrent(isCurrent);
  return { rootPath, identity };
}

/** Archive integrity verifies immutable bytes. It does not authenticate supplied decision or receipt facts. */
export async function appendMeaningTransition(input: {
  capturedHandle: FileSystemDirectoryHandle;
  preparation: MeaningTransitionPreparation;
  artifacts: readonly MeaningTransitionArtifactBytes[];
  writable: boolean;
  isCurrent: () => boolean;
}): Promise<{ status: 'not_created'; reason: Extract<MeaningTransitionPreparation, { status: 'not_created' }>['reason'] } | { status: 'archived'; fileName: string; created: boolean }> {
  const rootPathAtEntry = getTauriVaultRootPath(input.capturedHandle);
  const preparation = structuredClone(input.preparation);
  const artifactsAtEntry = input.artifacts.map(({ digest, content }) => ({ digest, content }));
  const writableAtEntry = input.writable;
  const isCurrent = input.isCurrent;
  if (preparation.status === 'not_created') return { status: 'not_created', reason: preparation.reason };
  if (!writableAtEntry) throw new Error('A writable ontology folder is required.');
  assertCurrent(isCurrent);
  const capturedRoot = captureRoot(rootPathAtEntry, isCurrent);
  // Observation starts before validation; attach a handler now so an early native refusal cannot
  // become an unhandled rejection while local digest validation is still running.
  void capturedRoot.catch(() => undefined);
  const record = preparation.record;
  if (!await verifyMeaningTransitionDigest(record)) throw new Error('Meaning transition digest verification failed.');
  const markdown = serializeMeaningTransition(record);
  const required = requiredArtifacts(record);
  const supplied = new Map<string, MeaningTransitionArtifactBytes>(artifactsAtEntry.map((artifact) => [artifact.digest, artifact]));
  if (supplied.size !== artifactsAtEntry.length || supplied.size !== required.size
    || [...required.keys()].some((digest) => !supplied.has(digest))) throw new Error('Meaning transition artifacts do not exactly match the record.');
  for (const artifact of supplied.values()) {
    if (!DIGEST.test(artifact.digest) || await sha256(artifact.content) !== artifact.digest) throw new Error('Meaning transition artifact digest verification failed.');
  }
  const { rootPath, identity } = await capturedRoot;
  assertCurrent(isCurrent);
  const fileName = meaningTransitionRecordFileName(record);
  const result = await appendTauriMeaningTransitionBundle({
    rootPath, expectedRootIdentity: identity, recordFileName: fileName, recordContent: markdown,
    artifacts: [...supplied.values()].map(({ digest, content }) => ({ digest, content })),
  });
  assertCurrent(isCurrent);
  if (result.recordFileName !== fileName || result.artifacts.length !== supplied.size
    || result.artifacts.some((artifact) => !supplied.has(artifact.digest)
      || artifact.fileName !== `${artifact.digest.slice('sha256:'.length)}.artifact`)) {
    throw new Error('Native meaning transition publication receipt mismatched.');
  }
  for (const artifact of supplied.values()) {
    if (await readTauriMeaningTransitionArtifact(rootPath, identity, artifact.digest) !== artifact.content) throw new Error('Archived meaning transition artifact readback mismatched.');
    assertCurrent(isCurrent);
  }
  const reopened = await readTauriMeaningTransitionRecord(rootPath, identity, fileName);
  assertCurrent(isCurrent);
  const parsed = await parseMeaningTransition(reopened);
  assertCurrent(isCurrent);
  if (!await verifyMeaningTransitionDigest(parsed) || reopened !== markdown) throw new Error('Archived meaning transition record readback mismatched.');
  assertCurrent(isCurrent);
  return { status: 'archived', fileName: result.recordFileName, created: result.recordCreated };
}

export async function readMeaningTransitionHistory(input: {
  capturedHandle: FileSystemDirectoryHandle; isCurrent: () => boolean; offset?: number; limit?: number;
}): Promise<MeaningTransitionArchivePage> {
  const rootPathAtEntry = getTauriVaultRootPath(input.capturedHandle);
  const isCurrent = input.isCurrent;
  const offset = input.offset ?? 0; const limit = input.limit ?? 30;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid meaning transition history page.');
  const { rootPath, identity } = await captureRoot(rootPathAtEntry, isCurrent);
  const page = await listTauriMeaningTransitionHistory(rootPath, identity, offset, limit);
  assertCurrent(isCurrent);
  const records: MeaningTransitionCandidate[] = [];
  const problems: MeaningTransitionArchivePage['problems'] = [];
  for (const entry of page.entries) {
    if (entry.kind === 'malformed') { problems.push({ fileName: entry.fileName, reason: entry.problem ?? 'Malformed archive member.' }); continue; }
    try {
      const markdown = await readTauriMeaningTransitionRecord(rootPath, identity, entry.fileName);
      assertCurrent(isCurrent);
      const record = await parseMeaningTransition(markdown);
      assertCurrent(isCurrent);
      if (meaningTransitionRecordFileName(record) !== entry.fileName) throw new Error('Meaning transition file identity does not match its metadata.');
      if (!await verifyMeaningTransitionDigest(record)) throw new Error('Meaning transition digest verification failed.');
      assertCurrent(isCurrent);
      for (const digest of requiredArtifacts(record).keys()) {
        await readTauriMeaningTransitionArtifact(rootPath, identity, digest);
        assertCurrent(isCurrent);
      }
      records.push(record);
    } catch (error) {
      assertCurrent(isCurrent);
      problems.push({ fileName: entry.fileName, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  assertCurrent(isCurrent);
  return { records, problems, totalMembers: page.totalMembers, scanned: page.entries.length, nextOffset: page.nextOffset };
}
