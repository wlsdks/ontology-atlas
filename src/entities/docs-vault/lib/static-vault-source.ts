import type { SampleSource } from '@/shared/lib/sample-source';
import sampleStorefrontContent from '../data/sample-storefront.content.json';
import sampleStorefrontManifest from '../data/sample-storefront.manifest.json';
import gatewayContent from '../data/gateway-content.json';
import gatewayChangelog from '../data/gateway-changelog.json';
import vaultManifest from '../data/manifest.json';
import type { VaultManifest } from '../model/types';

/**
 * static 모드(vault 미선택)에서 **지금 진실원인 번들 볼트 한 벌**.
 *
 * ## 왜 리졸버가 필요한가
 *
 * 실측 결함(2026-07-26): `demo:sample-source:v1 = storefront` 인 상태로 프로젝트
 * 상세를 열면 **한 화면에 두 볼트가 섞였다** — 제목·본문은 dogfood 의
 * `ontology-atlas`, 그래프는 storefront(31노드). 그 결과 히어로 지표가 전부 0,
 * 구성 탭은 빈 상태, 헤더만 "31 CONCEPTS · 61 RELATIONS" 를 외쳤다. 사용자에게
 * 이건 "고장" 으로 읽힌다.
 *
 * 원인은 단순했다. 샘플 선택을 존중하는 소비자가 2곳(`useOntologyInsight` ·
 * `useVaultHealth`)뿐이고 나머지 9곳이 dogfood 매니페스트를 **직접 import**
 * 했다. 같은 질문("지금 어떤 볼트인가")에 답이 두 개면 언젠가 갈라진다 —
 * 아키텍처 규율의 "단일 진실원" 이 정확히 이걸 막으려는 규칙이다.
 *
 * 그래서 매니페스트와 본문을 **짝으로** 돌려준다. 하나만 바꾸는 실수를
 * 타입 차원에서 불가능하게 만드는 게 이 함수의 존재 이유다(예전 결함은
 * 정확히 "매니페스트는 storefront, 본문은 dogfood" 였다).
 *
 * local 모드(사용자 vault 로드됨)에서는 이 값이 아예 소비되지 않는다 —
 * 사용자 디스크가 항상 우선.
 */
export interface StaticVaultSource {
  source: SampleSource;
  manifest: VaultManifest;
  /**
   * slug → 원문 마크다운 fallback. Gateway가 첫 페인트 전에 동기적으로
   * 필요로 하는 guide/* 만 포함한다. 그 밖의 문서는
   * `public/docs-vault/{slug}.md` asset으로 비동기 읽기한다.
   * 매니페스트와 항상 같은 볼트에서 온다.
   */
  content: Record<string, string>;
  /**
   * slug → **잘린 동기 미리보기**. 전문을 번들에 담기엔 너무 커졌지만 관문이
   * 첫 페인트에 동기로 필요로 하는 문서(지금은 CHANGELOG 하나 — 634KB 전문이
   * 모든 라우트의 공통 청크를 성능 예산 밖으로 밀었다). `body` 는 원문의
   * 앞부분 그대로(`## ` 절 단위 절단)이고, `omittedSections` 는 그 절단이
   * 접은 절 수다 — 화면은 자기 상한으로 한 번 더 자른 뒤 두 수를 더해 정확한
   * 총 접힌 수를 말한다. 전문은 `public/docs-vault/{slug}.md` 에 그대로 있다.
   * 매니페스트와 항상 같은 볼트에서 온다 — content 와 같은 짝 규율.
   */
  contentPreviews?: Record<string, { body: string; omittedSections: number }>;
  /**
   * 이 매니페스트의 문서 slug 앞에 붙어 있는, **에이전트가 물린 볼트 뿌리
   * 기준으로는 없는** 조각.
   *
   * dogfood 매니페스트는 `/docs` 통합 트리(가이드 62 + 온톨로지 96)로
   * 빌드되므로 온톨로지 문서가 `ontology/…` 로 시작하는데, 이 저장소가
   * 에이전트에 물리는 볼트 뿌리는 `docs/ontology` 다. 그 차이를 화면이
   * 복사해 주는 MCP 호출에서 빼지 않으면 붙여넣는 즉시 실패한다
   * (2026-07-26 실측). 사용자가 자기 폴더를 열면 그 폴더가 곧 볼트 뿌리라
   * 뺄 조각이 없다 — 그래서 로컬 모드에는 이 값이 없다.
   */
  agentSlugPrefix?: string;
}

// JSON import 는 union 필드를 string 으로 추론한다. 빌드 시점에 스키마가
// 고정이라 runtime 검증 대신 cast (기존 소비자들이 각자 하던 cast 를 여기로
// 모은 것 — 그 자체가 중복이었다).
const DOGFOOD: StaticVaultSource = {
  source: 'dogfood',
  manifest: vaultManifest as VaultManifest,
  content: gatewayContent as Record<string, string>,
  contentPreviews: {
    CHANGELOG: gatewayChangelog as { body: string; omittedSections: number },
  },
  agentSlugPrefix: 'ontology/',
};

const STOREFRONT: StaticVaultSource = {
  source: 'storefront',
  manifest: sampleStorefrontManifest as VaultManifest,
  content: sampleStorefrontContent as Record<string, string>,
};

export function resolveStaticVaultSource(source: SampleSource): StaticVaultSource {
  return source === 'storefront' ? STOREFRONT : DOGFOOD;
}
