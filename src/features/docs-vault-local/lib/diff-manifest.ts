/**
 * R14 #157 + #158 — vault polling 결과를 *added* / *modified* 두 부류로
 * 분류하는 pure helper. VaultDiffToaster 가 React 외 dependency 없이 호출.
 *
 * 입력: 이전 / 현재 manifest 의 (slug, mtime|null) Map.
 * 출력: 새로 등장한 slug + mtime 변화 slug.
 *
 * 정책:
 *   - prev 에 없는 slug → added.
 *   - 같은 slug 가 양쪽 다 mtime != null 이고 current > prev → modified.
 *   - 한쪽이라도 mtime == null (static manifest) → 비교 의미 없음. modified
 *     판정 skip (false-positive 차단).
 *   - removed 는 의도적으로 제외 — 사용자 명시 액션 (`delete_concept` 등)
 *     이 자체 toast 띄움. polling 결과로 다시 띄우면 noise.
 */
export function diffVaultManifest(
  prev: Map<string, number | null>,
  current: Map<string, number | null>,
): { added: string[]; modified: string[] } {
  const added: string[] = [];
  const modified: string[] = [];
  for (const [slug, mtime] of current) {
    const prevMtime = prev.get(slug);
    if (prevMtime === undefined) {
      added.push(slug);
      continue;
    }
    if (prevMtime !== null && mtime !== null && mtime > prevMtime) {
      modified.push(slug);
    }
  }
  return { added, modified };
}

/**
 * 토스트 문구를 여기서 완성 문자열로 만들지 않는 이유(N10 — 영어 토스트 ko 수리) —
 * 이 파일은 React 밖의 pure helper라 next-intl `useTranslations` 에 닿지 않는다.
 * 그래서 kind + slug/count 만 구조화해서 넘기고, 실제 로케일 문구 조립은 호출자
 * (`VaultDiffToaster`, React 컴포넌트)가 `t('featuresMisc.vaultDiffToaster.*')`
 * 로 한다 — "Added: domains/refunds" 같은 하드코딩 영문 리터럴이 다시 새지 않게.
 */
export type VaultDiffToastKind = 'added' | 'edited' | 'overflow';

export type VaultDiffToast = {
  kind: VaultDiffToastKind;
  slug?: string;
  count?: number;
  variant: 'info' | 'success';
};

export function planVaultDiffToasts(
  diff: { added: string[]; modified: string[] },
  previewLimit = 3,
): VaultDiffToast[] {
  const limit = Math.max(0, previewLimit);
  const planned: VaultDiffToast[] = [];
  let shown = 0;

  for (const slug of diff.added) {
    if (shown >= limit) break;
    planned.push({ kind: 'added', slug, variant: 'info' });
    shown += 1;
  }

  for (const slug of diff.modified) {
    if (shown >= limit) break;
    planned.push({ kind: 'edited', slug, variant: 'success' });
    shown += 1;
  }

  const overflow = Math.max(0, diff.added.length + diff.modified.length - limit);
  if (overflow > 0) {
    planned.push({ kind: 'overflow', count: overflow, variant: 'info' });
  }

  return planned;
}
