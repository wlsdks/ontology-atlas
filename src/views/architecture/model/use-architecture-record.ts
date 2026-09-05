"use client";

import { useEffect, useState } from 'react';

import { parseArchitectureRecord, type ArchitectureRecord } from '@/entities/architecture-record';
import { analysisTextDigest, readAnalysisHistory } from '@/entities/analysis-record';
import { architectureRecordFromAnalysis } from './analysis-architecture-record';

const EMPTY_RECORDS: Readonly<Record<string, ArchitectureRecord>> = Object.freeze({});

/**
 * Read the persisted conformance receipts `.ontology-atlas/architecture/<profile-slug>.json`
 * for the given profiles, through the same vault handle both surfaces already hold — the
 * browser and the installed app read the identical sidecar path (2026-08-27 council, point 3).
 *
 * Read-only and resilient by contract: a vault without the sidecar directory, a profile without
 * a receipt, or a receipt that does not parse all resolve to "no record" — silently, because a
 * missing machine receipt is a normal state, not an error a console should shout about. The
 * surface then renders the unchanged "Source check required" amber, never a defect.
 *
 * The loaded set stays keyed to the handle and slug list it was read for (the same derive-not-
 * reset pattern `ArchitecturePage` uses for handoff contexts), so a vault or profile change
 * falls back to "no records" without a synchronous state reset.
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
            // Missing or invalid receipt → no record for this profile.
          }
        }
      }
      if (profileDocuments && fileHandles) {
        // Newest-first pages stop once every requested profile has a run. The
        // bounded history viewer remains the path to older or unreadable files.
        const wanted = new Set(slugKey.split('\0'));
        let cursor: string | null = null;
        for (let pageIndex = 0; pageIndex < 10 && wanted.size; pageIndex += 1) {
          let page;
          try { page = await readAnalysisHistory(handle, { cursor }); } catch { break; }
          for (const run of page.records) {
            if (run.recordType !== 'run' || run.mode !== 'architecture' || !run.scope.profileSlug || !wanted.has(run.scope.profileSlug)) continue;
            const slug = run.scope.profileSlug;
            wanted.delete(slug);
            // A newer attempt without a compatible measurement cannot make a
            // legacy receipt look like the result of that new attempt.
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
