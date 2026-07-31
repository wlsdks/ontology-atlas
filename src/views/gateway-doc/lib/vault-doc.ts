import { resolveStaticVaultSource } from '@/entities/docs-vault';

/**
 * 관문의 읽을거리 두 장은 **볼트 안 마크다운을 그대로 그린다**.
 *
 * 손으로 쓴 마케팅 페이지를 따로 두지 않는 이유가 둘이다.
 *
 * 1. **두 번째 진실원을 안 만든다.** `docs/GUIDE.md` · `docs/CHANGELOG.md` 는
 *    이미 저장소에 있고 리뷰를 받는다. 화면용 사본을 따로 두면 반드시 한쪽만
 *    고쳐지고, 그때 방문자가 보는 쪽이 낡은 쪽이다.
 * 2. **제품이 자기 형식으로 자기를 설명한다.** 이 사이트의 읽을거리가
 *    Atlas 볼트의 문서이고, 같은 파일을 앱에서 열 수도 에이전트가 MCP 로 읽을
 *    수도 있다. dogfood 가 주장이 아니라 관측 가능한 사실이 된다.
 */

/**
 * 볼트 슬러그 → 원문 마크다운. 없으면 `null`.
 *
 * ## 왜 `'dogfood'` 로 **못 박는가**
 *
 * `resolveStaticVaultSource` 는 보통 사용자가 고른 샘플(dogfood / storefront)을
 * 존중해야 한다 — 한 화면에 두 볼트가 섞이는 2026-07-26 결함을 막는 규율이다.
 * **여기만 예외다.** 관문의 가이드와 변경 내역은 *이 제품의 문서*이지 사용자가
 * 구경하는 예시 볼트의 일부가 아니다. 예시 쇼핑몰을 골라 둔 방문자가 `/guide`
 * 를 열었을 때 나와야 하는 것은 Atlas 의 가이드이고, storefront 볼트에는 그
 * 문서가 애초에 없다.
 *
 * 그래서 리졸버를 **우회하지 않고**(원본 JSON 직접 import 는 계약 위반이다)
 * 인자를 고정해서 쓴다. 규율은 "리졸버를 통과한다" 이지 "선택을 따른다" 가
 * 아니고, 이 자리는 선택을 따르면 틀린다.
 */
export function readVaultDoc(slug: string): string | null {
  const { content } = resolveStaticVaultSource('dogfood');
  const doc = content[slug];
  return typeof doc === 'string' ? doc : null;
}

export interface TrimmedDoc {
  /** 화면에 그릴 마크다운. */
  body: string;
  /** 잘려나간 절의 수. 0 이면 전문이다. */
  omittedSections: number;
}

/**
 * `## ` 절 단위로 앞에서 `limit` 개만 남긴다.
 *
 * **왜 자르나**: CHANGELOG 는 오늘 기준 **318KB**다. react-markdown 이 그걸
 * 한 페이지에 풀면 DOM 노드가 수만 개가 되고, 관문의 읽을거리가 제품에서
 * 가장 무거운 화면이 된다. 변경 내역을 여는 사람이 실제로 찾는 것은 **최근에
 * 무엇이 바뀌었나**이지 2년치 전문이 아니다.
 *
 * **자르면 그 사실을 말한다.** 몇 절을 감췄는지 세어 돌려주고, 화면이 남은
 * 것을 어디서 읽는지 함께 보여준다 — 이 저장소가 `"곧 공개" 는 강등이 아니라
 * 거짓말이다` 로 등재한 규율의 같은 얼굴이다. 조용한 절단은 "이게 전부"라고
 * 말하는 것과 같다.
 *
 * 제목(첫 `# `)과 그 아래 머리말은 절이 아니므로 항상 남는다.
 */
