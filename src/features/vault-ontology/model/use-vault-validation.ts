'use client';

import { useMemo } from 'react';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useSampleSource } from '@/features/vault-sample-source';
import { useLocalVault } from '@/features/docs-vault-local';
import { resolveStaticVaultSource, type VaultManifest } from '@/entities/docs-vault';
import {
  summarizeVaultValidation,
  type VaultValidationSummary,
} from '@/shared/lib/validate-vault-document';

/**
 * 모드를 따라가는 frontmatter 검사 요약 — 설정 시트가 이미 쓰던
 * `summarizeVaultValidation` 을 **인사이트 화면에서도** 읽을 수 있게 한 훅.
 *
 * 왜 필요했나 (2026-08-04): 「할 일」의 준비도 미터는 관계 품질만 봤다. 그래서
 * 검사 오류가 5건인 폴더에서도 위험 세그먼트가 0px 였다 — 같은 앱의 설정
 * 시트는 같은 순간 「5개가 막음」이라고 말하고 있었다. 두 화면이 같은 폴더를
 * 다른 수로 부르면 둘 다 못 믿는다. 그래서 계산을 복제하지 않고 **같은 함수**를
 * 부른다.
 *
 * 모드 선택은 `useVaultHealth` 와 같은 규칙이다 — 화면이 그리고 있는 볼트를
 * 검사해야 수치가 화면과 일치한다.
 */
const staticManifest = resolveStaticVaultSource('dogfood').manifest;
const storefrontManifest = resolveStaticVaultSource('storefront').manifest;

const summaryCache = new WeakMap<VaultManifest, VaultValidationSummary>();
function manifestValidation(manifest: VaultManifest): VaultValidationSummary {
  const cached = summaryCache.get(manifest);
  if (cached) return cached;
  const result = summarizeVaultValidation(
    manifest.docs.map((doc) => ({
      slug: doc.slug,
      frontmatter: doc.frontmatter ?? {},
    })),
  );
  summaryCache.set(manifest, result);
  return result;
}

const EMPTY_SUMMARY: VaultValidationSummary = {
  ok: true,
  total: 0,
  errorCount: 0,
  warningCount: 0,
  issuesBySlug: [],
};

export function useVaultValidationSummary(): VaultValidationSummary {
  const mode = useDataSourceMode();
  const [sampleSource] = useSampleSource();
  const vault = useLocalVault();

  return useMemo(() => {
    if (mode === 'static') {
      return manifestValidation(
        sampleSource === 'storefront' ? storefrontManifest : staticManifest,
      );
    }
    if (vault.status === 'loaded' && vault.manifest) {
      return manifestValidation(vault.manifest);
    }
    return EMPTY_SUMMARY;
  }, [mode, sampleSource, vault.status, vault.manifest]);
}
