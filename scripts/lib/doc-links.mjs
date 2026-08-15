// 깨진 링크 검사의 순수 부분.
//
// 이 저장소가 실제로 겪은 부패다 — 볼트를 재생성하면 노드 파일이 사라지는데,
// 그 파일을 인용하던 산문은 그대로 남는다. 3,419줄 · 단언 2,126개짜리 산문 핀
// 묶음은 이것을 한 건도 잡지 못했다(문장은 안 바뀌었으니까). 링크는 반대다 —
// **대상이 있는지 없는지는 기계가 판정할 수 있다.**

/** 링크 문법은 코드 펜스 안에서 예시로 등장한다 — 예시를 검사하면 거짓 양성이 된다. */
export function stripFencedBlocks(markdown) {
  const lines = markdown.split('\n');
  let fenced = false;
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return '';
    }
    return fenced ? '' : line;
  });
}

/** 인라인 코드(`[a](b)` 를 문법 설명으로 적은 경우)도 링크가 아니다. */
function stripInlineCode(line) {
  return line.replace(/`[^`]*`/g, (match) => ' '.repeat(match.length));
}

export function collectMarkdownLinks(markdown) {
  const links = [];
  stripFencedBlocks(markdown).forEach((line, index) => {
    for (const match of stripInlineCode(line).matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      links.push({ line: index + 1, target: match[1] });
    }
  });
  return links;
}

/** GitHub README에서 쓰는 raw HTML picture/img 자산도 눌리지 않는 로컬 약속이다. */
export function collectHtmlAssetRefs(markdown) {
  const refs = [];
  stripFencedBlocks(markdown).forEach((line, index) => {
    for (const tagMatch of line.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
      for (const attrMatch of tagMatch[0].matchAll(/\b(src|srcset)\s*=\s*(["'])(.*?)\2/gi)) {
        const [, attribute, , value] = attrMatch;
        const candidates = attribute.toLowerCase() === 'srcset' && !isExternalTarget(value)
          ? value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0])
          : [value.trim()];
        for (const target of candidates) {
          if (target && !isExternalTarget(target)) refs.push({ line: index + 1, target });
        }
      }
    }
  });
  return refs;
}

export function isExternalTarget(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//');
}

/**
 * 백틱 안의 저장소 경로 인용. 문장을 읽는 게 아니라 **경로 토큰**만 본다.
 *
 * 좁게 잡는 이유는 실측이다: 아무 백틱 경로나 다 보면 168건이 뜨는데 대부분
 * `domains/foo.md` 같은 볼트 상대 예시이거나 빌드 산출물이다. 저장소 루트에
 * 앵커된 `.md` 경로로 좁히면 232건 중 3건이 뜨고 **셋 다 진짜**였다.
 */
const REPO_TOP_LEVEL = new Set([
  'src',
  'app',
  'docs',
  'scripts',
  'cli',
  'mcp',
  'tests',
  'messages',
  'samples',
  '.claude',
  '.agents',
  '.codex',
  '.github',
]);

/**
 * **저장소에 없는 자리를 근거로 인용한 것** — 목록 밖이라 위 검사가 원리적으로
 * 못 보던 층 (2026-08-15 실측으로 발견).
 *
 * `REPO_TOP_LEVEL` 은 손으로 관리하는 13줄짜리 허용목록이고, 그래서 **목록에 없는
 * 디렉터리를 가리키는 인용은 검사 자체가 존재하지 않았다.** 그 틈에서 색 헌장의
 * 근거(`신호 톤 3종`)와 막대 채색 규율의 근거가 각각 gitignore 된 작업 폴더의
 * `.md` 를 가리킨 채 3주를 살았다 — 그 파일들은 이 컴퓨터에도 없고, 클론한
 * 사람에게는 **폴더째** 없다. lint 메시지 하나는 개발자에게 그 없는 파일을
 * 근거로 대고 있었다.
 *
 * ## 왜 「목록 밖 전부」가 아니라 점-디렉터리인가
 *
 * 켜기 전 전수(2026-08-15): 목록 밖 인용은 **255건**인데 대부분 정당하다 —
 * `@docs/…`(임포트 문법) 35 · `domains/foo.md`(볼트 상대 예시) 10 ·
 * 루트 파일명 199. 전부 잡으면 소음이 신호를 덮는다. 반면 **gitignore 된
 * 점-디렉터리**를 근거로 인용한 것은 정의상 아무도 못 여는 자리다.
 *
 * `exists()` 로 판정하지 않고 **무조건** 잡는다 — 그 폴더는 작업하는 사람의
 * 컴퓨터에만 있으므로, 실재 여부로 판정하면 로컬은 초록이고 CI 는 빨간 검사가
 * 된다(기계마다 다른 게이트는 게이트가 아니다).
 */
const KEPT_DOT_DIRS = new Set(['.claude', '.agents', '.codex', '.github']);

/**
 * 예외 — **사용자 폴더에 런타임에 생기는 산출물**을 이름으로 부르는 것은 정당하다.
 * 저장소가 갖고 있어야 하는 파일이 아니라 「생기면 여기 생긴다」는 설명이다.
 */
const RUNTIME_ARTIFACT_DOT_DIRS = new Set([
  '.ontology-atlas', // 볼트 안 에이전트 기록·임포트 — 사용자 폴더에 생긴다
  '.tmp', // 검사 스크립트가 만드는 상태 파일
]);

export function collectProseDocRefs(markdown) {
  const refs = [];
  stripFencedBlocks(markdown).forEach((line, index) => {
    for (const match of line.matchAll(/`([^`\s]+\.md)`/g)) {
      const target = match[1];
      if (/[*?{}<>|[\]]/.test(target)) continue; // 글롭 · 플레이스홀더
      if (isExternalTarget(target)) continue;
      const relative = target.startsWith('./') || target.startsWith('../');
      const head = target.split('/')[0];
      const ghostDir =
        !relative &&
        head.startsWith('.') &&
        target.includes('/') &&
        !KEPT_DOT_DIRS.has(head) &&
        !RUNTIME_ARTIFACT_DOT_DIRS.has(head);
      if (ghostDir) {
        refs.push({ line: index + 1, target, relative: false, ghost: true });
        continue;
      }
      if (!relative && !REPO_TOP_LEVEL.has(head)) continue;
      refs.push({ line: index + 1, target, relative });
    }
  });
  return refs;
}

/**
 * 이력 문서는 **사라진 파일을 이름으로 부르는 것이 일**이다 — 변경 로그가
 * "`docs/GUIDE.md` 를 삭제했다" 고 쓰는 것은 부패가 아니라 기록이다. 그래서
 * 산문 경로 인용 검사는 여기서 빠진다(링크는 빠지지 않는다 — 링크는 이력
 * 문서에서도 눌렀을 때 열려야 하는 약속이다).
 *
 * 실측: 이 제외가 없으면 이력 문서에서만 24건이 떠서 현행 문서 3건을 덮는다.
 */
export function isHistoricalDoc(relativePath) {
  const normalized = relativePath.split('\\').join('/');
  return (
    /(^|\/)CHANGELOG\.md$/.test(normalized) ||
    normalized === 'docs/DECISIONS.md' ||
    /^docs\/(archive|audits|superpowers|plans|prototypes)\//.test(normalized) ||
    /^docs\/benchmark\/results\//.test(normalized)
  );
}
