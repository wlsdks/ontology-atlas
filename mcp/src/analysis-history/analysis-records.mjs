import { constants } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import path from 'node:path';

import {
  ANALYSIS_DIRECTORY,
  MAX_ANALYSIS_RECORD_BYTES,
  analysisRecordFileName,
  isAnalysisRecordFileName,
  parseAnalysisRecord,
  verifyAnalysisEvidence,
} from './analysis-record.mts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function archiveDirectory(vaultRoot) {
  const root = await realpath(vaultRoot);
  let directory = root;
  for (const part of ANALYSIS_DIRECTORY.split('/')) {
    directory = path.join(directory, part);
    let metadata;
    try { metadata = await lstat(directory); } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error('Analysis archive must be a real directory inside the selected vault.');
    const resolved = await realpath(directory);
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('Analysis archive escapes the selected vault.');
  }
  return directory;
}

async function readRecord(directory, fileName) {
  if (!isAnalysisRecordFileName(fileName)) throw new Error('Invalid analysis file name.');
  const target = path.join(directory, fileName);
  const before = await lstat(target);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_ANALYSIS_RECORD_BYTES) throw new Error('Analysis record is not a bounded, independent regular file.');
  const file = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await file.stat();
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size) throw new Error('Analysis record changed while it was opened.');
    const buffer = Buffer.alloc(Math.min(opened.size + 1, MAX_ANALYSIS_RECORD_BYTES + 1));
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await file.read(buffer, total, buffer.length - total, total);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > MAX_ANALYSIS_RECORD_BYTES) throw new Error('Analysis record exceeds the supported byte budget.');
    const markdown = buffer.subarray(0, total).toString('utf8');
    const after = await file.stat();
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) throw new Error('Analysis record changed while it was read.');
    const currentDirectory = await realpath(directory);
    if (currentDirectory !== directory) throw new Error('Analysis directory changed while it was read.');
    const record = parseAnalysisRecord(markdown);
    if (analysisRecordFileName(record) !== fileName) throw new Error('Analysis file identity does not match its metadata.');
    if (record.recordType === 'run') {
      const problems = await verifyAnalysisEvidence(record);
      if (problems.length) throw new Error(`Analysis evidence integrity failed: ${problems.join(', ')}`);
    }
    return { fileName, record };
  } finally { await file.close(); }
}

export async function readAnalysisRecord(vaultRoot, recordId) {
  if (typeof recordId !== 'string' || !UUID.test(recordId)) throw new Error('Analysis recordId must be a UUIDv4.');
  const directory = await archiveDirectory(vaultRoot);
  const names = [];
  if (directory) {
    for await (const entry of await opendir(directory)) {
      if (isAnalysisRecordFileName(entry.name) && entry.name.endsWith(`-${recordId}.md`)) names.push(entry.name);
      if (names.length > 1) break;
    }
  }
  if (names.length !== 1) throw new Error(names.length ? 'Analysis identity is ambiguous.' : 'Analysis record was not found.');
  const result = await readRecord(directory, names[0]);
  return { contract: 'analysisRecordRead:v1', operation: 'analysis_record', ...result, meaningAuthority: 'diagnostic-records-only' };
}
