/**
 * 가이드의 **차례** — 순서와 슬러그의 단일 진실원.
 *
 * ## 왜 배열 하나인가
 *
 * 이 목록이 세 가지를 동시에 정한다: ① 사이드바에 보이는 순서 ②
 * `generateStaticParams` 가 만들 정적 경로 ③ 이전/다음 이동. 세 곳이 각자
 * 목록을 들면 한 장을 추가할 때 두 곳만 고쳐지고, 그 결함은 **없는 페이지가
 * 사이드바에 뜨거나 있는 페이지가 안 뜨는** 형태로 나온다.
 *
 * ## 제목은 왜 여기 있나 (본문 `# H1` 이 아니라)
 *
 * 사이드바는 본문을 읽지 않고 그려져야 한다 — 여섯 장의 마크다운을 전부 파싱해서
 * 첫 제목을 뽑는 것은 목록 하나를 그리려고 문서를 다 여는 일이다. 그리고 이 이름은
 * **번역 대상**이라 볼트 파일(한국어 원문)에서 뽑을 수도 없다.
 *
 * ⚠️ 그래서 `titleKey` 는 `messages/*.json` 의 `gatewayNav.guidePages` 를 가리키고,
 * 계약 테스트가 목록과 메시지 키가 어긋나지 않는지 본다. 키를 추가하고 번역을
 * 잊으면 화면에 키 이름이 그대로 나온다.
 */
export interface GuidePage {
  /** 볼트 슬러그(`guide/…`) — 본문이 사는 자리. */
  readonly slug: string;
  /** URL 마디 — `/guide/<segment>`. 슬러그의 `guide/` 를 뗀 것과 같다. */
  readonly segment: string;
  /** `gatewayNav.guidePages.<key>` 메시지 키. */
  readonly titleKey: string;
}

export const GUIDE_PAGES: readonly GuidePage[] = [
  { slug: 'guide/what-is-atlas', segment: 'what-is-atlas', titleKey: 'whatIsAtlas' },
  { slug: 'guide/first-five-minutes', segment: 'first-five-minutes', titleKey: 'firstFiveMinutes' },
  { slug: 'guide/reading-the-map', segment: 'reading-the-map', titleKey: 'readingTheMap' },
  { slug: 'guide/vault-structure', segment: 'vault-structure', titleKey: 'vaultStructure' },
  { slug: 'guide/what-becomes-a-node', segment: 'what-becomes-a-node', titleKey: 'whatBecomesANode' },
  { slug: 'guide/relations', segment: 'relations', titleKey: 'relations' },
  { slug: 'guide/studio', segment: 'studio', titleKey: 'studio' },
  { slug: 'guide/from-your-repo', segment: 'from-your-repo', titleKey: 'fromYourRepo' },
  { slug: 'guide/connect-agent', segment: 'connect-agent', titleKey: 'connectAgent' },
  { slug: 'guide/growing-vault', segment: 'growing-vault', titleKey: 'growingVault' },
  { slug: 'guide/insights', segment: 'insights', titleKey: 'insights' },
  { slug: 'guide/cli', segment: 'cli', titleKey: 'cli' },
  { slug: 'guide/trust', segment: 'trust', titleKey: 'trust' },
] as const;

/**
 * `/guide` (마디 없음) 가 보여줄 장.
 *
 * 리다이렉트하지 않고 **그 자리에서 첫 장을 그린다** — `/guide` 는 공유되는
 * 주소인데 리다이렉트로 URL 이 바뀌면 링크를 받은 사람이 자기가 뭘 클릭했는지
 * 모르게 된다. 사이드바가 어느 장인지 이미 말해 준다.
 */
export const GUIDE_ENTRY_PAGE = GUIDE_PAGES[0]!;

/**
 * 세그먼트 해석 결과 — **어느 장을 그릴지**와 **그 장이 요청받은 장인지**를
 * 함께 말한다.
 *
 * ## 왜 `GuidePage` 하나를 돌려주지 않나 (2026-08-14 걷기 실측)
 *
 * 종전 `findGuidePage()` 는 모르는 세그먼트에 1장을 **말없이** 돌려줬다.
 * 가이드 본문의 상대 `.md` 링크가 `/guide/ONTOLOGY-ATLAS-SPEC.md` 로 풀렸을 때
 * 화면은 404 도 아니고 명세도 아닌 **1장을 그 주소인 척** 그렸다 — 오배송은
 * 404 보다 알아채기 어렵다. 정적 export 라 진짜 404 라우팅은 제한적이므로
 * (`generateStaticParams` 가 만든 경로만 실재한다), 폴백 자체는 유지하되
 * **대체했다는 사실을 화면이 말할 수 있게** `matched` 를 함께 돌려준다.
 * 렌더 쪽 소비자는 `app/[locale]/guide/[segment]/page.tsx` — `matched` 가
 * false 면 안내 배너를 얹는다.
 */
export interface GuidePageResolution {
  /** 실제로 그릴 장. 요청이 실재하지 않으면 첫 장. */
  readonly page: GuidePage;
  /** 요청한 세그먼트가 실재하는 장이었나 — false 면 화면이 대체를 고지해야 한다. */
  readonly matched: boolean;
}

export function resolveGuidePage(segment: string | undefined): GuidePageResolution {
  // 마디 없는 `/guide` 는 «첫 장을 그 자리에서 그린다» 가 정의된 행동이다
  // (위 GUIDE_ENTRY_PAGE 주석) — 대체가 아니므로 matched 다.
  if (!segment) return { page: GUIDE_ENTRY_PAGE, matched: true };
  const page = GUIDE_PAGES.find((candidate) => candidate.segment === segment);
  return page ? { page, matched: true } : { page: GUIDE_ENTRY_PAGE, matched: false };
}
