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
  const { status, manifest, consumeSelfWrittenSlugs, agentActivityLog } = useLocalVault();
  const toast = useToast();
  const t = useTranslations('featuresMisc.vaultDiffToaster');
  const prevMapRef = useRef<Map<string, number | null> | null>(null);
  /** 직전 diff 를 본 시각 — 이 창 안의 `delete_concept` 만 이번 버스트의 것이다. */
  const prevSeenAtRef = useRef<number>(Date.now());

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

    // 삭제는 매니페스트로 못 센다 — rename/merge 가 「삭제 + 추가」로 보이기
    // 때문이다(diff-manifest.ts 주석의 실측). 도구 이름은 의도를 알고 있으므로
    // 이 버스트 창 안의 `delete_concept` 만 센다.
    const removed = countRecentDeletes(agentActivityLog, prevSeenAtRef.current);
    prevSeenAtRef.current = Date.now();

    if (externalAdded.length === 0 && externalModified.length === 0 && removed === 0) return;

    for (const planned of planVaultDiffToasts({
      added: externalAdded,
      modified: externalModified,
      removed,
    })) {
      toast.show(formatVaultDiffToastMessage(planned, t), planned.variant);
    }
  }, [status, manifest, toast, t, consumeSelfWrittenSlugs, agentActivityLog]);

  return null;
}

/**
 * 이 버스트 창(`since` 이후)에 기록된 `delete_concept` 수.
 *
 * 활동 로그는 MCP 쓰기 성공 직후 서버가 append 하는 감사 로그라, 도구 이름이
 * 곧 의도다 — 매니페스트 슬러그 diff 와 달리 rename 을 삭제로 오독하지 않는다.
 */
function countRecentDeletes(
  entries: { at: string; tool: string }[] | undefined,
  since: number,
): number {
  if (!entries?.length) return 0;
  let count = 0;
  for (const entry of entries) {
    if (entry.tool !== 'delete_concept') continue;
    const at = Date.parse(entry.at);
    if (Number.isFinite(at) && at >= since) count += 1;
  }
  return count;
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
    case 'digest': {
      const c = planned.counts ?? { added: 0, modified: 0, removed: 0 };
      // 0인 갈래는 그리지 않는다 — 「삭제 0」은 정보가 아니라 소음이다.
      const parts: string[] = [];
      if (c.added > 0) parts.push(t('digestAdded', { count: c.added }));
      if (c.modified > 0) parts.push(t('digestModified', { count: c.modified }));
      if (c.removed > 0) parts.push(t('digestRemoved', { count: c.removed }));
      return `${t('digestPrefix')}${parts.join(t('digestJoin'))}`;
    }
    default:
      return '';
  }
}
