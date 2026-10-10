'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/shared/ui';
import { useLocalVault } from '@/entities/vault-session';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { useSkillParity } from '../lib/use-skill-parity';
import { buildSkillParityHandoff } from '../lib/skill-parity-handoff';
import type { SkillParityRow } from '../lib/skill-parity';

export function useSkillParityHandoff({
  isDesktopRuntime,
  localVault,
}: {
  isDesktopRuntime: boolean;
  localVault: ReturnType<typeof useLocalVault>;
}) {
  const toast = useToast();
  const tSkillParity = useTranslations('skillParity');
  // Skill-copy parity only with a real absolute path; the web falls back to the handle name.
  const skillParityRoot =
    isDesktopRuntime && localVault.handle
      ? getTauriVaultRootPath(localVault.handle) ?? null
      : null;
  const skillParity = useSkillParity(skillParityRoot);
  const handleCopySkillParityHandoff = useCallback(
    (rows: SkillParityRow[]) => {
      if (!skillParityRoot) return;
      const text = buildSkillParityHandoff(rows, skillParityRoot);
      if (!text) return;
      void navigator.clipboard
        .writeText(text)
        .then(() => toast.show(tSkillParity("copied"), "success"))
        .catch(() => toast.show(tSkillParity("copyFailed"), "error"));
    },
    [toast, tSkillParity, skillParityRoot],
  );
  return { skillParityRoot, skillParity, handleCopySkillParityHandoff };
}