export function trimToRecentSections(markdown: string, limit: number): TrimmedDoc {
  // 줄 시작의 `## ` 만 절 경계다 — 코드 블록 안의 `#` 를 절로 세지 않기 위해
  // 펜스 안쪽은 건너뛴다.
  const lines = markdown.split('\n');
  const boundaries: number[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    else if (!inFence && /^## (?!#)/.test(line)) boundaries.push(i);
  }

  if (boundaries.length <= limit) return { body: markdown, omittedSections: 0 };

  const cutAt = boundaries[limit]!;
  return {
    body: lines.slice(0, cutAt).join('\n').trimEnd(),
    omittedSections: boundaries.length - limit,
  };
}


export interface DocEntry {
  /** 앵커 id — 사이드바 링크와 본문 제목이 공유한다. */
  id: string;
  /** `## ` 뒤의 원문 전체. 사이드바 라벨 매칭에 쓴다. */
  heading: string;
  /** 앞머리의 `YYYY-MM-DD` — 없으면 `null`. */
  date: string | null;
  /** 날짜와 구분자를 뗀 나머지. 없으면 heading 그대로. */
  title: string;
}

/**
 * `## ` 절을 **차례 항목**으로 뽑는다 (변경 내역 사이드바용).
 *
 * ## 왜 id 를 여기서 만드나
 *
 * 사이드바 링크와 본문 제목이 **같은 문자열**을 써야 앵커가 걸린다. 두 곳이 각자
 * 만들면 규칙이 조금만 달라도(공백 처리, 대소문자) 링크가 조용히 아무 데도 안
 * 간다 — 눌러 보기 전에는 안 보이는 실패다. 그래서 한 함수가 목록과 id 를 같이
 * 낸다.
 *
 * ## 중복 제목
 *
 * 같은 날 여러 항목이 있으면 제목이 겹칠 수 있다. 뒤에 `-2`, `-3` 을 붙여 **항상
 * 유일**하게 만든다 — 겹치면 브라우저가 첫 번째로만 가고, 그건 목록이 거짓말을
 * 하는 것이다.
 */
export function extractEntries(markdown: string): DocEntry[] {
  const lines = markdown.split('\n');
  const out: DocEntry[] = [];
  const used = new Map<string, number>();
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(\`\`\`|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^## (?!#)(.+)$/.exec(line);
    if (!match) continue;

    const heading = match[1]!.trim();
    const dateMatch = /^(\d{4}-\d{2}-\d{2})\s*[—–-]?\s*(.*)$/.exec(heading);
    const date = dateMatch ? dateMatch[1]! : null;
    const title = dateMatch && dateMatch[2] ? dateMatch[2]! : heading;

    const base = slugifyHeading(heading);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    out.push({ id: seen === 0 ? base : `${base}-${seen + 1}`, heading, date, title });
  }
  return out;
}

/**
 * 제목의 **매칭 키** — 원문(마크다운)과 렌더된 텍스트가 같은 문자열이 되게 한다.
 *
 * ⚠️ 실측 결함(2026-07-31): 목록은 원문 `## 관문에 읽을거리 둘: \`/guide\`` 를
 * 키로 쓰고, 본문 `h2` 는 **렌더된** `관문에 읽을거리 둘: /guide` 로 조회했다.
 * 백틱·굵게 같은 인라인 마크다운이 든 제목 **3개의 앵커가 조용히 끊겼다** —
 * 눌러 보기 전에는 안 보이는 실패다.
 *
 * 그래서 양쪽 다 이 함수를 통과시킨다: 인라인 마커를 걷고 공백을 하나로 만든다.
 */
export function normalizeHeadingKey(heading: string): string {
  return heading
    .replace(/[`*_~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 마크다운 제목 → 앵커 id. 한글을 지우지 않는다 — 지우면 대부분의 제목이 빈 문자열이 된다. */
export function slugifyHeading(heading: string): string {
  return (
    heading
      .toLowerCase()
      .replace(/[`*_~\[\]()]/g, '')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'entry'
  );
}
