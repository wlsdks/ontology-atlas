/**
 * 두 볼트 슬러그 사이의 **상대 마크다운 경로** — `@` 멘션이 본문에 넣는 링크.
 *
 * ## 왜 표준 링크인가 (2026-08-08, 소유자 지적)
 *
 * 첫 판은 본문에 `[[슬러그|이름]]` 위키링크를 넣었다. 소유자가 물었다 —
 * *"`[[` 이거는 옵시디언 특유라서 우리가 쓰면 안되는거 아닌가?"*
 *
 * 짚은 것이 맞다. 위키링크는 MediaWiki(2001)에서 왔고 Roam·Logseq·Obsidian·
 * Foam·Dendron 이 다 쓰는 **PKM 공통 관습**이지 옵시디언 발명은 아니다. 그러나
 * 인상은 옵시디언이고, 무엇보다 **재 보니 표준 링크가 모든 축에서 낫다**:
 *
 * | | `[[슬러그\|이름]]` | `[이름](../경로.md)` |
 * |---|---|---|
 * | 우리 뷰어 | 링크 | 링크 (`resolveDocLink`) |
 * | 옵시디언 | 링크 | 링크 |
 * | **GitHub · VS Code · 일반 마크다운 뷰어** | **깨진 글자** | **링크** |
 * | 노드 이름을 바꾸면 | 낡는다 | 낡는다 |
 *
 * 마지막 줄이 결정적이었다. 위키링크가 «슬러그라서 파일 이동에 견딘다» 고
 * 생각했는데, `redirectBacklinks` 는 **frontmatter 만** 고치고 본문은 손대지
 * 않는다(실측). 즉 두 표기가 그 축에서 같고, 남는 차이는 **GitHub 에서
 * 읽히는가** 하나다.
 *
 * 그래서 답은 「우리만의 문법을 만든다」가 아니다 — 우리 문법은 **모든 다른
 * 도구에서 깨진 글자**가 되고, 그건 「평범한 마크다운으로 들고 나갈 수 있다」는
 * 이 제품의 약속을 우리가 깨는 것이다. 남의 문법도 아니고 우리 문법도 아닌
 * **마크다운 표준**을 쓴다.
 */

/**
 * `fromSlug` 문서에서 `toSlug` 문서로 가는 상대 경로(`.md` 포함).
 *
 * 뷰어의 `resolveDocLink` 가 링크를 **그 문서의 폴더 기준**으로 푼다. 그래서
 * 볼트 루트 기준 경로를 그대로 쓰면 안 된다 — `domains/typed-api` 에서
 * `capabilities/fixtures.md` 라고 쓰면 `domains/capabilities/fixtures` 를
 * 찾으러 간다(실측으로 확인한 해소 규칙).
 */
export function relativeDocPath(fromSlug: string, toSlug: string): string {
  const fromParts = fromSlug.split('/');
  const toParts = toSlug.split('/');
  // 마지막 조각은 파일 이름이므로 디렉터리 비교에서 뺀다.
  fromParts.pop();
  const fileName = `${toParts.pop()}.md`;

  let shared = 0;
  while (shared < fromParts.length && shared < toParts.length && fromParts[shared] === toParts[shared]) {
    shared += 1;
  }
  const up = fromParts.length - shared;
  const segments = [...Array.from({ length: up }, () => '..'), ...toParts.slice(shared), fileName];
  const path = segments.join('/');
  /*
   * 같은 폴더면 `./` 를 붙인다. 없으면 `fixtures.md` 가 되는데, 그건 링크로도
   * 읽히지만 **글 속에서 파일 이름처럼 보인다** — 링크임을 눈으로 알 수 있게
   * 한다. 해소 쪽은 `./` 를 이미 벗겨 낸다.
   */
  return up === 0 && toParts.length === shared ? `./${path}` : path;
}

/**
 * 본문에 넣을 마크다운 링크 한 줄.
 *
 * 라벨에 `]` 가 있으면 링크 문법이 그 자리에서 끊긴다 — 이스케이프한다.
 * 제목은 사람이 쓴 값이라 무엇이든 들어올 수 있다.
 */
export function buildDocLinkMarkdown({
  fromSlug,
  toSlug,
  label,
}: {
  fromSlug: string;
  toSlug: string;
  label: string;
}): string {
  const text = (label.trim() || toSlug).replace(/([[\]])/g, '\\$1');
  return `[${text}](${relativeDocPath(fromSlug, toSlug)})`;
}
