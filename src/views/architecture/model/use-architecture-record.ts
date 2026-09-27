"use client";

import { useEffect, useState } from 'react';

import { parseArchitectureRecord, type ArchitectureRecord } from '@/entities/architecture-record';
import { analysisTextDigest, readAnalysisHistory } from '@/entities/analysis-record';
import { architectureRecordFromAnalysis } from './analysis-architecture-record';

const EMPTY_RECORDS: Readonly<Record<string, ArchitectureRecord>> = Object.freeze({});

/**
 * Reads `.ontology-atlas/architecture/<profile-slug>.json` receipts through the vault handle both
 * surfaces hold. A missing or unparsable receipt is a normal "no record", silently. The loaded set
 * stays keyed to the handle and slugs it was read for, so a change falls back without a reset.
 */
export function useArchitectureRecords(
  handle: FileSystemDirectoryHandle | null,
  slugs: readonly string[],
  profileDocuments?: ReadonlyMap<string, string>,
  fileHandles?: ReadonlyMap<string, FileSystemFileHandle>,
): Readonly<Record<string, ArchitectureRecord>> {
  const slugKey = slugs.join('\0');
  const [loaded, setLoaded] = useState<{
    handle: FileSystemDirectoryHandle | null;
    slugKey: string;
    records: Readonly<Record<string, ArchitectureRecord>>;
  }>({ handle: null, slugKey: '', records: EMPTY_RECORDS });

  useEffect(() => {
    let cancelled = false;
    if (!handle || slugKey === '') {
      return () => { cancelled = true; };
    }
    const load = async () => {
      const next: Record<string, ArchitectureRecord> = {};
      let recordsDir: FileSystemDirectoryHandle | null = null;
      try {
        const sidecar = await handle.getDirectoryHandle('.ontology-atlas');
        recordsDir = await sidecar.getDirectoryHandle('architecture');
      } catch {
        recordsDir = null;
      }
      if (recordsDir) {
        for (const slug of slugKey.split('\0')) {
          try {
            const fileHandle = await recordsDir.getFileHandle(`${slug}.json`);
            const text = await (await fileHandle.getFile()).text();
            next[slug] = parseArchitectureRecord(JSON.parse(text));
          } catch {
            // A missing or invalid receipt means no record for this profile.
          }
        }
      }
      if (profileDocuments && fileHandles) {
        // Newest-first pages stop once every requested profile has a run; the history viewer reaches older ones.
        const wanted = new Set(slugKey.split('\0'));
        let cursor: string | null = null;
        for (let pageIndex = 0; pageIndex < 10 && wanted.size; pageIndex += 1) {
          let page;
          try { page = await readAnalysisHistory(handle, { cursor }); } catch { break; }
          for (const run of page.records) {
            if (run.recordType !== 'run' || run.mode !== 'architecture' || !run.scope.profileSlug || !wanted.has(run.scope.profileSlug)) continue;
            const slug = run.scope.profileSlug;
            wanted.delete(slug);
            // A newer attempt without a compatible measurement must not let a legacy receipt stand for it.
            delete next[slug];
            const record = architectureRecordFromAnalysis(run);
            const profileFile = fileHandles.get(profileDocuments.get(slug) ?? '');
            if (!record || !profileFile) continue;
            try {
              const current = await profileFile.getFile();
              if (current.size <= 500_000 && await analysisTextDigest(await current.text()) === record.profile.contentHash) next[slug] = record;
            } catch { /* An unavailable current profile leaves the measurement unknown. */ }
          }
          cursor = page.nextCursor;
          if (!cursor) break;
        }
      }
      if (!cancelled) setLoaded({ handle, slugKey, records: next });
    };
    void load();
    const update = () => { void load(); };
    window.addEventListener('atlas-analysis-records-changed', update);
    return () => { cancelled = true; window.removeEventListener('atlas-analysis-records-changed', update); };
  }, [handle, slugKey, profileDocuments, fileHandles]);

  return loaded.handle === handle && loaded.slugKey === slugKey ? loaded.records : EMPTY_RECORDS;
}
