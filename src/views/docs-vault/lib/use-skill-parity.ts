'use client';

import { useEffect, useState } from 'react';

import { analyzeAgentFiles, WEB_SCAN_ANALYZE_OPTIONS } from './agent-files';
import { readDesktopSkillTrees } from './read-desktop-skill-trees';
import { buildSkillParityModel, type SkillParityModel } from './skill-parity';

/**
 * The skill-copy parity verdict — **only in the desktop app, when the vault root is known.**
 *
 * `null` means "draw nothing in this slot", while a model with empty `rows` means "a vault with no
 * skill tree". These are different facts and are not collapsed into one value — the first is a
 * missing capability, the second is nothing to see.
 *
 * This hook never switches on for the web. An FSA handle has no absolute path, so there is no way
 * in principle to see `.claude/`, and no web equivalent is built
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
        // A read failure is demoted to **no verdict**. Calling what could not be read "agreed"
        // would have the screen claim it checked something it did not.
        if (!cancelled) setModel(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultRootPath]);

  return vaultRootPath ? model : null;
}
