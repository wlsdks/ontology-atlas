"use client";

import { useEffect, useState } from 'react';

import { parseArchitectureRecord, type ArchitectureRecord } from '@/entities/architecture-record';

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
    void (async () => {
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
      if (!cancelled) setLoaded({ handle, slugKey, records: next });
    })();
    return () => { cancelled = true; };
  }, [handle, slugKey]);

  return loaded.handle === handle && loaded.slugKey === slugKey ? loaded.records : EMPTY_RECORDS;
}
