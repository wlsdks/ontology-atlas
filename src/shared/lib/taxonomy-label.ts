/**
 * 화면 언어에 맞는 분류(category / status) 라벨 고르기 — 순수 함수.
 *
 * **vault frontmatter 는 진실원이 아니다** — 여기서 다루는 category / status
 * 는 vault 가 아니라 코드 상수(`entities/category`·`entities/status` 의
 * defaults)다. vault 파일이 쥐는 값은 `category: in-progress` 같은 **id**
 * 뿐이고, 그 id 를 사람 말로 옮기는 일은 UI 의 몫이다. 그래서 어권별 라벨을
 * 코드가 갖는 것이 계약 위반이 아니다 — 사용자가 쓴 문자열을 기계가 번역해
 * 보여주는 상황이 아니라, 우리가 쓴 문자열을 우리가 두 언어로 쓴 것이다.
 *
 * 반대로 **id 가 defaults 에 없으면 라벨을 지어내지 않는다** — 그건 사용자
 * vault 의 값이므로 원문 그대로 보여준다(`TaxonomyProvider` 의 `?? id`).
 *
 * 2026-07-28: `/project/new` 의 카테고리·상태 드롭다운과 카드 미리보기가
 * 영문 화면에서도 한국어를 그렸다. 원인은 라벨을 고르는 자리가 없어서
 * 호출부마다 `.label`(한국어)을 그대로 쓴 것 — 자리를 하나 만들어 모은다.
 */
export interface LocalizedTaxonomyLabel {
  /** 한국어 라벨 — 단일 필수 값. */
  label: string;
  /** 영문 라벨. 없으면 `label` 로 폴백한다(원문 노출이 지어낸 번역보다 낫다). */
  labelEn?: string;
}

/** 화면 로케일이 `en` 이면 영문 라벨, 그 외에는 한국어 라벨. */
export function pickTaxonomyLabel(
  entry: LocalizedTaxonomyLabel | undefined,
  locale: string,
): string | undefined {
  if (!entry) return undefined;
  if (locale === "en") return entry.labelEn ?? entry.label;
  return entry.label;
}
