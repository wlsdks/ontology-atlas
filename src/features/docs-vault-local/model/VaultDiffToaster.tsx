'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/shared/ui/toast';
import { useLocalVault } from './LocalVaultProvider';

/**
 * R13 #71 — vault polling 결과 *시각적 알림*. polling 으로 새 노드가
 * 들어오면 toast 로 명시 (예: "Added: capabilities/foo").
 *
 * polling (#69) + diff highlight (#70) 가 그래프 안 변화는 만들었지만,
 * 사용자가 그래프 안 보고 다른 페이지 (/docs / /ontology 등) 보고 있으면
 * 변화 인지 못함. toast 는 어느 페이지에서든 보여 *cross-page* alive
 * 신호 가 됨.
 *
 * 동작:
 *   - LocalVaultProvider 안에 mount, manifest.docs slug set 추적
 *   - 첫 mount 는 baseline 만 저장 (false-positive 방지)
 *   - 이후 새로 등장한 slug 가 1+ 개면 sonner info toast
 *   - 3+ 개 동시 추가면 처음 3 + "+N more"
 *
 * 삭제 / 수정 detection 은 일단 제외 — slug 가 같으면 같은 노드라 가정.
 * 추후 mtime / fingerprint diff 로 확장 가능.
 */
export function VaultDiffToaster() {
  const { status, manifest } = useLocalVault();
  const toast = useToast();
  const prevSlugsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (status !== 'loaded' || !manifest) return;
    const currentSlugs = new Set<string>(
      manifest.docs.map((d: { slug: string }) => d.slug),
    );

    // 첫 load — baseline 저장만 하고 끝
    if (prevSlugsRef.current === null) {
      prevSlugsRef.current = currentSlugs;
      return;
    }

    const prev = prevSlugsRef.current;
    const added: string[] = [];
    for (const s of currentSlugs) {
      if (!prev.has(s)) added.push(s);
    }
    prevSlugsRef.current = currentSlugs;
    if (added.length === 0) return;

    // 처음 3 명시, 나머지는 합산
    const PREVIEW = 3;
    const preview = added.slice(0, PREVIEW);
    for (const slug of preview) {
      toast.show(`Added: ${slug}`, 'info');
    }
    if (added.length > PREVIEW) {
      toast.show(`+${added.length - PREVIEW} more node(s)`, 'info');
    }
  }, [status, manifest, toast]);

  return null;
}
