'use client';

import { useEffect, useState } from 'react';

import { analyzeAgentFiles, WEB_SCAN_ANALYZE_OPTIONS } from '@/entities/agent-files';
import { readDesktopSkillTrees } from './read-desktop-skill-trees';
import { buildSkillParityModel, type SkillParityModel } from './skill-parity';

/**
 * Desktop only, with a known vault root. `null` means no capability (draw nothing); an
 * empty `rows` means no skill tree. The web cannot see `.claude/` through an FSA handle
 * (`.claude/rules/surfaces.md`).
 */
export function useSkillParity(vaultRootPath: string | null): SkillParityModel | null {
  const [model, setModel] = useState<SkillParityModel | null>(null);

  useEffect(() => {
    if (!vaultRootPath) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const files = await readDesktopSkillTrees(vaultRootPath);
        if (cancelled) return;
        if (files.length === 0) {
          setModel({ rows: [], disagreeing: 0 });
          return;
        }
        const analysis = analyzeAgentFiles({
          files,
          existingPaths: files.map((f) => f.path),
          unverifiablePrefixes: [...WEB_SCAN_ANALYZE_OPTIONS.unverifiablePrefixes],
          verifiableExtensions: [...WEB_SCAN_ANALYZE_OPTIONS.verifiableExtensions],
        });
        setModel(buildSkillParityModel(analysis));
      } catch {
        // A read failure is no verdict, never "agreed".
        if (!cancelled) setModel(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultRootPath]);

  return vaultRootPath ? model : null;
}
