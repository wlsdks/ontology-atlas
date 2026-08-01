'use client';

import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useOntologyKindLabel } from '@/entities/ontology-class';
import { useToast } from '@/shared/ui/toast';
import {
  diffVaultManifest,
  planVaultDiffToasts,
  toVaultDiffNode,
  type VaultDiffActionCount,
  type VaultDiffToast,
} from '../lib/diff-manifest';
import { useLocalVault } from './LocalVaultProvider';

/**
 * R13 #71 + #72 — vault polling 결과 *시각적 알림*. polling 으로 detect 한
 * 변화를 어떤 페이지에서든 toast 로 알림.
 *
 * #71 added detection: 새로운 slug 등장 → info toast.
 * #72 modified detection: slug 같지만 mtime 변화 → success toast.
 *   사용자 / AI agent 가 IDE 에서 .md 편집한 경우.
 *
 * 동작:
 *   - LocalVaultProvider 안에 mount, manifest.docs 의 (slug, mtime) Map 추적
 *   - 첫 mount 는 baseline 만 (false-positive 방지)
 *   - 이후 diff:
 *     · slug 신규 → added
 *     · slug 동일 + mtime 새로움 → modified
 *   - 버스트당 한 장(부채꼴 폐기 — `diff-manifest.ts` 주석)
 *   - 문구는 `featuresMisc.vaultDiffToaster.*` 로 로케일별 조립 — `diffVaultManifest`/
 *     `planVaultDiffToasts` 는 구조만 반환하는 pure helper라 여기서
 *     `useTranslations` 로 문자열을 완성한다(N10 — "Added: domains/refunds" 영문
 *     리터럴 ko 수리).
 *
 * ## 알림은 정보를 날라야 한다 (2026-08-01 소유자 지시)
 *
 * 종전 문구는 `편집됨: capabilities/payment-authorization` 이었다. 네 가지가
 * 동시에 빠져 있었다 — ① `capabilities/` 는 화면에 쓸 말이 아닌 개발자 폴더
 * 이름, ② 슬러그는 사람이 그 개념을 부르는 이름이 아님(`display_<locale>` 이
 * 있는데 토스트만 안 씀), ③ 무엇이 일어났는지 종류를 말하지 않음,
 * ④ 「편집됨」은 사건이 있었다는 말이지 정보가 아님.
 *
 * 그래서 화면에 나가는 것은 **「역량 편집 — 결제 승인」** 처럼 *종류(평문) +
 * 사건 + 사람 이름* 셋이다. 여러 건이면 종류별로 세어 「역량 3 · 요소 12 추가」.
 * **kind 를 못 얻으면 지어내지 않는다** — 종류 없이 「추가 — 이름」으로 쓰고,
 * 다이제스트에서는 「그 외 N」으로 정직하게 센다.
 *
 * 삭제 detection 은 일단 제외 — 사용자 명시 액션 후 toast 가 더 가치 있음
 * (delete_concept 같은 명령 자체가 toast 띄우면 됨, polling 결과로 다시
 * toast 띄우면 noise).
 */
export function VaultDiffToaster() {
  const { status, manifest, consumeSelfWrittenSlugs, agentActivityLog } = useLocalVault();
  const toast = useToast();
  const t = useTranslations('featuresMisc.vaultDiffToaster');
  const kindLabel = useOntologyKindLabel();
  const locale = useLocale();
  const prevMapRef = useRef<Map<string, number | null> | null>(null);
  /**
   * 직전 diff 를 본 시각 — 이 창 안의 `delete_concept` 만 이번 버스트의 것이다.
   * 렌더 중에 `Date.now()` 를 부르면 순수하지 않으므로(`react-hooks/purity`)
   * 첫 baseline 저장 때 effect 안에서 채운다.
   */
  const prevSeenAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== 'loaded' || !manifest) return;

    type DocLite = {
      slug: string;
      mtime?: number;
      title?: string;
      frontmatter?: Record<string, unknown>;
    };
    const docs: DocLite[] = manifest.docs;
    const currentMap = new Map<string, number | null>(
      docs.map((d) => [d.slug, d.mtime ?? null]),
    );

    // 첫 load — baseline 저장만 하고 끝
    if (prevMapRef.current === null) {
      prevMapRef.current = currentMap;
      prevSeenAtRef.current = Date.now();
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
    const removed = countRecentDeletes(agentActivityLog, prevSeenAtRef.current ?? 0);
    prevSeenAtRef.current = Date.now();

    if (externalAdded.length === 0 && externalModified.length === 0 && removed === 0) return;

    // 슬러그를 그대로 넘기지 않는다 — 여기서 매니페스트 행(kind + display_*/title)
    // 으로 바꿔야 화면이 폴더 경로 대신 「역량 · 결제 승인」을 말할 수 있다.
    const docBySlug = new Map(docs.map((d) => [d.slug, d]));
    const toNode = (slug: string) => toVaultDiffNode(docBySlug.get(slug) ?? { slug }, locale);

    for (const planned of planVaultDiffToasts({
      added: externalAdded.map(toNode),
      modified: externalModified.map(toNode),
      removed,
    })) {
      toast.show(formatVaultDiffToastMessage(planned, t, kindLabel), planned.variant);
    }
  }, [status, manifest, toast, t, kindLabel, locale, consumeSelfWrittenSlugs, agentActivityLog]);

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

type Translate = ReturnType<typeof useTranslations>;
type KindLabel = (kind: string) => string;

function formatVaultDiffToastMessage(
  planned: VaultDiffToast,
  t: Translate,
  kindLabel: KindLabel,
): string {
  switch (planned.kind) {
    case 'added':
    case 'edited': {
      const node = planned.node;
      if (!node) return '';
      // 종류를 아는 경우에만 종류를 말한다 — 모르면 「추가 — 이름」으로 끝낸다.
      return node.kind
        ? t(planned.kind === 'added' ? 'addedKind' : 'editedKind', {
            kind: kindLabel(node.kind),
            name: node.name,
          })
        : t(planned.kind, { name: node.name });
    }
    case 'digest': {
      const c = planned.counts;
      if (!c) return '';
      // 0인 갈래는 그리지 않는다 — 「삭제 0」은 정보가 아니라 소음이다.
      const parts: string[] = [];
      if (c.added.total > 0) {
        parts.push(t('digestAdded', { breakdown: formatBreakdown(c.added, t, kindLabel) }));
      }
      if (c.modified.total > 0) {
        parts.push(t('digestModified', { breakdown: formatBreakdown(c.modified, t, kindLabel) }));
      }
      if (c.removed > 0) parts.push(t('digestRemoved', { count: c.removed }));
      return parts.join(t('digestJoin'));
    }
    default:
      return '';
  }
}

/**
 * 「역량 3 · 요소 12」. 종류를 하나도 못 읽었으면 숫자만 낸다 — 전부 미상인데
 * 「그 외 5」라고 쓰면 있지도 않은 다른 몫을 암시한다.
 */
function formatBreakdown(count: VaultDiffActionCount, t: Translate, kindLabel: KindLabel): string {
  const rows = count.byKind;
  if (rows.length === 1 && !rows[0].kind) {
    return t('digestKindPlain', { count: rows[0].count });
  }
  return rows
    .map((row) =>
      row.kind
        ? t('digestKindItem', { kind: kindLabel(row.kind), count: row.count })
        : t('digestKindOther', { count: row.count }),
    )
    .join(t('digestKindJoin'));
}
