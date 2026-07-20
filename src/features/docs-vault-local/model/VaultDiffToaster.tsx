'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/shared/ui/toast';
import { diffVaultManifest, planVaultDiffToasts, type VaultDiffToast } from '../lib/diff-manifest';
import { useLocalVault } from './LocalVaultProvider';

/**
 * R13 #71 + #72 — vault polling 결과 *시각적 알림*. polling 으로 detect 한
 * 변화를 어떤 페이지에서든 toast 로 알림.
 *
 * #71 added detection: 새로운 slug 등장 → "추가됨: <slug>" info toast.
 * #72 modified detection: slug 같지만 mtime 변화 → "편집됨: <slug>"
 *   success toast. 사용자 / AI agent 가 IDE 에서 .md 편집한 경우.
 *
 * 동작:
 *   - LocalVaultProvider 안에 mount, manifest.docs 의 (slug, mtime) Map 추적
 *   - 첫 mount 는 baseline 만 (false-positive 방지)
 *   - 이후 diff:
 *     · slug 신규 → added
 *     · slug 동일 + mtime 새로움 → modified
 *   - added/modified 합쳐 처음 3 명시 + "+N more"
 *   - 문구는 `featuresMisc.vaultDiffToaster.*` 로 로케일별 조립 — `diffVaultManifest`/
 *     `planVaultDiffToasts` 는 kind/slug/count 만 반환하는 pure helper라 여기서
 *     `useTranslations` 로 문자열을 완성한다(N10 — "Added: domains/refunds" 영문
 *     리터럴 ko 수리).
 *
 * 삭제 detection 은 일단 제외 — 사용자 명시 액션 후 toast 가 더 가치 있음
 * (delete_concept 같은 명령 자체가 toast 띄우면 됨, polling 결과로 다시
 * toast 띄우면 noise).
 */
export function VaultDiffToaster() {
  const { status, manifest, consumeSelfWrittenSlugs } = useLocalVault();
  const toast = useToast();
  const t = useTranslations('featuresMisc.vaultDiffToaster');
  const prevMapRef = useRef<Map<string, number | null> | null>(null);

  useEffect(() => {
    if (status !== 'loaded' || !manifest) return;

    type DocLite = { slug: string; mtime?: number };
    const currentMap = new Map<string, number | null>(
      manifest.docs.map((d: DocLite) => [d.slug, d.mtime ?? null]),
    );

    // 첫 load — baseline 저장만 하고 끝
    if (prevMapRef.current === null) {
      prevMapRef.current = currentMap;
      return;
    }

    const { added, modified } = diffVaultManifest(
      prevMapRef.current,
      currentMap,
    );
    prevMapRef.current = currentMap;

    // 앱 자신의 쓰기(부트스트랩·인라인 편집 등)는 액션 자체가 이미
    // 피드백을 줬다 — 폴링 diff 로 재보고하면 토스트 연발 noise.
    const selfWritten = consumeSelfWrittenSlugs();
    const externalAdded = added.filter((slug) => !selfWritten.has(slug));
    const externalModified = modified.filter((slug) => !selfWritten.has(slug));

    if (externalAdded.length === 0 && externalModified.length === 0) return;

    for (const planned of planVaultDiffToasts({ added: externalAdded, modified: externalModified })) {
      toast.show(formatVaultDiffToastMessage(planned, t), planned.variant);
    }
  }, [status, manifest, toast, t, consumeSelfWrittenSlugs]);

  return null;
}

function formatVaultDiffToastMessage(
  planned: VaultDiffToast,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (planned.kind) {
    case 'added':
      return t('added', { slug: planned.slug ?? '' });
    case 'edited':
      return t('edited', { slug: planned.slug ?? '' });
    case 'overflow':
      return t('overflow', { count: planned.count ?? 0 });
    default:
      return '';
  }
}
