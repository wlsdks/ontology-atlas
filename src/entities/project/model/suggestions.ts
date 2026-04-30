import type { Project } from "./types";

export interface SuggestedDependency {
  slug: string;
  name: string;
  /** 매칭이 일어난 이유 표시용 짧은 발췌. */
  excerpt: string;
}

const MIN_NAME_LENGTH = 3;
const EXCERPT_HALF_WINDOW = 28;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAsciiAlphaNumeric(value: string): boolean {
  return /^[\x20-\x7e]+$/.test(value);
}

function findMatchIndex(haystack: string, needle: string): number {
  const trimmed = needle.trim();
  if (trimmed.length < MIN_NAME_LENGTH) return -1;
  // 영문/ascii 전용 이름은 단어 경계 기준으로. 한글·혼합은 단순 포함.
  if (isAsciiAlphaNumeric(trimmed)) {
    const regex = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "i");
    const match = regex.exec(haystack);
    return match?.index ?? -1;
  }
  return haystack.indexOf(trimmed);
}

function extractExcerpt(corpus: string, index: number, needleLength: number): string {
  const start = Math.max(0, index - EXCERPT_HALF_WINDOW);
  const end = Math.min(corpus.length, index + needleLength + EXCERPT_HALF_WINDOW);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < corpus.length ? "…" : "";
  return `${prefix}${corpus.slice(start, end).trim()}${suffix}`;
}

/**
 * 프로젝트의 description/detail 문자열에서 다른 프로젝트의 name/nameEn 을
 * 정확히 언급한 후보를 찾아 의존성 제안으로 반환한다.
 *
 * 설계 원칙:
 * - 자기 자신, 이미 dependencies 에 포함된 slug 는 제외.
 * - name 길이 3자 미만은 오검출(AI/UI 등)을 피하려 건너뜀.
 * - ASCII 이름은 단어 경계 기준(영단어 부분 일치 방지), 한글 포함 이름은 단순 포함.
 * - slug 기준으로 중복 제거해 첫 매칭 1회만 반환.
 */
export function computeSuggestedDependencies(
  current: Pick<Project, "slug" | "dependencies" | "description" | "detail">,
  candidates: readonly Project[],
): SuggestedDependency[] {
  const corpus = `${current.description ?? ""}\n${current.detail ?? ""}`;
  if (!corpus.trim()) return [];

  const excluded = new Set<string>([current.slug, ...current.dependencies]);
  const seen = new Set<string>();
  const suggestions: SuggestedDependency[] = [];

  for (const candidate of candidates) {
    if (excluded.has(candidate.slug) || seen.has(candidate.slug)) continue;

    const namesToTry = [candidate.name, candidate.nameEn].filter(
      (name): name is string => typeof name === "string" && name.trim().length > 0,
    );

    let bestIndex = -1;
    let matchedName = "";
    for (const name of namesToTry) {
      const index = findMatchIndex(corpus, name);
      if (index >= 0 && (bestIndex < 0 || index < bestIndex)) {
        bestIndex = index;
        matchedName = name;
      }
    }

    if (bestIndex < 0) continue;

    seen.add(candidate.slug);
    suggestions.push({
      slug: candidate.slug,
      name: candidate.name,
      excerpt: extractExcerpt(corpus, bestIndex, matchedName.length),
    });
  }

  return suggestions;
}
